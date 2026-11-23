// ===========================================================================
//  desktop.js —— 根系统桌面外壳
//  壁纸、图标、窗口（拖动/缩放/贴靠/最大化/最小化/关闭/焦点）、任务栏、开始菜单、
//  小组件面板、通知中心、右键菜单、toast、模态框；以及子系统的 tick 驱动与画布合成
// ===========================================================================
(function () {
  const U = window.U;
  const I = window.Icons;
  const fsMod = window.require('fs');
  const pathMod = window.require('path');

  const APPS = {
    files: { title: '文件管理器', icon: 'files' },
    spreadsheet: { title: '电子表格', icon: 'spreadsheet' },
    widgets: { title: '小组件', icon: 'widgets' },
    editor: { title: '编辑器', icon: 'editor' },
    tasks: { title: '任务管理器', icon: 'tasks' },
    settings: { title: '设置', icon: 'settings' },
    browser: { title: '浏览器', icon: 'browser' },
    systems: { title: '系统', icon: 'systems' },
    help: { title: '帮助', icon: 'help' }
  };

  class Desktop {
    constructor() {
      this.rt = null;
      this.display = null;
      this.win = new WindowManager(this);
      this.notes = [];
      this.notifs = [];
      this.clipboard = [];
      this.settings = window.Store.settings;
      this.onTick = [];
      this._acc = 0;
      this._last = 0;
      this._raf = 0;
    }
    init(rt, display) {
      this.rt = rt;
      this.display = display;
      this.root = rt.root;
      this.build();
      this.applySettings(this.settings);
      this.startLoop();
    }
    // ---------------- 构建外壳 ----------------
    build() {
      const app = document.getElementById('app');
      app.dataset.systemId = 'outer';
      const desk = U.el('div', { class: 'desktop', dataset: { testid: 'os-desktop', systemId: 'outer' } });
      this.el = desk;
      this.wallEl = U.el('div', { class: 'wallpaper' });
      this.iconsEl = U.el('div', { class: 'desktop-icons' });
      this.winsEl = U.el('div', { class: 'windows-layer' });
      this.taskbar = this.buildTaskbar();
      this.startMenu = this.buildStartMenu();
      this.panel = U.el('div', { class: 'side-panel hidden' });
      this.notifPanel = U.el('div', { class: 'side-panel hidden' });
      this.ctxEl = U.el('div', { class: 'ctx-menu hidden' });
      desk.append(this.wallEl, this.iconsEl, this.winsEl, this.taskbar, this.startMenu, this.panel, this.notifPanel, this.ctxEl);
      app.appendChild(desk);
      this.buildIcons();
      this.buildTaskbarItems();
      // 右键菜单
      desk.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (e.target.closest('.app-window') || e.target.closest('.taskbar')) return;
        this.showContext(e.clientX, e.clientY, [
          { label: '新建子系统', icon: 'systems', action: () => this.openApp('systems') },
          { label: '打开文件管理器', icon: 'folder', action: () => this.openApp('files') },
          { label: '刷新桌面', icon: 'refresh', action: () => { this.display.markDirty(this.root); this.renderAll(); } },
          { sep: true },
          { label: '显示设置', icon: 'settings', action: () => this.openApp('settings') },
          { label: '帮助', icon: 'help', action: () => this.openApp('help') }
        ]);
      });
      desk.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.ctx-menu')) this.hideContext();
      });
      window.addEventListener('keydown', (e) => this.onKey(e));
      window.addEventListener('resize', () => this.renderAll());
    }
    buildTaskbar() {
      const tb = U.el('div', { class: 'taskbar' });
      const left = U.el('div', { class: 'tb-left' });
      const start = U.el('button', { class: 'tb-btn start', dataset: { testid: 'start-toggle' }, title: '开始' }, [
        U.el('span', { class: 'logo', html: I.icon('grid', 16) }), U.el('span', { text: '开始' })
      ]);
      start.addEventListener('click', () => this.toggleStart());
      left.appendChild(start);
      const pinned = ['files', 'spreadsheet', 'browser', 'editor', 'systems'];
      for (const id of pinned) {
        const b = U.el('button', { class: 'tb-btn', title: APPS[id].title, html: I.icon(APPS[id].icon, 18) });
        b.addEventListener('click', () => this.openApp(id));
        left.appendChild(b);
      }
      const center = U.el('div', { class: 'tb-center' });
      const right = U.el('div', { class: 'tb-right' });
      const tray = U.el('div', { class: 'tray' });
      this.trayWifi = U.el('button', { class: 'tray-btn', html: I.icon('wifi', 16) + I.icon('volume', 16) });
      this.trayWifi.addEventListener('click', () => this.togglePanel());
      this.clockEl = U.el('div', { class: 'clock' }, [U.el('div', { class: 't', text: '' }), U.el('div', { class: 'd', text: '' })]);
      this.bell = U.el('button', { class: 'tray-btn', dataset: { testid: 'notifications-toggle' }, title: '通知', html: I.icon('bell', 17) });
      const badge = U.el('span', { class: 'badge hidden', text: '0' });
      this.bell.appendChild(badge);
      this.badge = badge;
      this.bell.addEventListener('click', () => this.toggleNotifs());
      tray.append(this.trayWifi, this.clockEl, this.bell);
      right.appendChild(tray);
      tb.append(left, center, right);
      this.tbCenter = center;
      return tb;
    }
    buildStartMenu() {
      const sm = U.el('div', { class: 'start-menu hidden', dataset: { testid: 'start-menu' } });
      sm.innerHTML = '<div class="sm-search"><div class="box">' + I.icon('search', 16) + '<input data-testid="start-search" placeholder="搜索应用" /></div></div>' +
        '<div class="sm-scroll"><div class="sm-head">已固定</div><div class="sm-grid"></div>' +
        '<div class="sm-head">所有应用</div><div class="sm-list"></div></div>' +
        '<div class="sm-foot"><div class="sm-user"><div class="sm-avatar">N</div><div><div class="n">Nested OS</div><div class="s">根系统 · outer</div></div></div>' +
        '<button class="btn ghost" data-testid="launch-help">' + I.icon('help', 15) + ' 帮助</button></div>';
      const grid = sm.querySelector('.sm-grid');
      const list = sm.querySelector('.sm-list');
      for (const id in APPS) {
        const a = APPS[id];
        const g = U.el('div', { class: 'sm-app', dataset: { testid: 'launch-' + id }, title: a.title }, [
          U.el('div', { class: 'ai', html: I.icon(a.icon, 19) }), U.el('div', { class: 'an', text: a.title })
        ]);
        g.addEventListener('click', () => { this.hideStart(); this.openApp(id); });
        grid.appendChild(g);
        const li = U.el('div', { class: 'sm-row', dataset: { testid: 'launch-row-' + id } }, [
          U.el('div', { class: 'ai', html: I.icon(a.icon, 15) }), U.el('div', { class: 'an', text: a.title }), U.el('div', { class: 'ad', text: '应用' })
        ]);
        li.addEventListener('click', () => { this.hideStart(); this.openApp(id); });
        list.appendChild(li);
      }
      const input = sm.querySelector('input');
      input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        sm.querySelectorAll('.sm-app,.sm-row').forEach((n) => {
          n.style.display = n.textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
        });
      });
      return sm;
    }
    buildIcons() {
      this.iconsEl.innerHTML = '';
      const icons = [
        { app: 'files', label: '文件管理器' },
        { app: 'systems', label: '系统' },
        { file: '/Demo/示例工作簿.sheet', label: '示例工作簿' },
        { file: '/Demo/helicopter-24.scene', label: '场景源文件' },
        { app: 'browser', label: '浏览器' },
        { app: 'help', label: '操作说明' }
      ];
      icons.forEach((ic, i) => {
        const d = U.el('div', {
          class: 'dicon', dataset: Object.assign({ testid: 'desktop-icon', kind: ic.app ? 'app' : 'file' }, ic.app ? { appId: ic.app } : { filePath: ic.file })
        }, [
          U.el('div', { class: 'dicon-img', html: I.icon(ic.app ? APPS[ic.app].icon : 'file', 25) }),
          U.el('div', { class: 'dicon-label', text: ic.label })
        ]);
        d.addEventListener('click', () => { this.iconsEl.querySelectorAll('.dicon').forEach((x) => x.classList.remove('selected')); d.classList.add('selected'); });
        d.addEventListener('dblclick', () => {
          if (ic.app) this.openApp(ic.app);
          else this.openFile(ic.file);
        });
        d.addEventListener('contextmenu', (e) => {
          e.preventDefault(); e.stopPropagation();
          this.showContext(e.clientX, e.clientY, [
            { label: '打开', icon: 'folder', action: () => (ic.app ? this.openApp(ic.app) : this.openFile(ic.file)) },
            { label: '属性', icon: 'info', action: () => this.toast(ic.label) }
          ]);
        });
        this.iconsEl.appendChild(d);
      });
    }
    buildTaskbarItems() {
      const c = this.tbCenter;
      c.innerHTML = '';
      for (const w of this.win.list()) {
        const it = U.el('div', { class: 'tb-item' + (w.minimized ? '' : ' running') + (this.win.focused === w.id ? ' active' : ''), dataset: { testid: 'taskbar-item', windowId: w.id, appId: w.appId } }, [
          U.el('span', { html: I.icon((APPS[w.appId] || {}).icon || 'dot', 16) }),
          U.el('span', { class: 't', text: w.title })
        ]);
        it.addEventListener('click', () => this.win.toggleFromTaskbar(w.id));
        c.appendChild(it);
      }
      if (this.onTaskbarChange) this.onTaskbarChange();
    }
    // ---------------- 开始菜单 / 面板 ----------------
    toggleStart() { this.startMenu.classList.contains('hidden') ? this.showStart() : this.hideStart(); }
    showStart() { this.startMenu.classList.remove('hidden'); this.hidePanels(); }
    hideStart() { this.startMenu.classList.add('hidden'); }
    togglePanel() {
      if (!this.panel.classList.contains('hidden')) { this.hidePanels(); return; }
      this.hideStart(); this.hideNotifs();
      this.panel.classList.remove('hidden');
      if (this.panelEl) this.panelEl.remove();
      this.panelEl = window.Apps.widgets.buildPanel(this);
      this.panel.appendChild(this.panelEl);
    }
    toggleNotifs() {
      if (!this.notifPanel.classList.contains('hidden')) { this.hideNotifs(); return; }
      this.hideStart(); if (this.panelEl) { this.panel.classList.add('hidden'); }
      this.notifPanel.classList.remove('hidden');
      this.notifPanel.innerHTML = '';
      this.notifEl = window.Apps.widgets.buildNotifs(this);
      this.notifPanel.appendChild(this.notifEl);
    }
    hideNotifs() { this.notifPanel.classList.add('hidden'); }
    hidePanels() { this.panel.classList.add('hidden'); this.notifPanel.classList.add('hidden'); }
    // ---------------- 通知 / toast / 模态 ----------------
    notify(title, body, icon) {
      this.notifs.unshift({ title, body, icon: icon || 'bell', t: Date.now() });
      if (this.notifs.length > 30) this.notifs.pop();
      if (!this.settings.dnd) this.toast(title + '：' + body, 'ok', 3200);
      this.updateBadge();
      if (!this.notifPanel.classList.contains('hidden')) this.toggleNotifs(), this.toggleNotifs();
    }
    updateBadge() {
      const n = this.notifs.filter((x) => !x.read).length;
      this.badge.textContent = String(n);
      this.badge.classList.toggle('hidden', n === 0);
    }
    toast(text, kind, ms) {
      const t = U.el('div', { class: 'toast ' + (kind || ''), text });
      document.body.appendChild(t);
      setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, ms || 2200);
    }
    modal(opts) {
      return new Promise((resolve) => {
        const mask = U.el('div', { class: 'modal-mask' });
        const box = U.el('div', { class: 'modal' }, [
          U.el('h3', { text: opts.title }),
          U.el('p', { text: opts.body || '' }),
          U.el('div', { class: 'acts' })
        ]);
        const acts = box.querySelector('.acts');
        (opts.buttons || [{ label: '确定', primary: true }]).forEach((b) => {
          const btn = U.el('button', { class: 'btn ' + (b.primary ? 'primary' : '') + (b.danger ? ' danger' : ''), text: b.label });
          btn.addEventListener('click', () => { mask.remove(); resolve(b.value); });
          acts.appendChild(btn);
        });
        mask.appendChild(box);
        this.el.appendChild(mask);
      });
    }
    showContext(x, y, items) {
      this.ctxEl.innerHTML = '';
      for (const it of items) {
        if (it.sep) { this.ctxEl.appendChild(U.el('div', { class: 'ctx-sep' })); continue; }
        const d = U.el('div', { class: 'ctx-item' }, [U.el('span', { html: I.icon(it.icon || 'dot', 14) }), U.el('span', { text: it.label })]);
        d.addEventListener('click', () => { this.hideContext(); it.action && it.action(); });
        this.ctxEl.appendChild(d);
      }
      this.ctxEl.classList.remove('hidden');
      const r = this.ctxEl.getBoundingClientRect();
      this.ctxEl.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
      this.ctxEl.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
    }
    hideContext() { this.ctxEl.classList.add('hidden'); }
    // ---------------- 应用与窗口 ----------------
    openApp(appId, arg) {
      const app = APPS[appId];
      if (!app) return null;
      const w = this.win.create({ appId, title: app.title, width: app.w || 900, height: app.h || 600 });
      const body = w.body;
      try {
        const inst = window.Apps[appId].create(body, w, this, arg);
        w.app = inst;
      } catch (e) {
        console.error(e);
        body.appendChild(U.el('div', { class: 'empty', text: '应用启动失败：' + e.message }));
      }
      this.win.focus(w.id);
      this.buildTaskbarItems();
      return w;
    }
    openFile(path) {
      const node = this.root.fs[path];
      if (!node) return this.toast('文件不存在：' + path, 'err');
      if (node.k === 'sheet' || path.endsWith('.sheet')) return this.openApp('spreadsheet', { path });
      if (path.endsWith('.scene')) return this.openApp('editor', { path, readOnly: true });
      return this.openApp('editor', { path });
    }
    openSubsystem(instId) {
      const inst = this.rt.getInstance(instId);
      if (!inst) return null;
      const w = this.win.create({ appId: 'systems', title: inst.name, width: 900, height: 620, systemId: 'outer' });
      w.subsystem = instId;
      const body = w.body;
      body.innerHTML = '';
      const bar = U.el('div', { class: 'sys-toolbar' });
      const badge = U.el('span', { class: 'sys-badge', text: inst.state });
      bar.appendChild(badge);
      const mk = (label, testid, fn, title) => {
        const b = U.el('button', { class: 'btn sm', dataset: { testid }, title: title || label, text: label });
        b.addEventListener('click', fn);
        bar.appendChild(b);
        return b;
      };
      mk('暂停', 'system-pause', () => { this.rt.control(instId, 'pause', {}); this.toast('已暂停 ' + inst.name); this.renderAll(); });
      mk('继续', 'system-resume', () => { this.rt.control(instId, 'resume', {}); this.renderAll(); });
      mk('单步', 'system-step', () => { this.rt.control(instId, 'step', {}); this.renderAll(); });
      mk('重启', 'system-restart', async () => {
        const r = await this.modal({ title: '重启子系统', body: '将结束子树内原有进程、重新载入内核源文件并从初始状态启动，已保存的文件会保留。', buttons: [{ label: '取消' }, { label: '重启', primary: true }] });
        if (r) { const x = this.rt.control(instId, 'restart', {}); this.toast(x.ok ? '已重启' : '重启失败：' + x.error); this.renderAll(); }
      });
      mk('快照', 'system-snapshot', () => {
        const r = this.rt.rawSyscall(this.root, 'subsystem_snapshot', [instId, null]);
        this.toast(r.ok ? '快照已保存：' + r.path : '快照失败：' + r.error, r.ok ? 'ok' : 'err');
      });
      mk('内核源文件', 'kernel-open', () => this.openApp('editor', { path: '/Systems/' + instId + '/kernel.nsl' }));
      mk('关闭', 'system-close', async () => {
        const r = await this.modal({ title: '关闭子系统', body: '关闭会停止整棵子树（' + inst.name + ' 及其全部后代）。已保存的快照仍可重新打开。', buttons: [{ label: '取消' }, { label: '关闭', primary: true, danger: true }] });
        if (r) { this.rt.control(instId, 'stop', {}); this.win.close(w.id); this.renderAll(); }
      });
      const wrap = U.el('div', { class: 'sys-canvas-wrap' });
      const cv = document.createElement('canvas');
      wrap.appendChild(cv);
      w.canvas = cv;
      w.badge = badge;
      body.append(bar, wrap);
      w.onResize = () => this.paintSubsystem(w);
      this.win.focus(w.id);
      this.buildTaskbarItems();
      return w;
    }
    paintSubsystem(w) {
      const inst = this.rt.getInstance(w.subsystem);
      if (!inst) return;
      const r = w.body.getBoundingClientRect();
      const wrap = w.canvas.parentElement;
      const cw = wrap.clientWidth, chh = wrap.clientHeight;
      if (cw < 2 || chh < 2) return;
      if (!inst.screen || inst.screen.w !== cw || inst.screen.h !== chh) {
        inst.screen = { w: cw, h: chh };
        inst.input.push({ kind: 'resize', w: cw, h: chh });
      }
      const cv = this.display.renderInstance(inst, cw, chh);
      const dpr = window.devicePixelRatio || 1;
      if (w.canvas.width !== cv.width || w.canvas.height !== cv.height) { w.canvas.width = cv.width; w.canvas.height = cv.height; }
      const ctx = w.canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w.canvas.width, w.canvas.height);
      ctx.drawImage(cv, 0, 0);
      w.badge.textContent = inst.paused ? '已暂停' : (inst.state === 'error' ? '内核错误' : '运行中');
      w.badge.className = 'sys-badge ' + (inst.paused ? 'pause' : (inst.state === 'error' ? 'err' : 'run'));
    }
    renderAll() {
      for (const w of this.win.list()) {
        if (w.subsystem) this.paintSubsystem(w);
        else if (w.projection) this.paintProjection(w);
      }
    }
    // ---------------- 设置 ----------------
    applySettings(s) {
      document.documentElement.style.setProperty('--accent', s.accent);
      const hex = s.accent.replace('#', '');
      const rgb = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)].join(',');
      document.documentElement.style.setProperty('--accent-rgb', rgb);
      this.wallEl.style.backgroundImage = 'url("' + this.wallpaperUrl(s.wallpaper) + '")';
      document.getElementById('app').style.zoom = s.scale;
      if (this.startMenu) {
        const n = this.startMenu.querySelector('.sm-user .n');
        if (n) n.textContent = s.systemName || 'outer';
      }
    }
    wallpaperUrl(name) {
      const root = U.projectRoot();
      const p = pathMod.join(root, 'assets', name || 'wallpaper-root.png');
      try { if (fsMod.existsSync(p)) return 'file:///' + p.replace(/\\/g, '/'); } catch (e) { /* ignore */ }
      return '';
    }
    refreshWallpapers() { this.applySettings(this.settings); }
    // ---------------- 键盘 ----------------
    onKey(e) {
      if (e.key === 'Escape') { this.hideStart(); this.hideContext(); }
      const w = this.win.focusedWin();
      if (w && w.app && w.app.onKey) { if (w.app.onKey(e) === true) return; }
    }
    // ---------------- 主循环 ----------------
    startLoop() {
      this._last = performance.now();
      const step = () => {
        const now = performance.now();
        let dt = (now - this._last) / 1000;
        this._last = now;
        if (dt > 0.1) dt = 0.1;
        this._acc += dt;
        const TICK = 1 / 60;
        let n = 0;
        while (this._acc >= TICK && n < 6) { this.rt.tick(TICK); this._acc -= TICK; n++; }
        this.paint();
        this.clockEl.children[0].textContent = U.fmtClock();
        this.clockEl.children[1].textContent = U.fmtDate();
        this.onTick.forEach((f) => f(dt));
        this._raf = requestAnimationFrame(step);
      };
      this._raf = requestAnimationFrame(step);
      // 窗口被完全遮挡时 rAF 可能停止：用定时器兜底继续推进
      setInterval(() => {
        const now = performance.now();
        if (now - this._last > 120) {
          const dt = Math.min(0.1, (now - this._last) / 1000);
          this._last = now;
          this.rt.tick(1 / 60);
          this.paint();
        }
      }, 60);
      document.addEventListener('visibilitychange', () => { this._last = performance.now(); this.renderAll(); });
    }
    paint() {
      for (const w of this.win.list()) {
        if (w.subsystem) this.paintSubsystem(w);
        else if (w.projection) this.paintProjection(w);
      }
      if (this.needsTaskbar) { this.needsTaskbar = false; this.buildTaskbarItems(); }
    }
    paintProjection(w) {
      if (!w.projection) return;
      const cv = this.display.renderProjection(w.projection, w);
      if (!cv) return;
      const wrap = w.canvas.parentElement;
      const cw = wrap.clientWidth, chh = wrap.clientHeight;
      if (cw < 2 || chh < 2) return;
      w.projection.w = cw; w.projection.h = chh;
      if (w.canvas.width !== cv.width || w.canvas.height !== cv.height) { w.canvas.width = cv.width; w.canvas.height = cv.height; }
      const ctx = w.canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w.canvas.width, w.canvas.height);
      ctx.drawImage(cv, 0, 0);
    }
  }

  // =========================================================================
  //  窗口管理（根系统）
  // =========================================================================
  class WindowManager {
    constructor(desktop) { this.d = desktop; this.windows = []; this.focused = null; this.z = 1; this.serial = 1; }
    list() { return this.windows; }
    get(id) { return this.windows.find((w) => w.id === id); }
    focusedWin() { return this.get(this.focused); }
    create(opts) {
      const d = this.d;
      const id = 'win-' + (this.serial++);
      const el = U.el('div', {
        class: 'app-window', dataset: { testid: 'app-window', appId: opts.appId, windowId: id, systemId: 'outer' }
      });
      const w = { id, appId: opts.appId, title: opts.title, el, x: 60 + (this.windows.length % 6) * 34, y: 40 + (this.windows.length % 6) * 30, width: opts.width || 860, height: opts.height || 580, minimized: false, maximized: false, zIndex: 0 };
      const tb = U.el('div', { class: 'titlebar', dataset: { testid: 'window-titlebar' } });
      w.tIcon = U.el('span', { class: 't-ic', html: I.icon((APPS[opts.appId] || {}).icon || 'dot', 17) });
      w.tTitle = U.el('span', { class: 't-title', text: opts.title });
      w.tSub = U.el('span', { class: 't-sub hidden' });
      const bMin = U.el('button', { class: 'wc', dataset: { testid: 'window-minimize' }, title: '最小化', html: I.icon('minimize', 13) });
      const bMax = U.el('button', { class: 'wc', dataset: { testid: 'window-maximize' }, title: '最大化', html: I.icon('maximize', 13) });
      const bClose = U.el('button', { class: 'wc close', dataset: { testid: 'window-close' }, title: '关闭', html: I.icon('close', 13) });
      bMin.addEventListener('click', (e) => { e.stopPropagation(); this.minimize(id); });
      bMax.addEventListener('click', (e) => { e.stopPropagation(); this.toggleMax(id); });
      bClose.addEventListener('click', (e) => { e.stopPropagation(); this.close(id); });
      tb.append(w.tIcon, w.tTitle, w.tSub, bMin, bMax, bClose);
      w.body = U.el('div', { class: 'window-body' });
      el.append(tb, w.body);
      for (const dir of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
        const h = U.el('div', { class: 'resize-handle ' + dir, dataset: { testid: 'window-resize', dir } });
        h.addEventListener('mousedown', (e) => this.startResize(e, w, dir));
        el.appendChild(h);
      }
      el.addEventListener('mousedown', () => this.focus(id));
      tb.addEventListener('mousedown', (e) => this.startDrag(e, w));
      tb.addEventListener('dblclick', (e) => { if (!e.target.closest('.wc')) this.toggleMax(id); });
      this.windows.push(w);
      d.winsEl.appendChild(el);
      this.apply(w);
      this.focus(id);
      d.buildTaskbarItems();
      return w;
    }
    apply(w) {
      const d = this.d;
      const dw = d.el.clientWidth, dh = d.el.clientHeight;
      if (w.maximized) { w.el.style.left = '0px'; w.el.style.top = '0px'; w.el.style.width = dw + 'px'; w.el.style.height = (dh - 62) + 'px'; }
      else {
        w.el.style.left = w.x + 'px'; w.el.style.top = w.y + 'px';
        w.el.style.width = w.width + 'px'; w.el.style.height = w.height + 'px';
      }
      w.el.style.zIndex = w.zIndex;
      w.el.classList.toggle('maximized', w.maximized);
      w.el.classList.toggle('minimized', w.minimized);
      w.el.classList.toggle('focused', this.focused === w.id);
      const bm = w.el.querySelector('[data-testid="window-maximize"]');
      if (bm) bm.innerHTML = I.icon(w.maximized ? 'restore' : 'maximize', 13);
      if (w.onResize) w.onResize();
    }
    focus(id) {
      const w = this.get(id);
      if (!w) return;
      if (this.focused === id && !w.minimized) return;
      this.focused = id;
      w.zIndex = ++this.z;
      if (w.minimized) w.minimized = false;
      this.windows.forEach((x) => this.apply(x));
      this.d.buildTaskbarItems();
      if (w.app && w.app.onFocus) w.app.onFocus();
    }
    minimize(id) { const w = this.get(id); if (!w) return; w.minimized = true; this.apply(w); if (this.focused === id) this.focused = null; this.windows.forEach((x) => this.apply(x)); this.d.buildTaskbarItems(); }
    toggleMax(id) { const w = this.get(id); if (!w) return; w.maximized = !w.maximized; this.apply(w); }
    toggleFromTaskbar(id) {
      const w = this.get(id);
      if (!w) return;
      if (this.focused === id && !w.minimized) this.minimize(id);
      else this.focus(id);
    }
    close(id) {
      const w = this.get(id);
      if (!w) return;
      if (w.app && w.app.onClose) { const r = w.app.onClose(); if (r === false) return; }
      if (w.subsystem) {
        const inst = this.d.rt.getInstance(w.subsystem);
        if (inst) { inst.paused = false; }
      }
      if (w.app && w.app.destroy) { try { w.app.destroy(); } catch (e) { /* ignore */ } }
      w.el.remove();
      this.windows = this.windows.filter((x) => x.id !== id);
      if (this.focused === id) { this.focused = null; const top = this.windows.filter((x) => !x.minimized).sort((a, b) => b.zIndex - a.zIndex)[0]; if (top) this.focus(top.id); }
      this.d.buildTaskbarItems();
    }
    startDrag(e, w) {
      if (e.target.closest('.wc') || w.maximized) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY, ox = w.x, oy = w.y;
      let ghost = null;
      const move = (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        w.x = ox + dx; w.y = oy + dy;
        if (w.y < 0) w.y = 0;
        this.apply(w);
        // 贴靠预览
        const dw = this.d.el.clientWidth;
        if (ev.clientX < 8 || ev.clientX > dw - 8 || ev.clientY < 8) {
          if (!ghost) { ghost = U.el('div', { class: 'snap-ghost' }); this.d.el.appendChild(ghost); }
          const left = ev.clientX < dw / 2;
          Object.assign(ghost.style, { left: (left ? 0 : dw / 2) + 'px', top: '0px', width: dw / 2 + 'px', height: (this.d.el.clientHeight - 62) + 'px' });
        } else if (ghost) { ghost.remove(); ghost = null; }
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        if (ghost) {
          const dw = this.d.el.clientWidth, dh = this.d.el.clientHeight;
          const left = parseFloat(ghost.style.left) < 10;
          ghost.remove();
          w.maximized = false;
          w.x = left ? 0 : dw / 2; w.y = 0; w.width = dw / 2; w.height = dh - 62;
          this.apply(w);
        }
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    }
    startResize(e, w, dir) {
      if (w.maximized) return;
      e.preventDefault(); e.stopPropagation();
      const sx = e.clientX, sy = e.clientY, ox = w.x, oy = w.y, ow = w.width, oh = w.height;
      const move = (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (dir.indexOf('e') >= 0) w.width = Math.max(320, ow + dx);
        if (dir.indexOf('s') >= 0) w.height = Math.max(220, oh + dy);
        if (dir.indexOf('w') >= 0) { w.width = Math.max(320, ow - dx); w.x = ox + (ow - w.width); }
        if (dir.indexOf('n') >= 0) { w.height = Math.max(220, oh - dy); w.y = oy + (oh - w.height); }
        this.apply(w);
      };
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    }
  }

  window.Desktop = Desktop;
  window.RootApps = APPS;
})();
