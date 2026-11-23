'use strict';
// ============ 桌面、窗口管理、任务栏、开始菜单、系统窗口 ============
(function (NS) {
  const DesktopAPI = {};
  const AppHost = {};
  NS.DesktopAPI = DesktopAPI;
  NS.AppHost = AppHost;

  const APPS = {};
  const APP_ORDER_ROOT = ['files', 'spreadsheet', 'widgets', 'editor', 'browser', 'tasks', 'settings'];
  const APP_ORDER_INNER = ['files', 'editor', 'tasks', 'player', 'charts'];

  AppHost.registerApp = function (def) { APPS[def.id] = def; };
  AppHost.appsFor = function (sys) {
    const order = sys.isRoot ? APP_ORDER_ROOT : APP_ORDER_INNER;
    return order.map(id => APPS[id]).filter(a => a && (sys.isRoot || a.inner !== false));
  };
  AppHost.get = id => APPS[id];
  AppHost.openApp = function (sys, appId, opts) {
    const def = APPS[appId];
    if (!def) return null;
    if (!sys.desktop) return null;
    // 同一应用单实例（投送除外）
    const existing = sys.windows.find(w => w.appId === appId && !w.isProjection);
    if (existing && def.single !== false) { sys.desktop.focusWindow(existing.id); return existing; }
    const win = sys.desktop.createWindow({
      appId,
      title: def.title,
      width: opts && opts.width || def.width || 640,
      height: opts && opts.height || def.height || 420,
      singular: def.single !== false
    });
    const proc = sys.registerApp(appId, def.title, { hostId: win.id, mem: def.mem || 0 });
    win.appProc = proc;
    try { def.open(win, sys, proc, opts); }
    catch (e) { console.error('app open failed', appId, e); sys.notify('应用启动失败', def.title + ': ' + e.message, { kind: 'error' }); }
    sys.desktop.renderTaskbar();
    return win;
  };
  AppHost.closeAppByPid = function (sys, pid, reason) {
    const p = sys.procs.get(pid);
    if (p && p.hostId && sys.desktop) sys.desktop.closeWindow(p.hostId, reason);
  };
  AppHost.onAppProcStateChange = function (sys, proc) {
    if (proc.state === 'suspended') {
      const win = sys.windows.find(w => w.id === proc.hostId);
      if (win && win.app && win.app.suspend) { try { win.app.suspend(); } catch (e) {} }
    } else if (proc.state === 'ready') {
      const win = sys.windows.find(w => w.id === proc.hostId);
      if (win && win.app && win.app.resume) { try { win.app.resume(); } catch (e) {} }
    }
  };
  AppHost.onProcOutput = function (sys, proc, line) {
    const win = sys.windows.find(w => w.id === proc.hostId);
    if (win && win.app && win.app.onOutput) { try { win.app.onOutput(line); } catch (e) {} }
    if (sys.desktop) sys.desktop.updateProcReadout(proc);
  };
  AppHost.keyEvent = function (sys, win, evt) {
    if (win && win.app && win.app.onKey) { try { return win.app.onKey(evt); } catch (e) {} }
    return false;
  };

  // ---------------- 桌面 ----------------
  let WIN_SEQ = 1;
  class Desktop {
    constructor(sys, container, opts) {
      opts = opts || {};
      this.sys = sys;
      this.container = container;
      this.isRoot = !!opts.isRoot;
      this.el = NS.el('div', { class: 'desktop-area', 'data-testid': 'os-desktop', 'data-system-id': sys.id });
      this.wallpaperEl = null;
      this.iconLayer = null;
      this.winLayer = null;
      this.taskbarEl = null;
      this.startMenuEl = null;
      this.trayPanel = null;
      this.ctxMenu = null;
      this.focusedWin = null;
      this.notifPanel = null;
      this.widgetsPanel = null;
      this.dragState = null;
      this.ghost = null;
      this.winSeq = 0;
      sys.desktop = this;
      this.build();
      this.bindEvents();
    }

    build() {
      const sys = this.sys;
      this.wallpaperEl = NS.el('div', { class: 'wallpaper' });
      if (sys.isRoot) {
        const wp = NS.Wallpaper.get(sys);
        if (wp) this.wallpaperEl.style.backgroundImage = 'url(' + wp + ')';
        this.wallpaperEl.style.filter = 'saturate(1.05)';
      } else {
        const hues = ['#1b2350', '#241b50', '#123a44', '#3a1f47', '#402a1a'];
        const h = hues[(sys.depth - 1) % hues.length];
        this.wallpaperEl.style.background = 'radial-gradient(1200px 800px at 30% 20%, ' + h + ', #0a0d18 75%)';
      }
      this.el.appendChild(this.wallpaperEl);
      this.el.appendChild(NS.el('div', { class: 'desktop-shade' }));
      this.iconLayer = NS.el('div', { class: 'desktop-icons' });
      this.el.appendChild(this.iconLayer);
      this.winLayer = NS.el('div', { style: { position: 'absolute', inset: '0', zIndex: '5', pointerEvents: 'none' } });
      this.el.appendChild(this.winLayer);
      this.renderIcons();
      this.taskbarEl = this.buildTaskbar();
      this.el.appendChild(this.taskbarEl);
    }

    wallpaper() { return this.wallpaperEl; }
    setWallpaper(dataUrl) { this.wallpaperEl.style.backgroundImage = 'url(' + dataUrl + ')'; }

    buildTaskbar() {
      const sys = this.sys;
      const bar = NS.el('div', { class: 'taskbar', 'data-system-id': sys.id });
      const start = NS.el('button', { class: 'tb-start', 'data-testid': 'start-toggle', 'aria-label': '开始' });
      start.appendChild(NS.el('span', { class: 'logo', text: 'N' }));
      start.appendChild(NS.el('span', { text: '开始' }));
      start.onclick = (e) => { e.stopPropagation(); this.toggleStartMenu(); };
      bar.appendChild(start);
      this.pinLayer = NS.el('div', { class: 'row', style: { gap: '.25rem' } });
      bar.appendChild(this.pinLayer);
      this.taskLayer = NS.el('div', { class: 'tb-tasks' });
      bar.appendChild(this.taskLayer);
      const tray = NS.el('div', { class: 'tb-tray' });
      const notif = NS.el('button', { class: 'tray-btn', 'data-testid': 'notifications-toggle', 'aria-label': '通知中心', title: '通知中心' });
      notif.appendChild(NS.el('span', { text: '🔔' }));
      notif.appendChild(NS.el('span', { class: 'tiny', text: '' }));
      notif.onclick = () => this.toggleNotifPanel();
      tray.appendChild(notif);
      this.notifBtn = notif;
      const widgetsBtn = NS.el('button', { class: 'tray-btn', 'data-testid': 'widgets-toggle', 'aria-label': '小组件', title: '小组件' });
      widgetsBtn.textContent = '📊';
      if (sys.isRoot) { widgetsBtn.onclick = () => this.toggleWidgetsPanel(); tray.appendChild(widgetsBtn); }
      const clock = NS.el('div', { class: 'tb-clock', 'aria-label': '时钟' });
      clock.appendChild(NS.el('div', { class: 't', text: '00:00' }));
      clock.appendChild(NS.el('div', { class: 'd', text: '' }));
      clock.onclick = () => { if (sys.isRoot) this.toggleWidgetsPanel(); };
      tray.appendChild(clock);
      this.clockEl = clock;
      this.quickSettingsBtn = NS.el('button', { class: 'tray-btn', 'aria-label': '快捷设置', title: '快捷设置', text: '⚙️' });
      this.quickSettingsBtn.onclick = () => AppHost.openApp(sys, 'settings', { section: 'quick' });
      tray.appendChild(this.quickSettingsBtn);
      bar.appendChild(tray);
      return bar;
    }

    renderPins() {
      if (!this.pinLayer) return;
      this.pinLayer.innerHTML = '';
      const apps = AppHost.appsFor(this.sys);
      apps.slice(0, 5).forEach(def => {
        const b = NS.el('button', { class: 'tb-pin', 'aria-label': def.title, title: def.title, 'data-app-id': def.id });
        b.textContent = def.icon;
        b.onclick = () => AppHost.openApp(this.sys, def.id);
        this.pinLayer.appendChild(b);
      });
    }

    renderIcons() {
      const sys = this.sys;
      this.iconLayer.innerHTML = '';
      const defs = AppHost.appsFor(sys);
      const extra = sys.isRoot ? [
        { appId: '__new-system', title: '新建子系统', icon: '➕', action: () => this.newSubsystem() },
        { appId: '__demo', title: 'Demo 素材', icon: '🗂️', action: () => AppHost.openApp(sys, 'files', { path: '/Demo' }) }
      ] : [{ appId: '__new-system', title: '新建子系统', icon: '➕', action: () => this.newSubsystem() }];
      defs.concat(extra).forEach(d => {
        const it = NS.el('div', { class: 'dicon', role: 'button', tabindex: '0', 'data-testid': 'desktop-icon', 'data-app-id': d.appId, 'aria-label': d.title });
        it.appendChild(NS.el('div', { class: 'glyph', text: d.icon }));
        it.appendChild(NS.el('div', { class: 'label', text: d.title }));
        it.addEventListener('click', (e) => { e.stopPropagation(); this.selectIcon(it); });
        it.addEventListener('dblclick', (e) => { e.stopPropagation(); d.action ? d.action() : AppHost.openApp(sys, d.appId); });
        it.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this.selectIcon(it); this.showCtxMenu(e.clientX, e.clientY, [
          { label: '打开', icon: '▶', fn: () => d.action ? d.action() : AppHost.openApp(sys, d.appId) }
        ]); });
        this.iconLayer.appendChild(it);
      });
      this.renderPins();
    }

    selectIcon(el) {
      this.iconLayer.querySelectorAll('.dicon.selected').forEach(x => x.classList.remove('selected'));
      el.classList.add('selected');
    }

    // ---------- 窗口 ----------
    defaultPolicy() {
      return { focus_on_click: true, raise_on_click: true, cascade: 28, snap_enabled: true, hit_test: 'top', z_order: 'focus' };
    }
    policy() { return Object.assign(this.defaultPolicy(), this.sys.policies.wm || {}); }

    createWindow(opts) {
      const sys = this.sys;
      const pol = this.policy();
      const id = 'win-' + sys.id + '-' + (++this.winSeq);
      const area = this.el.getBoundingClientRect();
      const w = Math.min(opts.width || 600, Math.max(280, area.width - 40));
      const h = Math.min(opts.height || 400, Math.max(200, area.height - 60));
      const n = sys.windows.length;
      const cx = (area.width - w) / 2 + (pol.cascade ? (n % 6) * pol.cascade : 0);
      const cy = (area.height - h) / 2 - 20 + (pol.cascade ? (n % 6) * pol.cascade : 0);
      const el = NS.el('div', {
        class: 'app-window', 'data-testid': 'app-window', 'data-window-id': id,
        'data-system-id': sys.id, 'data-app-id': opts.appId || 'app',
        style: { left: Math.max(4, cx) + 'px', top: Math.max(4, cy) + 'px', width: w + 'px', height: h + 'px', pointerEvents: 'auto' }
      });
      if (opts.cls) el.classList.add(opts.cls);
      const titlebar = NS.el('div', { class: 'win-titlebar', 'data-testid': 'window-titlebar' });
      const icon = NS.el('div', { class: 'wicon', text: (opts.icon || '▣') });
      const title = NS.el('div', { class: 'wtitle', text: opts.title || '', 'data-testid': 'window-title' });
      titlebar.appendChild(icon); titlebar.appendChild(title);
      if (opts.badge) { const b = NS.el('div', { class: 'wbadge', html: opts.badge }); titlebar.appendChild(b); }
      const btns = NS.el('div', { class: 'wbtns' });
      const min = NS.el('button', { class: 'wbtn', 'data-testid': 'window-minimize', 'aria-label': '最小化', text: '—' });
      const max = NS.el('button', { class: 'wbtn', 'data-testid': 'window-maximize', 'aria-label': '最大化', text: '▢' });
      const close = NS.el('button', { class: 'wbtn close', 'data-testid': 'window-close', 'aria-label': '关闭', text: '✕' });
      btns.append(min, max, close);
      titlebar.appendChild(btns);
      el.appendChild(titlebar);
      const body = NS.el('div', { class: 'win-body' });
      el.appendChild(body);
      // 调整大小手柄
      ['n','s','e','w','ne','nw','se','sw'].forEach(d => {
        const r = NS.el('div', { class: 'win-resize ' + d, 'data-dir': d, 'data-testid': d === 'se' ? 'window-resize' : undefined });
        el.appendChild(r);
      });
      this.winLayer.appendChild(el);
      const win = {
        id, sysId: sys.id, appId: opts.appId || 'app', title: opts.title || '',
        el, body, titleEl: title, x: el.offsetLeft, y: el.offsetTop, w, h,
        z: sys.windows.length, state: 'normal', focused: false, app: null, appProc: null,
        onClose: opts.onClose || null, mount: opts.mount || null, isProjection: !!opts.isProjection,
        sourceInfo: opts.sourceInfo || null, minimized: false, maximized: false, prevRect: null
      };
      sys.windows.push(win);
      if (opts.content) body.appendChild(opts.content);
      if (opts.mount) { try { win.app = opts.mount(win, body, sys) || {}; } catch (e) { console.error(e); } }
      // 事件
      min.onclick = (e) => { e.stopPropagation(); this.minimizeWindow(win); };
      max.onclick = (e) => { e.stopPropagation(); this.toggleMaximize(win); };
      close.onclick = (e) => { e.stopPropagation(); this.closeWindow(win.id); };
      titlebar.addEventListener('dblclick', (e) => { if (e.target.closest('.wbtns')) return; this.toggleMaximize(win); });
      el.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.wbtns')) return;
        this.focusWindow(win.id);
      });
      this.makeDraggable(win, titlebar);
      this.makeResizable(win);
      if (!(opts.noFocus)) this.focusWindow(win.id);
      this.renderTaskbar();
      NS.AppHost.onWindowCreated && NS.AppHost.onWindowCreated(win);
      return win;
    }

    windowById(id) { return this.sys.windows.find(w => w.id === id); }

    focusWindow(id) {
      const win = this.windowById(id);
      if (!win) return;
      const pol = this.policy();
      if (pol.z_order === 'focus' || pol.raise_on_click) {
        win.z = Math.max(...this.sys.windows.map(w => w.z)) + 1;
      }
      this.sys.windows.forEach(w => {
        w.focused = (w === win);
        w.el.classList.toggle('focused', w === win);
        w.el.style.zIndex = w.state === 'min' ? 1 : (5 + w.z);
      });
      this.focusedWin = win;
      this.renderTaskbar();
    }

    minimizeWindow(win) {
      win.state = 'min'; win.minimized = true;
      win.el.style.display = 'none';
      this.sys.windows.forEach(w => { if (w !== win && w.state !== 'min') { this.focusedWin = w; } });
      const next = this.sys.windows.filter(w => w !== win && w.state !== 'min').sort((a, b) => b.z - a.z)[0];
      if (next) this.focusWindow(next.id); else { this.focusedWin = null; this.renderTaskbar(); }
      this.renderTaskbar();
    }
    restoreWindow(win) {
      win.state = 'normal'; win.minimized = false;
      win.el.style.display = '';
      this.focusWindow(win.id);
    }
    toggleMaximize(win) {
      const area = this.el.getBoundingClientRect();
      if (win.state === 'max') {
        win.state = 'normal';
        win.el.classList.remove('maximized');
        Object.assign(win.el.style, { left: win.prevRect.x + 'px', top: win.prevRect.y + 'px', width: win.prevRect.w + 'px', height: win.prevRect.h + 'px' });
      } else {
        win.prevRect = { x: win.el.offsetLeft, y: win.el.offsetTop, w: win.el.offsetWidth, h: win.el.offsetHeight };
        win.state = 'max';
        win.el.classList.add('maximized');
        Object.assign(win.el.style, { left: '0px', top: '0px', width: area.width + 'px', height: area.height + 'px' });
      }
      this.focusWindow(win.id);
    }
    snapPreview(rect) {
      if (!this.ghost) {
        this.ghost = NS.el('div', { class: 'max-ghost' });
        document.getElementById('overlay-layer').appendChild(this.ghost);
      }
      Object.assign(this.ghost.style, { display: 'block', left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' });
    }
    clearSnap() { if (this.ghost) this.ghost.style.display = 'none'; }

    closeWindow(id, reason) {
      const win = this.windowById(id);
      if (!win) return;
      if (win.appId === 'system' && !reason) {
        NS.confirmDialog({
          title: '关闭子系统', message: '关闭系统窗口将停止整棵子系统，其中的程序与窗口都会结束。已保存的快照仍可重新打开。',
          okText: '停止并关闭', cancelText: '取消', danger: true
        }).then(ok => { if (ok) this.closeWindow(id, 'user-close'); });
        return;
      }
      if (win.app && win.app.destroy) { try { win.app.destroy(); } catch (e) {} }
      if (win.appProc) { this.sys.killProc(win.appProc.pid, reason || '窗口关闭'); }
      if (win.onClose) { try { win.onClose(reason); } catch (e) {} }
      if (win.isProjection && win.sourceInfo) NS.ProjectionHost.onProjectionClosed(win);
      win.el.remove();
      const i = this.sys.windows.indexOf(win); if (i >= 0) this.sys.windows.splice(i, 1);
      if (this.focusedWin === win) {
        this.focusedWin = null;
        const next = this.sys.windows.filter(w => w.state !== 'min').sort((a, b) => b.z - a.z)[0];
        if (next) this.focusWindow(next.id);
      }
      this.renderTaskbar();
      if (win.appId === 'system') {
        const childId = win.systemId;
        if (childId) this.sys.stopSubtree(childId, reason || 'user-close');
      }
    }

    makeDraggable(win, handle) {
      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (win.state === 'max') return;
        const startX = e.clientX, startY = e.clientY;
        const ox = win.el.offsetLeft, oy = win.el.offsetTop;
        const area = this.el.getBoundingClientRect();
        const pol = this.policy();
        let moved = false;
        const onMove = (ev) => {
          const dx = ev.clientX - startX, dy = ev.clientY - startY;
          if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
          moved = true;
          win.el.classList.add('dragging');
          let nx = ox + dx, ny = oy + dy;
          ny = NS.clamp(ny, 0, area.height - 40);
          if (pol.snap_enabled) {
            if (ev.clientX <= area.left + 4) { this.snapPreview({ x: 0, y: 0, w: area.width / 2, h: area.height }); this._snapDir = 'left'; }
            else if (ev.clientX >= area.right - 4) { this.snapPreview({ x: area.width / 2, y: 0, w: area.width / 2, h: area.height }); this._snapDir = 'right'; }
            else if (ev.clientY <= area.top + 4) { this.snapPreview({ x: 0, y: 0, w: area.width, h: area.height }); this._snapDir = 'max'; }
            else { this.clearSnap(); this._snapDir = null; }
          }
          Object.assign(win.el.style, { left: nx + 'px', top: ny + 'px' });
        };
        const onUp = (ev) => {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          win.el.classList.remove('dragging');
          this.clearSnap();
          if (this._snapDir === 'max') this.toggleMaximize(win);
          else if (this._snapDir === 'left' || this._snapDir === 'right') {
            const area2 = this.el.getBoundingClientRect();
            Object.assign(win.el.style, {
              left: (this._snapDir === 'left' ? 0 : area2.width / 2) + 'px', top: '0px',
              width: (area2.width / 2) + 'px', height: area2.height + 'px'
            });
          }
          this._snapDir = null;
          this.focusWindow(win.id);
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        e.preventDefault();
      });
    }

    makeResizable(win) {
      win.el.querySelectorAll('.win-resize').forEach(handle => {
        handle.addEventListener('pointerdown', (e) => {
          if (e.button !== 0 || win.state === 'max') return;
          e.stopPropagation();
          const dir = handle.getAttribute('data-dir');
          const startX = e.clientX, startY = e.clientY;
          const ox = win.el.offsetLeft, oy = win.el.offsetTop, ow = win.el.offsetWidth, oh = win.el.offsetHeight;
          const onMove = (ev) => {
            const dx = ev.clientX - startX, dy = ev.clientY - startY;
            let nx = ox, ny = oy, nw = ow, nh = oh;
            if (dir.includes('e')) nw = Math.max(280, ow + dx);
            if (dir.includes('s')) nh = Math.max(200, oh + dy);
            if (dir.includes('w')) { nw = Math.max(280, ow - dx); nx = ox + (ow - nw); }
            if (dir.includes('n')) { nh = Math.max(200, oh - dy); ny = oy + (oh - nh); }
            Object.assign(win.el.style, { left: nx + 'px', top: ny + 'px', width: nw + 'px', height: nh + 'px' });
          };
          const onUp = () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            this.focusWindow(win.id);
          };
          document.addEventListener('pointermove', onMove);
          document.addEventListener('pointerup', onUp);
          e.preventDefault();
        });
      });
    }

    renderTaskbar() {
      if (!this.taskLayer) return;
      this.taskLayer.innerHTML = '';
      const wins = this.sys.windows.filter(w => w.appId !== 'projection' || true);
      wins.forEach(w => {
        const b = NS.el('button', {
          class: 'tb-task' + (w.focused && w.state !== 'min' ? ' focused' : ''),
          'data-testid': 'taskbar-item', 'data-window-id': w.id, 'data-app-id': w.appId,
          'aria-label': w.title
        });
        b.appendChild(NS.el('span', { class: 'tg', text: (AppHost.get(w.appId) || {}).icon || '▣' }));
        b.appendChild(NS.el('span', { text: w.title }));
        b.onclick = () => {
          if (w.state === 'min') this.restoreWindow(w);
          else if (w.focused) this.minimizeWindow(w);
          else this.focusWindow(w.id);
        };
        this.taskLayer.appendChild(b);
      });
    }

    // ---------- 开始菜单 ----------
    toggleStartMenu(force) {
      if (this.startMenuEl && force !== true) { this.startMenuEl.remove(); this.startMenuEl = null; return; }
      if (this.startMenuEl) { this.startMenuEl.remove(); this.startMenuEl = null; return; }
      const sys = this.sys;
      const menu = NS.el('div', { class: 'start-menu', 'data-testid': 'start-menu', 'data-system-id': sys.id });
      const searchWrap = NS.el('div', { class: 'sm-search' });
      const search = NS.el('input', { class: 'inp', placeholder: '搜索应用…', 'data-testid': 'start-search', 'aria-label': '搜索应用' });
      searchWrap.appendChild(search);
      menu.appendChild(searchWrap);
      const apps = NS.el('div', { class: 'sm-apps' });
      const all = AppHost.appsFor(sys);
      const render = (kw) => {
        apps.innerHTML = '';
        const list = all.filter(d => !kw || d.title.includes(kw) || d.id.includes(kw));
        const appsSection = NS.el('div', { class: 'sm-section', text: '应用' });
        apps.appendChild(appsSection);
        list.forEach(d => {
          const it = NS.el('button', {
            class: 'sm-app', 'data-testid': 'launch-' + d.id, 'data-app-id': d.id, 'aria-label': d.title
          });
          it.appendChild(NS.el('span', { class: 'glyph', text: d.icon }));
          const txt = NS.el('div', {});
          txt.appendChild(NS.el('div', { class: 'nm', text: d.title }));
          txt.appendChild(NS.el('div', { class: 'ds', text: d.desc || '' }));
          it.appendChild(txt);
          it.onclick = () => { this.toggleStartMenu(); AppHost.openApp(sys, d.id); };
          apps.appendChild(it);
        });
        const tools = NS.el('div', { class: 'sm-section', text: '系统' });
        apps.appendChild(tools);
        const newSys = NS.el('button', { class: 'sm-app', 'data-testid': 'system-new', 'aria-label': '新建子系统' });
        newSys.appendChild(NS.el('span', { class: 'glyph', text: '➕' }));
        const t2 = NS.el('div', {});
        t2.appendChild(NS.el('div', { class: 'nm', text: '新建子系统' }));
        t2.appendChild(NS.el('div', { class: 'ds', text: '在当前系统内创建直属子系统' }));
        newSys.appendChild(t2);
        newSys.onclick = () => { this.toggleStartMenu(); this.newSubsystem(); };
        apps.appendChild(newSys);
      };
      search.addEventListener('input', () => render(search.value.trim()));
      render('');
      menu.appendChild(apps);
      const foot = NS.el('div', { class: 'sm-foot' });
      foot.appendChild(NS.el('div', { class: 'sm-sys' }, [NS.el('span', { class: 'sm-dot' }), NS.el('span', { text: sys.name + (sys.isRoot ? '（根系统）' : ' · 第 ' + (sys.depth + 1) + ' 层') })]));
      const stateTxt = sys.state === 'running' ? (sys.paused ? '已暂停' : '运行中') : sys.state === 'errored' ? '内核错误' : '已停止';
      foot.appendChild(NS.el('div', { class: 'row tiny muted' }, [NS.el('span', { text: '虚拟时间 ' + NS.fmtClock(sys.vtime) }), NS.el('span', { text: '· ' + stateTxt })]));
      menu.appendChild(foot);
      this.el.appendChild(menu);
      this.startMenuEl = menu;
      search.focus();
      const close = (e) => { if (!menu.contains(e.target)) { this.toggleStartMenu(); document.removeEventListener('pointerdown', close); } };
      setTimeout(() => document.addEventListener('pointerdown', close), 10);
    }

    // ---------- 右键菜单 ----------
    showCtxMenu(x, y, items) {
      this.closeCtx();
      const menu = NS.el('div', { class: 'ctx-menu', 'data-testid': 'ctx-menu' });
      items.forEach(it => {
        if (it.sep) { menu.appendChild(NS.el('div', { class: 'ctx-sep' })); return; }
        const b = NS.el('button', { class: 'ctx-item' + (it.danger ? ' danger' : ''), 'aria-label': it.label });
        b.appendChild(NS.el('span', { text: it.icon || '' }));
        b.appendChild(NS.el('span', { text: it.label }));
        if (it.checked) b.appendChild(NS.el('span', { class: 'ctx-check', text: '✓' }));
        b.onclick = () => { this.closeCtx(); it.fn && it.fn(); };
        menu.appendChild(b);
      });
      document.getElementById('ctx-layer').appendChild(menu);
      this.ctxMenu = menu;
      const r = menu.getBoundingClientRect();
      menu.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
      menu.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
      const close = (e) => { if (!menu.contains(e.target)) { this.closeCtx(); document.removeEventListener('pointerdown', close); } };
      setTimeout(() => document.addEventListener('pointerdown', close), 10);
    }
    closeCtx() { if (this.ctxMenu) { this.ctxMenu.remove(); this.ctxMenu = null; } }

    // ---------- 通知 ----------
    toggleNotifPanel() {
      if (this.notifPanel) { this.notifPanel.remove(); this.notifPanel = null; return; }
      const sys = this.sys;
      const panel = NS.el('div', { class: 'panel-pop', 'data-testid': 'notifications-panel', style: { right: '.6rem', bottom: 'calc(var(--taskbar-h) + .6rem)', width: '20rem', maxHeight: '60%' } });
      const head = NS.el('div', { class: 'panel-head' }, [NS.el('span', { text: '通知中心' }), (() => { const x = NS.el('div', { class: 'x', text: '✕' }); x.onclick = () => this.toggleNotifPanel(); return x; })()]);
      panel.appendChild(head);
      const body = NS.el('div', { class: 'panel-body' });
      if (!sys.notifications.length) body.appendChild(NS.el('div', { class: 'empty', text: '暂无通知' }));
      sys.notifications.forEach(n => {
        const it = NS.el('div', { class: 'notif-item' });
        it.appendChild(NS.el('div', { class: 'tg', text: n.kind === 'error' ? '⛔' : n.kind === 'timer' ? '⏰' : '🔔' }));
        const mid = NS.el('div', { style: { flex: 1 } });
        mid.appendChild(NS.el('div', { class: 'tt', text: n.title }));
        if (n.body) mid.appendChild(NS.el('div', { class: 'tb', text: n.body }));
        it.appendChild(mid);
        it.appendChild(NS.el('div', { class: 'tm', text: new Date(n.time).toLocaleTimeString() }));
        body.appendChild(it);
      });
      panel.appendChild(body);
      this.el.appendChild(panel);
      this.notifPanel = panel;
    }

    toggleWidgetsPanel() {
      if (this.widgetsPanel) { this.widgetsPanel.remove(); this.widgetsPanel = null; return; }
      const win = AppHost.openApp(this.sys, 'widgets', { panel: true });
      if (win) this.widgetsPanel = win.el;
    }

    onNotify(n) {
      if (this.notifBtn) {
        const c = this.notifBtn.querySelector('.tiny');
        if (c) c.textContent = this.sys.unreadCount() || '';
      }
      if (this.notifPanel) this.toggleNotifPanel(), this.toggleNotifPanel();
      if (n.kind === 'error' || n.kind === 'timer') {
        NS.toast({ icon: n.kind === 'error' ? '⛔' : '⏰', title: n.title, body: n.body, systemId: this.sys.id });
      }
    }
    markNotifsRead() { this.sys.notifications.forEach(n => n.read = true); if (this.notifBtn) { const c = this.notifBtn.querySelector('.tiny'); if (c) c.textContent = ''; } }

    updateClock() {
      if (!this.clockEl) return;
      const t = NS.fmtClock(this.sys.vtime);
      this.clockEl.querySelector('.t').textContent = t;
      const dsecs = Math.floor(this.sys.vtime / 1000);
      const day = Math.floor(dsecs / 86400) + 1;
      const hh = Math.floor((dsecs % 86400) / 3600), mm = Math.floor((dsecs % 3600) / 60);
      this.clockEl.querySelector('.d').textContent = '第' + day + '天 ' + NS.pad2(hh) + ':' + NS.pad2(mm);
    }

    updateProcReadout(proc) { /* 任务管理器自行刷新 */ }

    newSubsystem() {
      const sys = this.sys;
      if (sys.state !== 'running' || sys.paused) { NS.toast({ title: '无法创建子系统', body: '当前系统处于暂停或异常状态' }); return; }
      const r = sys.createChild({});
      if (r.error) { NS.toast({ title: '创建失败', body: r.error }); return; }
      sys.notify('创建子系统', '已创建 ' + r.sys.name + '（第 ' + (r.sys.depth + 1) + ' 层）', { kind: 'info' });
      this.renderIcons();
    }

    bindEvents() {
      this.el.addEventListener('pointerdown', (e) => {
        if (e.target === this.el || e.target === this.wallpaperEl || e.target === this.winLayer) {
          this.sys.windows.forEach(w => { w.focused = false; w.el.classList.remove('focused'); });
          this.focusedWin = null;
          this.renderTaskbar();
        }
      });
      this.el.addEventListener('contextmenu', (e) => {
        if (e.target === this.el || e.target === this.wallpaperEl) {
          e.preventDefault();
          this.showCtxMenu(e.clientX, e.clientY, [
            { label: '新建子系统', icon: '➕', fn: () => this.newSubsystem() },
            { sep: true },
            { label: '刷新桌面', icon: '↻', fn: () => { this.renderIcons(); this.renderTaskbar(); } },
            { label: '系统信息', icon: 'ℹ', fn: () => NS.Bench.showSysInfo(this.sys) }
          ]);
        }
      });
      this.el.addEventListener('dragover', (e) => { e.preventDefault(); });
      this.el.addEventListener('drop', (e) => { e.preventDefault(); NS.DragHost.handleDrop(this.sys, this, e); });
    }
  }

  // ---------------- DesktopAPI ----------------
  DesktopAPI.create = function (sys, container, opts) { return new Desktop(sys, container, opts); };
  DesktopAPI.applyUiOp = function (sys, op, proc) {
    if (!op || !op.cmd) return;
    if (op.cmd === 'notify') sys.notify(op.title || '通知', op.body || '', {});
  };
  DesktopAPI.onSystemCreated = function (sys) {
    if (!sys.parent || !sys.parent.desktop) return;
    const parentDesk = sys.parent.desktop;
    const win = parentDesk.createWindow({
      appId: 'system',
      title: sys.name + '（第 ' + (sys.depth + 1) + ' 层）',
      icon: '🖥️',
      badge: '<span class="dot" style="background:' + (sys.accent || '#7c6cf0') + '"></span>' + sys.name + ' · 运行中',
      width: Math.min(980, parentDesk.el.clientWidth * 0.8),
      height: Math.min(640, parentDesk.el.clientHeight * 0.8)
    });
    win.systemId = sys.id;
    win.el.classList.add('sys-window');
    const wrap = NS.el('div', { class: 'sys-desk-wrap' });
    win.body.appendChild(wrap);
    sys.desktopHost = wrap;
    DesktopAPI.mountChild(sys, wrap);
    const badge = win.el.querySelector('.wbadge');
    win._updateBadge = () => {
      if (!badge) return;
      const st = sys.state === 'running' ? (sys.paused ? '已暂停' : '运行中') : sys.state === 'errored' ? '内核错误' : '已停止';
      badge.innerHTML = '<span class="dot" style="background:' + (sys.state === 'errored' ? '#f87171' : sys.paused ? '#fbbf24' : '#4ade80') + '"></span>' + sys.name + ' · ' + st;
    };
    win._updateBadge();
    if (sys.state === 'errored') NS.DesktopAPI.showKernelError(win, sys);
    return win;
  };
  DesktopAPI.mountChild = function (sys, wrap) {
    sys.deskWrap = wrap;
    const desk = new Desktop(sys, wrap);
    sys.desktop = desk;
    wrap.appendChild(desk.el);
    return desk;
  };
  DesktopAPI.showKernelError = function (win, sys) {
    if (!win.body) return;
    let box = win.body.querySelector('.kernel-error-box');
    if (!box) {
      box = NS.el('div', { class: 'kernel-error-box', 'data-testid': 'kernel-error' });
      win.body.insertBefore(box, win.body.firstChild);
    }
    box.textContent = '⚠ 内核错误：' + (sys.kernelError || '未知错误') + '\n该子系统已停止运行，父系统与兄弟系统不受影响。请在父系统编辑器中修正内核源文件后重启。';
  };
  DesktopAPI.onSystemStopped = function (sys) {
    if (sys.desktop) { sys.desktop.el.remove(); }
    if (sys.deskWrap) { sys.deskWrap.remove(); }
    if (sys.parent && sys.parent.desktop) {
      const win = sys.parent.windows.find(w => w.systemId === sys.id);
      if (win) { win.el.remove(); const i = sys.parent.windows.indexOf(win); if (i >= 0) sys.parent.windows.splice(i, 1); sys.parent.desktop.renderTaskbar(); }
    }
  };
  DesktopAPI.onSystemRestarted = function (sys) {
    if (sys.desktop) { sys.desktop.el.remove(); sys.desktop = null; }
    if (sys.deskWrap) {
      const wrap = sys.deskWrap;
      wrap.innerHTML = '';
      DesktopAPI.mountChild(sys, wrap);
    } else if (sys.parent && sys.parent.desktop) {
      DesktopAPI.onSystemCreated(sys);
    }
    if (sys.parent && sys.parent.desktop) {
      const win = sys.parent.windows.find(w => w.systemId === sys.id);
      if (win) { const b = win.el.querySelector('.kernel-error-box'); if (b) b.remove(); if (win._updateBadge) win._updateBadge(); }
    }
  };
  DesktopAPI.refreshSystemBadge = function (sys) {
    if (sys.parent && sys.parent.desktop) {
      const win = sys.parent.windows.find(w => w.systemId === sys.id);
      if (win && win._updateBadge) win._updateBadge();
    }
  };

  NS.Desktop = Desktop;
})(window.NOS = window.NOS || {});