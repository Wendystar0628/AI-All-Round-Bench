'use strict';
// 根系统桌面（宿主原生实现）：Windows 式布局与操作逻辑，统一设计语言。
const { drawIcon } = require('./device2d.js');
const { Subview, TITLE_H } = require('./subview.js');
const { device3d } = require('./device.js');

function el(tag, cls, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  return e;
}
function iconEl(name, size, color, color2) {
  const cv = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = size * dpr; cv.height = size * dpr;
  cv.style.width = size + 'px'; cv.style.height = size + 'px';
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  drawIcon(ctx, name, 0, 0, size, color || '#e8eaf2', color2 || '#8b5cf6');
  return cv;
}
const APP_ICONS = {
  files: 'folder', spreadsheet: 'file-sheet', widgets: 'grid', editor: 'file-code',
  browser: 'globe', tasks: 'cpu', settings: 'gear', player: 'heli', charts: 'chart-bar',
  systems: 'layers', console: 'terminal', help: 'book', projection: 'project'
};

class RootDesktop {
  constructor(os) {
    this.os = os;
    this.windows = new Map();
    this.winCounter = 0;
    this.zTop = 10;
    this.focused = null;
    this.startOpen = false;
    this.wallpaperEl = document.getElementById('root-wallpaper');
    this.iconsEl = document.getElementById('root-icons');
    this.windowsEl = document.getElementById('root-windows');
    this.taskbarEl = document.getElementById('root-taskbar');
    this.startEl = document.getElementById('root-startmenu');
    this.overlaysEl = document.getElementById('root-overlays');
    this.toastsEl = document.getElementById('root-toasts');
    this.desktopEl = document.getElementById('root-desktop');
    this.clipboard = [];
    this.widgetsPanel = null;
    this.consoleWins = new Map();
    this.applySettings();
    this.buildIcons();
    this.buildTaskbar();
    this.bindGlobal();
    os.on('toast', n => this.showToast(n));
    os.on('change', () => this.refreshTaskbar());
    os.on('tick', () => this.tickClock());
    this.refreshTaskbar();
  }

  applySettings() {
    const s = this.os.settings;
    document.documentElement.style.setProperty('--accent', s.accent);
    const wp = s.wallpaper;
    if (wp === 'landscape') this.wallpaperEl.style.backgroundImage = 'url(assets/wallpaper-landscape.png)';
    else if (wp === 'dusk') this.wallpaperEl.style.backgroundImage = 'url(assets/wallpaper-dusk.png)';
    else if (wp === 'aurora') this.wallpaperEl.style.backgroundImage = 'url(assets/wallpaper-aurora.png)';
    else this.wallpaperEl.style.backgroundImage = 'url(assets/wallpaper-landscape.png)';
    this.desktopEl.style.fontSize = (13 * s.scale) + 'px';
    this.uiScale = s.scale;
  }

  buildIcons() {
    this.iconsEl.innerHTML = '';
    const icons = [
      { app: 'files', label: '文件管理' },
      { app: 'spreadsheet', label: '电子表格' },
      { app: 'browser', label: '浏览器' },
      { app: 'editor', label: '程序编辑器' },
      { app: 'tasks', label: '任务管理' },
      { app: 'settings', label: '设置' },
      { app: 'systems', label: '系统管理' },
      { app: 'help', label: '操作说明' },
      { file: '/Demo/sample.sheet', label: '示例工作簿', icon: 'file-sheet' },
      { file: '/Demo/helicopter-24.scene', label: '直升机 24', icon: 'file-scene' }
    ];
    for (const ic of icons) {
      const d = el('div', 'desktop-icon');
      d.dataset.testid = 'desktop-icon';
      if (ic.app) d.dataset.appId = ic.app;
      if (ic.file) d.dataset.filePath = ic.file;
      const box = el('div', 'di-icon');
      box.appendChild(iconEl(ic.icon || APP_ICONS[ic.app] || 'file', 28, '#f5b942', '#8b5cf6'));
      const lbl = el('div', 'di-label');
      lbl.textContent = ic.label;
      d.append(box, lbl);
      d.addEventListener('click', e => {
        this.iconsEl.querySelectorAll('.desktop-icon').forEach(x => x.classList.remove('selected'));
        d.classList.add('selected');
        e.stopPropagation();
      });
      d.addEventListener('dblclick', () => {
        if (ic.app) this.launch(ic.app);
        else this.openFile(ic.file);
      });
      d.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation();
        this.contextMenu(e.clientX, e.clientY, [
          { label: '打开', fn: () => ic.app ? this.launch(ic.app) : this.openFile(ic.file) }
        ]);
      });
      this.iconsEl.appendChild(d);
    }
  }

  buildTaskbar() {
    this.taskbarEl.innerHTML = '';
    const start = el('button', 'tb-start');
    start.dataset.testid = 'start-toggle';
    start.title = '开始';
    start.appendChild(iconEl('grid', 20, '#f5b942'));
    start.onclick = () => this.toggleStart();
    this.taskbarEl.appendChild(start);
    for (const app of ['files', 'spreadsheet', 'browser']) {
      const b = el('button', 'tb-pinned');
      b.title = app;
      b.appendChild(iconEl(APP_ICONS[app], 20, '#9aa0b8', '#8b5cf6'));
      b.onclick = () => this.launch(app);
      this.taskbarEl.appendChild(b);
    }
    this.tbItems = el('div', 'tb-items');
    this.taskbarEl.appendChild(this.tbItems);
    const tray = el('div', 'tb-tray');
    const widgetsBtn = el('button', 'tb-notif');
    widgetsBtn.dataset.testid = 'widgets-toggle';
    widgetsBtn.title = '小组件面板';
    widgetsBtn.appendChild(iconEl('grid', 17, '#9aa0b8'));
    widgetsBtn.onclick = () => this.os.apps.widgets.togglePanel();
    tray.appendChild(widgetsBtn);
    const notif = el('button', 'tb-notif');
    notif.dataset.testid = 'notifications-toggle';
    notif.title = '通知中心';
    notif.appendChild(iconEl('bell', 17, '#9aa0b8'));
    this.notifDot = el('span', 'dot hidden');
    notif.appendChild(this.notifDot);
    notif.onclick = () => this.os.apps.widgets.toggleNotifications();
    tray.appendChild(notif);
    this.clockEl = el('div', 'tb-clock');
    this.clockEl.innerHTML = '<div class="t"></div><div class="d"></div>';
    tray.appendChild(this.clockEl);
    this.taskbarEl.appendChild(tray);
    this.tickClock();
  }
  tickClock() {
    if (!this.clockEl) return;
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    this.clockEl.querySelector('.t').textContent = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    this.clockEl.querySelector('.d').textContent = (d.getMonth() + 1) + '/' + d.getDate() + ' · ' + this.os.settings.systemName;
  }
  refreshTaskbar() {
    if (!this.tbItems) return;
    this.tbItems.innerHTML = '';
    for (const w of this.windows.values()) {
      const b = el('button', 'tb-item' + (this.focused === w.id && !w.minimized ? ' active' : ''));
      b.dataset.testid = 'taskbar-item';
      b.dataset.windowId = w.id;
      b.appendChild(iconEl(APP_ICONS[w.appId] || 'window', 15, '#9aa0b8', '#8b5cf6'));
      const t = el('span');
      t.textContent = w.title;
      t.style.overflow = 'hidden'; t.style.textOverflow = 'ellipsis';
      b.appendChild(t);
      b.onclick = () => {
        if (w.minimized) { this.restoreWin(w); this.focusWin(w.id); }
        else if (this.focused === w.id) this.minimizeWin(w);
        else this.focusWin(w.id);
      };
      this.tbItems.appendChild(b);
    }
  }

  toggleStart() {
    this.startOpen = !this.startOpen;
    if (this.startOpen) this.renderStart();
    this.startEl.classList.toggle('hidden', !this.startOpen);
    this.taskbarEl.querySelector('.tb-start').classList.toggle('active', this.startOpen);
  }
  renderStart(filter) {
    this.startEl.innerHTML = '';
    const search = el('div', 'sm-search');
    search.appendChild(iconEl('search', 15, '#9aa0b8'));
    const inp = el('input');
    inp.placeholder = '搜索应用…';
    inp.dataset.testid = 'start-search';
    inp.value = filter || '';
    inp.oninput = () => this.renderStart(inp.value);
    search.appendChild(inp);
    this.startEl.appendChild(search);
    const apps = el('div', 'sm-apps');
    const items = [
      { id: 'files', label: '文件管理' }, { id: 'spreadsheet', label: '电子表格' },
      { id: 'widgets', label: '小组件面板' }, { id: 'editor', label: '程序编辑器' },
      { id: 'browser', label: '浏览器' }, { id: 'tasks', label: '任务管理' },
      { id: 'settings', label: '设置' }, { id: 'systems', label: '系统管理' },
      { id: 'help', label: '操作说明' }
    ];
    const q = (filter || '').toLowerCase();
    for (const it of items) {
      if (q && !it.label.toLowerCase().includes(q) && !it.id.includes(q)) continue;
      const b = el('button', 'sm-item');
      b.dataset.testid = 'launch-' + it.id;
      b.appendChild(iconEl(APP_ICONS[it.id] || 'window', 20, '#f5b942', '#8b5cf6'));
      const s = el('span'); s.textContent = it.label;
      b.appendChild(s);
      b.onclick = () => { this.toggleStart(); this.launch(it.id); };
      apps.appendChild(b);
    }
    this.startEl.appendChild(apps);
    setTimeout(() => inp.focus(), 0);
  }

  launch(appId, args) {
    const apps = this.os.apps;
    if (apps[appId] && apps[appId].open) apps[appId].open(args);
  }
  openFile(path) {
    if (path.endsWith('.sheet')) this.os.apps.spreadsheet.openFile(path);
    else if (path.endsWith('.scene') || path.endsWith('.flightrec')) {
      this.os.notifyRoot('场景文件', '直升机场景请在子系统的播放器中打开（系统管理 → 新建子系统）');
    }
    else this.os.apps.editor.openFile(path);
  }

  // ---------- 窗口 ----------
  createWindow(opts) {
    const id = 'w' + (++this.winCounter);
    const w = {
      id, appId: opts.appId, title: opts.title || '', pid: opts.pid || null,
      x: opts.x !== undefined ? opts.x : 60 + (this.winCounter % 6) * 30,
      y: opts.y !== undefined ? opts.y : 40 + (this.winCounter % 6) * 26,
      w: opts.w || 640, h: opts.h || 460,
      minimized: false, maximized: false, z: ++this.zTop,
      onClose: opts.onClose, kind: opts.kind || 'app', projId: opts.projId || null,
      childId: opts.childId || null
    };
    const win = el('div', 'app-window');
    win.dataset.testid = 'app-window';
    win.dataset.windowId = id;
    win.dataset.appId = opts.appId;
    win.dataset.systemId = 'outer';
    if (opts.childId) win.dataset.childSystemId = opts.childId;
    if (opts.projId) {
      const p = this.os.projections.get(opts.projId);
      if (p) {
        win.dataset.sourceSystemId = p.sourceSystemId;
        win.dataset.sourceWindowId = String(p.sourceWindowId);
        win.dataset.sourceAppId = p.sourceAppId;
      }
    }
    win.style.left = w.x + 'px'; win.style.top = w.y + 'px';
    win.style.width = w.w + 'px'; win.style.height = w.h + 'px';
    win.style.zIndex = w.z;
    const tb = el('div', 'window-titlebar');
    tb.dataset.testid = 'window-titlebar';
    const ic = el('span', 'wt-icon');
    ic.appendChild(iconEl(APP_ICONS[opts.appId] || 'window', 18, '#f5b942', '#8b5cf6'));
    const title = el('span', 'wt-title');
    title.textContent = w.title;
    tb.append(ic, title);
    if (opts.badge) { const bg = el('span', 'wt-badge'); bg.textContent = opts.badge; tb.appendChild(bg); }
    const mkBtn = (cls, testid, icon, fn) => {
      const b = el('button', 'wt-btn ' + cls);
      b.dataset.testid = testid;
      b.appendChild(iconEl(icon, 14, 'currentColor'));
      b.onclick = e => { e.stopPropagation(); fn(); };
      return b;
    };
    tb.appendChild(mkBtn('', 'window-minimize', 'minimize', () => this.minimizeWin(w)));
    tb.appendChild(mkBtn('', 'window-maximize', 'maximize', () => this.toggleMax(w)));
    tb.appendChild(mkBtn('close', 'window-close', 'x', () => this.closeWin(w)));
    const content = el('div', 'window-content');
    const rz = el('div', 'window-resize');
    rz.dataset.testid = 'window-resize';
    win.append(tb, content, rz);
    this.windowsEl.appendChild(win);
    w.el = win; w.contentEl = content; w.titleEl = title;
    this.windows.set(id, w);
    this.bindWindow(w, tb, rz);
    this.focusWin(id);
    this.refreshTaskbar();
    return w;
  }
  bindWindow(w, tb, rz) {
    tb.addEventListener('pointerdown', e => {
      if (e.target.closest('.wt-btn')) return;
      this.focusWin(w.id);
      if (w.maximized) return;
      const startX = e.clientX, startY = e.clientY, ox = w.x, oy = w.y;
      let snap = null;
      const move = ev => {
        w.x = ox + (ev.clientX - startX) / this.uiScale;
        w.y = oy + (ev.clientY - startY) / this.uiScale;
        w.x = Math.max(-w.w + 90, Math.min(w.x, this.desktopEl.clientWidth / this.uiScale - 60));
        w.y = Math.max(0, Math.min(w.y, (this.desktopEl.clientHeight - 48) / this.uiScale - 24));
        w.el.style.left = w.x + 'px'; w.el.style.top = w.y + 'px';
        snap = ev.clientX <= 6 ? 'left' : (ev.clientX >= window.innerWidth - 6 ? 'right' : null);
        this.showSnapPreview(snap);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        this.showSnapPreview(null);
        if (snap === 'left') { w.x = 0; w.y = 0; w.w = this.desktopEl.clientWidth / this.uiScale / 2; w.h = (this.desktopEl.clientHeight - 48) / this.uiScale; this.applyGeom(w); }
        if (snap === 'right') { w.x = this.desktopEl.clientWidth / this.uiScale / 2; w.y = 0; w.w = this.desktopEl.clientWidth / this.uiScale / 2; w.h = (this.desktopEl.clientHeight - 48) / this.uiScale; this.applyGeom(w); }
        if (w.childId) this.notifyChildResize(w);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    tb.addEventListener('dblclick', e => { if (!e.target.closest('.wt-btn')) this.toggleMax(w); });
    rz.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      this.focusWin(w.id);
      const startX = e.clientX, startY = e.clientY, ow = w.w, oh = w.h;
      const move = ev => {
        w.w = Math.max(260, ow + (ev.clientX - startX) / this.uiScale);
        w.h = Math.max(160, oh + (ev.clientY - startY) / this.uiScale);
        this.applyGeom(w);
        if (w.childId) this.notifyChildResize(w);
        if (w.onResize) w.onResize(w.w, w.h - TITLE_H);
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    w.el.addEventListener('pointerdown', () => this.focusWin(w.id));
  }
  applyGeom(w) {
    w.el.style.left = w.x + 'px'; w.el.style.top = w.y + 'px';
    w.el.style.width = w.w + 'px'; w.el.style.height = w.h + 'px';
  }
  showSnapPreview(snap) {
    let pv = document.getElementById('snap-preview');
    if (!snap) { if (pv) pv.remove(); return; }
    if (!pv) { pv = el('div', 'snap-preview'); pv.id = 'snap-preview'; this.windowsEl.appendChild(pv); }
    const W = this.desktopEl.clientWidth / this.uiScale, H = (this.desktopEl.clientHeight - 48) / this.uiScale;
    pv.style.left = (snap === 'left' ? 2 : W / 2 + 2) + 'px';
    pv.style.top = '2px'; pv.style.width = (W / 2 - 4) + 'px'; pv.style.height = (H - 4) + 'px';
  }
  focusWin(id) {
    const w = this.windows.get(id);
    if (!w) return;
    this.focused = id;
    w.z = ++this.zTop;
    w.el.style.zIndex = w.z;
    for (const x of this.windows.values()) x.el.classList.toggle('focused', x.id === id);
    if (w.childId) {
      const child = this.os.instances.get(w.childId);
      if (child) this.os.activeInstance = child;
    } else if (w.kind !== 'projection') {
      this.os.activeInstance = null;
    }
    this.refreshTaskbar();
    if (w.onFocus) w.onFocus();
  }
  minimizeWin(w) {
    w.minimized = true;
    w.el.style.display = 'none';
    if (this.focused === w.id) this.focused = null;
    this.refreshTaskbar();
    if (w.onMinimize) w.onMinimize();
  }
  restoreWin(w) {
    w.minimized = false;
    w.el.style.display = '';
    if (w.childId) { const c = this.os.instances.get(w.childId); if (c && c.surface) c.surface.resizeCanvases(); }
    this.refreshTaskbar();
  }
  toggleMax(w) {
    if (w.maximized) {
      w.maximized = false;
      Object.assign(w, w._restore);
      w.el.classList.remove('maximized');
    } else {
      w._restore = { x: w.x, y: w.y, w: w.w, h: w.h };
      w.maximized = true;
      w.x = 0; w.y = 0;
      w.w = this.desktopEl.clientWidth / this.uiScale;
      w.h = (this.desktopEl.clientHeight - 48) / this.uiScale;
      w.el.classList.add('maximized');
    }
    this.applyGeom(w);
    if (w.childId) this.notifyChildResize(w);
    if (w.onResize) w.onResize(w.w, w.h - TITLE_H);
  }
  closeWin(w) {
    if (w.kind === 'system' && w.childId) {
      this.confirm('停止子系统', '停止该子系统将结束其中全部程序与后代系统。已保存的快照仍可重新打开。确定停止？', () => {
        const child = this.os.instances.get(w.childId);
        if (child) this.os.stopInstance(child);
        this.removeWin(w);
      });
      return;
    }
    if (w.kind === 'projection') {
      this.os.removeProjection(w.projId, '关闭投送窗口');
      return;
    }
    if (w.onClose) w.onClose();
    this.removeWin(w);
  }
  removeWin(w) {
    w.el.remove();
    this.windows.delete(w.id);
    if (this.focused === w.id) this.focused = null;
    this.refreshTaskbar();
  }
  notifyChildResize(w) {
    const child = this.os.instances.get(w.childId);
    if (child) {
      const cw = w.maximized ? w.w : w.w;
      const ch = (w.maximized ? w.h : w.h) - TITLE_H;
      child.resize(Math.round(cw), Math.round(Math.max(80, ch)));
      if (child.surface) child.surface.resizeCanvases();
    }
  }
  setTitle(w, title) { w.title = title; w.titleEl.textContent = title; this.refreshTaskbar(); }

  // ---------- 子系统窗口 ----------
  openSystemWindow(child) {
    const w = this.createWindow({
      appId: 'systems', title: child.name + ' · 子系统桌面', kind: 'system', childId: child.id,
      w: 760, h: 540, badge: 'L' + child.depth,
      x: 90 + (this.os.instances.size % 4) * 40, y: 50 + (this.os.instances.size % 4) * 30
    });
    const mount = el('div');
    mount.style.cssText = 'position:absolute;inset:0;';
    w.contentEl.appendChild(mount);
    new Subview(this.os, child, mount);
    child.resize(w.w, w.h - TITLE_H);
    w.onResize = () => this.notifyChildResize(w);
    return w;
  }
  noteSubsystemPointer(inst) {
    this.os.activeInstance = inst;
  }
  onSubsystemFocus(inst) {
    this.os.activeInstance = inst;
    for (const w of this.windows.values()) w.el.classList.remove('focused');
    const sw = Array.from(this.windows.values()).find(w => w.childId === inst.id);
    if (sw) { sw.el.classList.add('focused'); this.focused = sw.id; }
    this.refreshTaskbar();
  }

  // ---------- 投送窗口 ----------
  openProjectionWindow(proj) {
    const w = this.createWindow({
      appId: 'projection', title: '投送 · ' + proj.title, kind: 'projection', projId: proj.id,
      w: 600, h: 420, badge: proj.sourceSystemId
    });
    const cv = document.createElement('canvas');
    cv.style.cssText = 'width:100%;height:100%;display:block;';
    w.contentEl.appendChild(cv);
    const render = () => {
      const rect = w.contentEl.getBoundingClientRect();
      if (rect.width < 4) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = rect.width * dpr; cv.height = rect.height * dpr;
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#12152a';
      ctx.fillRect(0, 0, rect.width, rect.height);
      const sub = this.os.device.peekSub(proj.sourceSystemId, proj.sourcePid);
      if (sub && sub.content) {
        const { renderList } = require('./device2d.js');
        renderList(ctx, sub.content, {
          blinkOn: this.os.device.blinkOn,
          render3d: (it, c) => this.os.device.render3dOp(it, c)
        });
      }
      if (this.os.projectionPaused(proj.id)) {
        ctx.fillStyle = 'rgba(10,12,24,0.55)';
        ctx.fillRect(0, 0, rect.width, rect.height);
        ctx.fillStyle = '#f5b942';
        ctx.font = '13px "Microsoft YaHei"';
        ctx.textAlign = 'center';
        ctx.fillText('源系统已暂停 · 内容冻结', rect.width / 2, rect.height / 2);
      }
    };
    const view = { render };
    this.os.device.registerView(view);
    w.onResize = render;
    w.onMinimize = () => { };
    // 输入转发到源应用
    const toLocal = e => {
      const r = cv.getBoundingClientRect();
      const sub = this.os.device.peekSub(proj.sourceSystemId, proj.sourcePid);
      return { x: (e.clientX - r.left) / (r.width / (w._projW || r.width)), y: (e.clientY - r.top) / (r.height / (w._projH || r.height)) };
    };
    const send = (kind, e, extra) => {
      const r = cv.getBoundingClientRect();
      const srcWin = this.os.instances.get(proj.sourceSystemId);
      let sw = null;
      if (srcWin) sw = srcWin.windows.find(x => x.id === proj.sourceWindowId);
      const logicalW = sw ? sw.w : r.width;
      const logicalH = sw ? (sw.h - TITLE_H) : r.height;
      const ev = Object.assign({ kind, x: (e.clientX - r.left) / (r.width / logicalW), y: (e.clientY - r.top) / (r.height / logicalH), button: e.button || 0, buttons: e.buttons || 0, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey }, extra || {});
      this.os.projectionInput(proj.id, ev);
    };
    cv.addEventListener('pointerdown', e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); send('pointer_down', e); });
    cv.addEventListener('pointermove', e => send('pointer_move', e));
    cv.addEventListener('pointerup', e => send('pointer_up', e));
    cv.addEventListener('dblclick', e => send('dblclick', e));
    cv.addEventListener('wheel', e => { e.preventDefault(); send('wheel', e, { dx: e.deltaX, dy: e.deltaY }); }, { passive: false });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    w._cleanup = () => this.os.device.unregisterView(view);
    return w;
  }
  closeProjectionWindow(proj, reason) {
    const w = Array.from(this.windows.values()).find(x => x.projId === proj.id);
    if (w) { if (w._cleanup) w._cleanup(); this.removeWin(w); }
    if (reason) this.os.notifyRoot('投送结束', reason);
  }

  // ---------- 控制台（根系统自定义程序输出） ----------
  ensureConsole(pid, name) {
    if (this.consoleWins.has(pid)) return;
    const w = this.createWindow({ appId: 'console', title: '程序输出 · ' + name, w: 560, h: 400, pid });
    const body = el('div', 'app-body');
    const log = el('div', 'console-log');
    log.dataset.testid = 'console-log';
    const view3d = el('div', 'console-view hidden');
    const cv = document.createElement('canvas');
    cv.style.cssText = 'width:100%;height:100%;display:block;';
    view3d.appendChild(cv);
    body.append(log, view3d);
    w.contentEl.appendChild(body);
    const render = () => {
      const sub = this.os.device.peekSub('outer', pid);
      if (!sub) return;
      log.innerHTML = '';
      for (const line of sub.logs) {
        const d = el('div', 'line');
        d.textContent = line;
        log.appendChild(d);
      }
      log.scrollTop = log.scrollHeight;
      let has3d = false;
      if (sub.content) for (const it of sub.content) if (it.op === '3d') has3d = true;
      view3d.classList.toggle('hidden', !has3d);
      if (has3d) {
        const r = view3d.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        cv.width = r.width * dpr; cv.height = r.height * dpr;
        const ctx = cv.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const { renderList } = require('./device2d.js');
        renderList(ctx, sub.content, { render3d: (it, c) => this.os.device.render3dOp(it, c) });
      }
    };
    const view = { render };
    this.os.device.registerView(view);
    w.onClose = () => { this.os.device.unregisterView(view); this.consoleWins.delete(pid); };
    this.consoleWins.set(pid, w);
  }
  closeAppByPid(pid) {
    const w = this.consoleWins.get(pid);
    if (w) this.closeWin(w);
    for (const x of Array.from(this.windows.values())) if (x.pid === pid) this.removeWin(x);
  }

  // ---------- 全局输入 ----------
  bindGlobal() {
    this.desktopEl.addEventListener('pointerdown', e => {
      if (e.target === this.desktopEl || e.target === this.wallpaperEl || e.target === this.iconsEl) {
        this.iconsEl.querySelectorAll('.desktop-icon').forEach(x => x.classList.remove('selected'));
        if (this.startOpen) this.toggleStart();
        this.os.activeInstance = null;
      }
    });
    this.desktopEl.addEventListener('contextmenu', e => {
      if (e.target === this.desktopEl || e.target === this.wallpaperEl || e.target === this.iconsEl) {
        e.preventDefault();
        this.contextMenu(e.clientX, e.clientY, [
          { label: '新建子系统', fn: () => this.os.apps.systems.createChild() },
          { label: '系统管理', fn: () => this.launch('systems') },
          { label: '显示设置', fn: () => this.launch('settings') },
          { label: '刷新', fn: () => this.refreshTaskbar() }
        ]);
      }
    });
    window.addEventListener('keydown', e => {
      const tgt = e.target;
      const inField = tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable || tgt.tagName === 'WEBVIEW');
      if (inField) return;
      const inst = this.os.activeInstance;
      if (inst && inst.state === 'running') {
        e.preventDefault();
        inst.input({ kind: 'key', key: e.key, code: e.code, text: e.key.length === 1 ? e.key : null, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey });
      }
    });
    window.addEventListener('resize', () => {
      for (const w of this.windows.values()) if (w.childId) this.notifyChildResize(w);
    });
  }
  contextMenu(x, y, items) {
    this.closeMenus();
    const m = el('div', 'ctx-menu');
    m.style.left = Math.min(x, window.innerWidth - 200) + 'px';
    m.style.top = Math.min(y, window.innerHeight - items.length * 32 - 60) + 'px';
    for (const it of items) {
      if (it.sep) { m.appendChild(el('div', 'ctx-sep')); continue; }
      const b = el('button', 'ctx-item');
      b.textContent = it.label;
      b.onclick = () => { this.closeMenus(); it.fn(); };
      m.appendChild(b);
    }
    this.overlaysEl.appendChild(m);
    const close = ev => { if (!m.contains(ev.target)) { this.closeMenus(); window.removeEventListener('pointerdown', close); } };
    setTimeout(() => window.addEventListener('pointerdown', close), 0);
  }
  closeMenus() { this.overlaysEl.querySelectorAll('.ctx-menu').forEach(x => x.remove()); }
  confirm(title, text, onOk, okLabel) {
    const mask = el('div', 'dialog-mask');
    const dlg = el('div', 'dialog');
    const h = el('h3'); h.textContent = title;
    const p = el('p'); p.textContent = text;
    const btns = el('div', 'dlg-btns');
    const cancel = el('button', 'btn'); cancel.textContent = '取消';
    const ok = el('button', 'btn danger'); ok.textContent = okLabel || '确定';
    cancel.onclick = () => mask.remove();
    ok.onclick = () => { mask.remove(); onOk(); };
    btns.append(cancel, ok);
    dlg.append(h, p, btns);
    mask.appendChild(dlg);
    this.overlaysEl.appendChild(mask);
  }
  showToast(n) {
    const t = el('div', 'toast');
    t.appendChild(iconEl('info', 20, '#f5b942'));
    const box = el('div');
    const tt = el('div', 'tt'); tt.textContent = n.title;
    const tb = el('div', 'tb'); tb.textContent = n.body;
    box.append(tt, tb);
    t.appendChild(box);
    this.toastsEl.appendChild(t);
    this.notifDot.classList.remove('hidden');
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.4s'; setTimeout(() => t.remove(), 400); }, 4200);
  }

  // ---------- bench ----------
  windowList() {
    const out = [];
    for (const w of this.windows.values()) {
      out.push({ id: 'outer:' + w.id, systemId: 'outer', appId: w.appId, title: w.title, state: w.minimized ? 'minimized' : 'normal' });
    }
    return out;
  }
  browserTabs() {
    return this.os.apps.browser ? this.os.apps.browser.tabsInfo() : [];
  }
}

module.exports = { RootDesktop, el, iconEl, APP_ICONS };
