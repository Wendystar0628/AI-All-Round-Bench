/*
 * 桌面外壳：根系统与各级子系统的桌面、窗口、任务栏、开始菜单、控件渲染。
 */
(function (g) {
  const NOS = (g.NOS = g.NOS || {});

  const ICONS = {
    files: '<svg viewBox="0 0 24 24"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    spreadsheet: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 9h18M9 9v11M15 9v11M3 15h18" stroke="currentColor" stroke-width="1.2"/></svg>',
    widgets: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="13" y="3" width="8" height="5" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="13" width="8" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="13" y="10" width="8" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    editor: '<svg viewBox="0 0 24 24"><path d="M5 3h9l5 5v13H5z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M14 3v5h5M8 13h8M8 17h5" stroke="currentColor" stroke-width="1.3"/></svg>',
    tasks: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 9h18M8 13h3M8 16h6" stroke="currentColor" stroke-width="1.3"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3" stroke="currentColor" stroke-width="1.5"/></svg>',
    browser: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 12h18M12 3c2.6 2.4 4 5.5 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.5-4-9s1.4-6.6 4-9z" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    player: '<svg viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 9.5l5 2.5-5 2.5z" fill="currentColor"/></svg>',
    charts: '<svg viewBox="0 0 24 24"><path d="M4 20V9M10 20V4M16 20v-7M22 20H2" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>',
    system: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="7" y="7" width="10" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 19h8" stroke="currentColor" stroke-width="1.3"/></svg>',
    folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    doc: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M14 3v4h4" stroke="currentColor" stroke-width="1.3"/></svg>',
    app: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>',
  };
  NOS.ICONS = ICONS;
  NOS.icon = function (name, cls) {
    return '<span class="ico ' + (cls || '') + '">' + (ICONS[name] || ICONS.app) + '</span>';
  };

  /* ================= 窗口模型 ================= */
  class Win {
    constructor(desktop, opts) {
      this.desktop = desktop;
      this.id = opts.id || ('w' + Math.random().toString(36).slice(2, 8));
      this.systemId = desktop.sys.id;
      this.appId = opts.appId || 'app';
      this.title = opts.title || '窗口';
      this.x = opts.x === undefined ? 40 + Math.floor(Math.random() * 60) : opts.x;
      this.y = opts.y === undefined ? 30 + Math.floor(Math.random() * 50) : opts.y;
      this.w = opts.w || 720;
      this.h = opts.h || 460;
      this.minW = opts.minW || 260;
      this.minH = opts.minH || 180;
      this.state = 'normal';
      this.z = 10;
      this.focused = false;
      this.content = opts.content || null;   // DOM 元素
      this.render = opts.render || null;     // 自定义渲染函数
      this.onClose = opts.onClose || null;
      this.onResize = opts.onResize || null;
      this.onFocus = opts.onFocus || null;
      this.meta = opts.meta || {};
      this.el = null;
    }
  }

  /* ================= 桌面 ================= */
  class Desktop {
    constructor(rt, sys, host, depth) {
      this.rt = rt;
      this.sys = sys;
      this.host = host;
      this.depth = depth || 0;
      this.windows = [];
      this.el = null;
      this.winLayer = null;
      this.iconLayer = null;
      this.taskbarEl = null;
      this.startMenuEl = null;
      this.scale = 1;
    }
    /* ---------- 构建 DOM ---------- */
    build(container) {
      const sys = this.sys;
      const el = document.createElement('div');
      el.className = 'desktop' + (this.depth === 0 ? ' desktop-root' : ' desktop-sub');
      el.setAttribute('data-system-id', sys.id);
      el.setAttribute('data-depth', String(this.depth));
      el.style.setProperty('--accent', sys.accent || '#7c5cff');
      const wall = document.createElement('div');
      wall.className = 'wallpaper';
      wall.style.backgroundImage = sys.wallpaper ? 'url(' + sys.wallpaper + ')' : 'none';
      el.appendChild(wall);
      const icons = document.createElement('div');
      icons.className = 'icon-layer';
      icons.setAttribute('data-testid', 'desktop-icons');
      el.appendChild(icons);
      this.iconLayer = icons;
      const winLayer = document.createElement('div');
      winLayer.className = 'win-layer';
      el.appendChild(winLayer);
      this.winLayer = winLayer;
      const tb = document.createElement('div');
      tb.className = 'taskbar';
      tb.setAttribute('data-testid', 'taskbar');
      el.appendChild(tb);
      this.taskbarEl = tb;
      this.el = el;
      container.appendChild(el);
      this.renderTaskbar();
      this.bindInput(el);
      return el;
    }
    /* ---------- 桌面图标 ---------- */
    setIcons(list) {
      this.iconLayer.innerHTML = '';
      for (const it of list) {
        const d = document.createElement('div');
        d.className = 'desktop-icon';
        d.setAttribute('data-testid', 'desktop-icon');
        d.setAttribute('data-app-id', it.appId || '');
        if (it.path) d.setAttribute('data-file-path', it.path);
        d.innerHTML = NOS.icon(it.icon || it.appId || 'app') + '<span class="label">' + (it.label || '') + '</span>';
        d.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectIcon(d);
        });
        d.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          this.host.onIconOpen(this, it);
        });
        d.addEventListener('contextmenu', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.host.onDesktopContextMenu(this, e, it);
        });
        this.iconLayer.appendChild(d);
      }
    }
    selectIcon(el) {
      this.iconLayer.querySelectorAll('.desktop-icon.selected').forEach((x) => x.classList.remove('selected'));
      el.classList.add('selected');
    }
    /* ---------- 窗口 ---------- */
    open(opts) {
      const win = new Win(this, opts);
      this.windows.push(win);
      this.renderWindow(win);
      this.focus(win);
      this.renderTaskbar();
      return win;
    }
    close(win) {
      if (win.onClose) win.onClose();
      this.windows = this.windows.filter((w) => w !== win);
      if (win.el) win.el.remove();
      this.renderTaskbar();
      const next = this.windows.filter((w) => w.state !== 'min').sort((a, b) => b.z - a.z)[0];
      if (next) this.focus(next);
    }
    focus(win) {
      for (const w of this.windows) { w.focused = false; if (w.el) w.el.classList.remove('focused'); }
      win.focused = true;
      win.z = ++this.zTop || (this.zTop = 100);
      if (win.el) { win.el.classList.add('focused'); win.el.style.zIndex = String(win.z); }
      this.renderTaskbar();
      if (win.onFocus) win.onFocus();
    }
    minimize(win) { win.state = 'min'; this.syncWindows(); }
    maximize(win) {
      if (win.state === 'max') { win.state = 'normal'; }
      else { win.state = 'max'; win.restore = { x: win.x, y: win.y, w: win.w, h: win.h }; }
      this.syncWindows();
    }
    restore(win) { win.state = 'normal'; this.syncWindows(); }
    snap(win, side) {
      const host = this.winLayer.getBoundingClientRect();
      if (side === 'left') { win.x = 0; win.y = 0; win.w = Math.floor(host.width / 2); win.h = host.height; }
      else { win.x = Math.floor(host.width / 2); win.y = 0; win.w = host.width - Math.floor(host.width / 2); win.h = host.height; }
      win.state = 'normal';
      this.syncWindows();
    }
    renderWindow(win) {
      const el = document.createElement('div');
      el.className = 'app-window';
      el.setAttribute('data-testid', 'app-window');
      el.setAttribute('data-window-id', win.id);
      el.setAttribute('data-app-id', win.appId);
      el.setAttribute('data-system-id', win.systemId);
      el.innerHTML =
        '<div class="titlebar" data-testid="window-titlebar">' +
        '<span class="title-ico">' + NOS.icon(win.appId === 'projection' ? 'player' : win.appId) + '</span>' +
        '<span class="title-text"></span>' +
        '<span class="win-btns">' +
        '<button data-testid="window-minimize" title="最小化">▁</button>' +
        '<button data-testid="window-maximize" title="最大化">▢</button>' +
        '<button data-testid="window-close" title="关闭">✕</button>' +
        '</span></div>' +
        '<div class="win-body"></div>';
      win.el = el;
      const body = el.querySelector('.win-body');
      if (win.content) body.appendChild(win.content);
      if (win.render) win.render(body, win);
      el.querySelector('.title-text').textContent = win.title;
      el.querySelector('[data-testid="window-minimize"]').addEventListener('click', (e) => { e.stopPropagation(); this.minimize(win); });
      el.querySelector('[data-testid="window-maximize"]').addEventListener('click', (e) => { e.stopPropagation(); this.maximize(win); });
      el.querySelector('[data-testid="window-close"]').addEventListener('click', (e) => { e.stopPropagation(); this.close(win); });
      const tb = el.querySelector('.titlebar');
      tb.addEventListener('dblclick', () => this.maximize(win));
      tb.addEventListener('mousedown', (e) => this.startDrag(e, win));
      tb.addEventListener('pointerdown', (e) => this.focus(win));
      this.winLayer.appendChild(el);
      this.syncWindows();
    }
    startDrag(e, win) {
      if (win.state === 'max') return;
      const sx = e.clientX, sy = e.clientY;
      const ox = win.x, oy = win.y;
      const move = (ev) => {
        win.x = ox + (ev.clientX - sx);
        win.y = oy + (ev.clientY - sy);
        this.syncWindows();
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      e.preventDefault();
    }
    syncWindows() {
      for (const win of this.windows) {
        if (!win.el) continue;
        win.el.style.display = win.state === 'min' ? 'none' : 'block';
        if (win.state === 'max') {
          win.el.style.left = '0px'; win.el.style.top = '0px';
          win.el.style.width = '100%'; win.el.style.height = '100%';
        } else {
          win.el.style.left = win.x + 'px';
          win.el.style.top = win.y + 'px';
          win.el.style.width = win.w + 'px';
          win.el.style.height = win.h + 'px';
        }
        win.el.style.zIndex = String(win.z);
      }
      this.renderTaskbar();
    }
    /* ---------- 任务栏 ---------- */
    renderTaskbar() {
      const tb = this.taskbarEl;
      if (!tb) return;
      tb.innerHTML = '';
      const start = document.createElement('button');
      start.className = 'start-btn';
      start.setAttribute('data-testid', 'start-toggle');
      start.setAttribute('data-system-id', this.sys.id);
      start.innerHTML = '<span class="logo">◈</span><span>开始</span>';
      start.addEventListener('click', (e) => { e.stopPropagation(); this.toggleStart(); });
      tb.appendChild(start);
      const pinned = document.createElement('div');
      pinned.className = 'pinned-apps';
      for (const app of (this.host.appsFor(this.sys) || [])) {
        const b = document.createElement('button');
        b.className = 'pin';
        b.setAttribute('data-testid', 'pin-' + app.id);
        b.setAttribute('data-app-id', app.id);
        b.title = app.name;
        b.innerHTML = NOS.icon(app.icon || app.id);
        b.addEventListener('click', () => this.host.launchApp(this.sys, app.id));
        pinned.appendChild(b);
      }
      tb.appendChild(pinned);
      const mid = document.createElement('div');
      mid.className = 'task-items';
      for (const win of this.windows) {
        const b = document.createElement('button');
        b.className = 'task-item' + (win.focused ? ' active' : '');
        b.setAttribute('data-testid', 'taskbar-item');
        b.setAttribute('data-window-id', win.id);
        b.setAttribute('data-app-id', win.appId);
        b.innerHTML = NOS.icon(win.appId === 'projection' ? 'player' : win.appId) + '<span>' + win.title + '</span>';
        b.addEventListener('click', () => {
          if (win.state === 'min') { win.state = 'normal'; this.syncWindows(); this.focus(win); }
          else if (win.focused) { win.state = 'min'; this.syncWindows(); }
          else this.focus(win);
        });
        mid.appendChild(b);
      }
      tb.appendChild(mid);
      const right = document.createElement('div');
      right.className = 'tray';
      const notif = document.createElement('button');
      notif.className = 'tray-btn';
      notif.setAttribute('data-testid', 'notifications-toggle');
      notif.setAttribute('data-system-id', this.sys.id);
      notif.innerHTML = '<span class="bell">🔔</span>' + (this.sys.notifications.length ? '<span class="badge">' + this.sys.notifications.length + '</span>' : '');
      notif.addEventListener('click', (e) => { e.stopPropagation(); this.host.openNotifications(this.sys); });
      right.appendChild(notif);
      const clock = document.createElement('div');
      clock.className = 'clock';
      clock.setAttribute('data-testid', 'clock');
      clock.textContent = this.host.clockText(this.sys);
      right.appendChild(clock);
      tb.appendChild(right);
    }
    toggleStart() {
      if (this.startMenuEl) { this.closeStart(); return; }
      const m = document.createElement('div');
      m.className = 'start-menu';
      m.setAttribute('data-testid', 'start-menu');
      m.setAttribute('data-system-id', this.sys.id);
      const head = document.createElement('div');
      head.className = 'sm-head';
      head.innerHTML = '<div class="sm-title">' + (this.sys.systemName || this.sys.name) + '</div><div class="sm-sub">系统标识 ' + this.sys.id + '</div>';
      m.appendChild(head);
      const search = document.createElement('input');
      search.className = 'sm-search';
      search.setAttribute('data-testid', 'start-search');
      search.placeholder = '搜索应用…';
      m.appendChild(search);
      const list = document.createElement('div');
      list.className = 'sm-list';
      m.appendChild(list);
      const render = (q) => {
        list.innerHTML = '';
        const apps = (this.host.appsFor(this.sys) || []).filter((a) => !q || a.name.indexOf(q) >= 0);
        for (const app of apps) {
          const item = document.createElement('div');
          item.className = 'sm-item';
          item.setAttribute('data-testid', 'launch-' + app.id);
          item.setAttribute('data-app-id', app.id);
          item.innerHTML = NOS.icon(app.icon || app.id) + '<span>' + app.name + '</span><span class="dim">' + (app.desc || '') + '</span>';
          item.addEventListener('click', () => { this.closeStart(); this.host.launchApp(this.sys, app.id); });
          list.appendChild(item);
        }
      };
      render('');
      search.addEventListener('input', () => render(search.value));
      this.el.appendChild(m);
      this.startMenuEl = m;
      setTimeout(() => {
        document.addEventListener('pointerdown', this._outside = (ev) => {
          if (this.startMenuEl && !this.startMenuEl.contains(ev.target) && !ev.target.closest('[data-testid="start-toggle"]')) {
            this.closeStart();
          }
        });
      }, 0);
    }
    closeStart() {
      if (this.startMenuEl) { this.startMenuEl.remove(); this.startMenuEl = null; }
      if (this._outside) { document.removeEventListener('pointerdown', this._outside); this._outside = null; }
    }
    /* ---------- 输入 ---------- */
    bindInput(el) {
      el.addEventListener('pointerdown', (e) => {
        if (e.target === el || e.target.classList.contains('wallpaper') || e.target.classList.contains('icon-layer')) {
          this.host.onDesktopPointerDown(this, e);
        }
      });
      el.addEventListener('contextmenu', (e) => {
        if (e.target === el || e.target.classList.contains('wallpaper')) {
          e.preventDefault();
          this.host.onDesktopContextMenu(this, e, null);
        }
      });
    }
  }

  NOS.Desktop = Desktop;
  NOS.Win = Win;

  /* ================= 控件渲染（子系统应用用） ================= */
  function renderWidgetsLegacy(container, widgets, ctx) {
    container.innerHTML = '';
    for (const w of widgets) {
      const type = w[1];
      const x = w[2], y = w[3], ww = w[4], wh = w[5];
      const id = w[0];
      let el;
      if (type === 'panel') {
        el = document.createElement('div');
        el.className = 'w-panel';
        el.innerHTML = w[6] ? '<div class="w-panel-title">' + escapeHtml(w[6]) + '</div>' : '';
        const inner = document.createElement('div');
        inner.className = 'w-panel-inner';
        el.appendChild(inner);
        container.appendChild(el);
        if (w[7]) renderWidgets(inner, w[7], ctx);
        el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = ww + 'px'; el.style.height = wh + 'px';
        continue;
      }
      if (type === 'text') {
        el = document.createElement('div');
        el.className = 'w-text';
        el.textContent = w[6] || '';
        el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = ww + 'px'; el.style.height = wh + 'px';
        container.appendChild(el);
        continue;
      }
      if (type === 'button') {
        el = document.createElement('button');
        el.className = 'w-button';
        el.textContent = w[6] || '';
        el.setAttribute('data-testid', w[8] || ('wbtn-' + id));
        el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = ww + 'px'; el.style.height = wh + 'px';
        container.appendChild(el);
        continue;
      }
      if (type === 'input') {
        el = document.createElement('input');
        el.className = 'w-input';
        el.value = w[6] || '';
        el.setAttribute('data-testid', w[8] || ('winput-' + id));
        el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = ww + 'px'; el.style.height = wh + 'px';
        container.appendChild(el);
        continue;
      }
      if (type === 'list' || type === 'table') {
        el = document.createElement('div');
        el.className = 'w-list';
        el.setAttribute('data-testid', w[8] || ('wlist-' + id));
        const items = w[7] || [];
        for (const it of items) {
          const row = document.createElement('div');
          row.className = 'w-row';
          row.setAttribute('data-row-id', it[0] === undefined ? '' : String(it[0]));
          row.textContent = it[1] === undefined ? String(it) : String(it[1]);
          el.appendChild(row);
        }
        el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = ww + 'px'; el.style.height = wh + 'px';
        container.appendChild(el);
        continue;
      }
      if (type === 'canvas2d') {
        el = document.createElement('canvas');
        el.className = 'w-canvas2d';
        el.setAttribute('data-testid', w[8] || 'wcanvas2d');
        el.width = ww; el.height = wh;
        el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = ww + 'px'; el.style.height = wh + 'px';
        container.appendChild(el);
        const data = w[7];
        if (data) draw2D(el, data);
        continue;
      }
      if (type === 'canvas3d') {
        el = document.createElement('div');
        el.className = 'w-canvas3d';
        el.setAttribute('data-testid', w[8] || 'wcanvas3d');
        el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = ww + 'px'; el.style.height = wh + 'px';
        container.appendChild(el);
        continue;
      }
      if (type === 'html') {
        el = document.createElement('div');
        el.className = 'w-html';
        el.innerHTML = w[6] || '';
        el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = ww + 'px'; el.style.height = wh + 'px';
        container.appendChild(el);
        continue;
      }
    }
  }
  /*
   * 控件以可复用的方式渲染：同一 id 的控件复用已有 DOM 元素，
   * 三维画布不会在每帧重建，输入框也不会丢失焦点。
   */
  function renderWidgets(container, widgets, ctx) {
    const c = ctx || {};
    if (!c.keep) c.keep = new Map();
    if (!c.seen) c.seen = new Set();
    for (const w of widgets || []) {
      const id = String(w[0]);
      const type = w[1];
      const key = id + ':' + type;
      c.seen.add(key);
      let el = c.keep.get(key);
      if (el && el.getAttribute('data-wkey') !== key) { el = null; }
      if (!el) {
        el = createWidget(w, key);
        c.keep.set(key, el);
      }
      updateWidget(el, w, c);
      container.appendChild(el);
    }
    for (const [k, el] of Array.from(c.keep.entries())) {
      if (!c.seen.has(k)) { if (el.remove) el.remove(); c.keep.delete(k); }
    }
  }
  function createWidget(w, key) {
    const type = w[1];
    let el;
    if (type === 'panel') {
      el = document.createElement('div');
      el.className = 'w-panel';
      const title = document.createElement('div');
      title.className = 'w-panel-title';
      el.appendChild(title);
      const inner = document.createElement('div');
      inner.className = 'w-panel-inner';
      el.appendChild(inner);
      el._inner = inner;
      el._title = title;
    } else if (type === 'button') {
      el = document.createElement('button');
      el.className = 'w-button';
    } else if (type === 'input') {
      el = document.createElement('input');
      el.className = 'w-input';
    } else if (type === 'textarea') {
      el = document.createElement('textarea');
      el.className = 'w-textarea';
    } else if (type === 'list' || type === 'table') {
      el = document.createElement('div');
      el.className = 'w-list';
    } else if (type === 'canvas2d') {
      el = document.createElement('canvas');
      el.className = 'w-canvas2d';
    } else if (type === 'canvas3d') {
      el = document.createElement('div');
      el.className = 'w-canvas3d';
    } else if (type === 'text') {
      el = document.createElement('div');
      el.className = 'w-text';
    } else {
      el = document.createElement('div');
      el.className = 'w-html';
    }
    el.setAttribute('data-wkey', key);
    el.setAttribute('data-widget-id', String(w[0]));
    el.setAttribute('data-widget-type', type);
    if (w[8]) el.setAttribute('data-testid', w[8]);
    return el;
  }
  function updateWidget(el, w, c) {
    const type = w[1];
    const x = w[2], y = w[3], ww = w[4], wh = w[5];
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.width = ww + 'px'; el.style.height = wh + 'px';
    if (type === 'panel') {
      el._title.textContent = w[6] || '';
      renderWidgets(el._inner, w[7] || [], c);
      return;
    }
    if (type === 'text') { if (el.textContent !== (w[6] || '')) el.textContent = w[6] || ''; return; }
    if (type === 'button') {
      if (el.textContent !== (w[6] || '')) el.textContent = w[6] || '';
      bindWidget(el, w, c, 'click');
      return;
    }
    if (type === 'input' || type === 'textarea') {
      const v = w[6] === undefined || w[6] === null ? '' : String(w[6]);
      if (document.activeElement !== el && el.value !== v) el.value = v;
      bindWidget(el, w, c, 'change');
      return;
    }
    if (type === 'list' || type === 'table') {
      const items = w[7] || [];
      const sig = JSON.stringify(items);
      if (el._sig !== sig) {
        el._sig = sig;
        el.innerHTML = '';
        for (const it of items) {
          const row = document.createElement('div');
          row.className = 'w-row';
          row.setAttribute('data-row-id', it[0] === undefined ? '' : String(it[0]));
          if (it[2]) row.setAttribute('data-testid', it[2]);
          row.textContent = it[1] === undefined ? String(it) : String(it[1]);
          el.appendChild(row);
        }
      }
      bindWidget(el, w, c, 'click');
      return;
    }
    if (type === 'canvas2d') {
      const ops = (c.ops && c.ops.length) ? c.ops : (w[7] && w[7].ops ? w[7].ops : null);
      if (!el.width || el.width !== ww || el.height !== wh) { el.width = ww; el.height = wh; }
      draw2D(el, ops ? { ops } : null);
      return;
    }
    if (type === 'html') { if (el._html !== w[6]) { el._html = w[6]; el.innerHTML = w[6] || ''; } return; }
  }
  /* 控件事件 -> 系统输入事件（坐标换算到所属桌面的坐标系） */
  function bindWidget(el, w, c, evt) {
    const id = String(w[0]);
    if (el._bound === id + ':' + evt) return;
    el._bound = id + ':' + evt;
    const handler = (e) => {
      if (!c.host || !c.desk || !c.sys) return;
      const desk = c.desk;
      const rect = desk.el.getBoundingClientRect();
      const scale = rect.width ? (desk.el.offsetWidth / rect.width) : 1;
      const x = (e.clientX - rect.left) / scale;
      const y = (e.clientY - rect.top) / scale;
      let value = '';
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') value = el.value;
      c.host.sendInput(c.sys, {
        kind: 'input', type: evt === 'change' ? 'value' : 'click',
        x: x, y: y, window: c.winId, widget: id, value: value,
      });
    };
    el.addEventListener(evt, handler);
  }
  function escapeHtml(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function draw2D(canvas, data) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!data || !data.ops) return;
    for (const op of data.ops) {
      const kind = op[0];
      if (kind === 'rect') {
        ctx.fillStyle = op[2] || '#7c5cff';
        ctx.fillRect(op[1], op[3], op[4], op[5]);
      } else if (kind === 'line') {
        ctx.strokeStyle = op[2] || '#ffffff';
        ctx.lineWidth = op[3] || 2;
        ctx.beginPath();
        ctx.moveTo(op[1], op[2]);
        ctx.lineTo(op[4], op[5]);
        ctx.stroke();
      } else if (kind === 'text') {
        ctx.fillStyle = op[2] || '#ffffff';
        ctx.font = (op[3] || 14) + 'px "Microsoft YaHei", sans-serif';
        ctx.textAlign = op[4] || 'left';
        ctx.fillText(op[1], op[5], op[6]);
      } else if (kind === 'circle') {
        ctx.fillStyle = op[2] || '#ffffff';
        ctx.beginPath();
        ctx.arc(op[1], op[2], op[3], 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  NOS.renderWidgets = renderWidgets;
  NOS.draw2D = draw2D;
  NOS.escapeHtml = escapeHtml;
})(typeof globalThis !== 'undefined' ? globalThis : this);
