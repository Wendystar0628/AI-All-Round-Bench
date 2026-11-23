// ============================================================
// 根系统桌面（宿主直接实现）
// Windows 式布局：桌面图标、任务栏、开始菜单、窗口管理、
// 系统窗口（承载子系统桌面）、投送窗口、通知与托盘。
// ============================================================
import { View2D } from '../device/view2d.js';
import { View3D } from '../device/view3d.js';
import { Input } from '../device/input.js';
import { rootApps } from './apps/index.js';

export class Desktop {
  constructor(host, rootSystem) {
    this.host = host;
    this.root = rootSystem;
    this.windows = new Map();
    this.nextWin = 1;
    this.zTop = 100;
    this.focus = null;
    this.startOpen = false;
    this.notifs = [];
    this.settings = { name: 'Nested OS', wallpaper: 'scene1', accent: '#8b6cff', scale: 1 };
    this.sysWins = new Map();     // systemId -> winId
    this.projWins = new Map();    // projId -> winId
    this.view2d = new View2D(host);
    this.view3d = new View3D(host);
    this.input = new Input(host);
    host.view2d = this.view2d;
    host.view3d = this.view3d;
    host.desktop = this;
    this.build();
    this.bindHost();
  }

  // ---------------- DOM 构建 ----------------
  build() {
    const d = document.createElement('div');
    d.id = 'desktop';
    d.style.position = 'absolute'; d.style.inset = '0'; d.style.overflow = 'hidden';
    this.wall = document.createElement('div');
    this.wall.id = 'wallpaper';
    this.wall.style.position = 'absolute'; this.wall.style.inset = '0';
    this.wall.style.backgroundSize = 'cover'; this.wall.style.backgroundPosition = 'center';
    d.appendChild(this.wall);
    this.iconLayer = document.createElement('div');
    this.iconLayer.id = 'icons';
    this.iconLayer.style.position = 'absolute'; this.iconLayer.style.inset = '0';
    d.appendChild(this.iconLayer);
    this.winLayer = document.createElement('div');
    this.winLayer.id = 'wins';
    this.winLayer.style.position = 'absolute'; this.winLayer.style.inset = '0';
    d.appendChild(this.winLayer);
    document.body.appendChild(d);
    this.el = d;
    this.buildTaskbar();
    this.buildStart();
    this.setWallpaper(this.settings.wallpaper);
    this.renderIcons();
  }

  buildTaskbar() {
    const tb = document.createElement('div');
    tb.id = 'taskbar';
    tb.style.position = 'absolute'; tb.style.left = '0'; tb.style.right = '0'; tb.style.bottom = '0';
    tb.style.height = '44px'; tb.style.display = 'flex'; tb.style.alignItems = 'center';
    tb.style.background = 'rgba(16,20,28,0.92)'; tb.style.backdropFilter = 'blur(12px)';
    tb.style.borderTop = '1px solid rgba(120,140,190,0.25)'; tb.style.zIndex = '500';
    tb.innerHTML = `
      <button id="startbtn" class="tbbtn" style="margin-left:6px;background:linear-gradient(135deg,#8b6cff,#6a4dff)">开始</button>
      <div id="pinned" style="display:flex;gap:4px;margin-left:8px"></div>
      <div id="tasks" style="display:flex;gap:4px;margin-left:10px;flex:1;overflow:hidden"></div>
      <div id="tray" style="display:flex;align-items:center;gap:10px;margin-right:10px;color:#c7d2e6;font-size:12px">
        <span id="netstate" title="网络">●</span>
        <span id="clock">--:--</span>
        <span id="date"></span>
        <button id="notifbtn" class="tbbtn" style="padding:2px 8px">通知 0</button>
      </div>`;
    this.el.appendChild(tb);
    this.taskbar = tb;
    this.tasksEl = tb.querySelector('#tasks');
    this.pinnedEl = tb.querySelector('#pinned');
    tb.querySelector('#startbtn').onclick = (e) => { e.stopPropagation(); this.toggleStart(); };
    tb.querySelector('#notifbtn').onclick = (e) => { e.stopPropagation(); this.toggleNotifPanel(); };
    const pinned = [['files', '文件'], ['sheet', '表格'], ['browser', '浏览器'], ['editor', '编辑器'], ['widgets', '小组件'], ['taskmgr', '任务管理器'], ['settings', '设置']];
    for (const [id, label] of pinned) {
      const b = document.createElement('button');
      b.className = 'tbbtn'; b.textContent = label;
      b.onclick = (e) => { e.stopPropagation(); this.openApp(id); };
      this.pinnedEl.appendChild(b);
    }
    setInterval(() => this.tickClock(), 1000);
    this.tickClock();
  }

  buildStart() {
    const m = document.createElement('div');
    m.id = 'startmenu';
    m.style.position = 'absolute'; m.style.left = '6px'; m.style.bottom = '50px';
    m.style.width = '330px'; m.style.maxHeight = '70%'; m.style.overflow = 'auto';
    m.style.background = 'rgba(22,28,40,0.97)'; m.style.border = '1px solid rgba(120,140,190,0.3)';
    m.style.borderRadius = '12px'; m.style.padding = '12px'; m.style.zIndex = '600';
    m.style.display = 'none'; m.style.boxShadow = '0 18px 50px rgba(0,0,0,0.5)';
    m.innerHTML = `<div style="color:#ffd23f;font-size:13px;margin-bottom:8px">应用</div><div id="startapps"></div>
      <div style="color:#ffd23f;font-size:13px;margin:10px 0 6px">系统</div><div id="startsys"></div>`;
    this.el.appendChild(m);
    this.startEl = m;
    const apps = [['files', '文件管理器'], ['sheet', '电子表格'], ['browser', '浏览器'], ['editor', '程序编辑器'],
      ['widgets', '小组件'], ['taskmgr', '任务管理器'], ['settings', '设置'], ['help', '操作说明'], ['console', '程序控制台']];
    const sa = m.querySelector('#startapps');
    for (const [id, label] of apps) {
      const b = document.createElement('button');
      b.className = 'startitem'; b.textContent = label;
      b.onclick = () => { this.openApp(id); this.toggleStart(false); };
      sa.appendChild(b);
    }
    const ss = m.querySelector('#startsys');
    const sysItems = [['创建子系统', () => this.createSystem()], ['系统管理', () => this.openSystemPanel()], ['重置实例编号', () => this.host.resetInnerSeq()]];
    for (const [label, fn] of sysItems) {
      const b = document.createElement('button');
      b.className = 'startitem'; b.textContent = label;
      b.onclick = () => { fn(); this.toggleStart(false); };
      ss.appendChild(b);
    }
  }

  toggleStart(force) {
    this.startOpen = force === undefined ? !this.startOpen : force;
    this.startEl.style.display = this.startOpen ? 'block' : 'none';
  }

  toggleNotifPanel() {
    if (this.notifPanel) { this.notifPanel.remove(); this.notifPanel = null; return; }
    const p = document.createElement('div');
    p.style.position = 'absolute'; p.style.right = '10px'; p.style.bottom = '50px';
    p.style.width = '320px'; p.style.maxHeight = '60%'; p.style.overflow = 'auto';
    p.style.background = 'rgba(22,28,40,0.97)'; p.style.border = '1px solid rgba(120,140,190,0.3)';
    p.style.borderRadius = '12px'; p.style.padding = '10px'; p.style.zIndex = '600';
    let html = '<div style="color:#ffd23f;font-size:13px;margin-bottom:6px">通知中心</div>';
    if (this.notifs.length === 0) html += '<div style="color:#8b96b5;font-size:12px">暂无通知</div>';
    for (const n of this.notifs.slice(-12).reverse()) {
      html += `<div style="padding:6px 0;border-bottom:1px solid rgba(120,140,190,0.15)"><div style="color:#e8ecf4;font-size:12px">${n.title}</div><div style="color:#93a1bb;font-size:11px">${n.text}</div></div>`;
    }
    p.innerHTML = html;
    this.el.appendChild(p);
    this.notifPanel = p;
  }

  notify(title, text) {
    this.notifs.push({ title, text, t: Date.now() });
    const b = this.taskbar.querySelector('#notifbtn');
    b.textContent = '通知 ' + this.notifs.length;
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.cssText = 'position:absolute;right:12px;bottom:56px;background:rgba(28,36,51,0.95);border:1px solid #33405a;border-radius:8px;padding:8px 12px;color:#e8ecf4;font-size:12px;z-index:700;max-width:300px';
    t.innerHTML = `<div style="color:#ffd23f">${title}</div><div style="color:#93a1bb">${text}</div>`;
    this.el.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; }, 2600);
    setTimeout(() => t.remove(), 3200);
  }

  tickClock() {
    const d = new Date();
    const c = this.taskbar.querySelector('#clock');
    if (c) c.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    const dt = this.taskbar.querySelector('#date');
    if (dt) dt.textContent = `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  // ---------------- 壁纸（自制风景图） ----------------
  setWallpaper(name) {
    this.settings.wallpaper = name;
    this.wall.style.backgroundImage = `url(${makeWallpaper(name)})`;
  }

  // ---------------- 桌面图标 ----------------
  renderIcons() {
    this.iconLayer.innerHTML = '';
    const items = [];
    const docs = this.root.vfs.list('/Desktop');
    if (docs) for (const e of docs) if (e.type === 'file') items.push({ name: e.name, path: '/Desktop/' + e.name, kind: 'file' });
    for (const [id, label] of [['files', '文件管理器'], ['sheet', '电子表格'], ['browser', '浏览器'], ['editor', '程序编辑器'], ['widgets', '小组件'], ['taskmgr', '任务管理器'], ['settings', '设置'], ['help', '操作说明']]) {
      items.push({ name: label, app: id, kind: 'app' });
    }
    items.forEach((it, i) => {
      const d = document.createElement('div');
      d.className = 'deskicon';
      d.style.cssText = 'position:absolute;left:' + (18 + (i % 2) * 96) + 'px;top:' + (16 + Math.floor(i / 2) * 100) + 'px;width:86px;text-align:center;cursor:pointer;user-select:none';
      d.innerHTML = `<div style="font-size:34px;line-height:44px">${it.kind === 'app' ? APP_GLYPH[it.app] || '🗔' : FILE_GLYPH(it.name)}</div><div style="color:#e8ecf4;font-size:12px;text-shadow:0 1px 3px #000">${it.name}</div>`;
      d.ondblclick = () => { if (it.kind === 'app') this.openApp(it.app); else this.openPath(it.path); };
      d.onclick = (e) => { e.stopPropagation(); this.iconLayer.querySelectorAll('.deskicon').forEach(x => x.style.background = ''); d.style.background = 'rgba(139,108,255,0.25)'; d.style.borderRadius = '8px'; };
      this.iconLayer.appendChild(d);
    });
  }

  openPath(path) {
    const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
    if (ext === '.scene' || ext === '.rec') this.openApp('player', { path });
    else if (ext === '.sheet') this.openApp('sheet', { path });
    else this.openApp('editor', { path });
  }

  // ---------------- 窗口管理 ----------------
  openApp(appId, opts = {}) {
    const existing = [...this.windows.values()].find(w => w.appId === appId && !opts.force);
    if (existing && !opts.path) { this.focusWin(existing.id); if (existing.min) this.unmin(existing); return existing; }
    const def = rootApps[appId];
    if (!def) { this.notify('无法打开', '未知应用 ' + appId); return null; }
    const id = this.nextWin++;
    const w = {
      id, appId, title: def.title, x: 60 + (id % 8) * 22, y: 40 + (id % 8) * 18,
      w: def.w || 720, h: def.h || 480, min: false, max: false, z: this.zTop++, sys: null, proj: null, prev: null
    };
    const el = document.createElement('div');
    el.className = 'win';
    el.style.cssText = `position:absolute;left:${w.x}px;top:${w.y}px;width:${w.w}px;height:${w.h}px;background:#141a24;border:1px solid #33405a;border-radius:10px;box-shadow:0 14px 40px rgba(0,0,0,0.45);display:flex;flex-direction:column;overflow:hidden;z-index:${w.z}`;
    const bar = document.createElement('div');
    bar.className = 'titlebar';
    bar.style.cssText = 'height:30px;flex:0 0 30px;display:flex;align-items:center;gap:6px;padding:0 8px;background:linear-gradient(180deg,#232d3f,#1c2433);cursor:default;user-select:none';
    bar.innerHTML = `<span class="wtitle" style="flex:1;color:#e8ecf4;font-size:12px;overflow:hidden;white-space:nowrap">${w.title}</span>`;
    const mkBtn = (label, color, fn) => {
      const b = document.createElement('button');
      b.className = 'wbtn'; b.textContent = label;
      b.style.cssText = `width:22px;height:20px;border:none;border-radius:4px;background:#0f141d;color:${color};font-size:11px;cursor:pointer`;
      b.onclick = (e) => { e.stopPropagation(); fn(); };
      bar.appendChild(b);
      return b;
    };
    mkBtn('—', '#e8ecf4', () => this.minimize(w.id));
    mkBtn('▢', '#e8ecf4', () => this.toggleMax(w.id));
    mkBtn('✕', '#ff5d6c', () => this.closeWin(w.id));
    el.appendChild(bar);
    const body = document.createElement('div');
    body.className = 'winbody';
    body.style.cssText = 'flex:1;overflow:hidden;position:relative;background:#0e1420';
    el.appendChild(body);
    this.winLayer.appendChild(el);
    w.el = el; w.body = body; w.bar = bar;
    this.windows.set(id, w);
    this.bindWinEvents(w);
    // 应用装载
    w._opts = opts;
    try {
      def.mount(w, this.api(), opts);
    } catch (e) {
      body.innerHTML = `<div style="padding:16px;color:#ff5d6c;font-size:13px">应用启动失败: ${e.message}</div>`;
    }
    if (opts.path && w.api && w.api.openPath) w.api.openPath(opts.path);
    this.focusWin(id);
    this.renderTasks();
    return w;
  }

  api() {
    return {
      host: this.host, root: this.root, desktop: this,
      fs: this.root.vfs,
      setTitle: (t) => { const w = this.focusWin(); if (w) { w.title = t; w.bar.querySelector('.wtitle').textContent = t; this.renderTasks(); } },
      notify: (a, b) => this.notify(a, b),
      openApp: (id, o) => this.openApp(id, o),
      openPath: (p) => this.openPath(p),
      refreshIcons: () => this.renderIcons(),
      publish: (p) => this.host.publishDataVersion(p),
      settings: this.settings,
      applySettings: () => this.applySettings()
    };
  }

  focusWin() {
    for (const w of this.windows.values()) if (w.el.style.zIndex == this.zTop - 1) return w;
    return null;
  }

  focusWinId(id) {
    const w = this.windows.get(id);
    if (!w) return;
    w.z = this.zTop++;
    w.el.style.zIndex = w.z;
    this.focus = w;
    for (const x of this.windows.values()) x.el.style.outline = '';
    w.el.style.outline = '1px solid ' + this.settings.accent;
  }

  minimize(id) {
    const w = this.windows.get(id);
    if (!w) return;
    w.min = true; w.el.style.display = 'none';
    this.renderTasks();
  }
  unmin(w) { w.min = false; w.el.style.display = 'flex'; this.focusWinId(w.id); this.renderTasks(); }

  toggleMax(id) {
    const w = this.windows.get(id);
    if (!w) return;
    if (w.max) {
      w.max = false;
      Object.assign(w.el.style, { left: w.prev.x + 'px', top: w.prev.y + 'px', width: w.prev.w + 'px', height: w.prev.h + 'px' });
    } else {
      w.prev = { x: w.x, y: w.y, w: w.w, h: w.h };
      w.max = true;
      const r = this.el.getBoundingClientRect();
      Object.assign(w.el.style, { left: '0px', top: '0px', width: r.width + 'px', height: (r.height - 44) + 'px' });
    }
    if (w.onResize) w.onResize();
  }

  closeWin(id) {
    const w = this.windows.get(id);
    if (!w) return;
    if (w.sys) {
      const ok = confirm('关闭该窗口将停止整个子系统子树，确定吗？');
      if (!ok) return;
      this.host.destroySubtree(w.sys, false);
      this.sysWins.delete(w.sys);
    }
    if (w.proj) {
      this.host.projectionInput(w.proj, { t: 'close' });
      this.projWins.delete(w.proj);
    }
    if (w.api && w.api.dispose) { try { w.api.dispose(); } catch (e) { } }
    w.el.remove();
    this.windows.delete(id);
    this.renderTasks();
  }

  bindWinEvents(w) {
    const bar = w.bar;
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.classList.contains('wbtn')) return;
      this.focusWinId(w.id);
      const r = w.el.getBoundingClientRect();
      const dr = this.el.getBoundingClientRect();
      const drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      const move = (ev) => {
        if (w.max) return;
        let x = ev.clientX - dr.left - drag.dx, y = ev.clientY - dr.top - drag.dy;
        y = Math.max(0, Math.min(y, dr.height - 90));
        x = Math.max(-w.w + 90, Math.min(x, dr.width - 60));
        w.el.style.left = x + 'px'; w.el.style.top = y + 'px';
        w.x = x; w.y = y;
      };
      const up = (ev) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (!w.max && ev.clientX - dr.left <= 6) this.snapHalf(w, false);
        else if (!w.max && ev.clientX - dr.left >= dr.width - 6) this.snapHalf(w, true);
        if (w.onResize) w.onResize();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    bar.addEventListener('dblclick', (e) => { if (!e.target.classList.contains('wbtn')) this.toggleMax(w.id); });
    // 边缘缩放
    w.el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.titlebar')) return;
      const r = w.el.getBoundingClientRect();
      const edge = e.clientX > r.right - 6 ? 'e' : e.clientY > r.bottom - 6 ? 's' : null;
      if (!edge || w.max) return;
      this.focusWinId(w.id);
      const move = (ev) => {
        if (edge === 'e') { w.w = Math.max(280, ev.clientX - r.left); w.el.style.width = w.w + 'px'; }
        else { w.h = Math.max(200, ev.clientY - r.top); w.el.style.height = w.h + 'px'; }
        if (w.onResize) w.onResize();
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    w.el.addEventListener('pointerdown', () => this.focusWinId(w.id), true);
  }

  snapHalf(w, right) {
    const r = this.el.getBoundingClientRect();
    if (w.max) { w.max = false; }
    w.prev = { x: w.x, y: w.y, w: w.w, h: w.h };
    w.x = right ? r.width / 2 : 0; w.y = 0; w.w = r.width / 2; w.h = r.height - 44;
    Object.assign(w.el.style, { left: w.x + 'px', top: '0px', width: w.w + 'px', height: w.h + 'px' });
    if (w.onResize) w.onResize();
  }

  renderTasks() {
    this.tasksEl.innerHTML = '';
    for (const w of this.windows.values()) {
      const b = document.createElement('button');
      b.className = 'tbbtn';
      b.textContent = w.title;
      b.style.cssText = 'max-width:150px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;' + (w.min ? 'opacity:.55;' : 'background:#232d3f;');
      b.onclick = () => { if (w.min) this.unmin(w); else if (this.focus === w) this.minimize(w.id); else this.focusWinId(w.id); };
      this.tasksEl.appendChild(b);
    }
  }

  // ---------------- 系统窗口（承载子系统桌面） ----------------
  systemWindow(system) {
    if (this.sysWins.has(system.id)) {
      const id = this.sysWins.get(system.id);
      const w = this.windows.get(id);
      if (w) { this.unmin(w); return w; }
    }
    const w = this.openApp('systemview', { force: true, system });
    if (w) this.sysWins.set(system.id, w.id);
    return w;
  }

  // ---------------- 投送窗口 ----------------
  projectionWindow(proj) {
    if (this.projWins.has(proj.id)) {
      const id = this.projWins.get(proj.id);
      const w = this.windows.get(id);
      if (w) { this.unmin(w); return w; }
    }
    const w = this.openApp('projection', { force: true, proj });
    if (w) this.projWins.set(proj.id, w.id);
    return w;
  }

  createSystem() {
    const name = prompt('子系统名称（可留空自动命名）', '') || '';
    const r = this.host.createChildSystem('outer', { name, kernelSource: this.host.presets.kernelSource });
    if (r.error) { this.notify('创建失败', r.error); return null; }
    const sys = this.host.systems.get(r.id);
    this.systemWindow(sys);
    this.notify('子系统已创建', r.id + (name ? ' · ' + name : ''));
    return sys;
  }

  openSystemPanel() {
    const w = this.openApp('syspanel', { force: true });
    return w;
  }

  applySettings() {
    document.documentElement.style.setProperty('--accent', this.settings.accent);
    const scale = this.settings.scale || 1;
    this.el.style.zoom = scale;
    this.setWallpaper(this.settings.wallpaper);
    this.notify('设置已应用', `名称 ${this.settings.name} · 缩放 ${Math.round(scale * 100)}%`);
  }

  bindHost() {
    this.host.on('system-added', (s) => {
      if (s.parentId === 'outer') this.systemWindow(s);
    });
    this.host.on('root-projection', (m) => {
      if (m.t === 'projection_open') {
        const proj = this.host.projections.get(m.projId);
        if (proj) this.projectionWindow(proj);
      } else if (m.t === 'projection_closed') {
        const id = this.projWins.get(m.projId);
        if (id) { const w = this.windows.get(id); if (w) { w.proj = null; this.closeWin(id); } }
        this.projWins.delete(m.projId);
      } else if (m.t === 'projection_focus') {
        const id = this.projWins.get(m.projId);
        if (id) { const w = this.windows.get(id); if (w) this.unmin(w); }
      }
    });
    this.host.on('file-received', (f) => {
      this.notify('已接收文件', (f.error ? '失败: ' + f.error : f.name + ' → ' + f.dir));
      this.renderIcons();
    });
    this.host.on('subtree-destroyed', (id) => {
      const wid = this.sysWins.get(id);
      if (wid) { const w = this.windows.get(wid); if (w) { w.sys = null; this.closeWin(wid); } }
      this.sysWins.delete(id);
      this.notify('子系统已停止', id);
    });
  }

  // 根桌面窗口矩形（供三维视图遮挡计算）
  rootWindowRects() {
    const out = [];
    const dr = this.el.getBoundingClientRect();
    for (const w of this.windows.values()) {
      if (w.min) continue;
      const r = w.el.getBoundingClientRect();
      out.push([r.left - dr.left + dr.left, r.top, r.width, r.height]);
    }
    return out;
  }

  ready() { return true; }
}

const APP_GLYPH = { files: '📁', sheet: '📊', browser: '🌐', editor: '📝', widgets: '🧩', taskmgr: '⚙', settings: '🔧', help: '❓', console: '▶' };
function FILE_GLYPH(name) {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  if (ext === '.scene' || ext === '.rec') return '🚁';
  if (ext === '.osprog') return '📜';
  if (ext === '.sheet') return '📊';
  if (ext === '.txt' || ext === '.md') return '📄';
  return '📄';
}

// ---------------- 自制壁纸（程序生成风景图） ----------------
const wallCache = {};
export function makeWallpaper(name) {
  if (wallCache[name]) return wallCache[name];
  const cv = document.createElement('canvas');
  cv.width = 1280; cv.height = 800;
  const c = cv.getContext('2d');
  const themes = {
    scene1: { sky: ['#2b3f6e', '#7f9ec9', '#f2c98a'], sun: '#ffd9a0', mount: ['#2c3a57', '#3d4f70'], ground: '#3f5a3a', water: '#2a4a63' },
    scene2: { sky: ['#1d2a4a', '#4a5f96', '#c98a6a'], sun: '#ffb27a', mount: ['#241f38', '#3a3050'], ground: '#4a4030', water: '#233a52' },
    scene3: { sky: ['#0f2a3a', '#2f6f7a', '#a8d8c0'], sun: '#e8ffd9', mount: ['#173038', '#254a4a'], ground: '#2f4a3a', water: '#1d4a52' }
  };
  const t = themes[name] || themes.scene1;
  // 天空
  const g = c.createLinearGradient(0, 0, 0, 520);
  g.addColorStop(0, t.sky[0]); g.addColorStop(0.55, t.sky[1]); g.addColorStop(1, t.sky[2]);
  c.fillStyle = g; c.fillRect(0, 0, 1280, 520);
  // 星
  for (let i = 0; i < 90; i++) {
    const x = (i * 137.5) % 1280, y = (i * 79.3) % 260;
    c.fillStyle = `rgba(255,255,255,${0.15 + (i % 5) * 0.1})`;
    c.fillRect(x, y, 1.6, 1.6);
  }
  // 太阳
  const sg = c.createRadialGradient(980, 300, 10, 980, 300, 190);
  sg.addColorStop(0, t.sun); sg.addColorStop(0.25, t.sun + 'cc'); sg.addColorStop(1, 'rgba(255,200,140,0)');
  c.fillStyle = sg; c.beginPath(); c.arc(980, 300, 190, 0, Math.PI * 2); c.fill();
  // 云
  for (let i = 0; i < 6; i++) {
    const cx = 120 + i * 200, cy = 120 + (i % 3) * 60, s = 0.7 + (i % 3) * 0.35;
    c.fillStyle = `rgba(255,255,255,${0.1 + (i % 3) * 0.05})`;
    for (let j = 0; j < 5; j++) {
      c.beginPath();
      c.ellipse(cx + j * 34 * s, cy + (j % 2) * 10 * s, 46 * s, 20 * s, 0, 0, Math.PI * 2);
      c.fill();
    }
  }
  // 远山
  const ridge = (base, amp, color, seed) => {
    c.fillStyle = color;
    c.beginPath(); c.moveTo(0, 800);
    for (let x = 0; x <= 1280; x += 20) {
      const y = base + Math.sin(x * 0.004 + seed) * amp + Math.sin(x * 0.011 + seed * 2) * amp * 0.35;
      c.lineTo(x, y);
    }
    c.lineTo(1280, 800); c.closePath(); c.fill();
  };
  ridge(330, 90, t.mount[0], 1.2);
  ridge(400, 70, t.mount[1], 3.4);
  // 湖面
  c.fillStyle = t.water; c.fillRect(0, 520, 1280, 280);
  // 山在水中的倒影
  c.globalAlpha = 0.25;
  c.save(); c.translate(0, 1040); c.scale(1, -1);
  ridge(330, 90, t.mount[0], 1.2);
  c.restore();
  c.globalAlpha = 1;
  // 波光
  for (let i = 0; i < 60; i++) {
    const y = 530 + (i * 4.4) % 260, x = (i * 211) % 1280, w = 30 + (i % 5) * 26;
    c.fillStyle = `rgba(255,230,190,${0.05 + (i % 4) * 0.03})`;
    c.fillRect(x, y, w, 1.4);
  }
  // 地面与树
  c.fillStyle = t.ground;
  c.beginPath(); c.moveTo(0, 800); c.lineTo(0, 700);
  for (let x = 0; x <= 1280; x += 40) c.lineTo(x, 700 + Math.sin(x * 0.01) * 12);
  c.lineTo(1280, 800); c.closePath(); c.fill();
  for (let i = 0; i < 16; i++) {
    const x = 40 + i * 82, y = 690 + Math.sin(x * 0.01) * 12, s = 0.7 + (i % 4) * 0.28;
    c.fillStyle = '#2c3a26';
    c.fillRect(x - 3 * s, y - 26 * s, 6 * s, 28 * s);
    c.fillStyle = i % 2 ? '#33502e' : '#3c5c34';
    c.beginPath();
    c.moveTo(x, y - 62 * s); c.lineTo(x - 22 * s, y - 22 * s); c.lineTo(x + 22 * s, y - 22 * s);
    c.closePath(); c.fill();
  }
  // 一架小直升机剪影（主题元素）
  c.save();
  c.translate(300, 210); c.scale(1.1, 1.1);
  c.fillStyle = 'rgba(20,24,36,0.85)';
  c.beginPath(); c.ellipse(0, 0, 26, 13, 0, 0, Math.PI * 2); c.fill();
  c.fillRect(24, -4, 34, 7);
  c.strokeStyle = 'rgba(20,24,36,0.85)'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(-44, -22); c.lineTo(44, -22); c.stroke();
  c.beginPath(); c.moveTo(0, -22); c.lineTo(0, -10); c.stroke();
  c.strokeStyle = 'rgba(255,210,63,0.9)'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(-14, 2); c.lineTo(14, 2); c.stroke();
  c.restore();
  wallCache[name] = cv.toDataURL('image/jpeg', 0.86);
  return wallCache[name];
}
