/* 根系统桌面宿主：DOM 窗口管理 + 远程子桌面渲染 + 投送 + 3D 设备挂接。
 * 根系统由宿主直接实现（题面允许）；窗口规则在 RootDesktop 中。 */
'use strict';
window.NOS = window.NOS || {};

class RootDesktop {
  constructor(rootEl) {
    this.el = rootEl;
    this.windows = new Map();  // wid -> {id,app,title,x,y,w,h,state,min,el,contentEl,model}
    this.order = [];
    this.z = 10;
    this.focus = null;
    this.settings = { wallpaper: 'dusk', accent: '#7c3aed', scale: 1, sysName: 'Nested OS' };
    this.iconCache = {};
    this._drag = null;
    this.remoteViews = new Map(); // childId -> remote desktop handle
    this.projectionEls = new Map();
  }

  mount() {
    this.el.innerHTML = '';
    this.el.className = 'nos-root';
    this.el.dataset.testid = 'os-desktop';
    this.el.dataset.systemId = 'outer';
    this.desktopEl = h('div', { class: 'nos-desktop', dataTestid: 'os-desktop', dataSystemId: 'outer' });
    this.el.appendChild(this.desktopEl);
    this.iconLayer = h('div', { class: 'desktop-icons' });
    this.desktopEl.appendChild(this.iconLayer);
    this.windowLayer = h('div', { class: 'window-layer' });
    this.desktopEl.appendChild(this.windowLayer);
    this.taskbar = h('div', { class: 'taskbar', dataSystemId: 'outer' });
    this.el.appendChild(this.taskbar);
    this.startLayer = h('div', { class: 'start-layer', style: { display: 'none' } });
    this.el.appendChild(this.startLayer);
    this.popLayer = h('div', { class: 'pop-layer' });
    this.el.appendChild(this.popLayer);
    this.bindDesktop();
    this.renderIcons();
    this.renderTaskbar();
    this.applySettings();
  }

  bindDesktop() {
    this.desktopEl.addEventListener('pointerdown', (e) => {
      if (e.target === this.desktopEl || e.target === this.iconLayer) {
        this.setFocus(null);
        this.closeStart();
      }
    });
    this.desktopEl.addEventListener('contextmenu', (e) => {
      if (e.target === this.desktopEl || e.target === this.iconLayer) {
        e.preventDefault();
        this.showDesktopMenu(e);
      }
    });
    this.desktopEl.addEventListener('keydown', (e) => this.routeKey(e), true);
    document.addEventListener('pointermove', (e) => this.onDragMove(e));
    document.addEventListener('pointerup', (e) => this.onDragEnd(e));
    window.addEventListener('resize', () => this.relayoutMaximized());
  }

  routeKey(e) {
    // 键盘只到焦点窗口；webview/输入控件自行处理
  }

  showDesktopMenu(e) {
    const menu = new NOS.ContextMenu(this.popLayer, [
      { label: '刷新桌面', action: () => this.renderIcons() },
      { label: '新建文件夹（文档）', action: () => NOS.rootApps.files && NOS.rootApps.files.newFolderFromDesktop() },
      { label: '更换壁纸（设置）', action: () => NOS.rootApps.settings.open() },
      { label: '显示设置', action: () => NOS.rootApps.settings.open() }
    ]);
    menu.show(e.clientX, e.clientY);
  }

  renderIcons() {
    this.iconLayer.innerHTML = '';
    const defs = [
      { app: 'files', label: '文件管理器', glyph: '📁', testid: 'desktop-icon' },
      { app: 'spreadsheet', label: '示例工作簿', glyph: '▦', testid: 'desktop-icon', filePath: '/Demo/sample.sheet' },
      { app: 'browser', label: '浏览器', glyph: '◍', testid: 'desktop-icon' },
      { app: 'player-demo', label: '直升机场景', glyph: '✈', testid: 'desktop-icon', filePath: '/Demo/helicopter-24.scene' },
      { app: 'sysmgr', label: '子系统', glyph: '▣', testid: 'desktop-icon' },
      { app: 'settings', label: '设置', glyph: '⚙', testid: 'desktop-icon' },
      { app: 'help', label: '操作说明', glyph: '?', testid: 'desktop-icon' }
    ];
    defs.forEach((d, i) => {
      const ic = h('div', { class: 'desktop-icon', dataTestid: 'desktop-icon', dataAppId: d.app, dataFilePath: d.filePath || '', dataSystemId: 'outer', tabindex: '0' });
      ic.style.left = '18px';
      ic.style.top = 18 + i * 92 + 'px';
      ic.innerHTML = `<div class="di-glyph">${d.glyph}</div><div class="di-label">${d.label}</div>`;
      let clickTimer = null, selected = false;
      ic.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.iconLayer.querySelectorAll('.desktop-icon.sel').forEach(x => x.classList.remove('sel')); ic.classList.add('sel'); });
      ic.addEventListener('dblclick', () => this.openByIcon(d));
      ic.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.openByIcon(d); });
      ic.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        new NOS.ContextMenu(this.popLayer, [
          { label: '打开', action: () => this.openByIcon(d) },
          d.filePath ? { label: '复制路径', action: () => NOS.rootVM.pushClipboard(d.filePath, 'outer') } : null
        ].filter(Boolean)).show(e.clientX, e.clientY);
      });
      this.iconLayer.appendChild(ic);
    });
  }

  openByIcon(d) {
    const apps = NOS.rootApps;
    if (d.app === 'files') apps.files.open();
    else if (d.app === 'spreadsheet') apps.sheet.openFile('/Demo/sample.sheet');
    else if (d.app === 'browser') apps.browser.open();
    else if (d.app === 'sysmgr') apps.sysmgr.open();
    else if (d.app === 'settings') apps.settings.open();
    else if (d.app === 'help') apps.help.open();
    else if (d.app === 'player-demo') {
      // 根桌面场景文件：打开文件管理器演示跨层传递入口（根本身不播放，用帮助提示）
      apps.files.openSelect('/Demo', 'helicopter-24.scene');
    }
  }

  renderTaskbar() {
    this.taskbar.innerHTML = '';
    const left = h('div', { class: 'tb-left' });
    const startBtn = h('button', { class: 'start-btn', dataTestid: 'start-toggle', ariaLabel: '开始' }, '⊞ 开始');
    startBtn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleStart(); });
    left.appendChild(startBtn);

    const pinned = [
      { app: 'files', glyph: '📁', label: '文件', launch: 'launch-files' },
      { app: 'browser', glyph: '◍', label: '浏览器', launch: 'launch-browser' },
      { app: 'spreadsheet', glyph: '▦', label: '表格', launch: 'launch-spreadsheet' }
    ];
    pinned.forEach(p => {
      const b = h('button', { class: 'tb-pin', dataTestid: p.launch, ariaLabel: p.label }, p.glyph);
      b.addEventListener('click', () => this.launchApp(p.app));
      left.appendChild(b);
    });

    const center = h('div', { class: 'tb-center', id: 'tb-windows' });
    const right = h('div', { class: 'tb-right' });
    const notif = h('button', { class: 'tb-tray', dataTestid: 'notifications-toggle', ariaLabel: '通知中心' }, '🔔');
    notif.addEventListener('click', (e) => { e.stopPropagation(); NOS.rootApps.widgets.toggleNotifications(); });
    const widgets = h('button', { class: 'tb-tray', dataTestid: 'widgets-toggle', ariaLabel: '小组件' }, '▦');
    widgets.addEventListener('click', () => NOS.rootApps.widgets.togglePanel());
    const clock = h('span', { class: 'tb-clock', id: 'tb-clock' }, '');
    right.appendChild(notif); right.appendChild(widgets); right.appendChild(clock);
    this.taskbar.append(left, center, right);
    this.updateClock();
    setInterval(() => this.updateClock(), 1000);
  }

  updateClock() {
    const c = this.taskbar.querySelector('#tb-clock');
    if (!c) return;
    const d = new Date();
    c.textContent = d.toLocaleString('zh-CN', { hour12: false }).slice(5);
  }

  toggleStart() {
    if (this.startLayer.style.display === 'none') this.openStart(); else this.closeStart();
  }
  closeStart() { this.startLayer.style.display = 'none'; }
  openStart() {
    this.startLayer.style.display = 'flex';
    this.startLayer.innerHTML = '';
    const menu = h('div', { class: 'start-menu', dataTestid: 'start-menu' });
    const title = h('div', { class: 'sm-title' }, this.settings.sysName);
    const search = h('input', { class: 'sm-search', placeholder: '搜索应用…', ariaLabel: '搜索应用' });
    menu.append(title, search);
    const items = [
      { id: 'launch-files', label: '文件管理器', glyph: '📁', app: 'files' },
      { id: 'launch-spreadsheet', label: '电子表格', glyph: '▦', app: 'spreadsheet' },
      { id: 'launch-widgets', label: '小组件', glyph: '◷', app: 'widgets' },
      { id: 'launch-editor', label: '文本与程序编辑器', glyph: '</>', app: 'editor' },
      { id: 'launch-browser', label: '浏览器', glyph: '◍', app: 'browser' },
      { id: 'launch-tasks', label: '任务管理器', glyph: '📊', app: 'tasks' },
      { id: 'launch-settings', label: '设置', glyph: '⚙', app: 'settings' },
      { id: 'launch-help', label: '操作说明', glyph: '?', app: 'help' },
      { id: 'launch-sysmgr', label: '子系统管理', glyph: '▣', app: 'sysmgr' }
    ];
    const list = h('div', { class: 'sm-list' });
    const render = (q) => {
      list.innerHTML = '';
      items.filter(x => !q || x.label.includes(q)).forEach(it => {
        const b = h('button', { class: 'sm-item', dataTestid: it.id, dataAppId: it.app }, `<span class="sm-glyph">${it.glyph}</span>${it.label}`);
        b.addEventListener('click', () => { this.launchApp(it.app); this.closeStart(); });
        list.appendChild(b);
      });
    };
    search.addEventListener('input', () => render(search.value.trim()));
    menu.appendChild(list);
    render('');
    this.startLayer.appendChild(menu);
    setTimeout(() => search.focus(), 0);
    this.startLayer.addEventListener('pointerdown', (e) => { if (e.target === this.startLayer) this.closeStart(); }, { once: true });
  }

  launchApp(app) {
    const a = NOS.rootApps[app === 'sysmgr' ? 'sysmgr' : app];
    if (a && a.open) a.open();
  }

  /* ---------- 窗口 ---------- */
  openWindow(app, title, opts) {
    opts = opts || {};
    // 单实例（除浏览器标签等）
    if (!opts.multi) {
      for (const [id, w] of this.windows) if (w.app === app && !opts.forceNew) { this.focusWin(id); return w; }
    }
    const id = 'w' + (++this.z);
    const n = this.order.length;
    const w = {
      id, app, title,
      x: opts.x ?? (80 + n * 26), y: opts.y ?? (50 + n * 22),
      w: opts.w || 780, h: opts.h || 500,
      state: 'normal', min: false, model: opts.model || null,
      projection: opts.projection || null
    };
    const el = this.buildWindowEl(w);
    w.el = el; w.contentEl = el.querySelector('.win-content');
    this.windowLayer.appendChild(el);
    this.windows.set(id, w);
    this.order.push(id);
    this.focusWin(id);
    this.updateTaskbarWindows();
    return w;
  }

  buildWindowEl(w) {
    const el = h('div', { class: 'app-window', dataTestid: 'app-window', dataWindowId: w.id, dataAppId: w.projection ? 'projection' : w.app, dataSystemId: w.projection ? w.projection.targetId : 'outer' });
    if (w.projection) {
      el.dataset.sourceSystemId = w.projection.sourceInstanceId;
      el.dataset.sourceWindowId = w.projection.sourceWindowId || w.projection.sourcePid;
      el.dataset.sourceAppId = w.projection.appId;
    }
    const tb = h('div', { class: 'win-titlebar', dataTestid: 'window-titlebar' });
    tb.innerHTML = `<span class="win-icon"></span><span class="win-title">${w.title}</span>`;
    const ctrls = h('div', { class: 'win-ctrls' });
    const mn = h('button', { class: 'wc-btn', dataTestid: 'window-minimize', ariaLabel: '最小化' }, '—');
    const mx = h('button', { class: 'wc-btn', dataTestid: 'window-maximize', ariaLabel: '最大化' }, '□');
    const cl = h('button', { class: 'wc-btn wc-close', dataTestid: 'window-close', ariaLabel: '关闭' }, '×');
    ctrls.append(mn, mx, cl);
    tb.appendChild(ctrls);
    const content = h('div', { class: 'win-content' });
    const resize = h('div', { class: 'win-resize', dataTestid: 'window-resize' });
    el.append(tb, content, resize);

    mn.addEventListener('click', (e) => { e.stopPropagation(); this.minimize(w.id); });
    mx.addEventListener('click', (e) => { e.stopPropagation(); this.toggleMax(w.id); });
    cl.addEventListener('click', (e) => { e.stopPropagation(); this.requestClose(w.id); });
    tb.addEventListener('dblclick', () => this.toggleMax(w.id));
    tb.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.wc-btn')) return;
      this.focusWin(w.id);
      if (w.state === 'max') return;
      this._drag = { wid: w.id, mode: 'move', sx: e.clientX, sy: e.clientY, ox: w.x, oy: w.y };
    });
    resize.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); this.focusWin(w.id);
      this._drag = { wid: w.id, mode: 'resize', sx: e.clientX, sy: e.clientY, ow: w.w, oh: w.h };
    });
    el.addEventListener('pointerdown', () => this.focusWin(w.id), true);
    // 贴靠
    el.addEventListener('pointerup', (e) => {
      if (!this._drag || this._drag.wid !== w.id) return;
      if (e.clientX < 4) this.snapWin(w.id, 'left');
      else if (e.clientX > window.innerWidth - 4) this.snapWin(w.id, 'right');
    });
    this.applyWinRect(w);
    return el;
  }

  applyWinRect(w) {
    const el = w.el;
    const taskH = 52;
    if (w.state === 'max') {
      Object.assign(el.style, { left: '0px', top: '0px', width: this.el.clientWidth + 'px', height: (this.el.clientHeight - taskH) + 'px' });
    } else {
      const x = NOS.util.clamp(w.x, -w.w + 80, this.el.clientWidth - 60);
      const y = NOS.util.clamp(w.y, 0, this.el.clientHeight - taskH - 40);
      Object.assign(el.style, { left: x + 'px', top: y + 'px', width: w.w + 'px', height: w.h + 'px' });
      w.x = x; w.y = y;
    }
    el.classList.toggle('maximized', w.state === 'max');
  }

  onDragMove(e) {
    if (!this._drag) return;
    const d = this._drag, w = this.windows.get(d.wid);
    if (!w) return;
    if (d.mode === 'move') {
      w.x = d.ox + e.clientX - d.sx; w.y = d.oy + e.clientY - d.sy;
    } else {
      w.w = Math.max(320, d.ow + e.clientX - d.sx);
      w.h = Math.max(220, d.oh + e.clientY - d.sy);
    }
    this.applyWinRect(w);
  }
  onDragEnd() { this._drag = null; }

  focusWin(id) {
    const w = this.windows.get(id);
    if (!w) return;
    this.order = this.order.filter(x => x !== id);
    this.order.push(id);
    this.order.forEach((wid, i) => { const ww = this.windows.get(wid); ww.el.style.zIndex = 10 + i; ww.el.classList.toggle('focused', wid === id); });
    this.focus = id;
    this.updateTaskbarWindows();
  }
  setFocus(id) { this.focus = id; this.order.forEach(wid => this.windows.get(wid).el.classList.toggle('focused', wid === id)); }
  minimize(id) { const w = this.windows.get(id); w.min = true; w.el.style.display = 'none'; this.updateTaskbarWindows(); }
  restore(id) { const w = this.windows.get(id); w.min = false; w.el.style.display = 'flex'; this.focusWin(id); }
  toggleMax(id) {
    const w = this.windows.get(id);
    if (w.state === 'max') { w.state = 'normal'; if (w.prev) { w.x = w.prev.x; w.y = w.prev.y; w.w = w.prev.w; w.h = w.prev.h; } }
    else { w.prev = { x: w.x, y: w.y, w: w.w, h: w.h }; w.state = 'max'; }
    this.applyWinRect(w);
  }
  snapWin(id, side) {
    const w = this.windows.get(id), taskH = 52;
    w.state = 'snap';
    w.y = 0; w.h = this.el.clientHeight - taskH;
    if (side === 'left') { w.x = 0; w.w = this.el.clientWidth / 2; }
    else { w.x = this.el.clientWidth / 2; w.w = this.el.clientWidth / 2; }
    this.applyWinRect(w);
  }
  relayoutMaximized() { for (const w of this.windows.values()) if (w.state === 'max') this.applyWinRect(w); }

  requestClose(id) {
    const w = this.windows.get(id);
    if (!w) return;
    if (w.projection) { this.closeProjection(id, w); return; }
    if (w.app === 'remote') {
      if (!window.confirm('关闭系统窗口将停止整个子树，确定吗？（可在子系统管理中仅最小化）')) return;
      NOS.rootApps.sysmgr.closeRemoteWindow(w);
      return;
    }
    if (w.model && w.model.beforeClose) {
      const r = w.model.beforeClose();
      if (r === false) return;
    }
    this.closeWindow(id);
  }
  closeWindow(id) {
    const w = this.windows.get(id);
    if (!w) return;
    if (w.model && w.model.unmount) { try { w.model.unmount(); } catch (e) {} }
    w.el.remove();
    this.windows.delete(id);
    this.order = this.order.filter(x => x !== id);
    this.updateTaskbarWindows();
    NOS.rootVM.eventTarget.emit('windows');
  }
  closeProjection(id, w) {
    const p = w.projection;
    // 只取消投送：通知源系统关闭投送
    const inst = NOS.rootVM.findInstance(p.sourceInstanceId);
    if (inst) {
      const svc = NOS.hostsvcs['project-close'];
      // 向源内核投递 project-close 事件
      const proc = inst.procs.find(x => x.pid === p.sourcePid);
      inst.postHostEvent({ type: 'projection-close', id: p.id, sourcePid: p.sourcePid });
      // 直接从源实例注册表移除
      const idx = inst.projections.findIndex(x => x.id === p.id);
      if (idx >= 0) inst.projections.splice(idx, 1);
    }
    NOS.rootVM.unregisterProjection(p.id);
    this.closeWindow(id);
  }

  updateTaskbarWindows() {
    const c = this.taskbar.querySelector('#tb-windows');
    if (!c) return;
    c.innerHTML = '';
    this.order.forEach(id => {
      const w = this.windows.get(id);
      const b = h('button', { class: 'tb-item' + (w.min ? '' : ' active') + (this.focus === id && !w.min ? ' focus' : ''), dataTestid: 'taskbar-item', dataWindowId: id, title: w.title });
      b.textContent = w.title;
      b.addEventListener('click', () => {
        if (w.min) this.restore(id);
        else if (this.focus === id) this.minimize(id);
        else this.focusWin(id);
      });
      c.appendChild(b);
    });
  }

  applySettings() {
    const s = this.settings;
    const wp = NOS.fixtures.wallpapers[s.wallpaper] ? NOS.fixtures.wallpapers[s.waper || s.wallpaper] : null;
    const url = (NOS.fixtures.wallpapers[s.wallpaper] || '').startsWith('data:')
      ? NOS.fixtures.wallpapers[s.wallpaper] : s.wallpaper;
    this.desktopEl.style.backgroundImage = `url("${url}")`;
    this.desktopEl.style.setProperty('--accent', s.accent);
    document.documentElement.style.fontSize = (14 * s.scale) + 'px';
  }

  /* ---------- 远程桌面 / 投送 ---------- */
  attachRemote(winId, inst) {
    const w = this.windows.get(winId);
    const handle = new NOS.RemoteDesktop(w.contentEl, inst);
    this.remoteViews.set(inst.id, handle);
    handle.mount();
    return handle;
  }
}

/* ---------- 小工具 ---------- */
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === 'class') el.className = attrs[k];
    else if (k === 'style' && typeof attrs[k] === 'object') Object.assign(el.style, attrs[k]);
    else if (k === 'dataTestid') el.setAttribute('data-testid', attrs[k]);
    else if (k.startsWith('data')) {
      const name = k.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
      if (attrs[k] !== '' && attrs[k] != null) el.setAttribute(name, attrs[k]);
    } else if (k.startsWith('on') && typeof attrs[k] === 'function') el.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] === true) el.setAttribute(k, '');
    else if (attrs[k] != null && attrs[k] !== false) el.setAttribute(k, attrs[k]);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(c) : c);
  }
  return el;
}
NOS.h = h;

class ContextMenu {
  constructor(layer, items) {
    this.layer = layer; this.items = items;
  }
  show(x, y) {
    const old = this.layer.querySelector('.ctx-menu');
    if (old) old.remove();
    const menu = h('div', { class: 'ctx-menu', dataTestid: 'ctx-menu' });
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    this.items.forEach(it => {
      if (!it) return;
      const b = h('button', { class: 'ctx-item' }, it.label);
      b.addEventListener('click', () => { menu.remove(); it.action && it.action(); });
      menu.appendChild(b);
    });
    this.layer.appendChild(menu);
    setTimeout(() => {
      const closer = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('pointerdown', closer); } };
      document.addEventListener('pointerdown', closer);
    }, 0);
  }
}
NOS.ContextMenu = ContextMenu;

/* 模态对话框（远程应用共用） */
NOS.modal = function (title, build) {
  const layer = document.getElementById('nos-pop-layer') || document.body;
  const mask = NOS.h('div', { class: 'nos-modal-mask' });
  const box = NOS.h('div', { class: 'nos-modal' });
  box.appendChild(NOS.h('div', { class: 'nos-modal-title' }, title));
  const body = NOS.h('div', { class: 'nos-modal-body' });
  box.appendChild(body);
  const close = () => mask.remove();
  body._close = close;
  const foot = NOS.h('div', { class: 'nos-modal-foot' });
  const ok = NOS.h('button', { class: 'rd-btn' }, '关闭');
  ok.addEventListener('click', close);
  mask.addEventListener('pointerdown', (e) => { if (e.target === mask) close(); });
  foot.appendChild(ok);
  box.appendChild(foot);
  mask.appendChild(box);
  layer.appendChild(mask);
  build(body, close);
  return { mask, body, close };
};

NOS.RootDesktop = RootDesktop;
