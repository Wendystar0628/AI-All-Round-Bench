/*
 * 宿主主控：系统树的创建与管理、根桌面、各子系统桌面、投送窗口、快照与 bench 接口。
 */
import { ThreeView } from './threeview.js';

const NOS = (globalThis.NOS = globalThis.NOS || {});
const Desktop = NOS.Desktop;
const renderWidgets = NOS.renderWidgets;
const RootApps = NOS.RootApps;

const ROOT_APPS = [
  { id: 'files', name: '文件管理器', icon: 'files', desc: '目录导航与文件操作' },
  { id: 'spreadsheet', name: '电子表格', icon: 'spreadsheet', desc: '公式、选区与工作簿' },
  { id: 'widgets', name: '小组件', icon: 'widgets', desc: '时钟、倒计时、便笺、通知' },
  { id: 'editor', name: '文本与程序编辑器', icon: 'editor', desc: '编辑并运行 NSL 程序' },
  { id: 'tasks', name: '任务管理器', icon: 'tasks', desc: '进程、配额与子系统拨付' },
  { id: 'settings', name: '设置', icon: 'settings', desc: '壁纸、强调色与缩放' },
  { id: 'browser', name: '浏览器', icon: 'browser', desc: '真实 Chromium 网页' },
  { id: 'systems', name: '系统', icon: 'system', desc: '子系统创建与管理' },
];
const SUB_APPS = [
  { id: 'files', name: '文件管理器', icon: 'files', desc: '本系统文件' },
  { id: 'editor', name: '文本与程序编辑器', icon: 'editor', desc: '编辑并运行程序' },
  { id: 'tasks', name: '进程管理器', icon: 'tasks', desc: '本系统进程与配额' },
  { id: 'player', name: '三维场景播放器', icon: 'player', desc: '直升机场景与飞行排演' },
  { id: 'charts', name: '图表工作台', icon: 'charts', desc: '连接根表格实时数据' },
  { id: 'systems', name: '系统', icon: 'system', desc: '直属子系统管理' },
];

class Host {
  constructor() {
    this.rt = null;
    this.desktops = new Map();
    this.subWindows = new Map();   // systemId -> Set(winId)
    this.threeViews = new Map();   // key -> ThreeView
    this.rootApps = new RootApps(this);
    this.ready = false;
    this.lastStep = 0;
    this.sheet = null;
    this.projections = [];         // 投送窗口登记
    this.projSeq = 1;
  }

  /* ---------------- 启动 ---------------- */
  async boot() {
    const F = await this.loadFixtures();
    this.fixtures = F;
    this.rt = new NOS.Runtime({
      fixtures: F,
      onSync: (sys) => this.onSystemSync(sys),
      onScene: (sys, key, data) => this.onSceneSubmit(sys, key, data),
      onNotify: (sys, a) => this.onNotify(sys, a),
      onChartConnect: (conn) => this.onChartConnect(conn),
      onChartDocs: () => this.onChartDocs(),
      onNewChild: (parentId) => this.createSystem(parentId),
      onChildControl: (parentId, childId, action) => this.onChildControl(parentId, childId, action),
      onOpenEditor: (parentId, childId) => this.onOpenEditor(parentId, childId),
      onProject: (req) => this.onProject(req),
      verbose: false,
    });
    const root = this.rt.createRoot();
    this.root = root;
    root.wallpaper = F.wallpaper;
    this.rt.loadCompiler(root);
    /* 根表格发布总线：数据以副本跨层传给订阅的子系统 */
    this.rt.sheetBus = (version, payload) => this.onSheetPublish(version, payload);
    // 根桌面
    const container = document.getElementById('desktop-root');
    const desk = new Desktop(this.rt, root, this, 0);
    this.desktops.set(root.id, desk);
    desk.build(container);
    desk.setIcons([
      { appId: 'files', icon: 'files', label: '文件管理器' },
      { appId: 'spreadsheet', icon: 'spreadsheet', label: '电子表格' },
      { appId: 'browser', icon: 'browser', label: '浏览器' },
      { appId: 'widgets', icon: 'widgets', label: '小组件' },
      { appId: 'editor', icon: 'editor', label: '编辑器' },
      { appId: 'tasks', icon: 'tasks', label: '任务管理器' },
      { appId: 'systems', icon: 'system', label: '系统' },
    ]);
    this.rootApps.init(root);
    this.sheet = this.rootApps.sheet;
    // 首帧
    this.render();
    this.ready = true;
    // 逻辑循环
    this.timer = setInterval(() => this.tick(), 25);
    return this;
  }
  async loadFixtures() {
    const text = async (p) => {
      const r = await fetch(p);
      if (!r.ok) throw new Error('缺少资源 ' + p + '（' + r.status + '）');
      return r.text();
    };
    const json = async (p) => JSON.parse(await text(p));
    const compiler = await text('/nsl/compiler.nsl');
    const kernel = await text('/nsl/kernel.nsl');
    const apps = {};
    for (const n of ['files', 'editor', 'tasks', 'player', 'charts', 'system', 'player-timing', 'player-scene', 'player-fx']) {
      try { apps[n] = await text('/nsl/apps/' + n + '.nsl'); } catch (e) { apps[n] = ''; }
    }
    const fc = await text('/nsl/flight-controller.nsl');
    const scene = await text('/nsl/helicopter-24.scene.json');
    const workbook = await text('/nsl/sample.sheet.json');
    const wallpaper = await this.makeWallpaper();
    return {
      kernel, compiler, apps, flightController: fc,
      scene, sceneCopy: scene, workbook,
      wallpaper,
      programs: {},
    };
  }
  /* 根壁纸：程序生成的风景图 */
  async makeWallpaper() {
    const c = document.createElement('canvas');
    c.width = 1600; c.height = 900;
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 900);
    sky.addColorStop(0, '#171a3c');
    sky.addColorStop(0.42, '#3d2a63');
    sky.addColorStop(0.68, '#a8486a');
    sky.addColorStop(0.82, '#e8844f');
    sky.addColorStop(1, '#f7c26b');
    g.fillStyle = sky; g.fillRect(0, 0, 1600, 900);
    // 远山
    const ridge = (yBase, color, amp, seed) => {
      g.beginPath(); g.moveTo(0, 900);
      let y = yBase;
      for (let x = 0; x <= 1600; x += 8) {
        y = yBase + Math.sin(x * 0.006 + seed) * amp + Math.sin(x * 0.021 + seed * 2) * amp * 0.45;
        g.lineTo(x, y);
      }
      g.lineTo(1600, 900); g.closePath();
      g.fillStyle = color; g.fill();
    };
    ridge(520, '#3a2a5c', 46, 1.2);
    ridge(610, '#2a1f46', 34, 3.7);
    ridge(700, '#1b1430', 22, 5.1);
    // 湖面
    const lake = g.createLinearGradient(0, 700, 0, 900);
    lake.addColorStop(0, '#3c2a5e'); lake.addColorStop(1, '#171129');
    g.fillStyle = lake; g.fillRect(0, 700, 1600, 200);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(247,194,107,' + (0.05 + Math.random() * 0.12) + ')';
      const y = 710 + Math.random() * 170;
      g.fillRect(Math.random() * 1600, y, 30 + Math.random() * 120, 1.5);
    }
    // 太阳
    const sun = g.createRadialGradient(1180, 300, 6, 1180, 300, 150);
    sun.addColorStop(0, 'rgba(255,236,190,0.95)');
    sun.addColorStop(0.25, 'rgba(255,176,110,0.55)');
    sun.addColorStop(1, 'rgba(255,150,90,0)');
    g.fillStyle = sun; g.fillRect(1000, 120, 380, 380);
    // 星星
    for (let i = 0; i < 120; i++) {
      g.fillStyle = 'rgba(255,255,255,' + (0.15 + Math.random() * 0.5) + ')';
      g.fillRect(Math.random() * 1600, Math.random() * 420, 1.6, 1.6);
    }
    // 树影
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * 1600;
      const h = 70 + Math.random() * 130;
      g.fillStyle = 'rgba(12,8,22,0.85)';
      g.beginPath();
      g.moveTo(x, 900); g.lineTo(x - h * 0.28, 900); g.lineTo(x, 900 - h); g.lineTo(x + h * 0.28, 900);
      g.closePath(); g.fill();
    }
    return c.toDataURL('image/jpeg', 0.86);
  }

  /* ---------------- 桌面与窗口 ---------------- */
  desktopOf(sys) { return this.desktops.get(sys.id); }
  appsFor(sys) { return sys.parentId ? SUB_APPS : ROOT_APPS; }
  clockText(sys) {
    const d = new Date();
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  onIconOpen(desk, item) {
    const sys = desk.sys;
    if (item.appId === 'systems') { this.rootApps.openSystems(sys); return; }
    this.launchApp(sys, item.appId);
  }
  launchApp(sys, appId) {
    if (sys.parentId) { this.launchSubApp(sys, appId); return; }
    this.rootApps.launch(sys, appId);
  }
  launchSubApp(sys, appId) {
    const map = {
      files: '/System/apps/files.nsl', editor: '/System/apps/editor.nsl',
      tasks: '/System/apps/tasks.nsl', player: '/System/apps/player.nsl',
      charts: '/System/apps/charts.nsl', systems: '/System/apps/system.nsl',
    };
    const path = map[appId];
    if (!path) return;
    sys.pendingEvents.push({ kind: 'launch', name: appId, path });
    this.rt.log('启动应用 ' + appId + ' @' + sys.id);
  }
  onDesktopContextMenu(desk, e, item) {
    const sys = desk.sys;
    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.setAttribute('data-testid', 'desktop-context-menu');
    const add = (label, fn, testid) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (testid) b.setAttribute('data-testid', testid);
      b.addEventListener('click', () => { menu.remove(); fn(); });
      menu.appendChild(b);
    };
    if (item && item.path) {
      add('打开', () => this.openFileIn(sys, item.path));
      add('在编辑器中打开', () => { this.rootApps.openEditor(sys, item.path); });
    }
    add('新建文件夹', () => { this.rootApps.newFolder(sys, '/Documents'); });
    add('新建文本文件', () => { this.rootApps.newFile(sys, '/Documents'); });
    add('系统设置', () => this.rootApps.openSettings(sys));
    add('刷新', () => this.render());
    document.body.appendChild(menu);
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    setTimeout(() => document.addEventListener('pointerdown', function h(ev) {
      if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('pointerdown', h); }
    }), 0);
  }
  openFileIn(sys, path) {
    if (/\.nsl$/.test(path)) { this.rootApps.openEditor(sys, path); return; }
    if (/\.sheet$/.test(path) || /\.json$/.test(path)) { this.rootApps.openSheet(sys, path); return; }
    if (/\.scene$/.test(path)) { this.rootApps.openScene(sys, path); return; }
    this.rootApps.openText(sys, path);
  }

  /* ---------------- 系统树 ---------------- */
  createSystem(parentId) {
    const parent = this.rt.sys(parentId);
    if (!parent) return null;
    if (!parent.compilerProg) this.rt.loadCompiler(parent);
    const src = parent.fs.read('/System/kernel.nsl');
    if (!src.ok) { this.notify(parent, '内核错误', '父系统中缺少 /System/kernel.nsl'); return null; }
    let kernelProg;
    try {
      kernelProg = this.rt.compileWithSystem(parent, src.content);
    } catch (e) {
      this.notify(parent, '内核错误', e.message);
      return null;
    }
    const child = this.rt.createChild(parent);
    this.rt.loadCompiler(child);
    const kp = new NOS.Proc(child, 'kernel', 'kernel', kernelProg, '/System/kernel.nsl');
    parent.processes.push(kp);
    child.kernelProc = kp;
    this.notify(parent, '子系统已创建', child.id + '（层级 ' + (child.depth + 1) + '）');
    return child;
  }
  openSystemWindow(sys) {
    const rootDesk = this.desktops.get(this.root.id);
    let win = rootDesk.windows.find((w) => w.appId === 'system' && w.meta.systemId === sys.id);
    if (win) { win.state = 'normal'; rootDesk.syncWindows(); rootDesk.focus(win); return win; }
    const body = document.createElement('div');
    body.className = 'system-window-body';
    body.setAttribute('data-system-id', sys.id);
    const childDesk = new Desktop(this.rt, sys, this, sys.depth);
    this.desktops.set(sys.id, childDesk);
    childDesk.build(body);
    childDesk.setIcons([
      { appId: 'files', icon: 'files', label: '文件' },
      { appId: 'editor', icon: 'editor', label: '编辑器' },
      { appId: 'tasks', icon: 'tasks', label: '进程' },
      { appId: 'player', icon: 'player', label: '播放器' },
      { appId: 'charts', icon: 'charts', label: '图表' },
      { appId: 'systems', icon: 'system', label: '系统' },
    ]);
    win = rootDesk.open({
      appId: 'system', title: sys.id + ' · ' + (sys.systemName || sys.name),
      w: 900, h: 600, x: 60 + (rootDesk.windows.length % 4) * 26, y: 40 + (rootDesk.windows.length % 4) * 24,
      content: body, meta: { systemId: sys.id },
    });
    win.el.setAttribute('data-system-id', sys.id);
    return win;
  }
  onSystemSync(sys) {
    // 内核同步了窗口表：更新该子系统桌面上的窗口
    const desk = this.desktops.get(sys.id);
    if (!desk) return;
    this.renderSystemWindows(sys, desk);
  }
  renderSystemWindows(sys, desk) {
    const wins = sys.windows || [];
    const seen = new Set();
    for (const w of wins) {
      seen.add(String(w.id));
      let rec = desk.windows.find((x) => x.meta && x.meta.kernelWindow === w.id);
      if (!rec) {
        const body = document.createElement('div');
        body.className = 'sub-window-body';
        const el = document.createElement('div');
        el.className = 'app-window';
        el.setAttribute('data-testid', 'app-window');
        el.setAttribute('data-window-id', 'k' + w.id);
        el.setAttribute('data-app-id', w.app || 'app');
        el.setAttribute('data-system-id', sys.id);
        el.innerHTML = '<div class="titlebar" data-testid="window-titlebar"><span class="title-ico">' + NOS.icon(w.app || 'app') + '</span><span class="title-text"></span><span class="win-btns"><button data-testid="window-minimize">▁</button><button data-testid="window-maximize">▢</button><button data-testid="window-close">✕</button></span></div><div class="win-body"></div>';
        el.querySelector('.title-text').textContent = w.title || '';
        el.querySelector('[data-testid="window-minimize"]').addEventListener('click', (e) => { e.stopPropagation(); sys.pendingEvents.push({ kind: 'syscall', pid: w.owner, tag: 0, code: 'win.min', args: JSON.stringify({ id: w.id }) }); });
        el.querySelector('[data-testid="window-maximize"]').addEventListener('click', (e) => { e.stopPropagation(); sys.pendingEvents.push({ kind: 'syscall', pid: w.owner, tag: 0, code: 'win.max', args: JSON.stringify({ id: w.id }) }); });
        el.querySelector('[data-testid="window-close"]').addEventListener('click', (e) => { e.stopPropagation(); sys.pendingEvents.push({ kind: 'syscall', pid: w.owner, tag: 0, code: 'win.close', args: JSON.stringify({ id: w.id }) }); });
        const tb = el.querySelector('.titlebar');
        tb.addEventListener('pointerdown', () => {
          sys.pendingEvents.push({ kind: 'syscall', pid: w.owner, tag: 0, code: 'win.focus', args: JSON.stringify({ id: w.id }) });
        });
        desk.winLayer.appendChild(el);
        rec = { el, body: el.querySelector('.win-body'), kernelWindow: w.id, app: w.app };
        desk.windows.push(rec);
        desk.windows.forEach((x, i) => { if (!x.z) x.z = 10 + i; });
      }
      rec.app = w.app;
      rec.el.querySelector('.title-text').textContent = w.title || '';
      rec.el.style.left = w.x + 'px';
      rec.el.style.top = w.y + 'px';
      rec.el.style.width = w.w + 'px';
      rec.el.style.height = w.h + 'px';
      rec.el.style.zIndex = String(w.z || 10);
      rec.el.style.display = w.state === 'min' ? 'none' : 'block';
      rec.el.classList.toggle('focused', !!w.focused);
      this.renderWidgetsInto(sys, rec, w);
    }
    // 移除已关闭的窗口
    for (const rec of desk.windows.slice()) {
      if (rec.kernelWindow && !seen.has(String(rec.kernelWindow))) {
        rec.el.remove();
        desk.windows = desk.windows.filter((x) => x !== rec);
      }
    }
  }
  renderWidgetsInto(sys, rec, w) {
    const widgets = w.widgets || [];
    const sig = JSON.stringify(widgets);
    if (rec.sig === sig) return;
    rec.sig = sig;
    if (!rec.keep) rec.keep = new Map();
    const desk = this.desktops.get(sys.id);
    const ctx = { host: this, sys, desk, winId: w.id, keep: rec.keep, seen: new Set() };
    const cached = sys.sceneCache.get('k' + w.id);
    if (cached && cached.state && cached.state.ops) ctx.ops = cached.state.ops;
    renderWidgets(rec.body, widgets, ctx);
    // 3D 画布
    for (const el of rec.body.querySelectorAll('.w-canvas3d')) {
      const key = 'k' + w.id;
      let view = this.threeViews.get(key);
      if (!view) {
        view = new ThreeView(el);
        this.threeViews.set(key, view);
        view.onPick = (info) => {
          sys.pendingEvents.push({ kind: 'input', type: 'pick', x: 0, y: 0, pick: JSON.stringify(info), window: w.id, owner: w.owner });
        };
      } else if (view.container !== el) {
        view.dispose();
        this.threeViews.delete(key);
        view = new ThreeView(el);
        this.threeViews.set(key, view);
        view.onPick = (info) => {
          sys.pendingEvents.push({ kind: 'input', type: 'pick', x: 0, y: 0, pick: JSON.stringify(info), window: w.id, owner: w.owner });
        };
      }
      el.setAttribute('data-threekey', key);
      this.bindSceneInput(el, sys, w);
    }
    const data = sys.sceneCache.get('k' + w.id) || sys.sceneCache.get('w' + w.id);
    if (data) {
      const view = this.threeViews.get('k' + w.id);
      if (view) {
        if (data.resource && view.resource !== data.resource) view.setResource(data.resource);
        if (data.state) view.setState(data.state);
      }
    }
  }
  /* 三维视图的拖动与滚轮 -> 源系统的输入事件 */
  bindSceneInput(el, sys, w) {
    if (el._sceneBound) return;
    el._sceneBound = true;
    let last = null;
    el.addEventListener('pointerdown', (e) => {
      last = { x: e.clientX, y: e.clientY };
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!last) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      sys.pendingEvents.push({ kind: 'input', type: 'drag', x: dx, y: dy, window: w.id, owner: w.owner });
    });
    const up = () => { last = null; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      sys.pendingEvents.push({ kind: 'input', type: 'wheel', x: 0, y: 0, value: e.deltaY, window: w.id, owner: w.owner });
    }, { passive: false });
  }
  /* 宿主输入 -> 系统输入事件 */
  sendInput(sys, ev) {
    if (!sys) return;
    sys.pendingEvents.push(ev);
  }
  onSceneSubmit(sys, key, data) {
    // 场景提交：更新对应窗口的三维视图
    const view = this.threeViews.get(key);
    if (view) {
      if (data.resource && !view.resource) view.setResource(data.resource);
      if (data.state) view.setState(data.state);
    }
    // 记录到子系统缓存，供投送使用
    sys.sceneCache.set(key, data);
    // 投送窗口同步显示同一份提交
    for (const proj of this.projections) {
      if (proj.sourceSystemId !== sys.id) continue;
      if ('k' + proj.sourceWindow !== key) continue;
      this.syncProjection(proj);
    }
  }

  /* ---------------- 逻辑循环与绘制 ---------------- */
  tick() {
    const t0 = performance.now();
    this.rt.step();
    this.lastStep = performance.now() - t0;
    this.render();
  }
  render() {
    for (const desk of this.desktops.values()) {
      desk.renderTaskbar();
    }
    for (const [key, view] of this.threeViews) {
      view.resize();
      view.render(0.05);
    }
  }
  notify(sys, title, text) {
    sys.notifications.unshift({ title, text, at: sys.time });
    if (sys.notifications.length > 50) sys.notifications.pop();
    this.onNotify(sys, { title, text });
  }
  /* 托盘通知入口：打开含通知中心的小组件面板 */
  openNotifications(sys) {
    const win = this.rootApps.openWidgets(sys);
    if (win && win.el) {
      const el = win.el.querySelector('[data-testid="widget-notifications"]');
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
    return win;
  }
  onNotify(sys, a) {
    const desk = this.desktops.get(sys.id);
    if (desk) desk.renderTaskbar();
  }

  /* ---------------- 跨层窗口投送 ---------------- */
  onProject(req) {
    const target = this.rt.sys(req.target);
    const srcSys = this.rt.sys(req.sourceSystemId);
    if (!target || !srcSys) return 0;
    const desk = this.desktops.get(target.id);
    if (!desk) return 0;
    const key = String(req.sourceSystemId) + ':' + String(req.sourceWindow);
    let proj = this.projections.find((p) => p.key === key);
    if (proj) {
      const win = desk.windows.find((w) => w.id === proj.winId);
      if (win) { win.state = 'normal'; desk.syncWindows(); desk.focus(win); return proj.id; }
    }
    const app = req.app || 'player';
    const body = document.createElement('div');
    body.className = 'proj-body';
    if (app === 'charts') {
      const cv = document.createElement('canvas');
      cv.className = 'w-canvas2d proj-canvas';
      cv.setAttribute('data-testid', 'chart-canvas');
      body.appendChild(cv);
    } else {
      const d = document.createElement('div');
      d.className = 'w-canvas3d proj-canvas3d';
      d.setAttribute('data-testid', 'player-view');
      body.appendChild(d);
    }
    const title = (app === 'charts' ? '图表投送' : '播放器投送') + ' · ' + srcSys.id;
    const win = desk.open({
      appId: 'projection', title, w: 720, h: 460, content: body,
      meta: { projection: true, sourceSystemId: req.sourceSystemId, sourceWindow: req.sourceWindow, sourceAppId: app },
    });
    const pid = 'proj-' + (this.projSeq++);
    proj = {
      id: pid, key, winId: win.id, systemId: target.id,
      sourceSystemId: req.sourceSystemId, sourceWindow: req.sourceWindow,
      sourceAppId: app, win,
    };
    this.projections.push(proj);
    win.el.setAttribute('data-source-system-id', String(req.sourceSystemId));
    win.el.setAttribute('data-source-window-id', String(req.sourceWindow));
    win.el.setAttribute('data-source-app-id', app);
    win.el.setAttribute('data-projection-id', pid);
    win.onClose = () => {
      this.projections = this.projections.filter((p) => p !== proj);
      const v = this.threeViews.get('p' + pid);
      if (v) { v.dispose(); this.threeViews.delete('p' + pid); }
    };
    if (app !== 'charts') {
      const view = new ThreeView(body.querySelector('.proj-canvas3d'));
      this.threeViews.set('p' + pid, view);
      view.onPick = (info) => {
        srcSys.pendingEvents.push({ kind: 'input', type: 'pick', x: 0, y: 0, pick: JSON.stringify(info), window: req.sourceWindow });
      };
    }
    this.bindProjectionInput(proj, body);
    this.syncProjection(proj);
    return pid;
  }
  /* 投送窗口的输入回到源系统（按源窗口坐标系换算） */
  bindProjectionInput(proj, body) {
    body.addEventListener('pointerdown', (e) => {
      const srcSys = this.rt.sys(proj.sourceSystemId);
      if (!srcSys) return;
      const sw = (srcSys.windows || []).find((w) => String(w.id) === String(proj.sourceWindow));
      if (!sw) return;
      const rect = body.getBoundingClientRect();
      const lx = e.clientX - rect.left, ly = e.clientY - rect.top;
      srcSys.pendingEvents.push({
        kind: 'input', type: 'click',
        x: sw.x + lx, y: sw.y + 34 + ly, window: sw.id,
      });
    });
  }
  /* 用源系统提交的数据刷新投送窗口 */
  syncProjection(proj) {
    const srcSys = this.rt.sys(proj.sourceSystemId);
    if (!srcSys) return;
    const data = srcSys.sceneCache.get('k' + proj.sourceWindow);
    if (!data) return;
    if (proj.sourceAppId === 'charts') {
      const cv = proj.win.el.querySelector('.proj-canvas');
      if (cv && data.state && data.state.ops) {
        const w = Math.max(64, proj.win.w - 20), h = Math.max(64, proj.win.h - 70);
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
        NOS.draw2D(cv, { ops: data.state.ops });
      }
    } else {
      const view = this.threeViews.get('p' + proj.id);
      if (view) {
        if (data.resource && !view.resource) view.setResource(data.resource);
        if (data.state) view.setState(data.state);
      }
    }
  }
  /* ---------------- 实时数据总线 ---------------- */
  colName(c) { let s = '', n = c; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; }
  colIndex(s) { let c = 0; for (const ch of String(s).toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64); return c - 1; }
  extractRange(cells, range) {
    const t = String(range || 'A1:D4').trim().toUpperCase();
    let m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(t);
    let r1 = 1, c1 = 1, r2 = 1, c2 = 1;
    if (m) { c1 = this.colIndex(m[1]); r1 = parseInt(m[2], 10); c2 = this.colIndex(m[3]); r2 = parseInt(m[4], 10); }
    else {
      m = /^([A-Z]+)(\d+)$/.exec(t);
      if (m) { c1 = this.colIndex(m[1]); r1 = parseInt(m[2], 10); c2 = c1; r2 = r1; }
    }
    if (r2 < r1) { const t2 = r1; r1 = r2; r2 = t2; }
    if (c2 < c1) { const t2 = c1; c1 = c2; c2 = t2; }
    const rows = [];
    for (let r = r1; r <= r2; r++) {
      const row = [];
      for (let c = c1; c <= c2; c++) {
        const addr = this.colName(c) + r;
        const cell = cells[addr];
        row.push(cell ? cell.v : null);
      }
      rows.push(row);
    }
    return rows;
  }
  onSheetPublish(version, payload) {
    const cells = (payload && payload.cells) || {};
    for (const conn of this.rt.chartConns.values()) {
      if (conn.state === 'disconnected') continue;
      const target = this.rt.sys(conn.systemId);
      if (!target) continue;
      const rows = this.extractRange(cells, conn.range);
      const data = { docId: conn.docId, range: conn.range, version: version, rows: rows };
      target.pendingEvents.push({
        kind: 'chart', docId: conn.docId, range: conn.range, version: version,
        data: JSON.stringify(data),
      });
    }
  }
  onChartConnect(conn) {
    const sheet = this.rootApps && this.rootApps.sheet;
    if (!sheet) return '';
    const rows = this.extractRange(sheet.cells, conn.range);
    return JSON.stringify({ docId: conn.docId, range: conn.range, version: sheet.version, rows: rows });
  }
  onChartDocs() {
    const sheet = this.rootApps && this.rootApps.sheet;
    if (!sheet) return '[]';
    const name = String(sheet.path || '').split('/').pop().replace(/\.sheet$/, '');
    return JSON.stringify([{ id: sheet.path, title: name || '工作簿', range: 'A1:D4' }]);
  }
  /* ---------------- 子系统控制 ---------------- */
  onChildControl(parentId, childId, action) {
    const child = this.rt.sys(childId);
    if (!child) return { ok: false, error: '实例不存在' };
    const parent = this.rt.sys(parentId);
    if (action === 'pause') { child.state = 'paused'; this.notify(parent, '子系统已暂停', childId); }
    else if (action === 'resume') { child.state = 'running'; this.notify(parent, '子系统已继续', childId); }
    else if (action === 'step') { this.stepSystem(child); }
    else if (action === 'restart') { this.rootApps.restartSystem(child); }
    else if (action === 'close') { this.rootApps.closeSystem(child); }
    else if (action === 'snapshot') { this.rootApps.snapshotSystem(child); }
    else if (action === 'restore') { this.rootApps.restoreSystem(child); }
    else if (action === 'fork') { this.rootApps.forkSystem(child); }
    else return { ok: false, error: '未知操作' };
    return { ok: true };
  }
  onOpenEditor(parentId, childId) {
    const child = this.rt.sys(childId);
    if (!child) return { ok: false, error: '实例不存在' };
    this.rootApps.openEditor(this.root, '/System/kernel.nsl');
    this.notify(this.root, '内核源文件', '已打开 ' + childId + ' 的内核源文件');
    return { ok: true };
  }

  /* ---------------- bench 接口 ---------------- */
  inspect() {
    const systems = [];
    for (const sys of this.rt.systems.values()) {
      systems.push({
        id: sys.id, parentId: sys.parentId, name: sys.systemName || sys.name,
        state: sys.state, time: sys.time, rate: sys.rate,
        budgetTotal: sys.budgetTotal, budgetGrant: sys.budgetGrant, budgetUsed: sys.budgetUsed,
        depth: sys.depth, processes: sys.processes.length,
      });
    }
    const windows = [];
    const browsers = [];
    const players = [];
    const charts = [];
    const projections = [];
    for (const sys of this.rt.systems.values()) {
      const desk = this.desktops.get(sys.id);
      if (!desk) continue;
      for (const w of desk.windows) {
        const isKernel = w.meta && w.meta.kernelWindow !== undefined;
        const wid = isKernel ? 'k' + w.meta.kernelWindow : w.id;
        windows.push({
          id: wid, systemId: sys.id, appId: isKernel ? (w.app || 'app') : w.appId,
          title: w.title || '', state: w.state,
        });
        // 应用状态：来自子系统应用提交的场景数据
        const data = sys.sceneCache.get('k' + (isKernel ? w.meta.kernelWindow : w.id));
        const appInfo = data && data.state ? data.state.app : null;
        if (appInfo && appInfo.kind === 'player') {
          players.push({
            windowId: wid, systemId: sys.id, state: appInfo.state,
            position: appInfo.position, duration: appInfo.duration, rate: appInfo.rate,
            scene: appInfo.scene, frameTime: appInfo.frameTime, mode: appInfo.mode,
          });
        }
        if (appInfo && appInfo.kind === 'chart') {
          charts.push({
            windowId: wid, systemId: sys.id, sourceTitle: appInfo.sourceTitle,
            range: appInfo.range, chartType: appInfo.chartType,
            connectionState: appInfo.connectionState, version: appInfo.version,
          });
        }
        if (w.meta && w.meta.projection) {
          projections.push({
            windowId: wid, systemId: sys.id,
            sourceSystemId: w.meta.sourceSystemId, sourceWindowId: w.meta.sourceWindow,
            sourceAppId: w.meta.sourceAppId, state: w.state,
          });
        }
      }
    }
    // 浏览器标签
    const bwin = this.rootApps && this.rootApps.windows && this.rootApps.windows.get('browser');
    if (bwin && bwin.tabs) {
      for (const t of bwin.tabs) {
        browsers.push({
          windowId: bwin.id, tabId: t.id, url: t.url, loadState: t.state,
          title: t.title || '', error: t.error || '',
        });
      }
    }
    return { systems, windows, browsers, players, charts, projections };
  }
  /* 重置到初态：关闭全部子系统实例，恢复预置文件与默认设置 */
  async reset() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    for (const desk of this.desktops.values()) {
      for (const w of desk.windows.slice()) { if (w.el) w.el.remove(); }
      desk.windows = [];
    }
    for (const id of Array.from(this.desktops.keys())) {
      if (id !== this.root.id) this.desktops.delete(id);
    }
    for (const v of this.threeViews.values()) { try { v.dispose(); } catch (e) { /* 忽略 */ } }
    this.threeViews.clear();
    this.projections = [];
    if (this.rt) {
      this.rt.systems.clear();
      this.rt.chartConns.clear();
      this.rt.root = null;
    }
    const F = this.fixtures;
    this.rt = new NOS.Runtime({
      fixtures: F,
      onSync: (sys) => this.onSystemSync(sys),
      onScene: (sys, key, data) => this.onSceneSubmit(sys, key, data),
      onNotify: (sys, a) => this.onNotify(sys, a),
      onChartConnect: (conn) => this.onChartConnect(conn),
      onChartDocs: () => this.onChartDocs(),
      onNewChild: (parentId) => this.createSystem(parentId),
      onChildControl: (parentId, childId, action) => this.onChildControl(parentId, childId, action),
      onOpenEditor: (parentId, childId) => this.onOpenEditor(parentId, childId),
      onProject: (req) => this.onProject(req),
      verbose: false,
    });
    const root = this.rt.createRoot();
    this.root = root;
    root.wallpaper = F.wallpaper;
    this.rt.loadCompiler(root);
    this.rt.sheetBus = (version, payload) => this.onSheetPublish(version, payload);
    const container = document.getElementById('desktop-root');
    container.innerHTML = '';
    const desk = new Desktop(this.rt, root, this, 0);
    this.desktops.set(root.id, desk);
    desk.build(container);
    desk.setIcons([
      { appId: 'files', icon: 'files', label: '文件管理器' },
      { appId: 'spreadsheet', icon: 'spreadsheet', label: '电子表格' },
      { appId: 'browser', icon: 'browser', label: '浏览器' },
      { appId: 'widgets', icon: 'widgets', label: '小组件' },
      { appId: 'editor', icon: 'editor', label: '编辑器' },
      { appId: 'tasks', icon: 'tasks', label: '任务管理器' },
      { appId: 'systems', icon: 'system', label: '系统' },
    ]);
    this.rootApps.windows.clear();
    this.rootApps.init(root);
    this.sheet = this.rootApps.sheet;
    this.render();
    this.timer = setInterval(() => this.tick(), 25);
    return true;
  }
}

NOS.Host = Host;
const host = new Host();
window.nestedOS = host;
window.bench = {
  version: 1,
  ready: async () => {
    if (!host.ready) await host.boot();
    return true;
  },
  reset: async () => { await host.reset(); return true; },
  inspect: async () => host.inspect(),
};
host.boot().then(() => {
  document.body.classList.add('booted');
}).catch((e) => {
  document.body.innerHTML = '<pre style="color:#fff;padding:20px;font:14px monospace">启动失败：' + e.message + '</pre>';
  console.error(e);
});
