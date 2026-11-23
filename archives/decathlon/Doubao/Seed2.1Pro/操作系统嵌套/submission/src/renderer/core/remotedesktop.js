/* 子系统远程桌面：把内核提交的 UI 描述渲染为完整桌面（桌面图标/窗口/任务栏/菜单），
 * 输入事件经坐标换算回传给子系统内核；直属子系统桌面递归嵌入。
 * 三维视图区域在此创建占位 div，由全局 Device3D 按其屏幕矩形 scissor 绘制。 */
'use strict';
window.NOS = window.NOS || {};
const RDH = {};

class RemoteDesktop {
  constructor(container, inst) {
    this.container = container;
    this.inst = inst;
    this.lastUiVersion = -1;
    this.scale = 1;
    this.viewW = 1100; this.viewH = 680;
    this.winEls = new Map();
    this.threeViews = []; // {key, el, pid, type:'player'|'projection'}
    this.destroyed = false;
  }

  mount() {
    this.el = NOS.h('div', { class: 'remote-desktop', dataSystemId: this.inst.id });
    this.el.style.width = '100%'; this.el.style.height = '100%';
    this.container.innerHTML = '';
    this.container.appendChild(this.el);
    this.el._rd = this;
    this.bindInput();
    this.render();
    this._raf = setInterval(() => this.render(), 100);
  }

  unmount() {
    this.destroyed = true;
    clearInterval(this._raf);
    this.threeViews.forEach(v => NOS.device3D && NOS.device3D.removeView(v.key));
    if (this.el && this.el.remove) this.el.remove();
  }

  bindInput() {
    this.el.addEventListener('pointerdown', (e) => this.onPointer(e, 'down'));
    this.el.addEventListener('pointerup', (e) => this.onPointer(e, 'up'));
    this.el.addEventListener('dblclick', (e) => this.onPointer(e, 'dbl'));
    this.el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this.onPointer(e, 'ctx'); });
    this.el.addEventListener('keydown', (e) => this.onKey(e));
    this.el.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.el.addEventListener('dragstart', e => e.preventDefault());
    this.el.addEventListener('drop', (e) => this.onDrop(e));
    this.el.addEventListener('dragover', (e) => { e.preventDefault(); });
  }

  localPoint(e) {
    const r = this.el.getBoundingClientRect();
    const x = (e.clientX - r.left) * (this.viewW / r.width);
    const y = (e.clientY - r.top) * (this.viewH / r.height);
    return { x, y, sx: e.clientX - r.left, sy: e.clientY - r.top, rect: r };
  }

  hitTest(ui, x, y) {
    // 返回 {winId, part, id, value}
    const wins = (ui.windows || []).slice().reverse();
    for (const w of wins) {
      if (w.min) continue;
      const rect = this.winRect(w);
      if (x >= rect.x && y >= rect.y && x <= rect.x + rect.w && y <= rect.y + rect.h) {
        // 标题栏按钮
        const tb = 30;
        if (y <= rect.y + tb) {
          const bx = rect.x + rect.w;
          if (x > bx - 34) return { winId: w.id, part: 'win-close', id: w.id };
          if (x > bx - 68) return { winId: w.id, part: 'win-max', id: w.id };
          if (x > bx - 102) return { winId: w.id, part: 'win-min', id: w.id };
          return { winId: w.id, part: 'titlebar', id: w.id };
        }
        // 内容控件命中（事件委托 data-part）
        return { winId: w.id, part: 'client', id: w.id, w, lx: x - rect.x, ly: y - rect.y - tb };
      }
    }
    // 任务栏
    if (y > ui.h - 48) return { part: 'taskbar' };
    // 桌面图标
    for (let i = 0; i < (ui.icons || []).length; i++) {
      const ix = 14, iy = 14 + i * 76, iw = 76, ih = 70;
      if (x >= ix && y >= iy && x <= ix + iw && y <= iy + ih) return { part: 'icon', id: i };
    }
    return { part: 'desktop' };
  }

  winRect(w) {
    if (w.state === 'max') return { x: 0, y: 0, w: this.viewW, h: this.viewH - 48 };
    return { x: w.x, y: w.y, w: w.w, h: w.h };
  }

  onPointer(e, action) {
    if (this.destroyed) return;
    const ui = this.inst.ui;
    if (!ui) return;
    const p = this.localPoint(e);
    const target = e.target.closest('[data-part],[data-cmd]');
    e.preventDefault && e.preventDefault();

    // 1) 控件命令（按钮/菜单/任务栏/图标）：发给 wm（pid=2）
    const cmdEl = e.target.closest('[data-cmd]');
    if (action === 'down' && cmdEl) {
      this.inst.postHostEvent({ type: 'wm-command', cmd: cmdEl.dataset.cmd, arg: cmdEl.dataset.arg !== undefined ? cmdEl.dataset.arg : null, value: cmdEl.dataset.value !== undefined ? cmdEl.dataset.value : null });
      return;
    }
    const partEl = e.target.closest('[data-part]');
    if (action === 'down' && partEl && partEl.dataset.part.startsWith('win-')) {
      this.inst.postHostEvent({ type: 'wm-command', cmd: partEl.dataset.part, arg: partEl.dataset.id || partEl.closest('[data-win]')?.dataset.win });
      return;
    }
    const hit = this.hitTest(ui, p.x, p.y);
    if (action === 'down' && hit.winId && hit.part === 'titlebar') {
      this.inst.postHostEvent({ type: 'wm-command', cmd: 'focus', arg: hit.winId });
      this.startDrag(e, hit);
      return;
    }
    if (action === 'dbl' && hit.part === 'icon') {
      this.inst.postHostEvent({ type: 'wm-command', cmd: (ui.icons[hit.id] || {}).cmd || 'launch-files' });
      return;
    }
    // 2) 应用区域内事件：wm 命中并转发
    if (hit.winId || partEl) {
      const ev = {
        type: 'pointer', action,
        part: partEl ? partEl.dataset.part : hit.part,
        id: partEl ? partEl.dataset.id : (hit.w && hit.w.app),
        value: partEl ? partEl.dataset.value : null,
        x: Math.round(p.x), y: Math.round(p.y),
        lx: hit.lx !== undefined ? Math.round(hit.lx) : null,
        ly: hit.ly !== undefined ? Math.round(hit.ly) : null,
        winId: hit.winId,
        mods: e.ctrlKey ? 'ctrl' : (e.shiftKey ? 'shift' : ''),
        button: e.button
      };
      this.inst.postHostEvent(ev);
    }
  }

  startDrag(e, hit) {
    const r = this.el.getBoundingClientRect();
    const w = hit.w;
    const move = (me) => {
      const x = (me.clientX - r.left) * (this.viewW / r.width);
      const y = (me.clientY - r.top) * (this.viewH / r.height);
      this.inst.postHostEvent({ type: 'wm-command', cmd: 'win-move', arg: w.id, x: Math.round(x), y: Math.round(y - 15) });
    };
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  onKey(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    this.inst.postHostEvent({ type: 'key', key: e.key, mods: e.ctrlKey ? 'ctrl' : '' });
    if (['Escape', 'F5'].includes(e.key)) e.stopPropagation();
  }

  onWheel(e) {
    const target = e.target.closest('[data-3d-view]');
    if (target) {
      e.preventDefault();
      const p = this.localPoint(e);
      this.inst.postHostEvent({ type: 'pointer', action: 'wheel', part: '3d-view', id: target.dataset.pid, value: String(Math.sign(e.deltaY)), x: p.x, y: p.y });
    }
  }

  onDrop(e) {
    // 跨层文件投放
    const data = NOS.dragPayload;
    if (!data) return;
    e.preventDefault();
    NOS.rootVM.eventTarget && NOS.rootApps.sysmgr && NOS.rootApps.sysmgr.transferFile(this.inst, data, e);
  }

  /* ---------- 渲染 ---------- */
  render() {
    if (this.destroyed) return;
    const inst = this.inst;
    if (inst.state === 'kernel-error') { this.renderKernelError(); return; }
    const ui = inst.ui;
    if (!ui) { this.el.innerHTML = '<div class="rd-boot">子系统启动中…</div>'; return; }
    this.viewW = ui.w || 1100; this.viewH = ui.h || 680;
    if (ui.uiVersion === this.lastUiVersion && !this._force) { this.updateViewRects(); return; }
    this.lastUiVersion = ui.version;
    this.buildDesktop(ui);
  }

  _forceRender() { this.lastUiVersion = -1; this.render(); }

  renderKernelError() {
    if (this.el.querySelector('.kernel-error')) return;
    this.el.innerHTML = '';
    const box = NOS.h('div', { class: 'kernel-error', dataTestid: 'kernel-error' });
    box.innerHTML = `<div class="ke-title">内核错误</div><pre>${this.escape(this.inst.kernelError || '未知错误')}</pre>
      <div class="ke-hint">请在父系统编辑器中修改内核程序后重启该子系统。</div>`;
    this.el.appendChild(box);
  }

  buildDesktop(ui) {
    this.el.innerHTML = '';
    this.el.classList.add('rd-live');
    this.el.style.background = 'linear-gradient(#241f44,#15122b)';
    // 壁纸（子系统按层级变色相）
    const hue = (this.inst.depth * 40) % 360;
    this.el.style.background = `linear-gradient(160deg, hsl(${hue} 40% 22%), hsl(${(hue + 40) % 360} 45% 12%))`;

    // 桌面图标
    const icons = NOS.h('div', { class: 'rd-icons' });
    (ui.icons || []).forEach((ic, i) => {
      const d = NOS.h('div', { class: 'rd-icon', dataPart: 'desktop-icon', dataId: String(i), dataCmd: ic.cmd, tabindex: '0' });
      d.innerHTML = `<div class="rd-glyph">${this.glyph(ic.glyph)}</div><div>${ic.label}</div>`;
      d.addEventListener('dblclick', () => this.inst.postHostEvent({ type: 'wm-command', cmd: ic.cmd }));
      d.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
      icons.appendChild(d);
    });
    this.el.appendChild(icons);

    // 窗口
    this.threeViews.forEach(v => NOS.device3D && NOS.device3D.removeView(v.key));
    this.threeViews = [];
    for (const w of ui.windows || []) this.buildWindow(ui, w);

    // 直属子系统远程桌面（由 child-ui 拉取）
    this.buildChildren(ui);

    // 开始菜单
    if (ui.startOpen) this.buildStartMenu(ui);

    // 任务栏
    this.buildTaskbar(ui);
    // 通知中心
    if (ui.notifOpen) this.buildNotifications(ui);
    // 归属标识
    const badge = NOS.h('div', { class: 'rd-badge' }, `${this.inst.name} · L${this.inst.depth} · ${this.stateText()}`);
    this.el.appendChild(badge);
  }

  stateText() {
    return { running: '运行中', paused: '已暂停', stopped: '已停止', 'kernel-error': '内核错误' }[this.inst.state] || this.inst.state;
  }

  glyph(g) {
    return ({ folder: '📁', scene: '✈', chart: '📈', code: '&lt;/&gt;', tasks: '📊', system: '▣' })[g] || '▤';
  }

  buildWindow(ui, w) {
    if (w.min) return;
    const rect = this.winRect(w);
    const win = NOS.h('div', {
      class: 'rd-window' + (w.focus ? ' focus' : ''), dataWin: w.id,
      style: { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' }
    });
    const tb = NOS.h('div', { class: 'rd-titlebar' });
    tb.innerHTML = `<span class="rd-title">${this.escape(w.title || w.app)}</span>`;
    const ctrls = NOS.h('div', { class: 'rd-ctrls' });
    [['win-min', '—'], ['win-max', '□'], ['win-close', '×']].forEach(([p, t]) => {
      const b = NOS.h('button', { class: 'rd-ctrl', dataPart: p, dataId: w.id }, t);
      ctrls.appendChild(b);
    });
    tb.appendChild(ctrls);
    const client = NOS.h('div', { class: 'rd-client', dataWin: w.id });
    win.append(tb, client);
    this.el.appendChild(win);
    this.buildAppContent(ui, w, client);
    // resize 手柄
    const rz = NOS.h('div', { class: 'rd-resize' });
    rz.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const r = this.el.getBoundingClientRect();
      const move = (me) => {
        const x = (me.clientX - r.left) * (this.viewW / r.width) - rect.x;
        const y = (me.clientY - r.top) * (this.viewH / r.height) - rect.y;
        this.inst.postHostEvent({ type: 'wm-command', cmd: 'win-resize', arg: w.id, w: Math.round(x), h: Math.round(y) });
      };
      const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
    });
    win.appendChild(rz);
  }

  buildAppContent(ui, w, client) {
    if (w.app === 'remote' && w.childId) {
      const child = this.inst.findChild(w.childId);
      if (child) {
        const rd = new RemoteDesktop(client, child);
        rd.mount();
        this._childRD = this._childRD || [];
        this._childRD.push(rd);
      } else {
        client.innerHTML = '<div class="rd-boot">子系统未运行</div>';
      }
      return;
    }
    const appUi = (this.inst.appUis || {})[w.pid];
    if (!appUi) { client.innerHTML = '<div class="rd-boot">应用准备中…</div>'; return; }
    const renderer = RD_APP[w.app];
    if (renderer) renderer(client, appUi, this.inst, w, this);
    else client.textContent = appUi.kind + ' ' + w.app;
  }

  buildChildren(ui) {
    // 直属子系统状态徽标（系统窗口内容由 wm 的 remote 窗口负责，此处不重复）
  }

  buildStartMenu(ui) {
    const menu = NOS.h('div', { class: 'rd-start', dataTestid: 'start-menu' });
    (ui.launchIds || []).forEach(id => {
      const labels = { 'launch-files': '文件管理器', 'launch-editor': '程序编辑器', 'launch-tasks': '进程管理器', 'launch-player': '三维播放器', 'launch-charts': '图表工作台', 'launch-system': '子系统管理' };
      const b = NOS.h('button', { class: 'rd-start-item', dataCmd: id, dataTestid: id }, labels[id] || id);
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
      b.addEventListener('click', () => this.inst.postHostEvent({ type: 'wm-command', cmd: id }));
      menu.appendChild(b);
    });
    this.el.appendChild(menu);
  }

  buildTaskbar(ui) {
    const bar = NOS.h('div', { class: 'rd-taskbar' });
    const start = NOS.h('button', { class: 'rd-startbtn', dataCmd: 'toggle-start', dataTestid: 'start-toggle' }, '⊞');
    start.addEventListener('click', () => this.inst.postHostEvent({ type: 'wm-command', cmd: 'toggle-start' }));
    bar.appendChild(start);
    const center = NOS.h('div', { class: 'rd-tbcenter' });
    (ui.taskbar && ui.taskbar.items || []).forEach(it => {
      const b = NOS.h('button', { class: 'rd-tbitem' + (it.focus ? ' active' : ''), dataCmd: 'task-activate', dataArg: it.wid, dataTestid: 'taskbar-item' }, it.title);
      b.addEventListener('click', () => this.inst.postHostEvent({ type: 'wm-command', cmd: 'task-activate', arg: it.wid }));
      center.appendChild(b);
    });
    bar.appendChild(center);
    const right = NOS.h('div', { class: 'rd-tbright' });
    const nt = NOS.h('button', { class: 'rd-tray', dataCmd: 'toggle-notif', dataTestid: 'notifications-toggle' }, '🔔');
    nt.addEventListener('click', () => this.inst.postHostEvent({ type: 'wm-command', cmd: 'toggle-notif' }));
    right.appendChild(nt);
    right.appendChild(NOS.h('span', { class: 'rd-clock' }, this.fmtTime(ui.time)));
    bar.append(right);
    this.el.appendChild(bar);
  }

  buildNotifications(ui) {
    const panel = NOS.h('div', { class: 'rd-notif', dataTestid: 'widget-notifications' });
    const list = (this.inst.notifications || []).slice(-8).reverse();
    if (!list.length) panel.innerHTML = '<div class="rd-empty">暂无通知</div>';
    list.forEach(n => {
      panel.appendChild(NOS.h('div', { class: 'rd-n' }, `<b>${this.escape(n.title || '')}</b><div>${this.escape(n.body || '')}</div>`));
    });
    this.el.appendChild(panel);
  }

  /* 注册一个 3D 视口（播放器区域） */
  register3DView(el, pid, scenePath, cameraMode) {
    const key = this.inst.id + ':' + pid + ':' + NOS.util.uid();
    const view = { key, el, pid, inst: this.inst, sceneKey: null, state: null, camera: { mode: cameraMode || 'cine' }, _rect: null };
    this.threeViews.push(view);
    el.dataset.viewKey = key;
    el.dataset['3d-view'] = '1';
    el.dataset.pid = pid;
    NOS.device3DRegistry = NOS.device3DRegistry || new Map();
    NOS.device3DRegistry.set(key, view);
    return view;
  }

  updateViewRects() {
    // 由全局渲染循环统一计算（device 需要屏幕坐标）
  }

  fmtTime(ms) {
    const d = new Date(ms);
    return d.toLocaleTimeString('zh-CN', { hour12: false });
  }
  escape(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
}

window.NOS.RemoteDesktop = RemoteDesktop;
window.NOS.RD_APP = RDH;
