// 桌面外壳：窗口管理、输入、开始菜单、任务栏、系统树、快照、持久化与自动化接口
import { System, FS, STEP_MS, normalizePath, dirname, basename, joinPath, createKernelProcess, Scheduler, extOf } from './kernel.js';
import { deepClone, clamp, h, clear, icon, iconSvg, fileIcon, fmtBytes, fmtTime, fmtClock, debounce, download, hashStr } from './util.js';
import {
  APP_DEFS, WALLPAPERS, ACCENTS, DEMO_FILES, INNER_FILES, SAMPLE_SHEET,
  SCENE_HELICOPTER, SCENE_MINIMAL, KERNEL_TEMPLATE, CONTROLLER_TEMPLATE,
  FIXTURE_MANIFEST, APP_ORDER_ROOT, APP_ORDER_INNER, PLAYER_TEMPLATE, CHARTS_TEMPLATE, FLIGHT_TEMPLATE
} from './data.js';
import { FilesApp } from './apps/files.js';
import { SheetApp } from './apps/spreadsheet.js';
import { EditorApp, HELP_TEXT } from './apps/editor.js';
import { TasksApp } from './apps/tasks.js';
import { SettingsApp } from './apps/settings.js';
import { BrowserApp } from './apps/browser.js';
import { PlayerApp } from './apps/player.js';
import { ChartsApp } from './apps/charts.js';
import { SysMgrApp } from './apps/sysmgr.js';
import { SceneView } from './scene.js';

const APP_CLASSES = {
  files: FilesApp, spreadsheet: SheetApp, editor: EditorApp, tasks: TasksApp,
  settings: SettingsApp, browser: BrowserApp, player: PlayerApp, charts: ChartsApp,
  sysmgr: SysMgrApp
};

const APP_SIZE = {
  files: [880, 560], spreadsheet: [960, 620], editor: [900, 600], browser: [1040, 700],
  tasks: [940, 640], settings: [780, 640], player: [1000, 680], charts: [860, 580],
  sysmgr: [960, 640], system: [1000, 700], projection: [720, 480]
};

const ROOT_SETTINGS = {
  name: '根系统', wallpaper: 'dusk', accent: 'blue', scale: 1,
  dnd: false, volume: 68, brightness: 82, wifi: true, bluetooth: false
};

const depthZoom = d => [1, 0.94, 0.86, 0.78, 0.72][Math.min(4, d)] ?? 0.72;

export class OS {
  constructor(rootEl) {
    this.rootEl = rootEl;
    this.systems = new Map();
    this.desktops = new Map();
    this.windows = new Map();
    this.root = null;
    this.nextSystemSeq = 1;
    this.nextWindowSeq = 1;
    this.scheduler = new Scheduler(this);
    this.started = false;
    this.stateLoaded = false;
    this.rootWorkbooks = new Map();
    this.chartSubs = new Map();
    this.projectionSeq = 1;
    this.clipboardBombs = new WeakSet();
    this.saveSoon = debounce(() => this.saveState(), 1200);
    this.lastSave = 0;
    this.toastSeq = 1;
    this.kernelErrorSystems = new Set();
    this.frameCount = 0;
    this.msgLog = [];
    this.debug = { enabled: false };
    this._bindGlobal();
  }

  async boot() {
    const data = await fetch('/api/state').then(r => r.json()).catch(() => null);
    if (data && data.version === 1) {
      try {
        this.hydrate(data);
        this.stateLoaded = true;
      } catch (e) {
        console.error('hydrate failed', e);
        this.createInitial();
        this.stateLoaded = true;
      }
    } else {
      this.createInitial();
      this.stateLoaded = true;
    }
    this.started = true;
    this.scheduler.start();
    this.setupBench();
    this.updateAllClocks();
    this.saveSoon();
    setTimeout(() => {
      const boot = document.getElementById('boot-screen');
      if (boot) { boot.classList.add('done'); setTimeout(() => boot.remove(), 600); }
    }, 350);
  }

  createInitial() {
    this.clearAll();
    const root = this.createRootSystem();
    this.root = root;
    this.systems.set(root.id, root);
    root.epochBase = Date.now();
    this.lastActiveSystem = root;
    const d = new Desktop(this, root, this.rootEl);
    this.desktops.set(root.id, d);
    d.mount();
    root.desktop = d;
    this.applySettings(root);
    this.notify(root, 'Nested OS', '根系统已就绪。双击桌面图标打开应用，或用“新建子系统”开始递归。', 'ok', false);
  }

  clearAll() {
    for (const w of [...this.windows.values()]) { try { w.destroy(); } catch (e) {} }
    this.windows.clear();
    for (const d of this.desktops.values()) { try { d.destroy(); } catch (e) {} }
    this.desktops.clear();
    this.systems.clear();
    this.rootWorkbooks.clear();
    this.chartSubs.clear();
    this.root = null;
    this.lastActiveSystem = null;
    this.rootEl.innerHTML = '';
    this.nextSystemSeq = 1;
    this.nextWindowSeq = 1;
  }

  createRootSystem() {
    const fs = new FS();
    for (const p of ['/Desktop', '/Documents', '/Downloads', '/Demo', '/System', '/System/kernels', '/Snapshots', '/Recycle Bin']) fs.mkdir(p);
    fs.write('/Demo/helicopter-24.scene', JSON.stringify(SCENE_HELICOPTER, null, 2), Date.now());
    fs.write('/Demo/sample.sheet', JSON.stringify(SAMPLE_SHEET, null, 2), Date.now());
    for (const [p, c] of Object.entries(DEMO_FILES)) fs.write(p, c, Date.now());
    fs.write('/System/help.md', HELP_TEXT, Date.now());
    const root = new System(this, { id: 'outer', name: '根系统', parentId: null, parent: null, depth: 0, budget: 60000, grantRatio: 0.5 });
    root.fs = fs;
    root.settings = deepClone(ROOT_SETTINGS);
    root.notifications = [];
    root.clipboard = [];
    root.apps = { workbooks: [], settings: root.settings };
    root.spawn('player', PLAYER_TEMPLATE, { type: 'service', quota: 500 });
    root.spawn('charts', CHARTS_TEMPLATE, { type: 'service', quota: 500 });
    root.spawn('flight', FLIGHT_TEMPLATE, { type: 'service', quota: 400 });
    root.syncStorage();
    return root;
  }

  createChild(parent, opts = {}) {
    if (parent.state === 'stopped' || parent.state === 'error') {
      this.toast(parent, '无法创建子系统', '父系统当前不可用', 'err');
      return null;
    }
    const id = opts.id || `inner-${this.nextSystemSeq}`;
    if (!opts.id) this.nextSystemSeq++;
    const kernelPath = joinPath('/System/kernels', id + '.kernel');
    let kernelSource = opts.kernelSource;
    if (!kernelSource) {
      const tpl = parent.fs.read('/System/kernel.sys');
      kernelSource = tpl || KERNEL_TEMPLATE;
    }
    parent.fs.write(kernelPath, kernelSource, Date.now());
    const fs = new FS();
    for (const p of ['/Desktop', '/Documents', '/Downloads', '/Demo', '/System', '/System/kernels', '/Snapshots', '/Recycle Bin']) fs.mkdir(p);
    fs.write('/Demo/helicopter-24.scene', JSON.stringify(SCENE_HELICOPTER, null, 2), Date.now());
    fs.write('/Demo/minimal.scene', JSON.stringify(SCENE_MINIMAL, null, 2), Date.now());
    fs.write('/System/kernel.sys', parent.fs.read('/System/kernel.sys') || KERNEL_TEMPLATE, Date.now());
    for (const [p, c] of Object.entries(INNER_FILES)) fs.write(p, c, Date.now());
    fs.write('/Demo/sample.sheet', JSON.stringify(SAMPLE_SHEET, null, 2), Date.now());
    fs.write('/System/help.md', HELP_TEXT, Date.now());
    const child = new System(this, {
      id, name: id, parent, depth: parent.depth + 1,
      budget: Math.round(parent.budget * (opts.grantRatio ?? 0.5)),
      grantRatio: opts.grantRatio ?? 0.5,
      memoryLimit: Math.max(64 * 1024 * 1024, Math.round(parent.memoryLimit * 0.8)),
      storageLimit: Math.max(16 * 1024 * 1024, Math.round(parent.storageLimit * 0.8))
    });
    child.fs = fs;
    child.settings = this.inheritSettings(parent, child);
    child.notifications = [];
    child.clipboard = [];
    child.apps = {};
    child.kernelSourcePath = kernelPath;
    child.kernelSource = kernelSource;
    child.clock = parent.clock;
    child.speed = 1;
    parent.children.push(child);
    this.systems.set(id, child);
    this.bootSystem(child);
    this.openSystemWindow(parent, child);
    this.notify(parent, '子系统已创建', `${id} 已启动，位于 ${parent.id} 桌面。`, 'ok', true);
    this.charge(parent, 80);
    this.saveSoon();
    return child;
  }

  inheritSettings(parent, child) {
    const hue = (hashStr(child.id) % 360);
    const accents = ['blue', 'violet', 'teal', 'amber', 'rose', 'green'];
    return {
      name: child.id, wallpaper: ['aurora', 'dunes', 'tide', 'dusk'][child.depth % 4],
      accent: accents[child.depth % accents.length], scale: 1,
      dnd: false, volume: parent.settings?.volume ?? 68, brightness: parent.settings?.brightness ?? 82,
      wifi: parent.settings?.wifi ?? true, bluetooth: false
    };
  }

  bootSystem(sys) {
    sys.processes = [];
    sys.nextPid = 1;
    const k = createKernelProcess(sys, sys.kernelSource || KERNEL_TEMPLATE, 900);
    if (!k.ok) {
      sys.state = 'error';
      this.onKernelError(sys, k.error);
      return;
    }
    const services = [
      ['winman', '/System/winman.prog'], ['files', '/System/files.prog'],
      ['player', '/System/player.prog'], ['charts', '/System/charts.prog'],
      ['flight', '/System/flight.prog']
    ];
    for (const [nm, path] of services) {
      const f = sys.fs.get(path);
      if (f && !f.dir) sys.spawn(nm, f.content, { type: 'service', quota: 500 });
    }
    sys.totalUsed = 0;
    sys.state = 'running';
  }

  openSystemWindow(parent, child) {
    const pd = this.desktops.get(parent.id);
    if (!pd) return;
    const existing = [...this.windows.values()].find(w => w.appId === 'system' && w.state?.systemId === child.id && w.systemId === parent.id);
    if (existing) {
      if (existing.minimized) { existing.minimized = false; existing.el.classList.remove('minimized'); }
      pd.focusWindow(existing);
      return existing;
    }
    const work = pd.workArea();
    const w = Math.min(1040, Math.max(620, work.w * 0.86));
    const hh = Math.min(720, Math.max(440, work.h * 0.84));
    const win = this.openApp(parent, 'system', {
      title: `${child.id} · 子系统桌面`, width: w, height: hh,
      x: Math.max(10, (work.w - w) / 2 + (parent.children.length % 3) * 18),
      y: Math.max(10, (work.h - hh) / 2 + (parent.children.length % 3) * 14),
      systemId: child.id, noCascade: true
    });
    return win;
  }

  openApp(sys, appId, opts = {}) {
    const d = this.desktops.get(sys.id);
    if (!d) return Promise.resolve(null);
    if (appId === 'widgets') { d.toggleWidgets(); return Promise.resolve(null); }
    if (appId === 'system') {
      const child = opts.systemId ? this.systems.get(opts.systemId) : null;
      if (!child) return Promise.resolve(null);
      if (child.state === 'stopped' || child.state === 'error') {
        this.toast(sys, '子系统不可用', `${child.id} 当前未运行`, 'warn');
      }
      const existing = [...this.windows.values()].find(w => w.appId === 'system' && w.state?.systemId === child.id && w.systemId === sys.id);
      if (existing) {
        if (existing.minimized) { existing.minimized = false; existing.el.classList.remove('minimized'); }
        this.desktops.get(sys.id)?.focusWindow(existing);
        return Promise.resolve(existing);
      }
      if (!child.desktop) {
        child.desktop = new Desktop(this, child, null);
        this.desktops.set(child.id, child.desktop);
      }
      if (!child.desktop.mounted) {
        child.desktop.mounted = true;
        child.desktop.buildChrome();
      }
      const win = this.createWindow(sys, {
        appId: 'system', title: opts.title || `${child.id} · 子系统桌面`,
        width: opts.width, height: opts.height, x: opts.x, y: opts.y, state: { systemId: child.id }
      });
      if (win) {
        win.bodyEl.classList.add('system-window-body');
        win.bodyEl.appendChild(child.desktop.el);
        child.desktop.attachWindow(win);
        child.desktop.updateZoom();
        win.setIcon('system');
      }
      return Promise.resolve(win);
    }
    const def = APP_DEFS[appId];
    if (!def || !APP_CLASSES[appId]) {
      this.toast(sys, '无法启动', `未知应用 ${appId}`, 'err');
      return Promise.resolve(null);
    }
    // 子系统需要对应的服务进程；若被结束则提示
    if (sys !== this.root) {
      const svc = ['files', 'player', 'charts'].includes(appId) ? appId : null;
      if (svc) {
        const proc = sys.processes.find(p => p.name === svc || (p.meta && p.meta.appId === svc));
        if (proc && (proc.state === 'finished' || proc.state === 'error')) {
          this.toast(sys, '服务已停止', `${svc} 进程不可用，请在任务管理器中重启`, 'warn');
        }
      }
    }
    if (appId === 'player') { this.ensureService(sys, 'player'); this.ensureService(sys, 'flight'); }
    if (appId === 'charts') { this.ensureService(sys, 'charts'); }
    return Promise.resolve(this.createWindow(sys, {
      appId, title: opts.title || def.title, width: opts.width, height: opts.height,
      x: opts.x, y: opts.y, state: opts.state || {}, filePath: opts.filePath
    }));
  }

  ensureService(sys, name) {
    if (!sys) return null;
    const p = sys.processes.find(x => x.name === name && x.state !== 'finished' && x.state !== 'error');
    if (p) return p;
    const path = '/System/' + name + '.prog';
    const f = sys.fs.get(path);
    if (!f || f.dir) return null;
    const r = sys.spawn(name, f.content, { type: 'service', quota: name === 'flight' ? 400 : 500 });
    return r.ok ? r.proc : null;
  }

  reapServices(sys) {
    if (!sys) return;
    const wins = [...this.windows.values()].filter(w => w.systemId === sys.id);
    if (!wins.some(w => w.appId === 'player')) {
      for (const p of sys.processes) if (p.name === 'player' || p.name === 'flight' || p.name === 'controller') { p.state = 'finished'; p.error = null; }
    }
    if (!wins.some(w => w.appId === 'charts')) {
      for (const p of sys.processes) if (p.name === 'charts') { p.state = 'finished'; p.error = null; }
    }
  }

  createApp(win) {
    if (win.appId === 'system') return new SystemApp(win, this);
    if (win.appId === 'projection') return new ProjectionApp(win, this, win.state);
    if (win.appId === 'panel') return new PanelApp(win, this, win.state);
    const C = APP_CLASSES[win.appId];
    if (C) return new C(win, this, win.state);
    return new DummyApp(win, this);
  }

  closeProjectionsOf(win, force = false) {
    const still = this.windows.get(win.id);
    if (!force && still && still.appId !== 'projection' && still !== win) return;
    for (const p of [...this.windows.values()]) {
      if (p.appId === 'projection' && p.state?.sourceWindowId === win.id) {
        p.app?.dispose?.();
        if (p.el?.parentNode) p.el.parentNode.removeChild(p.el);
        this.windows.delete(p.id);
        p.desktop.windows = p.desktop.windows.filter(w => w !== p);
        p.desktop.rebuildTaskbar();
        this.notify(p.desktop.system, '投送已结束', '源窗口已关闭', 'warn', true);
      }
    }
  }

  closeBrowserResources(win) {
    if (win.app?.dispose) { /* already disposed */ }
  }

  createWindow(sys, opts) {
    const d = this.desktops.get(sys.id);
    if (!d) return null;
    const win = new OSWindow(this, d, opts);
    this.windows.set(win.id, win);
    d.windows.push(win);
    d.rebuildTaskbar();
    d.focusWindow(win);
    return win;
  }

  newWindowId() { return `w${this.nextWindowSeq++}`; }

  closeWindow(win, opts = {}) {
    if (!win || (win.closing && !opts.force)) return;
    win.closing = true;
    if (win.app && win.app.beforeClose && !opts.force) {
      const r = win.app.beforeClose();
      if (r && typeof r.then === 'function') {
        r.then(ok => {
          if (ok === false) { win.closing = false; return; }
          this.closeWindow(win, { force: true });
        }).catch(() => { win.closing = false; });
        return;
      }
      if (r === false) { win.closing = false; return; }
    }
    if (win.appId === 'projection') {
      this.closeProjection(win);
      return;
    }
    if (win.appId === 'system') {
      const child = this.systems.get(win.state?.systemId);
      this.dialog(win.desktop.system, {
        title: '关闭子系统窗口',
        text: `关闭 ${child?.id || '子系统'} 将停止整棵子树。已保存的快照仍可恢复。`,
        actions: [{ id: 'ok', text: '停止子树', primary: true, danger: true }, { id: 'cancel', text: '取消' }]
      }).then(res => {
        if (res === 'ok') { this.stopSystem(child, true); win.destroy(); }
        else win.closing = false;
      });
      return;
    }
    win.destroy();
  }

  destroyWindow(win) {
    if (!win || win.destroyed) return;
    win.destroyed = true;
    try { win.app?.dispose?.(); } catch (e) {}
    if (win.el && win.el.parentNode) win.el.parentNode.removeChild(win.el);
    this.windows.delete(win.id);
    const d = win.desktop;
    d.windows = d.windows.filter(w => w !== win);
    if (d.focusWindowId === win.id) {
      const next = d.windows.filter(w => !w.minimized).sort((a, b) => b.z - a.z)[0];
      d.focusWindow(next || null);
    }
    d.rebuildTaskbar();
    if (win.appId === 'browser') this.closeBrowserResources(win);
    this.reapServices(win.sys);
    if (win.appId === 'player' || win.appId === 'charts') {
      const sid = win.id;
      setTimeout(() => this.closeProjectionsOf({ id: sid }), 180);
    }
    this.saveSoon();
  }

  focusWindow(win) { if (win) win.desktop.focusWindow(win); }

  notify(sys, title, text, kind = 'info', toast = true) {
    if (!sys) return;
    if (!sys.notifications) sys.notifications = [];
    const n = { id: this.toastSeq++, title, text, kind, time: sys.clock, read: false, systemId: sys.id };
    sys.notifications.unshift(n);
    if (sys.notifications.length > 60) sys.notifications.pop();
    const d = this.desktops.get(sys.id);
    if (d) {
      d.updateNotifBadge();
      if (toast && !(sys.settings?.dnd)) d.showToast(n);
      if (d.notifFlyoutOpen) d.renderNotifications();
      if (d.widgetsOpen) d.renderWidgets();
    }
    this.saveSoon();
  }

  toast(sys, title, text, kind = 'info') {
    const d = this.desktops.get(sys.id);
    if (d) d.showToast({ id: this.toastSeq++, title, text, kind, time: sys.clock, systemId: sys.id });
  }

  dialog(sys, opts) {
    const d = this.desktops.get(sys.id);
    if (!d) return Promise.resolve(opts.actions?.[0]?.id || null);
    return d.dialog(opts);
  }

  prompt(sys, title, text, defaultValue = '', okText = '确定') {
    return this.dialog(sys, {
      title, text,
      input: { value: defaultValue, placeholder: '' },
      actions: [{ id: 'ok', text: okText, primary: true }, { id: 'cancel', text: '取消' }]
    }).then(res => res === 'ok' ? (this.lastDialogValue ?? defaultValue) : null);
  }

  charge(sys, work) {
    if (!sys) return;
    if (sys.isRoot) {
      sys.lastAppWork = (sys.lastAppWork || 0) + work;
      sys.totalUsed += 0;
    } else {
      const p = sys.processes.find(p => p.name === 'files');
      if (p) { p.usedTotal += work; }
    }
  }

  chargeRoot(work) { this.charge(this.root, work); }

  copyFile(srcSys, srcPath, dstSys, dstPath) {
    const f = srcSys.fs.get(srcPath);
    if (!f) return { ok: false, error: '源文件不存在' };
    const target = normalizePath(dstPath);
    const size = f.dir ? 0 : f.size;
    if (dstSys.fs.storageUsed() + size > dstSys.storageLimit) {
      this.notify(dstSys, '复制失败', '目标系统存储配额不足', 'err');
      return { ok: false, error: '目标存储配额不足' };
    }
    if (f.dir) {
      const prefix = srcPath === '/' ? '/' : srcPath + '/';
      const entries = [...srcSys.fs.files.entries()].filter(([p]) => p === srcPath || p.startsWith(prefix));
      let total = 0;
      for (const [, n] of entries) if (!n.dir) total += n.size;
      if (dstSys.fs.storageUsed() + total > dstSys.storageLimit) {
        this.notify(dstSys, '复制失败', '目标系统存储配额不足', 'err');
        return { ok: false, error: '目标存储配额不足' };
      }
      for (const [p, n] of entries) {
        const np = target + p.slice(srcPath.length);
        dstSys.fs.ensureDir(dirname(np));
        dstSys.fs.files.set(np, { ...deepClone(n), path: np });
      }
    } else {
      if (!dstSys.fs.write(target, f.content, Date.now())) return { ok: false, error: '写入失败' };
    }
    dstSys.syncStorage();
    if (this.desktops.get(dstSys.id)?.refreshFiles) this.desktops.get(dstSys.id).refreshFiles();
    this.notify(dstSys, '文件已复制', `${basename(srcPath)} → ${target}`, 'ok', true);
    return { ok: true };
  }

  deleteToRecycle(sys, path) {
    const f = sys.fs.get(path);
    if (!f) return false;
    const bin = '/Recycle Bin';
    if (normalizePath(path).startsWith(bin + '/')) { sys.fs.remove(path); return true; }
    let name = basename(path);
    let target = joinPath(bin, name);
    let i = 1;
    while (sys.fs.exists(target)) { target = joinPath(bin, `${name} (${i++})`); }
    if (f.dir) {
      const prefix = path === '/' ? '/' : path + '/';
      const entries = [...sys.fs.files.entries()].filter(([p]) => p === path || p.startsWith(prefix));
      for (const [p, n] of entries) {
        const np = target + p.slice(path.length);
        sys.fs.files.set(np, { ...n, path: np, origin: p });
      }
      for (const [p] of entries) sys.fs.remove(p);
    } else {
      sys.fs.remove(path);
      sys.fs.files.set(target, { ...f, path: target, origin: path });
    }
    sys.syncStorage();
    this.notify(sys, '已移入回收站', basename(path), 'info', true);
    return true;
  }

  restoreFromRecycle(sys, path) {
    const f = sys.fs.get(path);
    if (!f) return false;
    const origin = f.origin || joinPath('/Documents', basename(path));
    if (sys.fs.exists(origin)) { this.toast(sys, '恢复失败', '原位置已存在同名文件', 'err'); return false; }
    sys.fs.ensureDir(dirname(origin));
    if (f.dir) {
      const prefix = path + '/';
      const entries = [...sys.fs.files.entries()].filter(([p]) => p === path || p.startsWith(prefix));
      for (const [p, n] of entries) {
        const np = origin + p.slice(path.length);
        sys.fs.files.set(np, { ...n, path: np });
      }
      for (const [p] of entries) sys.fs.remove(p);
    } else {
      sys.fs.remove(path);
      sys.fs.write(origin, f.content, Date.now());
    }
    sys.syncStorage();
    this.notify(sys, '已恢复', basename(path), 'ok', true);
    return true;
  }

  openFile(sys, path, opts = {}) {
    const f = sys.fs.get(path);
    if (!f) { this.toast(sys, '打开失败', `${path} 不存在`, 'err'); return; }
    if (f.dir) {
      this.openApp(sys, 'files', { state: { path } });
      return;
    }
    const ext = extOf(path);
    if (ext === 'sheet') {
      let doc = sys.apps.workbooks?.find(w => w.path === path);
      if (!doc) {
        try {
          const data = JSON.parse(f.content);
          doc = { id: 'wb-' + hashStr(path + sys.id).toString(16), path, data, dirty: false, version: 1, title: data.name || basename(path) };
          sys.apps.workbooks = sys.apps.workbooks || [];
          sys.apps.workbooks.push(doc);
          this.registerWorkbook(sys, doc);
        } catch (e) { this.toast(sys, '打开失败', '工作簿格式错误', 'err'); return; }
      }
      this.openApp(sys, 'spreadsheet', { state: { docId: doc.id } });
    } else if (ext === 'scene') {
      this.openApp(sys, 'player', { state: { path }, filePath: path });
    } else if (ext === 'record') {
      this.openApp(sys, 'player', { state: { recordPath: path } });
    } else if (['prog', 'kernel', 'txt', 'md', 'json'].includes(ext)) {
      this.openApp(sys, 'editor', { state: { path }, filePath: path });
    } else {
      this.openApp(sys, 'editor', { state: { path } });
    }
  }

  registerWorkbook(sys, doc) {
    if (!sys.isRoot) return;
    this.rootWorkbooks.set(doc.id, { sys, doc });
    this.publishWorkbook(doc.id);
  }

  unregisterWorkbook(docId) {
    this.rootWorkbooks.delete(docId);
    for (const [chartWinId, sub] of this.chartSubs) {
      if (sub.docId === docId) {
        const w = this.windows.get(chartWinId);
        if (w?.app?.onSourceClosed) w.app.onSourceClosed();
        this.chartSubs.delete(chartWinId);
      }
    }
  }

  publishWorkbook(docId) {
    const entry = this.rootWorkbooks.get(docId);
    if (!entry) return;
    const { sys, doc } = entry;
    for (const [chartWinId, sub] of [...this.chartSubs]) {
      if (sub.docId !== docId) continue;
      const win = this.windows.get(chartWinId);
      if (!win || !win.app) { this.chartSubs.delete(chartWinId); continue; }
      const payload = win.app.buildRangePayload ? win.app.buildRangePayload(doc) : null;
      if (!payload) continue;
      const targetSys = win.desktop.system;
      const pid = win.app.chartPid ? win.app.chartPid() : null;
      if (pid == null) continue;
      const r = targetSys.deliver(pid, ['data', payload, win.id], 'root');
      sub.version = payload.version;
      sub.pending = (sub.pending || 0) + (r === 1 ? 1 : 0);
      if (r === -2) this.notify(targetSys, '图表更新积压', '消息队列已满，部分更新被丢弃', 'warn', true);
    }
    this.saveSoon();
  }

  // ---------- 播放器 / 飞控 / 图表的系统调用 ----------
  playerTick(sys) {
    const wins = [...this.windows.values()].filter(w => w.systemId === sys.id && w.appId === 'player' && w.app);
    let cost = 0;
    for (const w of wins) {
      const r = w.app.systemTick ? w.app.systemTick(sys) : null;
      if (r && r.cost) cost += r.cost;
      const def = w.app.sceneDef;
      cost += def ? 2 + Math.round((def.trees || 0) / 12 + (def.rocks || 0) / 6 + ((def.timeline?.keys?.length || 1) / 4)) : 2;
    }
    return { cost: Math.max(2, Math.round(cost)) };
  }

  flightTick(sys) {
    let cost = 0;
    const wins = [...this.windows.values()].filter(w => w.systemId === sys.id && w.appId === 'player' && w.app?.sim && w.app.mode === 'rehearsal');
    for (const w of wins) {
      const r = w.app.flightStep ? w.app.flightStep(sys) : null;
      if (r) cost += r.cost || 1;
    }
    return { cost: Math.max(2, Math.round(cost)) };
  }

  chartTick(sys) {
    let cost = 0;
    for (const w of this.windows.values()) {
      if (w.systemId === sys.id && w.appId === 'charts' && w.app?.tick) {
        const r = w.app.tick(STEP_MS, sys);
        if (r?.cost) cost += r.cost;
        const d = w.app.chart?.data;
        cost += 2 + (d?.labels?.length || 0) * (d?.series?.length || 1) / 10;
      }
    }
    return { cost: Math.max(2, Math.round(cost)) };
  }

  chartHandle(sys, msg) {
    if (!Array.isArray(msg)) return { cost: 1 };
    if (msg[0] === 'data') {
      const targetId = msg[2];
      const w = this.windows.get(targetId) || [...this.windows.values()].find(x => x.systemId === sys.id && x.appId === 'charts');
      if (w && w.systemId === sys.id && w.appId === 'charts' && w.app?.handleData) {
        w.app.handleData(msg[1]);
        return { cost: 20 };
      }
    }
    return { cost: 1 };
  }

  sensor(sys, i) {
    for (const w of this.windows.values()) {
      if (w.systemId === sys.id && w.appId === 'player' && w.app?.sim && w.app.mode === 'rehearsal') {
        const s = w.app.sim.sensors();
        return s[i] ?? 0;
      }
    }
    return 0;
  }

  control(sys, thr, roll, pitch, yaw) {
    for (const w of this.windows.values()) {
      if (w.systemId === sys.id && w.appId === 'player' && w.app?.sim && w.app.mode === 'rehearsal') {
        w.app.sim.setControls({ thr, roll, pitch, yaw });
        w.app.lastControlWall = performance.now();
      }
    }
  }

  onWmConfig(sys, cascade, focusRule) { sys.wmConfig = { cascade, focusRule }; }
  onFilesConfig(sys, mode) { sys.filesSort = mode; }

  panelClear(sys, id, color) {
    let p = sys.panelState[id];
    if (!p) { p = sys.panelState[id] = { ops: [], color: '#0d1424', dirty: true, winId: null }; }
    p.ops = []; p.color = color || '#0d1424'; p.dirty = true;
    if (!p.winId || !this.windows.has(p.winId)) {
      const win = this.createWindow(sys, { appId: 'panel', title: '程序面板 · ' + id, width: 420, height: 320, state: { panelId: id } });
      if (win) p.winId = win.id;
    }
    const win = this.windows.get(p.winId);
    if (win?.app?.redraw) win.app.redraw();
    return { cost: 1 };
  }
  panelRect(sys, id, x, y, w, hh, color) {
    const p = sys.panelState[id]; if (p) { p.ops.push(['rect', x, y, w, hh, color]); p.dirty = true; }
    const win = p && this.windows.get(p.winId); if (win?.app?.redraw) win.app.redraw();
    return { cost: 1 };
  }
  panelText(sys, id, x, y, text, color) {
    const p = sys.panelState[id]; if (p) { p.ops.push(['text', x, y, text, color]); p.dirty = true; }
    const win = p && this.windows.get(p.winId); if (win?.app?.redraw) win.app.redraw();
    return { cost: 1 };
  }
  sceneSubmit(sys, path, state, proc) {
    return { value: 0, cost: 2 };
  }

  afterTick(realDt) {
    if (!this.started) return;
    this.frameCount++;
    for (const sys of this.systems.values()) {
      const d = this.desktops.get(sys.id);
      if (d) d.updateClock();
    }
    const rootD = this.desktops.get(this.root?.id);
    if (rootD) rootD.updateClock();
    for (const w of this.windows.values()) {
      if (w.app?.tick && !w.minimized) {
        try { w.app.tick(realDt); } catch (e) { console.error(e); }
      }
      if (w.app?.render && !w.minimized) {
        try { w.app.render(); } catch (e) { console.error(e); }
      }
    }
    if (this.frameCount % 30 === 0) {
      for (const d of this.desktops.values()) if (d.tasksRefresh) d.tasksRefresh();
    }
    if (this.frameCount % 300 === 0) this.saveSoon();
  }

  onSystemStep(sys, used, alloc) { /* 供扩展 */ }
  onFsChange(sys, path) {
    for (const d of this.desktops.values()) if (d.refreshFiles && d.system === sys) d.refreshFiles();
  }
  onProcessLog(sys, proc, text) { this.msgLog.push({ sys: sys.id, pid: proc.id, text }); if (this.msgLog.length > 200) this.msgLog.shift(); }
  onProcessError(sys, proc) { this.notify(sys, '程序异常', `${proc.name}：${proc.error}`, 'err', true); }
  onProcessFinished(sys, proc) { this.saveSoon(); }
  onKernelError(sys, msg) {
    sys.state = 'error';
    this.kernelErrorSystems.add(sys.id);
    this.notify(sys, '内核错误', msg, 'err', true);
    this.toast(sys, '内核错误', msg, 'err');
    const d = this.desktops.get(sys.id);
    if (d) d.showKernelError(msg);
    const parentD = sys.parent ? this.desktops.get(sys.parent.id) : null;
    if (parentD) parentD.showKernelErrorBadge(sys.id, msg);
    this.saveSoon();
  }

  // ---------- 系统管理 ----------
  pauseSystem(sys) {
    if (!sys || sys.state !== 'running') return;
    sys.state = 'paused';
    this.refreshSystemUI();
    this.notify(sys, '系统已暂停', `${sys.id} 的时钟、进程与子树已停止推进`, 'warn', true);
    this.saveSoon();
  }
  resumeSystem(sys) {
    if (!sys || sys.state !== 'paused') return;
    sys.state = 'running';
    this.refreshSystemUI();
    this.notify(sys, '系统已继续', `${sys.id} 从暂停位置继续`, 'ok', true);
    this.saveSoon();
  }
  stepSystem(sys) {
    if (!sys || sys.state !== 'paused') { this.toast(this.root, '单步', '只有暂停的直属子系统可以单步', 'warn'); return; }
    if (sys.blockedByAncestor) { this.toast(this.root, '单步失败', '父系统或祖先已暂停', 'warn'); return; }
    sys.forceStep = true;
    const before = sys.clock;
    const grant = sys.lastGrant || sys.budget;
    sys.step(grant, { dtScale: 1 });
    sys.forceStep = false;
    const stepped = sys.clock - before;
    this.notify(sys, '单步完成', `推进 ${stepped} ms（一个逻辑时间步）`, 'info', true);
    this.renderAll();
    this.saveSoon();
  }
  restartSystem(sys) {
    if (!sys) return;
    if (!sys.parent) { this.reset(); return; }
    const parent = sys.parent;
    const kernelPath = sys.kernelSourcePath || joinPath('/System/kernels', sys.id + '.kernel');
    const src = parent.fs.read(kernelPath);
    if (src) { sys.kernelSource = src; }
    sys.processes = [];
    sys.pendingServices.clear();
    sys.nextPid = 1;
    sys.clock = parent.clock;
    sys.state = 'running';
    sys.errorLog = [];
    sys.kernelError = null;
    sys.apps = sys.apps || {};
    this.kernelErrorSystems.delete(sys.id);
    this.bootSystem(sys);
    if (sys.state === 'error') {
      this.notify(sys, '重启失败', sys.kernelError || '内核程序错误', 'err', true);
      this.renderAll();
      return;
    }
    for (const child of [...sys.children]) {
      if (child.state !== 'stopped') this.restartSystem(child);
    }
    for (const w of [...this.windows.values()]) {
      if (w.systemId === sys.id && w.app?.reset) { try { w.app.reset(); } catch (e) {} }
    }
    const d = this.desktops.get(sys.id);
    if (d) { d.hideKernelError(); d.updatePauseOverlay(); }
    const existingWin = [...this.windows.values()].find(w => w.appId === 'system' && w.state?.systemId === sys.id && w.systemId === sys.parent.id);
    if (!existingWin) this.openSystemWindow(sys.parent, sys);
    this.notify(sys, '系统已重启', `重新载入 ${basename(kernelPath)}，保留文件系统`, 'ok', true);
    this.renderAll();
    this.saveSoon();
  }
  stopSystem(sys, closeWindow = false) {
    if (!sys) return;
    sys.state = 'stopped';
    for (const w of [...this.windows.values()]) {
      if (w.systemId === sys.id && (w.appId === 'player' || w.appId === 'charts')) this.closeProjectionsOf(w, true);
    }
    for (const p of sys.processes) p.state = 'finished';
    for (const child of [...sys.children]) {
      if (child.state !== 'stopped') this.stopSystem(child, false);
    }
    if (closeWindow) {
      const w = [...this.windows.values()].find(w => w.appId === 'system' && w.state?.systemId === sys.id);
      if (w) this.destroyWindow(w);
      if (sys.desktop) { sys.desktop.el.style.display = 'none'; }
    }
    this.notify(sys.parent || this.root, '子树已停止', `${sys.id} 及其后代已停止`, 'warn', true);
    this.refreshSystemUI();
    this.saveSoon();
  }
  closeSystem(sys) { this.stopSystem(sys, true); }
  setSpeed(sys, speed) {
    sys.speed = speed;
    this.notify(sys, '时间速率', `${sys.id} → ${speed}×（不影响执行预算）`, 'info', false);
    this.saveSoon();
  }
  setGrant(sys, ratio) {
    if (!sys.parent) return;
    sys.grantRatio = clamp(ratio, 0.05, 0.8);
    sys.budget = Math.round(sys.parent.budget * sys.grantRatio);
    this.notify(sys.parent, '拨付已调整', `${sys.id} 获得 ${(sys.grantRatio * 100).toFixed(0)}% 的父系统预算`, 'info', false);
    this.saveSoon();
  }

  refreshSystemUI() {
    for (const d of this.desktops.values()) {
      d.updatePauseOverlay();
      d.updateSysChip();
      d.rebuildTaskbar();
      if (d.sysmgrRefresh) d.sysmgrRefresh();
    }
  }

  renderAll() {
    for (const w of this.windows.values()) {
      if (w.app?.render) { try { w.app.render(); } catch (e) {} }
    }
  }

  // ---------- 跨层投送 ----------
  project(sourceWin, targetSys) {
    if (!sourceWin || !['player', 'charts'].includes(sourceWin.appId)) return;
    if (!targetSys || targetSys === sourceWin.desktop.system) { this.toast(sourceWin.desktop.system, '投送失败', '请选择祖先桌面', 'warn'); return; }
    const anyExisting = [...this.windows.values()].find(w => w.appId === 'projection' && w.state?.sourceWindowId === sourceWin.id);
    if (anyExisting) { this.focusWindow(anyExisting); return; }
    let p = sourceWin.desktop.system;
    let ok = false;
    while (p) { if (p === targetSys) { ok = true; break; } p = p.parent; }
    if (!ok || targetSys.depth >= sourceWin.desktop.system.depth) { this.toast(sourceWin.desktop.system, '投送失败', '目标必须是祖先桌面', 'warn'); return; }
    const existing = [...this.windows.values()].find(w => w.appId === 'projection' && w.state?.sourceWindowId === sourceWin.id && w.systemId === targetSys.id);
    if (existing) { this.focusWindow(existing); return; }
    const win = this.createWindow(targetSys, {
      appId: 'projection', title: `投送 · ${APP_DEFS[sourceWin.appId].title}`,
      width: 720, height: 480,
      state: {
        sourceSystemId: sourceWin.systemId, sourceWindowId: sourceWin.id, sourceAppId: sourceWin.appId,
        targetSystemId: targetSys.id
      }
    });
    if (win) {
      win.setIcon('projection');
      win.el.setAttribute('data-source-system-id', sourceWin.systemId);
      win.el.setAttribute('data-source-window-id', sourceWin.id);
      win.el.setAttribute('data-source-app-id', sourceWin.appId);
      this.notify(targetSys, '已创建投送', `${APP_DEFS[sourceWin.appId].title} ← ${sourceWin.systemId}`, 'ok', true);
      this.saveSoon();
    }
  }

  closeProjection(win) {
    const d = win.desktop;
    this.destroyWindow(win);
    this.notify(win.desktop.system, '投送已关闭', '源应用继续运行，可再次投送', 'info', true);
  }

  projectionSource(win) {
    return this.windows.get(win?.state?.sourceWindowId);
  }

  forwardProjection(win, action) {
    const src = this.projectionSource(win);
    if (!src || !src.app) return;
    if (src.app.applyProjectionAction) src.app.applyProjectionAction(action);
    else if (src.app.handleProjection) src.app.handleProjection(action);
    this.saveSoon();
  }

  // ---------- 快照 ----------
  snapshotSubtree(sys, name) {
    if (!sys || !sys.parent) { this.toast(this.root, '快照失败', '只能为直属子系统创建快照', 'warn'); return null; }
    const parent = sys.parent;
    const systems = [];
    const collect = s => {
      systems.push(s);
      for (const c of s.children) collect(c);
    };
    collect(sys);
    const data = {
      format: 'nos-snapshot', version: 1, createdAt: Date.now(), rootId: sys.id,
      name: name || `snapshot-${sys.id}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`,
      systems: systems.map(s => ({
        system: Object.assign(s.serialize(), { settings: s.settings, notifications: s.notifications, clipboard: s.clipboard }),
        windows: [...this.windows.values()].filter(w => w.systemId === s.id).map(w => ({
          id: w.id, appId: w.appId, title: w.title, x: w.x, y: w.y, w: w.w, h: w.h,
          minimized: w.minimized, maximized: w.maximized, z: w.z,
          state: w.app?.serialize ? w.app.serialize() : {}
        }))
      }))
    };
    const text = JSON.stringify(data);
    const path = joinPath('/Snapshots', data.name + '.snap');
    if (parent.fs.storageUsed() + new TextEncoder().encode(text).length > parent.storageLimit) {
      this.notify(parent, '快照失败', '父系统存储配额不足', 'err');
      return null;
    }
    parent.fs.write(path, text, Date.now());
    parent.syncStorage();
    this.charge(parent, 30 + Math.ceil(text.length / 200));
    this.notify(parent, '快照已保存', `${path} · ${fmtBytes(text.length)}`, 'ok', true);
    this.saveSoon();
    return data;
  }

  listSnapshots(sys) {
    return (sys.fs.list('/Snapshots') || []).filter(f => !f.dir && f.path.endsWith('.snap'));
  }

  restoreSnapshot(sys, snap, opts = {}) {
    if (!snap || !snap.systems?.length) return null;
    const parent = sys.parent;
    if (!parent) return null;
    const rootData = snap.systems[0];
    const old = this.systems.get(snap.rootId);
    if (old && !opts.fork) {
      if (old.desktop?.win) this.destroyWindow(old.desktop.win);
      old.state = 'stopped';
      parent.children = parent.children.filter(c => c !== old);
      for (const s of this.allSystems(old)) {
        this.systems.delete(s.id);
        const d = this.desktops.get(s.id);
        if (d) { d.destroy(); this.desktops.delete(s.id); }
      }
      if (old.desktop) { old.desktop.destroy(); this.desktops.delete(old.id); }
    }
    const built = this.instantiateSnapshot(parent, snap, opts);
    this.notify(parent, opts.fork ? '分叉完成' : '快照已恢复', `${built.id} 已从 ${snap.rootId} 恢复`, 'ok', true);
    this.refreshSystemUI();
    this.renderAll();
    this.saveSoon();
    return built;
  }

  instantiateSnapshot(parent, snap, opts = {}) {
    const idMap = new Map();
    const winIdMap = new Map();
    if (opts.fork) {
      for (const e of snap.systems) idMap.set(e.system.id, `inner-${this.nextSystemSeq++}`);
    }
    const remapSys = id => idMap.get(id) || id;
    const rootEntry = snap.systems[0];
    const sysMap = new Map();
    const winMap = new Map();

    // 第一遍：重建系统与桌面
    const createSys = (entry, parentSys) => {
      const sd = JSON.parse(JSON.stringify(entry.system));
      const oldId = sd.id;
      const nid = remapSys(oldId);
      sd.id = nid;
      if (opts.fork) sd.name = nid;
      sd.parentId = parentSys ? parentSys.id : parent.id;
      const sys = System.fromJSON(this, sd, parentSys);
      sys.settings = entry.settings ? JSON.parse(JSON.stringify(entry.settings)) : (parentSys?.settings ? JSON.parse(JSON.stringify(parentSys.settings)) : deepClone(ROOT_SETTINGS));
      sys.notifications = entry.notifications || [];
      sys.clipboard = entry.clipboard || [];
      if (!parentSys) {
        sys.parent = parent;
        sys.parentId = parent.id;
        sys.depth = parent.depth + 1;
        parent.children.push(sys);
      } else {
        sys.depth = parentSys.depth + 1;
        parentSys.children.push(sys);
      }
      this.systems.set(sys.id, sys);
      const d = new Desktop(this, sys, null);
      sys.desktop = d;
      this.desktops.set(sys.id, d);
      d.mounted = true;
      d.buildChrome();
      d.el.style.width = '100%';
      d.el.style.height = '100%';
      d.el.style.position = 'absolute';
      d.el.style.inset = '0';
      return sys;
    };
    const createTree = (entry, parentSys) => {
      const sys = createSys(entry, parentSys);
      const oldId = entry.system.id;
      for (const ch of snap.systems) {
        if (ch !== entry && ch.system.parentId === oldId) createTree(ch, sys);
      }
      return sys;
    };
    const rootSys = createTree(rootEntry, null);

    // 第二遍：重建窗口
    for (const e of snap.systems) {
      const sys = sysMap.get(e.system.id) || this.systems.get(remapSys(e.system.id));
      if (!sys) continue;
      for (const wd of e.windows || []) {
        let wid = wd.id;
        if (opts.fork || this.windows.has(wid)) wid = `w${this.nextWindowSeq++}`;
        winIdMap.set(wd.id, wid);
      }
    }
    for (const e of snap.systems) {
      const nid = remapSys(e.system.id);
      const sys = this.systems.get(nid);
      if (!sys) continue;
      for (const wd of e.windows || []) {
        const wid = winIdMap.get(wd.id) || wd.id;
        const st = JSON.parse(JSON.stringify(wd.state || {}));
        if (st.systemId) st.systemId = remapSys(st.systemId);
        if (st.sourceSystemId) st.sourceSystemId = remapSys(st.sourceSystemId);
        if (st.sourceWindowId) st.sourceWindowId = winIdMap.get(st.sourceWindowId) || st.sourceWindowId;
        if (st.targetSystemId) st.targetSystemId = remapSys(st.targetSystemId);
        const win = this.createWindow(sys, {
          id: wid, appId: wd.appId, title: wd.title, x: wd.x, y: wd.y, width: wd.w, height: wd.h,
          state: st
        });
        if (win) {
          win.minimized = !!wd.minimized;
          win.maximized = !!wd.maximized;
          win.z = wd.z || win.z;
          if (win.minimized) win.el.classList.add('minimized');
          if (win.maximized) win.applyMaximized();
          if (win.app?.restore) { try { win.app.restore(st); } catch (err) {} }
          if (win.appId === 'system') {
            const childSys = this.systems.get(st.systemId);
            if (childSys?.desktop) {
              win.bodyEl.classList.add('system-window-body');
              win.bodyEl.appendChild(childSys.desktop.el);
              childSys.desktop.attachWindow(win);
            }
          }
        }
      }
    }

    // 在父桌面上重新打开该子树的系统窗口
    const pd = this.desktops.get(rootSys.id);
    if (pd) {
      pd.el.style.position = 'absolute';
      pd.el.style.inset = '0';
      this.openApp(parent, 'system', { systemId: rootSys.id });
    }
    for (const w of this.windows.values()) {
      if (w.appId === 'projection' && w.app?.rebind) w.app.rebind();
    }
    return rootSys;
  }
  allSystems(sys) {
    const out = [sys];
    for (const c of sys.children) out.push(...this.allSystems(c));
    return out;
  }

  // ---------- 设置 ----------
  applySettings(sys) {
    const d = this.desktops.get(sys.id);
    if (!d) return;
    const st = sys.settings || (sys.settings = deepClone(ROOT_SETTINGS));
    const wp = WALLPAPERS.find(w => w.id === st.wallpaper) || WALLPAPERS[0];
    d.wallpaperEl.style.backgroundImage = `url("${wp.file}")`;
    d.wallpaperEl.style.filter = st.wallpaper === 'dusk' ? 'none' : `hue-rotate(${['dusk', 'aurora', 'dunes', 'tide'].indexOf(st.wallpaper) * 8}deg)`;
    const ac = ACCENTS.find(a => a.id === st.accent) || ACCENTS[0];
    d.el.style.setProperty('--accent', ac.a);
    d.el.style.setProperty('--accent-2', ac.b);
    d.el.style.setProperty('--accent-soft', hexA(ac.a, 0.18));
    d.updateZoom();
    d.renderIcons();
    d.rebuildTaskbar();
    this.saveSoon();
  }

  updateZoom(d) { d.updateZoom(); }

  // ---------- 持久化 ----------
  serializeTree(sys) {
    const windows = [...this.windows.values()].filter(w => w.systemId === sys.id).map(w => ({
      id: w.id, appId: w.appId, title: w.title, x: w.x, y: w.y, w: w.w, h: w.h,
      minimized: w.minimized, maximized: w.maximized, z: w.z,
      state: w.app?.serialize ? w.app.serialize() : {}
    }));
    return {
      system: sys.serialize(),
      windows,
      settings: sys.settings,
      notifications: sys.notifications,
      clipboard: sys.clipboard,
      children: sys.children.map(c => this.serializeTree(c))
    };
  }

  serializeAll() {
    if (!this.root) return null;
    return {
      version: 1,
      savedAt: Date.now(),
      root: this.serializeTree(this.root),
      nextSystemSeq: this.nextSystemSeq,
      rootWorkbooks: [...this.rootWorkbooks.keys()],
      chartSubs: [...this.chartSubs.entries()].map(([k, v]) => [k, { docId: v.docId, range: v.range, labelCol: v.labelCol, series: v.series, version: v.version }])
    };
  }

  async saveState() {
    if (!this.started) return;
    const data = this.serializeAll();
    if (!data) return;
    try {
      await fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      this.lastSave = Date.now();
    } catch (e) {}
  }

  hydrate(data) {
    this.clearAll();
    const rootData = data.root;
    const build = (entry, parent) => {
      const sd = entry.system;
      const sys = System.fromJSON(this, sd, parent);
      if (!parent) { sys.parent = null; sys.parentId = null; sys.depth = 0; }
this.systems.set(sys.id, sys);
      sys.settings = entry.settings || deepClone(ROOT_SETTINGS);
      sys.notifications = entry.notifications || [];
      sys.clipboard = entry.clipboard || [];
      sys.apps = sys.apps || {};
      if (sys.isRoot) {
        if (!sys.apps.workbooks) sys.apps.workbooks = [];
      }
      const d = new Desktop(this, sys, parent ? null : this.rootEl);
      sys.desktop = d;
      this.desktops.set(sys.id, d);
      d.mounted = false;
      for (const wd of entry.windows || []) {
        if (wd.appId === 'system') {
          // 稍后挂载
        }
      }
      for (const ch of entry.children || []) {
        const c = build(ch, sys);
        sys.children.push(c);
      }
      return sys;
    };
    this.root = build(rootData, null);
    this.lastActiveSystem = this.root;
    this.nextSystemSeq = data.nextSystemSeq || (this.systems.size);
    // 挂载桌面
    for (const sys of this.systems.values()) {
      const d = this.desktops.get(sys.id);
      if (!d) continue;
      if (sys.isRoot) { d.mount(); }
      else { d.mounted = true; d.buildChrome(); d.el.style.width = '100%'; d.el.style.height = '100%'; }
    }
    // 重建窗口
    for (const sys of this.systems.values()) {
      const entry = this.findEntry(rootData, sys.id);
      if (!entry) continue;
      for (const wd of entry.windows || []) {
        const win = this.createWindow(sys, {
          id: wd.id, appId: wd.appId, title: wd.title, x: wd.x, y: wd.y, width: wd.w, height: wd.h,
          state: wd.state || {}
        });
        if (win) {
          win.minimized = !!wd.minimized;
          win.maximized = !!wd.maximized;
          win.z = wd.z || win.z;
          if (win.minimized) win.el.classList.add('minimized');
          if (win.maximized) win.applyMaximized();
          if (win.app?.restore) { try { win.app.restore(wd.state || {}); } catch (e) {} }
        }
      }
    }
    // system 窗口挂载子桌面
    for (const w of [...this.windows.values()]) {
      if (w.appId === 'system') {
        const child = this.systems.get(w.state?.systemId);
        if (child?.desktop) {
          w.bodyEl.classList.add('system-window-body');
          w.bodyEl.appendChild(child.desktop.el);
          child.desktop.attachWindow(w);
          child.desktop.updateZoom();
        }
      }
    }
    let maxW = 0;
    for (const id of this.windows.keys()) { const m = /^w(\d+)$/.exec(id); if (m) maxW = Math.max(maxW, parseInt(m[1], 10)); }
    this.nextWindowSeq = Math.max(this.nextWindowSeq, maxW + 1);
    for (const sys of this.systems.values()) {
      this.applySettings(sys);
      if (sys.state === 'error') {
        const d = this.desktops.get(sys.id);
        if (d) d.showKernelError(sys.kernelError || sys.errorLog?.slice(-1)[0]?.msg || '内核程序异常');
      }
    }
    this.rehydrateWorkbooks();
    if (this.root?.apps?.workbooks) {
      for (const doc of this.root.apps.workbooks) {
        if (!this.rootWorkbooks.has(doc.id)) this.registerWorkbook(this.root, doc);
      }
    }
    this.renderAll();
  }

  findEntry(entry, id) {
    if (entry.system.id === id) return entry;
    for (const c of entry.children || []) { const f = this.findEntry(c, id); if (f) return f; }
    return null;
  }

  rehydrateWorkbooks() {
    const root = this.root;
    if (!root) return;
    for (const w of this.windows.values()) {
      if (w.appId === 'spreadsheet' && w.app?.serialize) {
        const st = w.state || {};
        const doc = root.apps.workbooks?.find(d => d.id === st.docId);
        if (doc) this.registerWorkbook(root, doc);
      }
    }
    if (!root.apps.workbooks) root.apps.workbooks = [];
    // 从文件系统补回未打开的工作簿索引
  }

  reset() {
    const root = this.root;
    this.saveSoon.cancel();
    fetch('/api/reset', { method: 'POST' }).catch(() => {});
    this.clearAll();
    this.createInitial();
    this.scheduler.lastReal = performance.now();
    this.scheduler.acc = 0;
    this.renderAll();
    this.notify(this.root, '已重置', '当前数据目录已恢复初态', 'ok', true);
  }

  // ---------- 自动化 ----------
  setupBench() {
    const os = this;
    window.bench = {
      version: 1,
      ready: async () => {
        await new Promise(r => setTimeout(r, 120));
        return true;
      },
      reset: async () => { os.reset(); await new Promise(r => setTimeout(r, 200)); return true; },
      inspect: () => os.inspect()
    };
  }

  inspect() {
    const systems = [...this.systems.values()].map(s => ({ id: s.id, parentId: s.parentId, name: s.name, state: s.state }));
    const windows = [...this.windows.values()].map(w => ({ id: w.id, systemId: w.systemId, appId: w.appId, title: w.title, state: w.minimized ? 'minimized' : (w.maximized ? 'maximized' : 'normal') }));
    const browsers = [];
    const players = [];
    const charts = [];
    const projections = [];
    for (const w of this.windows.values()) {
      if (w.appId === 'browser' && w.app?.inspect) browsers.push(...w.app.inspect(w));
      if (w.appId === 'player' && w.app?.inspect) players.push(w.app.inspect(w));
      if (w.appId === 'charts' && w.app?.inspect) charts.push(w.app.inspect(w));
      if (w.appId === 'projection') projections.push({
        windowId: w.id, systemId: w.systemId, sourceSystemId: w.state?.sourceSystemId,
        sourceWindowId: w.state?.sourceWindowId, sourceAppId: w.state?.sourceAppId,
        state: w.minimized ? 'minimized' : 'normal'
      });
    }
    return { systems, windows, browsers, players, charts, projections };
  }

  _bindGlobal() {
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        for (const d of this.desktops.values()) d.closeTopLayer();
      }
    });
    window.addEventListener('beforeunload', () => {
      try { this.saveState(); } catch (e) {}
    });
    setInterval(() => { if (this.started) this.updateAllClocks(); }, 1000);
    window.addEventListener('resize', () => {
      for (const d of this.desktops.values()) d.layout();
    });
    document.addEventListener('pointerdown', e => {
      const t = e.target;
      if (!t || !t.closest) return;
      if (!t.closest('.ctx-menu')) for (const d of this.desktops.values()) d.closeContextMenu();
      if (!t.closest('.start-menu') && !t.closest('[data-testid="start-toggle"]')) for (const d of this.desktops.values()) if (d.startOpen) d.toggleStart(false);
      if (!t.closest('.flyout') && !t.closest('[data-testid="widgets-toggle"]') && !t.closest('.tray-clock')) for (const d of this.desktops.values()) if (d.widgetsOpen) d.toggleWidgets(false);
      if (!t.closest('.flyout') && !t.closest('[data-testid="notifications-toggle"]')) for (const d of this.desktops.values()) if (d.notifFlyoutOpen) d.toggleNotifications(false);
    }, true);
    // 跨窗口文件拖放
    document.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/x-nos-file')) e.preventDefault(); });
    document.addEventListener('copy', e => {
      const text = e.clipboardData?.getData('text/plain');
      if (text) this.recordClipboard(this.activeSystem(), text);
    });
  }

  updateAllClocks() {
    for (const d of this.desktops.values()) d.updateClock();
  }

  getSystem(id) { return this.systems.get(id); }
  activeSystem() { return this.lastActiveSystem || this.root; }
  recordClipboard(sys, text) {
    if (!sys || !text) return;
    if (!sys.clipboard) sys.clipboard = [];
    const last = sys.clipboard[0];
    if (last && last.text === text) return;
    sys.clipboard.unshift({ text, time: sys.clock, type: 'text' });
    if (sys.clipboard.length > 30) sys.clipboard.pop();
    const d = this.desktops.get(sys.id);
    if (d?.widgetsOpen) d.renderWidgets();
    this.saveSoon();
  }
  getDesktop(id) { return this.desktops.get(id); }
  getWindow(id) { return this.windows.get(id); }
  systemPath(sys) {
    const parts = [];
    let s = sys;
    while (s) { parts.unshift(s.id); s = s.parent; }
    return parts.join(' / ');
  }
}

function hexA(hex, a) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(111,141,255,${a})`;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
}



// ============================================================
// 桌面
// ============================================================
export class Desktop {
  constructor(os, system, hostEl) {
    this.os = os;
    this.system = system;
    this.hostEl = hostEl;
    this.windows = [];
    this.focusWindowId = null;
    this.zTop = 10;
    this.zoom = 1;
    this.widgetsOpen = false;
    this.notifFlyoutOpen = false;
    this.startOpen = false;
    this.tasksRefresh = null;
    this.sysmgrRefresh = null;
    this.refreshFiles = null;
    this.selectedIcons = new Set();
    this.mounted = false;
    this.ctxMenuEl = null;
    this.fileDragOver = 0;
    this._build();
  }

  _build() {
    const el = h('div', { class: 'desktop', 'data-system-id': this.system.id });
    el.dataset.testid = 'os-desktop';
    this.el = el;
    const stage = h('div', { class: 'desktop-stage' });
    this.stage = stage;
    this.wallpaperEl = h('div', { class: 'wallpaper' });
    this.wallpaperTint = h('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none' } });
    this.iconsEl = h('div', { class: 'desktop-icons' });
    this.windowsEl = h('div', { class: 'windows-layer' });
    this.overlayEl = h('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 90000 } });
    this.taskbarEl = h('div', { class: 'taskbar' });
    this.startEl = h('div', { class: 'start-menu hidden' });
    this.widgetsEl = h('div', { class: 'flyout hidden' });
    this.notifEl = h('div', { class: 'flyout hidden' });
    this.toastsEl = h('div', { class: 'toasts' });
    this.pauseEl = h('div', { class: 'pause-overlay hidden' });
    this.kernelErrEl = h('div', { class: 'sys-error-overlay hidden' });
    stage.append(this.wallpaperEl, this.wallpaperTint, this.iconsEl, this.windowsEl, this.overlayEl, this.pauseEl, this.kernelErrEl, this.toastsEl, this.taskbarEl, this.startEl, this.widgetsEl, this.notifEl);
    el.append(stage);
    this.bindDesktop();
  }

  mount(hostEl) {
    if (hostEl) this.hostEl = hostEl;
    if (this.hostEl) this.hostEl.appendChild(this.el);
    else this.os.rootEl.appendChild(this.el);
    this.mounted = true;
    this.layout();
    if (!this.taskbarBuilt) this.buildTaskbar();
    this.renderIcons();
    this.rebuildTaskbar();
    this.buildStartMenu();
    this.applySystemTheme();
  }

  buildChrome() {
    if (!this.taskbarBuilt) this.buildTaskbar();
    this.renderIcons();
    this.rebuildTaskbar();
    this.buildStartMenu();
  }

  applySystemTheme() {
    const st = this.system.settings;
    if (st) {
      const ac = ACCENTS.find(a => a.id === st.accent) || ACCENTS[0];
      this.el.style.setProperty('--accent', ac.a);
      this.el.style.setProperty('--accent-2', ac.b);
      this.el.style.setProperty('--accent-soft', hexA(ac.a, 0.18));
    } else {
      const hue = (hashStr(this.system.id) % 60) - 20;
      this.el.style.setProperty('--accent', `hsl(${222 + hue} 90% 68%)`);
      this.el.style.setProperty('--accent-2', `hsl(${268 + hue} 85% 70%)`);
    }
  }

  attachWindow(win) {
    this.win = win;
    this.hostEl = win.bodyEl;
    this.layout();
    this.updateZoom();
  }

  layout() {
    if (!this.mounted) return;
    const host = this.hostEl || this.os.rootEl;
    const cw = host.clientWidth || 1200;
    const ch = host.clientHeight || 800;
    let zoom = this.system.isRoot ? (this.system.settings?.scale || 1) : depthZoom(this.system.depth) * (this.system.settings?.scale || 1);
    zoom = clamp(zoom, 0.55, 1.6);
    this.zoom = zoom;
    this.stage.style.zoom = zoom;
    const w = Math.max(320, Math.floor(cw / zoom));
    const hh = Math.max(240, Math.floor(ch / zoom));
    this.stage.style.width = w + 'px';
    this.stage.style.height = hh + 'px';
    this.width = w; this.height = hh;
    for (const win of this.windows) {
      if (win.maximized) win.applyMaximized();
      else {
        win.w = Math.min(win.w, w - 10);
        win.h = Math.min(win.h, hh - 52 - 10);
        win.x = clamp(win.x, 0, Math.max(0, w - win.w));
        win.y = clamp(win.y, 0, Math.max(0, hh - 52 - win.h));
        win.applyRect();
      }
    }
    if (this.system.depth === 0) this.os.rootEl.appendChild(this.el);
  }

  updateZoom() { this.layout(); }

  workArea() { return { w: this.width || 1200, h: (this.height || 800) - 52 }; }

  toLocal(clientX, clientY) {
    const r = this.el.getBoundingClientRect();
    return { x: (clientX - r.left) / this.zoom, y: (clientY - r.top) / this.zoom };
  }

  renderIcons() {
    clear(this.iconsEl);
    const st = this.system.settings;
    const isRoot = this.system.isRoot;
    const items = [];
    if (isRoot) {
      items.push({ appId: 'files', label: '此电脑', icon: 'monitor', color: '#7dd3fc' });
      items.push({ appId: 'browser', label: '浏览器', icon: 'browser', color: '#60a5fa' });
      items.push({ appId: 'sysmgr', label: '新建子系统', icon: 'system', color: '#f0abfc', action: 'new-system' });
      items.push({ path: '/Demo/sample.sheet', label: '示例工作簿', file: true });
      items.push({ path: '/Demo/helicopter-24.scene', label: '直升机 24', file: true });
      items.push({ path: '/Documents', label: '文档', folder: true });
      items.push({ path: '/Recycle Bin', label: '回收站', folder: true, icon: 'trash' });
    } else {
      items.push({ appId: 'files', label: '文件管理器', icon: 'files', color: '#ffc857' });
      items.push({ appId: 'player', label: '场景播放器', icon: 'player', color: '#c084fc' });
      items.push({ appId: 'charts', label: '图表工作台', icon: 'charts', color: '#34d399' });
      items.push({ appId: 'editor', label: '编辑器', icon: 'editor', color: '#93c5fd' });
      items.push({ appId: 'tasks', label: '进程管理器', icon: 'tasks', color: '#f472b6' });
      items.push({ appId: 'sysmgr', label: '新建子系统', icon: 'system', color: '#f0abfc', action: 'new-system' });
      items.push({ path: '/Demo/helicopter-24.scene', label: '直升机 24', file: true });
      items.push({ path: '/Documents', label: '文档', folder: true });
    }
    const cols = Math.max(1, Math.floor((this.width || 1200) / 96));
    const rowH = 100;
    items.forEach((it, i) => {
      const col = Math.floor(i / 7);
      const row = i % 7;
      const x = 14 + col * 96;
      const y = 14 + row * rowH;
      const el = h('div', {
        class: 'dicon', 'data-testid': 'desktop-icon',
        style: { left: x + 'px', top: y + 'px' },
        title: it.label
      });
      if (it.appId) el.dataset.appId = it.appId;
      if (it.path) el.dataset.filePath = it.path;
      if (it.action) el.dataset.action = it.action;
      let ic;
      if (it.file || it.folder) {
        const fi = fileIcon(it.path, !!it.folder);
        if (it.icon) { ic = icon(it.icon, 42); }
        else {
          const span = h('span', { style: { color: fi.color, display: 'flex' } });
          span.innerHTML = `<span style="display:flex;width:42px;height:42px">${fi.svg.replace('<svg ', '<svg style="width:42px;height:42px" ')}</span>`;
          ic = span;
        }
      } else {
        ic = icon(it.icon || 'grid', 42);
        ic.style.color = it.color || 'var(--accent)';
      }
      const img = h('div', { class: 'dicon-img' }, ic);
      const label = h('div', { class: 'dicon-label' }, it.label);
      el.append(img, label);
      el.addEventListener('click', e => {
        e.stopPropagation();
        if (!e.ctrlKey && !e.metaKey) this.selectedIcons.clear();
        this.selectedIcons.add(it);
        this.updateIconSelection();
      });
      el.addEventListener('dblclick', () => this.openIcon(it));
      el.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation();
        this.selectedIcons.clear(); this.selectedIcons.add(it); this.updateIconSelection();
        this.showIconMenu(e.clientX, e.clientY, it);
      });
      if (it.file || it.folder) {
        el.draggable = true;
        el.addEventListener('dragstart', e => {
          e.dataTransfer.setData('application/x-nos-file', JSON.stringify({ systemId: this.system.id, path: it.path }));
          e.dataTransfer.effectAllowed = 'copy';
        });
        if (it.folder) {
          el.addEventListener('dragover', e => {
            if (e.dataTransfer.types.includes('application/x-nos-file')) { e.preventDefault(); el.classList.add('drop-target'); }
          });
          el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
          el.addEventListener('drop', e => {
            e.preventDefault(); el.classList.remove('drop-target');
            this.handleFileDrop(e, it.path);
          });
        }
      }
      this.iconsEl.appendChild(el);
    });
  }

  updateIconSelection() {
    const items = [...this.iconsEl.children];
    items.forEach(el => {
      const sel = [...this.selectedIcons].some(it =>
        (it.appId && el.dataset.appId === it.appId && !it.path) ||
        (it.path && el.dataset.filePath === it.path)
      );
      el.classList.toggle('selected', sel);
    });
  }

  openIcon(it) {
    if (it.action === 'new-system') { this.os.openApp(this.system, 'sysmgr'); setTimeout(() => { const w = [...this.os.windows.values()].find(w => w.systemId === this.system.id && w.appId === 'sysmgr'); if (w?.app?.createChild) w.app.createChild(); }, 60); return; }
    if (it.appId) { this.os.openApp(this.system, it.appId); return; }
    if (it.path) this.os.openFile(this.system, it.path);
  }

  handleFileDrop(e, targetDir) {
    const raw = e.dataTransfer.getData('application/x-nos-file');
    if (!raw) return;
    let payload;
    try { payload = JSON.parse(raw); } catch (err) { return; }
    const srcSys = this.os.systems.get(payload.systemId);
    if (!srcSys) return;
    const f = srcSys.fs.get(payload.path);
    if (!f) return;
    const dst = normalizePath(joinPath(targetDir, basename(payload.path)));
    if (this.system.fs.exists(dst)) {
      this.os.dialog(this.system, {
        title: '目标已存在',
        text: `${dst} 已存在，是否覆盖？`,
        actions: [{ id: 'overwrite', text: '覆盖', primary: true }, { id: 'cancel', text: '取消' }]
      }).then(res => {
        if (res === 'overwrite') this.os.copyFile(srcSys, payload.path, this.system, dst);
      });
    } else {
      const r = this.os.copyFile(srcSys, payload.path, this.system, dst);
      if (!r.ok) this.os.toast(this.system, '复制失败', r.error, 'err');
    }
    if (this.refreshFiles) this.refreshFiles();
  }

  showIconMenu(clientX, clientY, item) {
    const items = [];
    if (item.path) {
      items.push({ icon: 'open', label: '打开', act: () => this.os.openFile(this.system, item.path) });
      if (item.file) {
        items.push({ icon: 'copy', label: '复制', act: () => { this.clipboard = { systemId: this.system.id, path: item.path, cut: false }; this.os.toast(this.system, '已复制', basename(item.path), 'ok'); } });
        items.push({ icon: 'cut', label: '剪切', act: () => { this.clipboard = { systemId: this.system.id, path: item.path, cut: true }; } });
        items.push({ icon: 'text', label: '重命名', act: () => this.renamePath(item.path) });
        items.push({ sep: true });
        items.push({ icon: 'trash', label: '删除', danger: true, act: () => { this.os.deleteToRecycle(this.system, item.path); this.renderIcons(); } });
      } else {
        items.push({ sep: true });
        items.push({ icon: 'trash', label: '清空回收站', danger: true, act: () => { const bin = '/Recycle Bin'; for (const f of this.system.fs.list(bin) || []) this.system.fs.remove(f.path); this.os.toast(this.system, '回收站已清空', '', 'ok'); this.renderIcons(); } });
      }
    } else {
      items.push({ icon: 'open', label: '打开', act: () => this.openIcon(item) });
      if (item.action === 'new-system') items.push({ icon: 'settings', label: '子系统管理', act: () => this.os.openApp(this.system, 'sysmgr') });
    }
    this.showContextMenu(clientX, clientY, items);
  }

  renamePath(path) {
    this.os.prompt(this.system, '重命名', '输入新名称', basename(path)).then(name => {
      if (!name) return;
      const np = joinPath(dirname(path), name.trim());
      if (this.system.fs.exists(np) && np !== path) { this.os.toast(this.system, '重命名失败', '目标已存在', 'err'); return; }
      if (this.system.fs.rename(path, np)) { this.os.toast(this.system, '已重命名', np, 'ok'); this.renderIcons(); }
    });
  }

  bindDesktop() {
    this.el.addEventListener('pointerdown', e => {
      if (e.target === this.el || e.target === this.stage || e.target === this.iconsEl || e.target.classList.contains('wallpaper')) {
        this.closeAllLayers();
        this.selectedIcons.clear();
        this.updateIconSelection();
        if (this.focusWindowId) {
          const w = this.os.windows.get(this.focusWindowId);
          if (w) w.el.classList.remove('focused');
          this.focusWindowId = null;
        }
      }
    });
    this.el.addEventListener('contextmenu', e => {
      if (e.target.closest('.app-window') || e.target.closest('.taskbar') || e.target.closest('.start-menu') || e.target.closest('.flyout')) return;
      e.preventDefault();
      this.selectedIcons.clear(); this.updateIconSelection();
      this.showDesktopMenu(e.clientX, e.clientY);
    });
    this.el.addEventListener('dragover', e => {
      if (e.dataTransfer.types.includes('application/x-nos-file')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
    });
    this.el.addEventListener('drop', e => {
      e.preventDefault();
      const raw = e.dataTransfer.getData('application/x-nos-file');
      if (raw) {
        try {
          const payload = JSON.parse(raw);
          const srcSys = this.os.systems.get(payload.systemId);
          const f = srcSys?.fs.get(payload.path);
          if (f) {
            const dst = normalizePath(joinPath('/Documents', basename(payload.path)));
            const finalDst = this.system.fs.exists(dst) ? joinPath('/Documents', `${basename(payload.path)} (${Date.now() % 10000})`) : dst;
            this.os.copyFile(srcSys, payload.path, this.system, finalDst);
          }
        } catch (err) {}
      }
    });
  }

  showDesktopMenu(clientX, clientY) {
    const items = [
      { icon: 'grid', label: '查看', act: () => {} },
      { icon: 'sort', label: '排序方式', act: () => {} },
      { icon: 'reload', label: '刷新', act: () => { this.renderIcons(); this.os.toast(this.system, '已刷新', '', 'info'); } },
      { sep: true },
      { icon: 'system', label: '新建子系统', act: () => this.os.openApp(this.system, 'sysmgr') },
      { icon: 'folder', label: '新建文件夹', act: () => this.newFolder('/Documents') },
      { sep: true },
      { icon: 'widgets', label: '小组件', act: () => this.toggleWidgets(true) },
      { icon: 'bell', label: '通知中心', act: () => this.toggleNotifications(true) },
      { icon: 'settings', label: '显示设置', act: () => this.os.openApp(this.system, 'settings') },
      { icon: 'help', label: '操作说明', act: () => this.os.openApp(this.system, 'editor', { state: { path: '/System/help.md', help: true } }) }
    ];
    this.showContextMenu(clientX, clientY, items);
  }

  newFolder(dir) {
    this.os.prompt(this.system, '新建文件夹', '名称', '新建文件夹').then(name => {
      if (!name) return;
      const p = joinPath(dir, name.trim());
      if (this.system.fs.exists(p)) { this.os.toast(this.system, '创建失败', '同名文件已存在', 'err'); return; }
      this.system.fs.mkdir(p);
      this.os.notify(this.system, '文件夹已创建', p, 'ok', true);
      this.renderIcons();
      if (this.refreshFiles) this.refreshFiles();
    });
  }

  showContextMenu(clientX, clientY, items) {
    this.closeContextMenu();
    const local = this.toLocal(clientX, clientY);
    const menu = h('div', { class: 'ctx-menu', style: { left: local.x + 'px', top: local.y + 'px' } });
    for (const it of items) {
      if (it.sep) { menu.append(h('div', { class: 'ctx-sep' })); continue; }
      const b = h('button', { class: 'ctx-item' + (it.danger ? ' danger' : '') });
      const ic = h('span', { style: { display: 'flex', color: it.danger ? '#ff8f99' : 'var(--muted)' } });
      ic.innerHTML = iconSvg(it.icon || 'grid');
      if (it.testid) b.dataset.testid = it.testid;
      if (it.targetSystemId) b.dataset.targetSystemId = it.targetSystemId;
      b.append(ic, h('span', {}, it.label));
      if (it.key) b.append(h('span', { class: 'ctx-key' }, it.key));
      b.addEventListener('click', () => { this.closeContextMenu(); it.act?.(); });
      menu.append(b);
    }
    this.overlayEl.appendChild(menu);
    this.ctxMenuEl = menu;
    const r = menu.getBoundingClientRect();
    const stageR = this.stage.getBoundingClientRect();
    if (r.right > stageR.right) menu.style.left = Math.max(4, local.x - r.width) + 'px';
    if (r.bottom > stageR.bottom) menu.style.top = Math.max(4, local.y - r.height) + 'px';
  }

  closeContextMenu() { if (this.ctxMenuEl) { this.ctxMenuEl.remove(); this.ctxMenuEl = null; } }

  closeTopLayer() {
    if (this.ctxMenuEl) { this.closeContextMenu(); return true; }
    if (this.startOpen) { this.toggleStart(false); return true; }
    if (this.widgetsOpen) { this.toggleWidgets(false); return true; }
    if (this.notifFlyoutOpen) { this.toggleNotifications(false); return true; }
    return false;
  }

  closeAllLayers() {
    this.closeContextMenu();
    if (this.startOpen) this.toggleStart(false);
    if (this.widgetsOpen) this.toggleWidgets(false);
    if (this.notifFlyoutOpen) this.toggleNotifications(false);
  }

  focusWindow(win) {
    if (!win) { this.focusWindowId = null; return; }
    this.os.lastActiveSystem = this.system;
    if (win.minimized) { win.minimized = false; win.el.classList.remove('minimized'); }
    this.focusWindowId = win.id;
    win.z = ++this.zTop;
    win.applyZ();
    for (const w of this.windows) w.el.classList.toggle('focused', w === win);
    win.app?.onFocus?.();
    this.rebuildTaskbar();
  }

  nextFocus() {
    const vis = this.windows.filter(w => !w.minimized).sort((a, b) => b.z - a.z);
    this.focusWindow(vis[0] || null);
  }

  buildStartMenu() {
    clear(this.startEl);
    const sys = this.system;
    const apps = sys.isRoot ? APP_ORDER_ROOT : APP_ORDER_INNER;
    const search = h('div', { class: 'start-search' });
    const sIcon = h('span', { style: { display: 'flex' } }); sIcon.innerHTML = iconSvg('search');
    const input = h('input', { placeholder: '搜索应用、文件与设置', 'data-testid': 'start-search' });
    search.append(sIcon, input);
    const grid = h('div', { class: 'start-grid' });
    const list = h('div', { class: 'start-list' });
    const foot = h('div', { class: 'start-foot' });
    const user = h('div', { class: 'start-user' }, 'N');
    foot.append(user, h('div', { style: { flex: '1' } }));
    const powerBtn = h('button', { class: 'btn ghost small', title: '重新载入' }, icon('restart', 14), '重新载入');
    powerBtn.addEventListener('click', () => { this.os.restartSystem(sys); this.toggleStart(false); });
    foot.append(powerBtn);
    this.startEl.append(search, h('div', { class: 'start-section-title' }, h('span', {}, '固定'), h('span', {}, `${sys.id} · 第 ${sys.depth + 1} 层`)), grid, h('div', { class: 'start-section-title' }, h('span', {}, '所有应用')), list, foot);
    const render = (filter = '') => {
      clear(grid); clear(list);
      const f = filter.trim().toLowerCase();
      const matched = apps.filter(a => !f || APP_DEFS[a].title.toLowerCase().includes(f) || a.includes(f));
      for (const a of matched) {
        const def = APP_DEFS[a];
        const b = h('button', { class: 'start-app', 'data-testid': def.launch || ('launch-' + a) });
        const ic = h('span', { class: 'sa-ic' });
        ic.innerHTML = iconSvg(def.icon);
        ic.firstChild.style.color = def.color;
        b.append(ic, h('span', {}, def.title));
        b.addEventListener('click', () => { this.os.openApp(sys, a); this.toggleStart(false); });
        (grid.children.length < 12 ? grid : list).append(b);
      }
      const extra = [
        { id: 'new-system', title: '新建子系统', icon: 'system', act: () => { this.os.openApp(sys, 'sysmgr'); } },
        { id: 'help', title: '操作说明', icon: 'help', act: () => this.os.openApp(sys, 'editor', { state: { path: '/System/help.md', help: true } }) }
      ];
      for (const a of extra) {
        const b = h('button', { class: 'start-app' });
        const ic = h('span', { class: 'sa-ic' }); ic.innerHTML = iconSvg(a.icon);
        b.append(ic, h('span', {}, a.title));
        b.addEventListener('click', () => { a.act(); this.toggleStart(false); });
        list.append(b);
      }
    };
    input.addEventListener('input', () => render(input.value));
    render('');
    this.startEl.addEventListener('contextmenu', e => e.preventDefault());
  }

  toggleStart(force) {
    const open = force == null ? !this.startOpen : force;
    if (open) {
      this.closeContextMenu();
      if (this.widgetsOpen) this.toggleWidgets(false);
      if (this.notifFlyoutOpen) this.toggleNotifications(false);
      this.startEl.classList.remove('hidden');
      this.startEl.dataset.testid = 'start-menu';
      const inp = this.startEl.querySelector('input'); if (inp) { inp.value = ''; inp.focus(); }
      const tb = this.taskbarEl.querySelector('[data-testid="start-toggle"]'); if (tb) tb.classList.add('on');
    } else {
      this.startEl.classList.add('hidden');
      const tb = this.taskbarEl.querySelector('[data-testid="start-toggle"]'); if (tb) tb.classList.remove('on');
    }
    this.startOpen = open;
  }

  buildTaskbar() {
    clear(this.taskbarEl);
    const start = h('button', { class: 'tb-start', 'data-testid': 'start-toggle', title: '开始', 'aria-label': '开始' });
    start.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="1.4"/><rect x="13" y="3" width="8" height="8" rx="1.4" opacity=".75"/><rect x="3" y="13" width="8" height="8" rx="1.4" opacity=".75"/><rect x="13" y="13" width="8" height="8" rx="1.4" opacity=".5"/></svg>`;
    start.addEventListener('click', e => { e.stopPropagation(); this.toggleStart(); });
    this.taskbarEl.append(start);
    const pinned = h('div', { class: 'tb-pinned' });
    const pinApps = this.system.isRoot ? ['files', 'browser', 'spreadsheet', 'editor', 'settings'] : ['files', 'player', 'charts', 'editor'];
    for (const a of pinApps) {
      const b = h('button', { class: 'tb-button', title: APP_DEFS[a].title, 'data-testid': 'tb-' + a, 'data-app-id': a });
      b.innerHTML = iconSvg(APP_DEFS[a].icon);
      b.firstChild.style.color = APP_DEFS[a].color;
      b.addEventListener('click', () => this.os.openApp(this.system, a));
      pinned.append(b);
    }
    const sysm = h('button', { class: 'tb-button', title: '系统管理器', 'data-testid': 'tb-system' });
    sysm.innerHTML = iconSvg('system'); sysm.firstChild.style.color = '#f0abfc';
    sysm.addEventListener('click', () => this.os.openApp(this.system, 'sysmgr'));
    pinned.append(sysm);
    const wbtn = h('button', { class: 'tb-button', title: '小组件', 'data-testid': 'widgets-toggle' });
    wbtn.innerHTML = iconSvg('widgets'); wbtn.firstChild.style.color = '#7dd3fc';
    wbtn.addEventListener('click', () => this.toggleWidgets());
    pinned.append(wbtn);
    this.taskbarEl.append(pinned);
    const apps = h('div', { class: 'tb-apps', 'data-testid': 'taskbar-apps' });
    this.taskbarEl.append(apps);
    const tray = h('div', { class: 'tb-tray' });
    const chip = h('div', { class: 'sys-chip' });
    const dot = h('i');
    const chipText = h('span', {}, `${this.system.id} · 运行中`);
    chip.append(dot, chipText);
    chip.dataset.testid = 'sys-chip';
    tray.append(chip);
    const net = h('button', { class: 'tray-btn', title: '网络', 'data-testid': 'tray-network' });
    net.innerHTML = iconSvg('wifi');
    net.addEventListener('click', () => this.toggleQuick());
    tray.append(net);
    const vol = h('button', { class: 'tray-btn', title: '音量' });
    vol.innerHTML = iconSvg('volume');
    vol.addEventListener('click', () => this.toggleQuick());
    tray.append(vol);
    const notif = h('button', { class: 'tray-btn', title: '通知中心', 'data-testid': 'notifications-toggle', 'aria-label': '通知中心' });
    notif.innerHTML = iconSvg('bell');
    notif.addEventListener('click', e => { e.stopPropagation(); this.toggleNotifications(); });
    tray.append(notif);
    const clock = h('button', { class: 'tray-clock', 'data-testid': 'tray-clock', title: '日期与时间' });
    clock.addEventListener('click', () => { this.toggleWidgets(); });
    tray.append(clock);
    this.taskbarEl.append(tray);
    this.clockEl = clock;
    this.chipEl = chip; this.chipDot = dot; this.chipText = chipText;
    this.notifBtn = notif;
    this.taskbarAppsEl = apps;
    this.updateClock();
    this.rebuildTaskbar();
    this.updateNotifBadge();
    this.updateSysChip();
    this.startEl.classList.add('hidden');
    this.startOpen = false;
  }

  rebuildTaskbar() {
    if (!this.taskbarAppsEl) return;
    clear(this.taskbarAppsEl);
    const wins = this.windows.filter(w => !w.closing);
    for (const w of wins) {
      const b = h('button', { class: 'tb-app', 'data-testid': 'taskbar-item', 'data-window-id': w.id, title: w.title });
      b.dataset.appId = w.appId;
      const ic = h('span', { style: { display: 'flex' } });
      const def = APP_DEFS[w.appId] || { icon: 'grid', color: '#9aa6c4' };
      ic.innerHTML = iconSvg(def.icon);
      ic.firstChild.style.color = def.color;
      b.append(ic, h('span', {}, w.title));
      if (w.id === this.focusWindowId && !w.minimized) b.classList.add('active');
      b.classList.toggle('running', true);
      b.addEventListener('click', e => {
        e.stopPropagation();
        if (w.minimized) { w.minimized = false; w.el.classList.remove('minimized'); this.focusWindow(w); }
        else if (this.focusWindowId === w.id) { w.minimized = true; w.el.classList.add('minimized'); this.focusWindowId = null; this.nextFocus(); this.rebuildTaskbar(); }
        else this.focusWindow(w);
      });
      b.addEventListener('contextmenu', e => {
        e.preventDefault();
        this.showContextMenu(e.clientX, e.clientY, [
          { icon: 'open', label: '最大化', act: () => w.toggleMaximize() },
          { icon: 'close', label: '关闭窗口', act: () => this.os.closeWindow(w) }
        ]);
      });
      this.taskbarAppsEl.append(b);
    }
    // 更新固定按钮运行态
    for (const b of this.taskbarEl.querySelectorAll('.tb-button')) {
      const appId = b.dataset.appId;
      const running = appId && this.windows.some(w => w.appId === appId);
      b.classList.toggle('running', !!running);
      b.classList.toggle('active', !!(appId && this.windows.some(w => w.appId === appId && w.id === this.focusWindowId)));
    }
  }

  updateClock() {
    const sys = this.system;
    const timer = sys.widgets?.timer;
    if (timer && timer.running && sys.clock >= timer.endAt) {
      timer.running = false;
      timer.remaining = 0;
      this.os.notify(sys, '倒计时结束', `${timer.duration} 秒计时完成`, 'warn', true);
    }
    if (!this.clockEl) return;
    const base = sys.isRoot ? (sys.epochBase || (sys.epochBase = Date.now() - sys.clock)) : (sys.parent?.epochBase || Date.now());
    const d = new Date(base + sys.clock);
    const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
    const date = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    const text = `<b>${hh}:${mm}</b><br><span>${date}</span>`;
    if (this._lastClockText !== text) { this._lastClockText = text; this.clockEl.innerHTML = text; }
    if (this.widgetsOpen && this.widgetsEl) {
      const wc = this.widgetsEl.querySelector('.widget-clock');
      if (wc) wc.textContent = `${hh}:${mm}`;
      if (timer) {
        const td = this.widgetsEl.querySelector('.timer-display');
        if (td) td.textContent = fmtClock(timer.running ? Math.max(0, (timer.endAt - sys.clock) / 1000) : (timer.remaining || 0));
      }
      const sw = sys.widgets?.stopwatch;
      if (sw) {
        const sd = this.widgetsEl.querySelector('.sw-display');
        if (sd) sd.textContent = fmtClock(sw.running ? sw.elapsed + (sys.clock - sw.startAt) / 1000 : sw.elapsed);
      }
    }
  }

  updateSysChip() {
    if (!this.chipText) return;
    const st = this.system.state;
    const eff = this.system.effectiveState;
    const label = st === 'paused' ? '已暂停' : (eff === 'blocked' ? '祖先暂停' : st === 'stopped' ? '已停止' : st === 'error' ? '内核错误' : '运行中');
    this.chipText.textContent = `${this.system.id} · ${label}`;
    this.chipEl.classList.toggle('paused', st === 'paused' || eff === 'blocked');
    this.chipEl.classList.toggle('stopped', st === 'stopped');
    this.chipEl.classList.toggle('error', st === 'error');
    this.chipDot.style.background = st === 'error' ? 'var(--danger)' : st === 'paused' || eff === 'blocked' ? 'var(--warn)' : st === 'stopped' ? 'var(--faint)' : 'var(--ok)';
  }

  updatePauseOverlay() {
    const eff = this.system.effectiveState;
    const show = (eff === 'paused' || eff === 'blocked') && this.system.state !== 'stopped';
    if (!this.pauseEl) return;
    if (show) {
      clear(this.pauseEl);
      this.pauseEl.classList.remove('hidden');
      const chip = h('div', { class: 'pause-chip', 'data-testid': 'pause-overlay' });
      chip.append(h('span', {}, eff === 'blocked' ? '祖先系统已暂停，本层停止推进' : '本系统已暂停'));
      const btn = h('button', {}, eff === 'blocked' ? '返回' : '继续');
      btn.addEventListener('click', () => {
        if (eff === 'blocked') {
          let p = this.system.parent; while (p && p.state === 'paused') p = p.parent;
          if (p) this.os.resumeSystem(p);
        } else this.os.resumeSystem(this.system);
      });
      chip.append(btn);
      this.pauseEl.append(chip);
      this.pauseEl.style.pointerEvents = 'none';
      chip.style.pointerEvents = 'auto';
    } else {
      this.pauseEl.classList.add('hidden');
      clear(this.pauseEl);
    }
    this.updateSysChip();
  }

  updateNotifBadge() {
    if (!this.notifBtn) return;
    const unread = (this.system.notifications || []).filter(n => !n.read).length;
    if (unread > 0) {
      if (!this.notifBtn.querySelector('.badge')) {
        const b = h('span', { class: 'badge' });
        b.style.cssText = 'position:absolute;top:2px;right:2px;min-width:14px;height:14px;padding:0 3px;border-radius:7px;background:#e5484d;color:#fff;font-size:9px;display:flex;align-items:center;justify-content:center;';
        this.notifBtn.style.position = 'relative';
        this.notifBtn.append(b);
      }
      this.notifBtn.querySelector('.badge').textContent = unread > 9 ? '9+' : String(unread);
    } else {
      this.notifBtn.querySelector('.badge')?.remove();
    }
  }

  showToast(n) {
    const t = h('div', { class: 'toast ' + (n.kind || 'info'), 'data-testid': 'toast' });
    const ic = h('div', { style: { color: n.kind === 'err' ? '#ff8f99' : n.kind === 'warn' ? '#ffd98a' : n.kind === 'ok' ? '#8ff0c8' : '#c9d5ff' } });
    ic.innerHTML = iconSvg(n.kind === 'err' ? 'warning' : n.kind === 'warn' ? 'warning' : n.kind === 'ok' ? 'check' : 'info');
    t.append(ic, h('div', {}, h('div', { class: 't-title' }, n.title), h('div', { class: 't-text' }, n.text)));
    this.toastsEl.append(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(16px)'; t.style.transition = 'all .2s'; setTimeout(() => t.remove(), 220); }, 4200);
  }

  toggleWidgets(force) {
    const open = force == null ? !this.widgetsOpen : force;
    if (open) {
      this.startOpen && this.toggleStart(false);
      this.notifFlyoutOpen && this.toggleNotifications(false);
      this.widgetsOpen = true;
      this.widgetsEl.classList.remove('hidden');
      this.widgetsEl.dataset.testid = 'widgets-panel';
      this.widgetsEl.dataset.appId = 'widgets';
      this.widgetsEl.dataset.systemId = this.system.id;
      this.renderWidgets();
    } else {
      this.widgetsOpen = false;
      this.widgetsEl.classList.add('hidden');
    }
  }

  renderWidgets() {
    const el = this.widgetsEl;
    clear(el);
    const sys = this.system;
    const head = h('div', { class: 'flyout-head' }, h('h3', {}, '小组件'), h('button', { class: 'btn ghost small', 'data-testid': 'widgets-close' }, '收起'));
    head.lastChild.addEventListener('click', () => this.toggleWidgets(false));
    el.append(head);
    const grid = h('div', { class: 'flyout-grid' });
    // 时钟
    const clockCard = h('div', { class: 'widget-card' });
    const now = new Date((sys.parent?.epochBase || Date.now()) + sys.clock);
    clockCard.append(
      h('div', { class: 'wc-title' }, h('span', {}, '时钟'), h('span', {}, '系统时间')),
      h('div', { class: 'widget-clock', 'data-testid': 'widget-clock' }, `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`),
      h('div', { class: 'widget-date' }, `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日`)
    );
    grid.append(clockCard);
    // 日历
    const calCard = h('div', { class: 'widget-card' });
    calCard.append(h('div', { class: 'wc-title' }, h('span', {}, '日历')));
    const cal = h('div', { class: 'cal-head' },
      h('button', { class: 'btn ghost small', title: '上个月' }, '‹'),
      h('span', { class: 'cal-month' }, `${now.getFullYear()} / ${now.getMonth() + 1}`),
      h('button', { class: 'btn ghost small', title: '下个月' }, '›'));
    let calDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const calGrid = h('div', { class: 'cal-grid' });
    const renderCal = () => {
      clear(calGrid);
      const days = ['一', '二', '三', '四', '五', '六', '日'];
      for (const d of days) calGrid.append(h('div', { class: 'cg head' }, d));
      const first = new Date(calDate.getFullYear(), calDate.getMonth(), 1);
      const startPad = (first.getDay() + 6) % 7;
      const daysInMonth = new Date(calDate.getFullYear(), calDate.getMonth() + 1, 0).getDate();
      for (let i = 0; i < startPad; i++) calGrid.append(h('div', { class: 'cg dim' }, ''));
      const today = new Date();
      for (let d = 1; d <= daysInMonth; d++) {
        const isToday = d === today.getDate() && calDate.getMonth() === today.getMonth() && calDate.getFullYear() === today.getFullYear();
        calGrid.append(h('div', { class: 'cg' + (isToday ? ' today' : '') }, String(d)));
      }
      cal.querySelector('.cal-month').textContent = `${calDate.getFullYear()} / ${calDate.getMonth() + 1}`;
    };
    cal.children[0].addEventListener('click', () => { calDate = new Date(calDate.getFullYear(), calDate.getMonth() - 1, 1); renderCal(); });
    cal.children[2].addEventListener('click', () => { calDate = new Date(calDate.getFullYear(), calDate.getMonth() + 1, 1); renderCal(); });
    renderCal();
    calCard.append(cal, calGrid);
    grid.append(calCard);
    // 倒计时
    if (!sys.widgets) sys.widgets = { timer: { duration: 5, remaining: 5, running: false, endAt: 0 }, note: '', clip: sys.clipboard || [] };
    if (!sys.widgets.timer) sys.widgets.timer = { duration: 5, remaining: 5, running: false, endAt: 0 };
    const timer = sys.widgets.timer;
    const tCard = h('div', { class: 'widget-card' });
    tCard.append(h('div', { class: 'wc-title' }, h('span', {}, '倒计时'), h('span', {}, '秒')));
    const tInput = h('input', { class: 'input', type: 'number', min: '1', max: '3600', value: String(timer.duration || 5), 'data-testid': 'widget-timer-input' });
    const tStart = h('button', { class: 'btn primary small', 'data-testid': 'widget-timer-start' }, '开始');
    const tPause = h('button', { class: 'btn small', 'data-testid': 'widget-timer-pause' }, '暂停');
    const tReset = h('button', { class: 'btn ghost small', 'data-testid': 'widget-timer-reset' }, '重置');
    const tDisp = h('div', { class: 'timer-display' }, fmtClock(timer.running ? Math.max(0, (timer.endAt - sys.clock) / 1000) : timer.remaining));
    tInput.addEventListener('change', () => { timer.duration = clamp(Number(tInput.value) || 5, 1, 3600); timer.remaining = timer.duration; tDisp.textContent = fmtClock(timer.remaining); });
    tStart.addEventListener('click', () => {
      const dur = clamp(Number(tInput.value) || 5, 1, 3600);
      timer.duration = dur; timer.remaining = dur; timer.running = true; timer.endAt = sys.clock + dur * 1000;
      this.os.toast(sys, '倒计时开始', `${dur} 秒`, 'info');
      this.renderWidgets();
    });
    tPause.addEventListener('click', () => {
      if (timer.running) { timer.remaining = Math.max(0, (timer.endAt - sys.clock) / 1000); timer.running = false; }
      else if (timer.remaining > 0) { timer.running = true; timer.endAt = sys.clock + timer.remaining * 1000; }
      this.renderWidgets();
    });
    tReset.addEventListener('click', () => { timer.running = false; timer.remaining = timer.duration; this.renderWidgets(); });
    tCard.append(h('div', { class: 'timer-row' }, tInput, tStart, tPause, tReset), tDisp);
    grid.append(tCard);
    // 便笺
    const nCard = h('div', { class: 'widget-card' });
    nCard.append(h('div', { class: 'wc-title' }, h('span', {}, '便笺')));
    const note = h('textarea', { class: 'widget-note', 'data-testid': 'widget-note-text', placeholder: '随手记录…' });
    note.value = sys.widgets?.note || '';
    note.addEventListener('input', () => { if (!sys.widgets) sys.widgets = {}; sys.widgets.note = note.value; this.os.saveSoon(); });
    nCard.append(note, h('button', { class: 'btn small', style: { marginTop: '6px' }, 'data-testid': 'widget-note-save' }, '保存到文档'));
    nCard.lastChild.addEventListener('click', () => {
      const p = '/Documents/便笺 ' + new Date().toISOString().slice(0, 10) + '.txt';
      this.system.fs.write(p, note.value, Date.now());
      this.os.notify(sys, '便笺已保存', p, 'ok', true);
    });
    grid.append(nCard);
    // 秒表
    const sw = sys.widgets?.stopwatch || (sys.widgets.stopwatch = { running: false, elapsed: 0, startAt: 0, last: 0 });
    const swCard = h('div', { class: 'widget-card' });
    swCard.append(h('div', { class: 'wc-title' }, h('span', {}, '秒表'), h('span', {}, '分:秒')));
    const swDisp = h('div', { class: 'timer-display sw-display' }, fmtClock(sw.running ? sw.elapsed + (sys.clock - sw.startAt) / 1000 : sw.elapsed));
    const swStart = h('button', { class: 'btn primary small', 'data-testid': 'widget-stopwatch-start' }, '开始');
    const swPause = h('button', { class: 'btn small', 'data-testid': 'widget-stopwatch-pause' }, '暂停');
    const swReset = h('button', { class: 'btn ghost small', 'data-testid': 'widget-stopwatch-reset' }, '重置');
    swStart.addEventListener('click', () => { if (!sw.running) { sw.startAt = sys.clock; sw.running = true; this.renderWidgets(); } });
    swPause.addEventListener('click', () => { if (sw.running) { sw.elapsed += (sys.clock - sw.startAt) / 1000; sw.running = false; this.renderWidgets(); } });
    swReset.addEventListener('click', () => { sw.running = false; sw.elapsed = 0; sw.startAt = 0; this.renderWidgets(); });
    swCard.append(swDisp, h('div', { class: 'timer-row' }, swStart, swPause, swReset));
    grid.append(swCard);
    // 剪贴板
    const cCard = h('div', { class: 'widget-card' });
    cCard.append(h('div', { class: 'wc-title' }, h('span', {}, '剪贴板历史'), h('span', {}, String((sys.clipboard || []).length))));
    const list = h('div', { 'data-testid': 'widget-clipboard-list' });
    for (const c of (sys.clipboard || []).slice(0, 6)) {
      const it = h('div', { class: 'clip-item' }, String(c.text).replace(/\n/g, ' ↵ '));
      it.title = c.text;
      it.addEventListener('click', () => { navigator.clipboard?.writeText(c.text); this.os.toast(sys, '已复制', '剪贴板项已放回', 'ok'); });
      list.append(it);
    }
    if (!(sys.clipboard || []).length) list.append(h('div', { class: 'empty', style: { padding: '12px 0' } }, '暂无记录'));
    cCard.append(list);
    grid.append(cCard);
    el.append(grid);
    // 快捷设置
    const qs = h('div', { class: 'widget-card', style: { marginTop: '10px' } });
    qs.append(h('div', { class: 'wc-title' }, h('span', {}, '快捷设置'), h('span', {}, '与设置同步')));
    const qsg = h('div', { class: 'qs-grid' });
    const qsTiles = [
      ['wifi', 'wifi', '无线网络', () => sys.settings.wifi, () => { sys.settings.wifi = !sys.settings.wifi; this.os.applySettings(sys); this.renderWidgets(); }],
      ['dnd', 'bell', '免打扰', () => sys.settings.dnd, () => { sys.settings.dnd = !sys.settings.dnd; this.renderWidgets(); }],
      ['brightness', 'sun', '亮度 ' + (sys.settings.brightness ?? 82) + '%', () => false, () => {}],
      ['volume', 'volume', '音量 ' + (sys.settings.volume ?? 68) + '%', () => false, () => {}]
    ];
    for (const [id, ic, label, on, fn] of qsTiles) {
      const t = h('button', { class: 'qs-tile' + (on() ? ' on' : ''), 'data-testid': 'qs-' + id });
      const sp = h('span', { style: { display: 'flex' } }); sp.innerHTML = iconSvg(ic);
      t.append(sp, h('span', {}, label));
      t.addEventListener('click', fn);
      qsg.append(t);
    }
    const vol = h('input', { type: 'range', min: '0', max: '100', value: String(sys.settings.volume ?? 68), style: { width: '100%', accentColor: 'var(--accent)', marginTop: '8px' }, 'data-testid': 'qs-volume' });
    vol.addEventListener('input', () => { sys.settings.volume = Number(vol.value); this.os.saveSoon(); });
    qs.append(qsg, vol);
    el.append(qs);
    // 通知中心
    const nTitle = h('div', { class: 'start-section-title', style: { marginTop: '14px' } }, h('span', {}, '通知中心'));
    const clearBtn = h('button', { class: 'btn ghost small' }, '全部已读');
    clearBtn.addEventListener('click', () => { for (const n of sys.notifications || []) n.read = true; this.updateNotifBadge(); this.renderWidgets(); });
    nTitle.append(clearBtn);
    el.append(nTitle);
    const nList = h('div', { 'data-testid': 'widget-notifications' });
    const nots = (sys.notifications || []).slice(0, 6);
    if (!nots.length) nList.append(h('div', { class: 'empty' }, '暂无通知'));
    for (const n of nots) {
      const it = h('div', { class: 'notif-item' });
      const ic = h('div', { class: 'ni-ic' });
      ic.innerHTML = iconSvg(n.kind === 'err' ? 'warning' : n.kind === 'ok' ? 'check' : 'info');
      it.append(ic, h('div', { class: 'ni-body' },
        h('div', { class: 'ni-title' }, n.title),
        h('div', { class: 'ni-text' }, n.text),
        h('div', { class: 'ni-time' }, new Date((sys.parent?.epochBase || Date.now()) + n.time).toLocaleTimeString('zh-CN'))));
      nList.append(it);
    }
    el.append(nList);
  }

  toggleNotifications(force) {
    const open = force == null ? !this.notifFlyoutOpen : force;
    if (open) {
      this.startOpen && this.toggleStart(false);
      this.widgetsOpen && this.toggleWidgets(false);
      this.notifFlyoutOpen = true;
      this.notifEl.classList.remove('hidden');
      this.notifEl.dataset.testid = 'notifications-panel';
      this.notifEl.dataset.appId = 'widgets';
      this.notifEl.dataset.systemId = this.system.id;
      for (const n of this.system.notifications || []) n.read = true;
      this.updateNotifBadge();
      this.renderNotifications();
    } else {
      this.notifFlyoutOpen = false;
      this.notifEl.classList.add('hidden');
    }
  }

  renderNotifications() {
    const el = this.notifEl;
    clear(el);
    const sys = this.system;
    const head = h('div', { class: 'flyout-head' }, h('h3', {}, '通知中心'), h('button', { class: 'btn ghost small' }, '收起'));
    head.lastChild.addEventListener('click', () => this.toggleNotifications(false));
    el.append(head);
    const dnd = h('button', { class: 'btn small' }, sys.settings?.dnd ? '免打扰：开' : '免打扰：关');
    dnd.addEventListener('click', () => {
      if (!sys.settings) sys.settings = deepClone(ROOT_SETTINGS);
      sys.settings.dnd = !sys.settings.dnd;
      dnd.textContent = sys.settings.dnd ? '免打扰：开' : '免打扰：关';
      this.os.saveSoon();
    });
    el.append(dnd, h('div', { style: { height: '10px' } }));
    const list = (sys.notifications || []);
    if (!list.length) el.append(h('div', { class: 'empty' }, '暂无通知'));
    for (const n of list) {
      const it = h('div', { class: 'notif-item' });
      const ic = h('div', { class: 'ni-ic' });
      ic.innerHTML = iconSvg(n.kind === 'err' ? 'warning' : n.kind === 'ok' ? 'check' : 'info');
      it.append(ic, h('div', { class: 'ni-body' },
        h('div', { class: 'ni-title' }, n.title),
        h('div', { class: 'ni-text' }, n.text),
        h('div', { class: 'ni-time' }, new Date((sys.parent?.epochBase || Date.now()) + n.time).toLocaleTimeString('zh-CN'))));
      el.append(it);
    }
    el.append(h('button', { class: 'btn ghost small', style: { marginTop: '8px' } }, '清空'));
    el.lastChild.addEventListener('click', () => { sys.notifications = []; this.renderNotifications(); this.updateNotifBadge(); });
  }

  toggleQuick() { this.toggleWidgets(); }

  dialog(opts) {
    return new Promise(resolve => {
      const layer = h('div', { class: 'modal-layer', style: { pointerEvents: 'auto' } });
      this.lastDialogValue = undefined;
      const dlg = h('div', { class: 'dialog', role: 'dialog' });
      dlg.append(h('h3', {}, opts.title || '提示'));
      if (opts.text) dlg.append(h('p', {}, opts.text));
      let inputEl = null;
      if (opts.input) {
        inputEl = h('input', { class: 'input dlg-input', value: opts.input.value || '', placeholder: opts.input.placeholder || '' });
        dlg.append(inputEl);
      }
      const actions = h('div', { class: 'dlg-actions' });
      const finish = val => { layer.remove(); resolve(val); };
      for (const a of opts.actions || [{ id: 'ok', text: '确定', primary: true }]) {
        const b = h('button', { class: 'btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : '') }, a.text);
        b.addEventListener('click', () => {
          this.lastDialogValue = inputEl ? inputEl.value : undefined;
          finish(a.id);
        });
        actions.append(b);
      }
      dlg.append(actions);
      layer.append(dlg);
      layer.addEventListener('pointerdown', e => { if (e.target === layer) { this.lastDialogValue = inputEl ? inputEl.value : undefined; finish('cancel'); } });
      this.overlayEl.appendChild(layer);
      if (inputEl) { setTimeout(() => { inputEl.focus(); inputEl.select(); }, 30); }
      const key = e => {
        if (e.key === 'Enter' && inputEl) { this.lastDialogValue = inputEl.value; finish('ok'); layer.removeEventListener('keydown', key); }
        if (e.key === 'Escape') { this.lastDialogValue = inputEl?.value; finish('cancel'); layer.removeEventListener('keydown', key); }
      };
      layer.addEventListener('keydown', key);
      layer.tabIndex = -1; layer.focus();
    });
  }

  showKernelError(msg) {
    clear(this.kernelErrEl);
    this.kernelErrEl.classList.remove('hidden');
    const card = h('div', { class: 'sys-error-card', 'data-testid': 'kernel-error' });
    card.append(h('h3', {}, '内核错误 · 系统已停止'), h('p', { style: { margin: '0 0 8px', color: '#ffd0d4', fontSize: '11px' } }, '请修正内核源文件后重新启动本系统。父系统与兄弟系统不受影响。'), h('pre', {}, msg));
    const row = h('div', { style: { display: 'flex', gap: '8px', marginTop: '12px' } });
    const rb = h('button', { class: 'btn primary', 'data-testid': 'kernel-restart' }, '重新载入内核');
    rb.addEventListener('click', () => { this.os.restartSystem(this.system); });
    const eb = h('button', { class: 'btn' }, '打开内核源文件');
    eb.addEventListener('click', () => {
      const p = this.system.parent?.fs?.get(this.system.kernelSourcePath);
      if (p) this.os.openApp(this.system.parent, 'editor', { state: { path: this.system.kernelSourcePath } });
    });
    row.append(rb, eb); card.append(row);
    this.kernelErrEl.append(card);
  }

  hideKernelError() { this.kernelErrEl.classList.add('hidden'); clear(this.kernelErrEl); }

  showKernelErrorBadge(sysId, msg) {
    if (this.system.id !== sysId) this.os.toast(this.system, '子内核错误', `${sysId}：${msg}`, 'err');
  }

  destroy() {
    for (const w of [...this.windows]) { try { w.destroy(); } catch (e) {} }
    if (this.el?.parentNode) this.el.parentNode.removeChild(this.el);
  }
}

// ============================================================
// 窗口
// ============================================================
export class OSWindow {
  constructor(os, desktop, opts) {
    this.os = os;
    this.desktop = desktop;
    this.sys = desktop.system;
    this.systemId = this.sys.id;
    this.id = opts.id || os.newWindowId();
    this.appId = opts.appId;
    this.title = opts.title || (APP_DEFS[opts.appId]?.title || opts.appId);
    this.state = opts.state || {};
    this.minimized = false;
    this.maximized = false;
    this.closing = false;
    this.z = ++desktop.zTop;
    const work = desktop.workArea();
    const size = APP_SIZE[opts.appId] || [760, 520];
    const ww = Math.min(opts.width || size[0], Math.max(320, work.w - 20));
    const wh = Math.min(opts.height || size[1], Math.max(240, work.h - 20));
    const cascade = (desktop.system.wmConfig?.cascade ?? 26);
    const offset = (desktop.windows.length % 7) * cascade;
    let x = opts.x != null ? opts.x : Math.max(8, (work.w - ww) / 2 + offset - 40);
    let y = opts.y != null ? opts.y : Math.max(8, (work.h - wh) / 2 + offset - 50);
    if (opts.noCascade) { x = Math.max(8, (work.w - ww) / 2); y = Math.max(8, (work.h - wh) / 2); }
    this.x = clamp(x, 0, Math.max(0, work.w - 200));
    this.y = clamp(y, 0, Math.max(0, work.h - 160));
    this.w = ww; this.h = wh;
    this.restoreRect = { x: this.x, y: this.y, w: this.w, h: this.h };
    this.build(opts);
    this.app = os.createApp(this);
    if (this.app?.mount) this.app.mount(this.bodyEl);
    this._tagControls();
    try {
      this.observer = new MutationObserver(() => this._tagControls());
      this.observer.observe(this.bodyEl, { childList: true, subtree: true });
    } catch (e) {}
    this.applyRect();
  }

  build(opts) {
    const el = h('div', { class: 'app-window', 'data-testid': 'app-window', 'data-window-id': this.id, 'data-app-id': this.appId, 'data-system-id': this.sys.id });
    el.dataset.windowId = this.id;
    el.dataset.appId = this.appId;
    el.dataset.systemId = this.sys.id;
    this.el = el;
    const def = APP_DEFS[this.appId] || { icon: 'grid', color: '#9aa6c4' };
    const titlebar = h('div', { class: 'titlebar', 'data-testid': 'window-titlebar' });
    const tIcon = h('span', { class: 'title-icon' });
    tIcon.innerHTML = iconSvg(def.icon);
    const tText = h('span', { class: 'title-text' }, this.title);
    const badge = h('span', { class: 'title-badge' }, this.sys.id);
    const spacer = h('span', { class: 'title-spacer' });
    const actions = h('div', { class: 'title-actions' });
    const min = h('button', { class: 'win-btn', 'data-testid': 'window-minimize', title: '最小化', 'aria-label': '最小化' }); min.innerHTML = iconSvg('minimize');
    const max = h('button', { class: 'win-btn', 'data-testid': 'window-maximize', title: '最大化', 'aria-label': '最大化' }); max.innerHTML = iconSvg('maximize');
    const close = h('button', { class: 'win-btn close', 'data-testid': 'window-close', title: '关闭', 'aria-label': '关闭' }); close.innerHTML = iconSvg('close');
    actions.append(min, max, close);
    titlebar.append(tIcon, tText, badge, spacer, actions);
    this.titleTextEl = tText;
    const body = h('div', { class: 'window-body' });
    this.bodyEl = body;
    el.append(titlebar, body);
    const handles = h('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none' } });
    for (const dir of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
      const hd = h('div', { class: 'resize-handle rh-' + dir, 'data-testid': 'window-resize' });
      hd.style.pointerEvents = 'auto';
      hd.addEventListener('pointerdown', e => this.startResize(e, dir));
      handles.append(hd);
    }
    handles.style.zIndex = '30';
    el.append(handles);
    min.addEventListener('click', e => { e.stopPropagation(); this.minimize(); });
    max.addEventListener('click', e => { e.stopPropagation(); this.toggleMaximize(); });
    close.addEventListener('click', e => { e.stopPropagation(); this.os.closeWindow(this); });
    titlebar.addEventListener('dblclick', e => { if (!e.target.closest('button')) this.toggleMaximize(); });
    titlebar.addEventListener('pointerdown', e => { if (!e.target.closest('button')) this.startDrag(e); });
    el.addEventListener('pointerdown', () => {
      const rule = this.desktop.system.wmConfig?.focusRule;
      if (rule === 0 && this.desktop.focusWindowId !== this.id) return;
      this.desktop.focusWindow(this);
    }, true);
    this.desktop.windowsEl.appendChild(el);
  }

  _tagControls() {
    if (!this.bodyEl) return;
    for (const el of this.bodyEl.querySelectorAll('button, input, select, textarea, [contenteditable="true"], [role="button"]')) {
      if (!el.dataset.systemId) el.dataset.systemId = this.sys.id;
      if (!el.dataset.windowId) el.dataset.windowId = this.id;
    }
  }
  setTitle(t) {
    this.title = t;
    if (this.titleTextEl) this.titleTextEl.textContent = t;
    if (this.os && this.desktop) this.desktop.rebuildTaskbar();
  }
  setIcon(name) {
    const ic = this.el.querySelector('.title-icon');
    if (ic) ic.innerHTML = iconSvg(name || 'grid');
  }
  setData(k, v) { this.el.dataset[k] = v; }
  applyRect() {
    this.el.style.left = this.x + 'px';
    this.el.style.top = this.y + 'px';
    this.el.style.width = this.w + 'px';
    this.el.style.height = this.h + 'px';
  }
  applyZ() { this.el.style.zIndex = String(this.z); }
  applyMaximized() {
    if (!this.maximized) return;
    const work = this.desktop.workArea();
    this.x = 0; this.y = 0; this.w = work.w; this.h = work.h;
    this.el.classList.add('maximized');
    this.applyRect();
    this.app?.onResize?.();
  }
  toggleMaximize() {
    if (this.maximized) {
      this.maximized = false;
      this.el.classList.remove('maximized');
      Object.assign(this, this.restoreRect);
      this.applyRect();
    } else {
      this.restoreRect = { x: this.x, y: this.y, w: this.w, h: this.h };
      this.maximized = true;
      this.applyMaximized();
    }
    this.desktop.rebuildTaskbar();
    this.app?.onResize?.();
  }
  minimize() {
    this.minimized = true;
    this.el.classList.add('minimized');
    this.desktop.focusWindowId = null;
    this.desktop.nextFocus();
    this.desktop.rebuildTaskbar();
  }
  startDrag(e) {
    if (e.button !== 0) return;
    if (this.maximized) {
      // 拖动最大化窗口时恢复
      const work = this.desktop.workArea();
      const ratio = (e.clientX - this.desktop.el.getBoundingClientRect().left) / this.desktop.zoom / work.w;
      this.maximized = false; this.el.classList.remove('maximized');
      this.w = this.restoreRect.w; this.h = this.restoreRect.h;
      this.x = clamp(ratio * work.w - this.w / 2, 0, work.w - this.w);
      this.y = 0; this.applyRect();
    }
    this.desktop.focusWindow(this);
    const start = this.desktop.toLocal(e.clientX, e.clientY);
    const orig = { x: this.x, y: this.y };
    const work = this.desktop.workArea();
    let moved = false;
    const preview = h('div', { class: 'snap-preview' });
    this.desktop.overlayEl.appendChild(preview);
    const move = ev => {
      const p = this.desktop.toLocal(ev.clientX, ev.clientY);
      let nx = orig.x + (p.x - start.x);
      let ny = orig.y + (p.y - start.y);
      ny = clamp(ny, 0, work.h - 40);
      this.x = nx; this.y = ny;
      this.applyRect();
      if (Math.abs(p.x - start.x) + Math.abs(p.y - start.y) > 3) moved = true;
      let snap = null;
      if (p.x < 12) snap = 'left';
      else if (p.x > (this.desktop.width || 1200) - 12) snap = 'right';
      if (snap) {
        preview.style.display = 'block';
        preview.style.top = '0px'; preview.style.bottom = '52px';
        preview.style.left = snap === 'left' ? '0px' : '50%';
        preview.style.width = '50%';
      } else preview.style.display = 'none';
    };
    const up = ev => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      preview.remove();
      const p = this.desktop.toLocal(ev.clientX, ev.clientY);
      if (p.x < 12) this.snap('left');
      else if (p.x > (this.desktop.width || 1200) - 12) this.snap('right');
      else if (p.y < 8) this.toggleMaximize();
      this.app?.onMove?.();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }
  snap(side) {
    const work = this.desktop.workArea();
    this.maximized = false; this.el.classList.remove('maximized');
    this.x = side === 'left' ? 0 : Math.floor(work.w / 2);
    this.y = 0; this.w = Math.floor(work.w / 2); this.h = work.h;
    this.applyRect();
    this.app?.onResize?.();
  }
  startResize(e, dir) {
    e.preventDefault(); e.stopPropagation();
    this.desktop.focusWindow(this);
    const start = this.desktop.toLocal(e.clientX, e.clientY);
    const orig = { x: this.x, y: this.y, w: this.w, h: this.h };
    const move = ev => {
      const p = this.desktop.toLocal(ev.clientX, ev.clientY);
      const dx = p.x - start.x, dy = p.y - start.y;
      let x = orig.x, y = orig.y, w = orig.w, h = orig.h;
      const minW = 300, minH = 180;
      if (dir.includes('e')) w = Math.max(minW, orig.w + dx);
      if (dir.includes('s')) h = Math.max(minH, orig.h + dy);
      if (dir.includes('w')) { w = Math.max(minW, orig.w - dx); x = orig.x + (orig.w - w); }
      if (dir.includes('n')) { h = Math.max(minH, orig.h - dy); y = orig.y + (orig.h - h); }
      this.x = x; this.y = y; this.w = w; this.h = h;
      this.applyRect();
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      this.app?.onResize?.();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }
  destroy() {
    if (this.closing && this.el?.parentNode == null) return;
    this.os.destroyWindow(this);
  }
}

// 供 app 模块使用的根级类型判断
export function isRootSys(sys) { return sys && !sys.parent; }
// ============================================================
// 内建窗口应用：系统窗口、投送、程序面板
// ============================================================
export class SystemApp {
  constructor(win, os) { this.win = win; this.os = os; this.body = null; }
  mount(body) { this.body = body; }
  serialize() { return {}; }
  restore() {}
  dispose() {}
}

export class DummyApp {
  constructor(win, os) { this.win = win; this.os = os; }
  mount(body) { body.innerHTML = '<div class="empty">此应用不可用</div>'; }
  serialize() { return {}; }
  dispose() {}
}

export class PanelApp {
  constructor(win, os, state) {
    this.win = win; this.os = os; this.panelId = state?.panelId || 'demo';
    this.canvas = null; this.ctx = null;
  }
  mount(body) {
    body.style.background = '#0d1424';
    this.canvas = h('canvas', { style: { width: '100%', height: '100%', display: 'block' } });
    body.append(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.ro = new ResizeObserver(() => this.redraw());
    this.ro.observe(body);
    this.redraw();
  }
  redraw() {
    if (!this.canvas || !this.ctx) return;
    const sys = this.win.sys;
    const p = sys.panelState?.[this.panelId];
    const w = this.canvas.clientWidth || 400, h = this.canvas.clientHeight || 300;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    const ctx = this.ctx;
    ctx.fillStyle = p?.color || '#0d1424';
    ctx.fillRect(0, 0, w, h);
    for (const op of p?.ops || []) {
      if (op[0] === 'rect') {
        ctx.fillStyle = op[5] || '#6f8dff';
        ctx.fillRect(op[1], op[2], op[3], op[4]);
      } else if (op[0] === 'text') {
        ctx.fillStyle = op[4] || '#dfe7ff';
        ctx.font = '14px "Microsoft YaHei UI", sans-serif';
        ctx.fillText(String(op[3]), op[1], op[2]);
      }
    }
  }
  serialize() { return { panelId: this.panelId }; }
  restore() {}
  dispose() { this.ro?.disconnect(); }
}

export class ProjectionApp {
  constructor(win, os, state) {
    this.win = win; this.os = os;
    this.state = state || {};
    this.canvas = null; this.ctx = null; this.view = null;
    this.sourceAppId = state?.sourceAppId;
    this.drag = null;
    this.frozen = false;
  }
  mount(body) {
    body.style.background = '#080c16';
    const wrap = h('div', { class: 'projection-wrap' });
    const canvasWrap = h('div', { class: 'projection-canvas-wrap' });
    this.canvas = h('canvas', {});
    canvasWrap.append(this.canvas);
    const frozen = h('div', { class: 'projection-frozen', 'data-testid': 'projection-frozen' }, '源系统已暂停');
    canvasWrap.append(frozen);
    this.frozenEl = frozen;
    const bar = h('div', { class: 'projection-bar' });
    const src = h('span', { class: 'projection-src' }, '投送中');
    this.srcEl = src;
    bar.append(src);
    const mk = (testid, ic, title, fn) => {
      const b = h('button', { class: 'btn', title, 'data-testid': testid });
      b.innerHTML = iconSvg(ic);
      b.addEventListener('click', fn);
      bar.append(b); return b;
    };
    this.playBtn = mk('player-play', 'play', '播放', () => this.act({ type: 'toggle' }));
    this.pauseBtn = mk('player-pause', 'pause', '暂停', () => this.act({ type: 'pause' }));
    mk('player-stop', 'stop', '停止', () => this.act({ type: 'stop' }));
    mk('player-step', 'step', '逐帧', () => this.act({ type: 'step' }));
    mk('player-camera', 'camera', '镜头', () => this.act({ type: 'camera' }));
    const seek = h('input', { type: 'range', min: '0', max: '100', step: '0.01', value: '0', 'data-testid': 'player-seek', style: { flex: '1', accentColor: 'var(--accent)' } });
    this.seekEl = seek;
    seek.addEventListener('input', () => this.act({ type: 'seek', time: Number(seek.value) }));
    bar.append(seek);
    const time = h('span', { class: 'player-time', 'data-testid': 'player-time' }, '00:00.00');
    this.timeEl = time;
    bar.append(time);
    if (this.sourceAppId === 'charts') {
      this.playBtn.style.display = 'none'; this.pauseBtn.style.display = 'none';
      const t = mk('chart-type', 'charts', '切换图表类型', () => this.act({ type: 'chart-type' }));
      t.innerHTML = iconSvg('charts') + ' 类型';
      this.seekEl.style.display = 'none'; this.timeEl.style.display = 'none';
    }
    wrap.append(canvasWrap, bar);
    body.append(wrap);
    this.wrap = wrap;
    this.canvas.addEventListener('pointerdown', e => this.onDown(e));
    this.canvas.addEventListener('pointermove', e => this.onMove(e));
    this.canvas.addEventListener('pointerup', e => this.onUp(e));
    this.canvas.addEventListener('wheel', e => { e.preventDefault(); this.act({ type: 'zoom', delta: e.deltaY }); }, { passive: false });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvasWrap);
    this.resize();
    this.rebuildView();
  }
  rebuildView() {
    if (this.view) { this.view.dispose(); this.view = null; }
    const src = this.os.getWindow(this.state.sourceWindowId);
    const app = src?.app;
    if (this.sourceAppId === 'player' && app?.sceneDef && this.canvas) {
      try {
        this.view = new SceneView(this.canvas, app.sceneDef);
        this.view.resize();
      } catch (e) { console.error(e); }
      this.ctx = null;
    } else {
      this.ctx = this.canvas?.getContext('2d') || null;
    }
  }
  resize() {
    const wrap = this.canvas?.parentElement;
    if (!wrap) return;
    const w = Math.max(1, wrap.clientWidth), h = Math.max(1, wrap.clientHeight);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    if (this.view) this.view.resize();
  }
  source() { return this.os.getWindow(this.state.sourceWindowId); }
  act(action) { if (this.frozen) return; this.os.forwardProjection(this.win, action); }
  onDown(e) {
    if (e.button !== 0) return;
    this.drag = { x: e.clientX, y: e.clientY, moved: false };
    this.canvas.setPointerCapture(e.pointerId);
  }
  onMove(e) {
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 1) {
      this.drag.moved = true;
      this.act({ type: 'orbit', dx, dy });
      this.drag.x = e.clientX; this.drag.y = e.clientY;
    }
  }
  onUp(e) {
    if (!this.drag) return;
    const moved = this.drag.moved;
    this.drag = null;
    if (!moved) {
      const src = this.source();
      if (this.view) {
        const pick = this.view.pick(e.clientX, e.clientY);
        if (pick) this.act({ type: 'select', pick });
        else {
          const g = this.view.groundHit(e.clientX, e.clientY);
          if (g) this.act({ type: 'ground', x: g.x, z: g.z, y: g.y });
        }
      }
    }
  }
  render() {
    const src = this.source();
    if (!src || !src.app || src.appId !== this.sourceAppId) {
      if (this.endedShown !== true) {
        this.endedShown = true;
        if (this.srcEl) this.srcEl.textContent = '源窗口已关闭 · 投送结束';
        if (this.frozenEl) { this.frozenEl.style.display = 'flex'; this.frozenEl.textContent = '源窗口已关闭'; }
      }
      return;
    }
    this.endedShown = false;
    const sys = src.desktop.system;
    if (sys.state === 'stopped' || sys.state === 'error') {
      if (this.srcEl) this.srcEl.textContent = '源系统已停止 · 投送结束';
      if (this.frozenEl) { this.frozenEl.style.display = 'flex'; this.frozenEl.textContent = '源系统已停止'; }
      return;
    }
    const frozen = sys.state === 'paused' || sys.effectiveState === 'paused' || sys.effectiveState === 'blocked';
    if (this.playBtn) this.playBtn.disabled = frozen;
    if (this.pauseBtn) this.pauseBtn.disabled = frozen;
    if (this.seekEl) this.seekEl.disabled = frozen || this.sourceAppId === 'charts';
    this.frozen = frozen;
    if (this.frozenEl) this.frozenEl.style.display = frozen ? 'flex' : 'none';
    const label = `${this.sourceAppId === 'player' ? '播放器' : '图表'} · ${src.systemId} · ${src.id}`;
    if (this.srcEl) this.srcEl.textContent = label;
    if (frozen) return;
    if (this.sourceAppId === 'player') {
      if (!this.view || (src.app.sceneDef && this.view.def !== src.app.sceneDef)) this.rebuildView();
      const st = src.app.sceneState ? src.app.sceneState() : null;
      if (st && this.view) {
        this.view.update(st);
        if (this.timeEl) this.timeEl.textContent = fmtTime(st.time || 0);
        if (this.seekEl && document.activeElement !== this.seekEl) {
          const dur = st.duration || 1;
          this.seekEl.max = String(dur);
          this.seekEl.value = String(st.time || 0);
        }
      }
    } else if (this.sourceAppId === 'charts') {
      const ctx = this.ctx;
      if (ctx && src.app.drawChart) {
        const w = this.canvas.width, h = this.canvas.height;
        src.app.drawChart(ctx, w, h, { interactive: false });
      }
    }
  }
  rebind() { this.state.sourceSystemId = this.win.state?.sourceSystemId; this.rebuildView(); }
  serialize() { return { ...this.state }; }
  dispose() { this.ro?.disconnect(); this.view?.dispose(); this.view = null; }
}
