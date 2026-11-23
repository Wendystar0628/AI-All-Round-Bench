// Root Operating System ('outer')
// Coordinates Root Desktop, Window Manager, VFS persistence (--data-dir), Settings,
// Widgets & Notifications, Root .nos processes, Direct Child Subsystem Carriers,
// Cross-Layer Live Data Broker, Cross-Layer Projection Host, Cross-Layer File Drag-Drop,
// Subtree Snapshot/Restore/Fork, & window.bench Automation API.

import { createVM, runVM, replySyscall, computeVMMemBytes, deepCloneValue } from '../vm/vm.js';
import { compileNOS } from '../vm/compiler_bootstrap.js';
import { createDefaultOuterVfs, createSeedInnerVfs, buildPrecompiledMap } from '../fixtures/default_files.js';
import { SharedRenderer3D } from '../display/renderer3d.js';
import { SubsystemDisplayDevice } from '../display/display_device.js';
import { iconHtml } from '../display/icons.js';
import { mountSpreadsheetApp } from './spreadsheet.js';
import { mountBrowserApp } from './browser.js';
import { mountRootFilesApp } from './files_app.js';
import { renderWidgetsContent } from './widgets_app.js';
import { mountRootEditorApp } from './editor_app.js';
import { mountRootTasksApp } from './tasks_app.js';
import { mountRootSettingsApp, WALLPAPERS } from './settings_app.js';
import { mountRootHelpApp } from './help_app.js';

function normPath(p) {
  if (!p) return '/';
  let s = String(p).trim();
  if (!s.startsWith('/')) s = '/' + s;
  const parts = s.split('/');
  const out = [];
  for (const seg of parts) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return '/' + out.join('/');
}

function parentDir(p) {
  const np = normPath(p);
  if (np === '/') return '/';
  const parts = np.split('/');
  parts.pop();
  return parts.length <= 1 ? '/' : parts.join('/');
}

function baseName(p) {
  const np = normPath(p);
  if (np === '/') return '/';
  return np.split('/').pop();
}

function hashStr32(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16);
}

export class RootOS {
  constructor(mountEl, nosSources) {
    this.mountEl = mountEl;
    this.nosSources = nosSources;
    this.precompiled = buildPrecompiledMap(nosSources);
    this.renderer3d = new SharedRenderer3D();

    this.displayDevice = new SubsystemDisplayDevice(this.renderer3d, {
      sendRawEvent: (sysId, ev) => this.sendRawEventToChild(sysId, ev),
      sendControlAction: (sysId, ev) => this.routeControlAction(sysId, ev),
      getSystemPauseReason: (sysId) => this.getSystemPauseReason(sysId),
    });

    // Global state
    this.vtime = 0;
    this.budgetConfig = 520000;
    this.memQuota = 384 * 1048576;
    this.storageQuota = 96 * 1048576;
    this.lastTickUsed = 0;

    this.nextSubSeq = 1;
    this.nextWinSeq = 1;
    this.nextRootPid = 1;
    this.workbookSeq = 0;

    this.vfs = {};
    this.vfsListeners = new Set();
    this.compilerBc = null;
    this.compilerHash = '';
    this.compilerModified = false;
    this.compileCache = new Map();

    this.settings = {
      systemName: '主境 OS',
      wallpaper: 'alpine',
      accent: '#38bdf8',
      scale: 1,
      dnd: false,
    };

    this.widgetsState = {
      calYear: null,
      calMonth: null,
      timerInputSec: 5,
      timerRemaining: 5,
      timerRunning: false,
      timerLastTick: 0,
      swRunning: false,
      swElapsedMs: 0,
      swLastTick: 0,
      noteText: '',
    };

    this.clipboardHistory = [];
    this.notifications = [];
    this.unreadNotifs = 0;

    this.windows = []; // { id, appId, title, x, y, w, h, z, state, minimized, focused, el, bodyEl, controller, ... }
    this.focusedWinId = null;
    this.zCounter = 20;

    this.rootProcs = []; // Root custom .nos processes
    this.children = new Map(); // childId -> carrier object
    this.lastSnapshots = new Map(); // childId -> last snap path
    this.openWorkbooks = new Map(); // docId -> workbook descriptor
    this.browsers = new Map(); // winId -> browser controller
    this.liveSubs = new Map(); // `${sysId}:${winId}` -> subscription + external queue
    this.projections = new Map(); // `${srcSysId}:${srcWinId}` -> root projection window

    this.startMenuOpen = false;
    this.widgetsOpen = false;
    this.notifsOpen = false;
    this.isReady = false;
    this.readyResolvers = [];
    this._saveTimer = null;

    this._initDataFromDisk();
    this._buildShellDOM();
    this._initCrossLayerDragDrop();
    this._applySettingsToDOM();
    this._startLoop();

    this.isReady = true;
    this.readyResolvers.forEach((fn) => fn());
    this.readyResolvers = [];
  }

  // ==================== Persistence (--data-dir) ====================

  _initDataFromDisk() {
    let loadedVfs = null;
    let loadedCfg = null;
    try {
      const vRaw = window.nestedHost?.readDataFile?.('outer_vfs.json');
      if (vRaw) loadedVfs = JSON.parse(vRaw);
    } catch {}
    try {
      const cRaw = window.nestedHost?.readDataFile?.('outer_settings.json');
      if (cRaw) loadedCfg = JSON.parse(cRaw);
    } catch {}

    this.vfs = loadedVfs && typeof loadedVfs === 'object' && loadedVfs['/']
      ? loadedVfs
      : createDefaultOuterVfs(this.nosSources);

    // Ensure essential system scripts exist
    if (!this.vfs['/sys/kernel.nos'] || !this.vfs['/sys/compiler.bc']) {
      const defaults = createDefaultOuterVfs(this.nosSources);
      for (const [k, v] of Object.entries(defaults)) {
        if (!this.vfs[k]) this.vfs[k] = v;
      }
    }

    if (loadedCfg) {
      if (loadedCfg.settings) Object.assign(this.settings, loadedCfg.settings);
      if (loadedCfg.noteText !== undefined) this.widgetsState.noteText = loadedCfg.noteText;
    }

    this._loadRootCompiler();
  }

  _scheduleSaveVfs() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      try {
        window.nestedHost?.writeDataFile?.('outer_vfs.json', JSON.stringify(this.vfs));
      } catch {}
    }, 350);
  }

  saveSettingsAndWidgets() {
    try {
      window.nestedHost?.writeDataFile?.(
        'outer_settings.json',
        JSON.stringify({ settings: this.settings, noteText: this.widgetsState.noteText })
      );
    } catch {}
  }

  async resetToInitialState() {
    // Close all windows & subsystems cleanly
    for (const w of [...this.windows]) {
      this.closeWindow(w.id, true);
    }
    this.children.clear();
    this.rootProcs = [];
    this.liveSubs.clear();
    this.projections.clear();
    this.openWorkbooks.clear();
    this.browsers.clear();
    this.lastSnapshots.clear();
    this.clipboardHistory = [];
    this.notifications = [];
    this.unreadNotifs = 0;

    this.nextSubSeq = 1;
    this.nextWinSeq = 1;
    this.nextRootPid = 1;
    this.workbookSeq = 0;
    this.vtime = 0;
    this.budgetConfig = 520000;
    this.memQuota = 384 * 1048576;
    this.storageQuota = 96 * 1048576;

    this.settings = {
      systemName: '主境 OS',
      wallpaper: 'alpine',
      accent: '#38bdf8',
      scale: 1,
      dnd: false,
    };
    const now = new Date();
    this.widgetsState = {
      calYear: now.getFullYear(),
      calMonth: now.getMonth(),
      timerInputSec: 5,
      timerRemaining: 5,
      timerRunning: false,
      timerLastTick: 0,
      swRunning: false,
      swElapsedMs: 0,
      swLastTick: 0,
      noteText: '',
    };

    this.vfs = createDefaultOuterVfs(this.nosSources);
    this.compilerModified = false;
    this.compileCache.clear();
    this._loadRootCompiler();
    this._scheduleSaveVfs();
    this.saveSettingsAndWidgets();

    this.startMenuOpen = false;
    this.widgetsOpen = false;
    this.notifsOpen = false;
    this._hideAllPopups();
    this._applySettingsToDOM();
    this._renderTaskbar();
    this.renderer3d.clearAllScenes();
    return true;
  }

  // ==================== Root VFS ====================

  onVfsChange(fn) {
    this.vfsListeners.add(fn);
    return () => this.vfsListeners.delete(fn);
  }

  _emitVfsChange() {
    this._scheduleSaveVfs();
    for (const fn of this.vfsListeners) {
      try { fn(); } catch {}
    }
  }

  getStorageUsed() {
    let total = 0;
    for (const node of Object.values(this.vfs)) {
      if (node && node.kind === 'file') total += node.size || 0;
    }
    return total;
  }

  vfsEnsureDir(dirPath) {
    const np = normPath(dirPath);
    if (this.vfs[np]) return;
    const parts = np.split('/').filter(Boolean);
    let cur = '';
    for (const seg of parts) {
      cur += '/' + seg;
      if (!this.vfs[cur]) this.vfs[cur] = { kind: 'dir', size: 0, mtime: Date.now() / 1000 };
    }
  }

  vfsList(dirPath) {
    const np = normPath(dirPath);
    if (!this.vfs[np] || this.vfs[np].kind !== 'dir') return { ok: false, error: `目录不存在: ${np}`, entries: [] };
    const entries = [];
    for (const [p, node] of Object.entries(this.vfs)) {
      if (p === np || p === '/') continue;
      if (parentDir(p) === np) {
        entries.push({ name: baseName(p), path: p, kind: node.kind, size: node.size || 0, mtime: node.mtime, origPath: node.origPath });
      }
    }
    entries.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
    return { ok: true, path: np, entries };
  }

  vfsRead(path) {
    const np = normPath(path);
    const node = this.vfs[np];
    if (!node || node.kind !== 'file') return { ok: false, error: `文件不存在: ${np}` };
    return { ok: true, path: np, content: node.content, size: node.size };
  }

  vfsWrite(path, content) {
    const np = normPath(path);
    const text = String(content ?? '');
    const oldSize = this.vfs[np]?.kind === 'file' ? (this.vfs[np].size || 0) : 0;
    const delta = text.length - oldSize;
    if (this.getStorageUsed() + delta > this.storageQuota) {
      return { ok: false, error: '根系统存储配额不足' };
    }
    this.vfsEnsureDir(parentDir(np));
    this.vfs[np] = { kind: 'file', content: text, size: text.length, mtime: Date.now() / 1000 };
    this._emitVfsChange();
    return { ok: true, path: np, size: text.length };
  }

  vfsMkdir(path) {
    const np = normPath(path);
    this.vfsEnsureDir(np);
    this._emitVfsChange();
    return { ok: true, path: np };
  }

  vfsDelete(path) {
    const np = normPath(path);
    if (np === '/' || !this.vfs[np]) return { ok: false, error: '路径不存在' };
    const node = this.vfs[np];
    if (np.startsWith('/Trash/')) {
      delete this.vfs[np];
      this._emitVfsChange();
      return { ok: true, permanent: true };
    }
    if (node.kind === 'dir') {
      const prefix = np + '/';
      for (const k of Object.keys(this.vfs)) {
        if (k === np || k.startsWith(prefix)) delete this.vfs[k];
      }
      this._emitVfsChange();
      return { ok: true };
    }
    this.vfsEnsureDir('/Trash');
    let base = baseName(np);
    let tp = '/Trash/' + base;
    let seq = 1;
    while (this.vfs[tp]) tp = `/Trash/${seq++}_${base}`;
    this.vfs[tp] = { ...node, origPath: np, mtime: Date.now() / 1000 };
    delete this.vfs[np];
    this._emitVfsChange();
    return { ok: true, trashPath: tp };
  }

  vfsRestore(trashPath) {
    const np = normPath(trashPath);
    const node = this.vfs[np];
    if (!node) return { ok: false, error: '文件不存在' };
    const orig = node.origPath || `/Documents/${baseName(np)}`;
    this.vfsEnsureDir(parentDir(orig));
    this.vfs[orig] = { kind: 'file', content: node.content, size: node.size, mtime: Date.now() / 1000 };
    delete this.vfs[np];
    this._emitVfsChange();
    return { ok: true, path: orig };
  }

  vfsCopy(src, dst) {
    const rd = this.vfsRead(src);
    if (!rd.ok) return rd;
    return this.vfsWrite(dst, rd.content);
  }

  vfsMove(src, dst) {
    const s = normPath(src);
    const d = normPath(dst);
    if (!this.vfs[s]) return { ok: false, error: '源文件不存在' };
    if (s === d) return { ok: true, path: d };
    this.vfsEnsureDir(parentDir(d));
    this.vfs[d] = this.vfs[s];
    delete this.vfs[s];
    this._emitVfsChange();
    return { ok: true, path: d };
  }

  vfsStat(path) {
    const np = normPath(path);
    const n = this.vfs[np];
    if (!n) return { ok: false };
    return { ok: true, path: np, kind: n.kind, size: n.size || 0 };
  }

  // ==================== Root Self-Hosting Compiler ====================

  _loadRootCompiler() {
    const rd = this.vfsRead('/sys/compiler.bc');
    if (rd.ok) {
      try {
        this.compilerBc = JSON.parse(rd.content);
        this.compilerHash = hashStr32(rd.content);
        this.compileCache.clear();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }
    return { ok: false, error: '缺少 /sys/compiler.bc' };
  }

  compileWithRootCompiler(src) {
    const sh = hashStr32(src);
    const ck = `${this.compilerHash}:${sh}`;
    if (this.compileCache.has(ck)) return { ok: true, bytecode: this.compileCache.get(ck) };
    if (!this.compilerModified && this.precompiled[sh]) {
      this.compileCache.set(ck, this.precompiled[sh]);
      return { ok: true, bytecode: this.precompiled[sh] };
    }
    if (!this.compilerBc) {
      const lr = this._loadRootCompiler();
      if (!lr.ok) return lr;
    }
    const cvm = createVM(this.compilerBc, { COMPILE_SRC: src });
    let r;
    let total = 0;
    while (total < 40000000) {
      r = runVM(cvm, 1000000, this.memQuota);
      total += r.stepsUsed;
      if (r.status === 'exited') {
        if (r.value?.ok) {
          this.compileCache.set(ck, r.value.bytecode);
          return { ok: true, bytecode: r.value.bytecode };
        }
        return { ok: false, error: r.value?.error || '编译失败' };
      }
      if (r.status === 'error') return { ok: false, error: r.error };
      if (r.status === 'syscall') replySyscall(cvm, null);
    }
    return { ok: false, error: '编译超时' };
  }

  selfHostRootCompiler() {
    const rd = this.vfsRead('/sys/compiler.nos');
    if (!rd.ok) return { ok: false, error: '找不到 /sys/compiler.nos' };
    this.compilerModified = true;
    const comp = this.compileWithRootCompiler(rd.content);
    if (!comp.ok) return comp;
    const jsonStr = JSON.stringify(comp.bytecode);
    const wr = this.vfsWrite('/sys/compiler.bc', jsonStr);
    if (!wr.ok) return wr;
    this._loadRootCompiler();
    return { ok: true, funcs: comp.bytecode.funcs.length, bytes: jsonStr.length };
  }

  // ==================== Root Custom .nos Process Runner ====================

  spawnRootProgram(path, args = {}) {
    const rd = this.vfsRead(path);
    if (!rd.ok) return { ok: false, error: rd.error };
    const comp = this.compileWithRootCompiler(rd.content);
    if (!comp.ok) return { ok: false, error: comp.error };
    const ctx = createVM(comp.bytecode, { ARGS: args });
    const proc = {
      pid: this.nextRootPid++,
      name: baseName(path),
      path: rd.path,
      state: 'ready',
      prevState: 'ready',
      wakeAt: -1,
      ctx,
      inbox: [],
      stepsTick: 0,
      stepsTotal: 0,
      pendingWork: 0,
      memBytes: computeVMMemBytes(ctx),
      logs: [],
      result: null,
      error: null,
    };
    this.rootProcs.push(proc);
    return { ok: true, pid: proc.pid };
  }

  controlRootProc(pid, act) {
    const p = this.rootProcs.find((x) => x.pid === pid);
    if (!p) return;
    if (act === 'suspend' && p.state !== 'exited' && p.state !== 'error') {
      p.prevState = p.state;
      p.state = 'suspended';
    } else if (act === 'resume' && p.state === 'suspended') {
      p.state = p.prevState;
    } else if (act === 'kill') {
      p.state = 'exited';
      p.ctx = null;
      p.memBytes = 0;
    }
  }

  // ==================== Direct Child Subsystem Carrier Lifecycle ====================

  allocGlobalSystemId() {
    return `inner-${this.nextSubSeq++}`;
  }

  createChildSystem(customName = null) {
    const childId = this.allocGlobalSystemId();
    const cname = customName || `子系统 ${childId}`;
    const ktpl = this.vfsRead('/sys/kernel.nos');
    if (!ktpl.ok) return { ok: false, error: '找不到 /sys/kernel.nos' };

    const kpath = `/Systems/${childId}/kernel.nos`;
    const wr = this.vfsWrite(kpath, ktpl.content);
    if (!wr.ok) return wr;

    const grantCap = Math.max(80000, Math.floor(this.budgetConfig * 0.65));
    const memCap = Math.floor(this.memQuota * 0.65);
    const storageCap = Math.floor(this.storageQuota * 0.65);
    const seedVfs = createSeedInnerVfs(this.vfs);

    const comp = this.compileWithRootCompiler(ktpl.content);
    const carrier = {
      id: childId,
      name: cname,
      kernelPath: kpath,
      state: comp.ok ? 'running' : 'error',
      paused: false,
      stepReq: 0,
      timeRate: 1.0,
      grantCap,
      memCap,
      storageCap,
      ctx: null,
      viewport: { w: 940, h: 600 },
      rawEvents: [],
      commands: [],
      lastDisplay: null,
      lastMetrics: null,
      savedVfs: seedVfs,
      error: comp.ok ? null : comp.error,
      selfStepsTick: 0,
      childStepsTick: 0,
      memBytes: 0,
      windowId: null,
    };

    if (comp.ok) {
      const bootPayload = {
        systemId: childId,
        parentId: 'outer',
        name: cname,
        depth: 1,
        budgetConfig: grantCap,
        memQuota: memCap,
        storageQuota: storageCap,
        seedVfs,
        precompiled: this.precompiled,
      };
      carrier.ctx = createVM(comp.bytecode, { BOOT: bootPayload });
      carrier.memBytes = computeVMMemBytes(carrier.ctx);
    }

    this.children.set(childId, carrier);
    const win = this.openSubsystemWindow(carrier);
    carrier.windowId = win.id;
    return { ok: comp.ok, childId, error: carrier.error };
  }

  _extractPreservedStateFromCtx(ctx) {
    if (!ctx?.module || !ctx.globals) return { vfs: null, children: [] };
    const idx = ctx.module.globals.indexOf('KSTATE');
    if (idx < 0) return { vfs: null, children: [] };
    const cst = ctx.globals[idx];
    if (!cst?.vfs) return { vfs: null, children: [] };
    const subChildren = [];
    for (const p of (cst.procs || [])) {
      if (p.kind === 'carrier' && p.state !== 'exited' && p.childId) {
        const sub = this._extractPreservedStateFromCtx(p.ctx);
        subChildren.push({
          childId: p.childId,
          name: p.childName,
          savedVfs: sub.vfs,
          subChildren: sub.children,
        });
      }
    }
    return { vfs: deepCloneValue(cst.vfs), children: subChildren };
  }

  _markRestoredCtx(ctx) {
    if (!ctx?.module || !ctx.globals) return;
    const idx = ctx.module.globals.indexOf('KSTATE');
    if (idx < 0) return;
    const cst = ctx.globals[idx];
    if (!cst) return;
    cst.outbound = [];
    // Mark chart receivers as restored_pending_reconnect
    for (const sub of Object.values(cst.liveSubs || {})) {
      if (sub?.recvPid) {
        const p = (cst.procs || []).find((x) => x.pid === sub.recvPid);
        if (p && p.state !== 'exited') {
          p.inbox.push({ fromPid: 0, fromGen: 0, toPid: p.pid, toGen: p.gen, sentAt: cst.vtime, data: { type: 'live_restored_pending' }, bytes: 64 });
          if (p.state === 'waiting_msg') {
            p.state = 'ready';
            p.wakeAt = -1;
            replySyscall(p.ctx, p.inbox.shift());
          }
        }
      }
    }
    cst.liveSubs = {};
    for (const p of (cst.procs || [])) {
      if (p.kind === 'carrier' && p.ctx) this._markRestoredCtx(p.ctx);
    }
  }

  _remapForkCtx(ctx, newId, newParentId, newName) {
    if (!ctx?.module || !ctx.globals) return;
    const idx = ctx.module.globals.indexOf('KSTATE');
    if (idx < 0) return;
    const cst = ctx.globals[idx];
    if (!cst) return;
    const oldId = cst.systemId;
    cst.systemId = newId;
    cst.parentId = newParentId;
    if (newName) cst.name = newName;
    cst.activeProjections = {};
    cst.outbound = [];
    this._markRestoredCtx(ctx);

    const childMap = {};
    for (const p of (cst.procs || [])) {
      if (p.kind === 'carrier' && p.state !== 'exited' && p.childId) {
        const oldCid = p.childId;
        const freshCid = this.allocGlobalSystemId();
        p.childId = freshCid;
        childMap[oldCid] = freshCid;
        const oldK = `/Systems/${oldCid}/kernel.nos`;
        const newK = `/Systems/${freshCid}/kernel.nos`;
        if (cst.vfs[oldK]) {
          cst.vfs[`/Systems/${freshCid}`] = { kind: 'dir', size: 0, mtime: cst.vtime };
          cst.vfs[newK] = cst.vfs[oldK];
          delete cst.vfs[oldK];
        }
        p.path = newK;
        if (cst.childDisplays?.[oldCid]) {
          cst.childDisplays[freshCid] = cst.childDisplays[oldCid];
          delete cst.childDisplays[oldCid];
        }
        this._remapForkCtx(p.ctx, freshCid, newId, null);
      }
    }
    if (cst.wmDisplay?.windows) {
      cst.wmDisplay.systemId = newId;
      for (const dw of cst.wmDisplay.windows) {
        if (dw.appId === 'subsystem' && dw.childId && childMap[dw.childId]) {
          dw.childId = childMap[dw.childId];
        }
      }
    }
    const wmProc = (cst.procs || []).find((x) => x.pid === cst.wmPid);
    if (wmProc && wmProc.state !== 'exited') {
      const msg = {
        fromPid: 0,
        fromGen: 0,
        toPid: wmProc.pid,
        toGen: wmProc.gen,
        sentAt: cst.vtime,
        data: { type: 'system_id_remapped', oldId, newId, childMap },
        bytes: 96,
      };
      if (wmProc.state === 'waiting_msg' && wmProc.ctx) {
        wmProc.state = 'ready';
        wmProc.wakeAt = -1;
        replySyscall(wmProc.ctx, msg);
      } else {
        wmProc.inbox.push(msg);
      }
    }
  }

  restartChildSystem(childId) {
    const c = this.children.get(childId);
    if (!c) return { ok: false, error: `找不到子系统 ${childId}` };
    const preserved = this._extractPreservedStateFromCtx(c.ctx);
    const rd = this.vfsRead(c.kernelPath);
    if (!rd.ok) {
      c.state = 'error';
      c.ctx = null;
      c.error = `找不到内核源文件 ${c.kernelPath}`;
      return { ok: false, error: c.error };
    }
    this._endProjectionsUnderSubtree(childId, '子系统重启');
    this._removeLiveSubsUnderSubtree(childId);

    const comp = this.compileWithRootCompiler(rd.content);
    if (!comp.ok) {
      c.state = 'error';
      c.ctx = null;
      c.error = `内核编译错误: ${comp.error}`;
      if (preserved.vfs) c.savedVfs = preserved.vfs;
      this.notify('子系统内核错误', `${childId}: ${comp.error}`);
      return { ok: false, error: c.error };
    }

    const seedVfs = preserved.vfs || c.savedVfs || createSeedInnerVfs(this.vfs);
    const bootPayload = {
      systemId: childId,
      parentId: 'outer',
      name: c.name,
      depth: 1,
      budgetConfig: c.grantCap,
      memQuota: c.memCap,
      storageQuota: c.storageCap,
      seedVfs,
      restartChildren: preserved.children,
      precompiled: this.precompiled,
    };
    c.ctx = createVM(comp.bytecode, { BOOT: bootPayload });
    c.state = 'running';
    c.paused = false;
    c.error = null;
    c.rawEvents = [];
    c.commands = [];
    c.lastDisplay = null;
    c.savedVfs = seedVfs;
    c.memBytes = computeVMMemBytes(c.ctx);
    return { ok: true };
  }

  controlChildSystem(childId, cmd) {
    const c = this.children.get(childId);
    if (!c) return { ok: false, error: `未找到子系统 ${childId}` };
    const act = cmd.action;
    if (act === 'pause') {
      c.paused = true;
      return { ok: true };
    }
    if (act === 'resume') {
      c.paused = false;
      this._flushLiveQueues();
      return { ok: true };
    }
    if (act === 'step') {
      if (c.paused) c.stepReq += 1;
      return { ok: true };
    }
    if (act === 'set_rate') {
      c.timeRate = Math.max(0.1, Math.min(8.0, Number(cmd.rate) || 1));
      c.commands.push({ type: 'set_rate', rate: c.timeRate });
      return { ok: true };
    }
    if (act === 'set_grant') {
      c.grantCap = Math.max(5000, Math.floor(Number(cmd.grant) || 80000));
      return { ok: true };
    }
    if (act === 'restart') return this.restartChildSystem(childId);
    if (act === 'open_kernel') {
      this.openApp('editor', { openPath: c.kernelPath });
      return { ok: true };
    }
    if (act === 'close') {
      this._stopChildCarrier(childId);
      if (c.windowId) this.closeWindow(c.windowId, true);
      return { ok: true };
    }
    return { ok: false, error: `未知动作 ${act}` };
  }

  _stopChildCarrier(childId) {
    const c = this.children.get(childId);
    if (!c) return;
    this._endProjectionsUnderSubtree(childId, '源子系统已停止');
    this._removeLiveSubsUnderSubtree(childId);
    c.ctx = null;
    this.children.delete(childId);
  }

  snapshotChildSystem(childId, snapPath = null) {
    const c = this.children.get(childId);
    if (!c || !c.ctx) return { ok: false, error: '目标子系统未运行，无法创建快照' };
    const ksrc = this.vfsRead(c.kernelPath);
    const snapObj = {
      format: 'nos-snapshot-v1',
      childId,
      childName: c.name,
      savedAt: this.vtime,
      kernelSource: ksrc.ok ? ksrc.content : '',
      childTimeRate: c.timeRate,
      childPaused: c.paused,
      childGrantCap: c.grantCap,
      childMemCap: c.memCap,
      childStorageCap: c.storageCap,
      carrierCtx: deepCloneValue(c.ctx),
    };
    const text = JSON.stringify(snapObj);
    const targetPath = snapPath || `/Systems/${childId}_snap_${Math.floor(this.vtime * 10)}.snap`;
    const wr = this.vfsWrite(targetPath, text);
    if (!wr.ok) return wr;
    this.lastSnapshots.set(childId, targetPath);
    this.notify('子树快照已保存', `${targetPath} (${(wr.size / 1024).toFixed(1)} KB)`);
    return { ok: true, path: targetPath, size: wr.size };
  }

  restoreChildSnapshot(childId, snapPath) {
    const c = this.children.get(childId);
    if (!c) return { ok: false, error: `目标子系统 ${childId} 不存在` };
    const rd = this.vfsRead(snapPath);
    if (!rd.ok) return rd;
    try {
      const snap = JSON.parse(rd.content);
      if (snap.format !== 'nos-snapshot-v1') return { ok: false, error: '无效的快照文件格式' };
      if (snap.kernelSource) this.vfsWrite(c.kernelPath, snap.kernelSource);
      c.ctx = snap.carrierCtx;
      c.state = 'running';
      c.error = null;
      c.paused = Boolean(snap.childPaused);
      c.timeRate = snap.childTimeRate || 1.0;
      c.rawEvents = [];
      c.commands = [];
      this._removeLiveSubsUnderSubtree(childId);
      this._markRestoredCtx(c.ctx);
      this._reconcileOuterProjectionsAfterRestore(childId, c.ctx);
      c.memBytes = computeVMMemBytes(c.ctx);
      // Force one display presentation pulse even if paused so first frame = snapshot state!
      this._syncDisplayFromCtx(c);
      this.notify('快照已恢复', `${childId} 已恢复至 ${snapPath}`);
      return { ok: true, path: snapPath };
    } catch (e) {
      return { ok: false, error: `快照损坏: ${e.message}` };
    }
  }

  forkChildSnapshot(snapPath, newName = null) {
    const rd = this.vfsRead(snapPath);
    if (!rd.ok) return rd;
    try {
      const snap = JSON.parse(rd.content);
      if (snap.format !== 'nos-snapshot-v1') return { ok: false, error: '无效的快照文件格式' };
      const freshId = this.allocGlobalSystemId();
      const cname = newName || `分叉 ${freshId}`;
      const kpath = `/Systems/${freshId}/kernel.nos`;
      const wr = this.vfsWrite(kpath, snap.kernelSource || this.vfsRead('/sys/kernel.nos').content);
      if (!wr.ok) return wr;

      const ctxCopy = snap.carrierCtx;
      this._remapForkCtx(ctxCopy, freshId, 'outer', cname);

      const carrier = {
        id: freshId,
        name: cname,
        kernelPath: kpath,
        state: 'running',
        paused: Boolean(snap.childPaused),
        stepReq: 0,
        timeRate: snap.childTimeRate || 1.0,
        grantCap: snap.childGrantCap || Math.floor(this.budgetConfig * 0.65),
        memCap: snap.childMemCap || Math.floor(this.memQuota * 0.65),
        storageCap: snap.childStorageCap || Math.floor(this.storageQuota * 0.65),
        ctx: ctxCopy,
        viewport: { w: 920, h: 580 },
        rawEvents: [],
        commands: [],
        lastDisplay: null,
        lastMetrics: null,
        savedVfs: null,
        error: null,
        selfStepsTick: 0,
        childStepsTick: 0,
        memBytes: computeVMMemBytes(ctxCopy),
        windowId: null,
      };
      this.children.set(freshId, carrier);
      this._syncDisplayFromCtx(carrier);
      const win = this.openSubsystemWindow(carrier);
      carrier.windowId = win.id;
      this.notify('已分叉独立子树', `${freshId} (源自 ${snapPath})`);
      return { ok: true, childId: freshId };
    } catch (e) {
      return { ok: false, error: `分叉失败: ${e.message}` };
    }
  }

  restoreLastSnapshotForChild(childId) {
    const sp = this.lastSnapshots.get(childId);
    if (!sp) return { ok: false, error: `尚未为 ${childId} 创建快照` };
    return this.restoreChildSnapshot(childId, sp);
  }

  forkLastSnapshotForChild(childId) {
    const sp = this.lastSnapshots.get(childId);
    if (!sp) return { ok: false, error: `尚未为 ${childId} 创建快照` };
    return this.forkChildSnapshot(sp);
  }

  _reconcileOuterProjectionsAfterRestore(childId, rootCtx) {
    // 按逻辑身份核对快照范围外 (outer) 已打开的投送窗口：
    // 若源窗口在恢复后的子树中仍存在，保持外框原位并重新绑定源系统投送；若不再存在，则结束投送
    const sysWindows = new Map(); // sysId -> { cst, winMap }
    const walk = (ctx) => {
      if (!ctx?.module || !ctx.globals) return;
      const idx = ctx.module.globals.indexOf('KSTATE');
      if (idx < 0) return;
      const cst = ctx.globals[idx];
      if (!cst) return;
      const wMap = new Map();
      for (const w of (cst.wmWindowsMeta || [])) wMap.set(w.id, w);
      for (const wid of Object.keys(cst.appDisplays || {})) {
        if (!wMap.has(wid)) wMap.set(wid, { id: wid, appId: 'player', title: wid });
      }
      sysWindows.set(cst.systemId, { cst, wMap });
      for (const p of (cst.procs || [])) {
        if (p.kind === 'carrier' && p.ctx) walk(p.ctx);
      }
    };
    walk(rootCtx);

    for (const [key, pWin] of [...this.projections.entries()]) {
      if (!sysWindows.has(pWin.sourceSystemId) && pWin.sourceSystemId !== childId) continue;
      const info = sysWindows.get(pWin.sourceSystemId);
      const srcWin = info?.wMap.get(pWin.sourceWindowId);
      if (!srcWin) {
        this._endProjectionByKey(key, '快照恢复后源窗口已不存在');
      } else {
        // 保持外框当前位置不变，重新绑定源系统投送并立即同步恢复时刻画面
        info.cst.activeProjections[pWin.sourceWindowId] = {
          sourceSystemId: pWin.sourceSystemId,
          sourceWindowId: pWin.sourceWindowId,
          sourceAppId: pWin.sourceAppId,
          sourceTitle: srcWin.title || pWin.sourceAppId,
          sourceDepth: info.cst.depth,
          targetSystemId: 'outer',
        };
        const ui = info.cst.appDisplays?.[pWin.sourceWindowId];
        const sc = info.cst.appScenes?.[pWin.sourceWindowId];
        if (ui) {
          pWin.projData = {
            sourceSystemId: pWin.sourceSystemId,
            sourceWindowId: pWin.sourceWindowId,
            sourceAppId: pWin.sourceAppId,
            sourceTitle: srcWin.title || pWin.sourceAppId,
            ui: deepCloneValue(ui),
            scene3d: sc ? deepCloneValue(sc) : null,
          };
          this._renderOuterProjectionWindow(pWin);
        }
      }
    }
  }

  _syncDisplayFromCtx(carrier) {
    if (!carrier?.ctx?.module) return;
    const idx = carrier.ctx.module.globals.indexOf('KSTATE');
    if (idx < 0) return;
    const cst = carrier.ctx.globals[idx];
    if (cst?.wmDisplay) {
      carrier.lastDisplay = deepCloneValue(cst.wmDisplay);
      carrier.lastDisplay.systemId = carrier.id;
    }
  }

  openSnapshotDialog(snapPath) {
    const directIds = Array.from(this.children.keys());
    const buttons = [
      { label: '分叉为新子系统', kind: 'primary', onClick: () => this.forkChildSnapshot(snapPath) },
    ];
    if (directIds.length > 0) {
      buttons.push({
        label: `恢复到 ${directIds[0]}`,
        kind: 'danger',
        onClick: () => this.restoreChildSnapshot(directIds[0], snapPath),
      });
    }
    buttons.push({ label: '取消', kind: 'secondary', onClick: () => {} });
    this.showConfirmModal({
      title: '打开子树快照文件',
      message: `快照文件：${snapPath}\n可选择恢复到现有子系统，或从中分叉启动全新的独立子树。`,
      buttons,
    });
  }

  // ==================== Cross-Layer Routing, Live Data & Projection ====================

  _findDirectAncestorOf(sysId) {
    if (this.children.has(sysId)) return this.children.get(sysId);
    const hasDesc = (m, target) => {
      if (!m?.children) return false;
      for (const ch of m.children) {
        if (ch.systemId === target || hasDesc(ch, target)) return true;
      }
      return false;
    };
    for (const c of this.children.values()) {
      if (hasDesc(c.lastMetrics, sysId)) return c;
    }
    return null;
  }

  getSystemPauseReason(sysId) {
    if (!sysId || sysId === 'outer') return null;
    const checkChain = (m, target, ancPaused) => {
      if (!m) return null;
      const curPaused = ancPaused || (m.state === 'paused' ? `系统 ${m.systemId} 已暂停` : (m.state === 'error' ? `系统 ${m.systemId} 内核错误` : null));
      if (m.systemId === target) return curPaused;
      for (const ch of (m.children || [])) {
        const res = checkChain(ch, target, curPaused);
        if (res !== undefined) return res;
      }
      return undefined;
    };
    for (const c of this.children.values()) {
      const ownP = c.state === 'error' ? `系统 ${c.id} 内核错误` : (c.paused ? `系统 ${c.id} 已暂停` : null);
      if (c.id === sysId) return ownP;
      const r = checkChain(c.lastMetrics, sysId, ownP);
      if (r !== undefined) return r;
    }
    return null;
  }

  sendRawEventToChild(childId, ev) {
    const c = this.children.get(childId);
    if (!c || c.paused || c.state === 'error') return;
    c.rawEvents.push(ev);
  }

  routeControlAction(targetSysId, ev) {
    if (this.getSystemPauseReason(targetSysId)) return;
    if (this.children.has(targetSysId)) {
      this.children.get(targetSysId).rawEvents.push(ev);
      return;
    }
    const direct = this._findDirectAncestorOf(targetSysId);
    if (direct && !direct.paused && direct.state !== 'error') {
      direct.commands.push({
        type: 'route',
        targetSystemId: targetSysId,
        cmd: { type: 'inject_raw', event: ev },
      });
    }
  }

  routeCommandToSystem(targetSysId, cmd) {
    const direct = this._findDirectAncestorOf(targetSysId);
    if (!direct) return false;
    if (direct.id === targetSysId) {
      direct.commands.push(cmd);
    } else {
      direct.commands.push({ type: 'route', targetSystemId: targetSysId, cmd });
    }
    return true;
  }

  // ---- Live Data Broker (2.16) ----

  publishWorkbookUpdate(doc) {
    for (const sub of this.liveSubs.values()) {
      if (sub.docId !== doc.docId) continue;
      if (doc.version <= sub.lastEnqueuedVersion) continue;
      sub.lastEnqueuedVersion = doc.version;
      const rows = deepCloneValue(doc.extractRange(sub.range));
      sub.pendingQueue.push({
        type: 'live_data',
        windowId: sub.windowId,
        docId: doc.docId,
        sourceTitle: doc.title,
        range: sub.range,
        version: doc.version,
        rows,
        status: 'ok',
      });
    }
    this._flushLiveQueues();
  }

  publishWorkbookClosed(docId) {
    for (const sub of this.liveSubs.values()) {
      if (sub.docId !== docId) continue;
      sub.pendingQueue.push({
        type: 'live_data',
        windowId: sub.windowId,
        docId,
        status: 'source_closed',
      });
    }
    this._flushLiveQueues();
  }

  _flushLiveQueues() {
    for (const sub of this.liveSubs.values()) {
      if (sub.pendingQueue.length === 0) continue;
      // Pause-aware queuing: keep updates buffered outside paused subtrees!
      if (this.getSystemPauseReason(sub.systemId)) continue;
      while (sub.pendingQueue.length > 0) {
        const pkt = sub.pendingQueue.shift();
        this.routeCommandToSystem(sub.systemId, pkt);
      }
    }
  }

  _removeLiveSubsUnderSubtree(rootChildId) {
    const ids = new Set(this._collectSubtreeIds(rootChildId));
    for (const [k, sub] of this.liveSubs.entries()) {
      if (ids.has(sub.systemId)) this.liveSubs.delete(k);
    }
  }

  _collectSubtreeIds(childId) {
    const out = [childId];
    const walk = (m) => {
      if (!m?.children) return;
      for (const ch of m.children) {
        out.push(ch.systemId);
        walk(ch);
      }
    };
    const c = this.children.get(childId);
    if (c?.lastMetrics) walk(c.lastMetrics);
    return out;
  }

  // ---- Cross-Layer Projection Host on Root Desktop (2.15) ----

  _handleProjectionToOuter(proj) {
    const key = `${proj.sourceSystemId}:${proj.sourceWindowId}`;
    let pWin = this.projections.get(key);
    if (!pWin || !this.windows.find((w) => w.id === pWin.id)) {
      const title = `[投送 · ${proj.sourceSystemId}] ${proj.sourceTitle || proj.sourceAppId}`;
      const isPlayer = proj.sourceAppId === 'player';
      pWin = this._createWindow({
        appId: 'projection',
        title,
        w: isPlayer ? 760 : 620,
        h: isPlayer ? 500 : 420,
        projKey: key,
        sourceSystemId: proj.sourceSystemId,
        sourceWindowId: proj.sourceWindowId,
        sourceAppId: proj.sourceAppId,
      });
      pWin.el.dataset.sourceSystemId = proj.sourceSystemId;
      pWin.el.dataset.sourceWindowId = proj.sourceWindowId;
      pWin.el.dataset.sourceAppId = proj.sourceAppId;
      this.projections.set(key, pWin);
    }
    pWin.projData = proj;
    this._renderOuterProjectionWindow(pWin);
  }

  _renderOuterProjectionWindow(pWin) {
    if (!pWin?.projData) return;
    const proj = pWin.projData;
    const frozenReason = this.getSystemPauseReason(proj.sourceSystemId);
    this.displayDevice.renderProjectedContent(pWin.bodyEl, {
      hostSystemId: 'outer',
      hostWindowId: pWin.id,
      sourceSystemId: proj.sourceSystemId,
      sourceWindowId: proj.sourceWindowId,
      sourceAppId: proj.sourceAppId,
      ui: proj.ui,
      scene3d: proj.scene3d,
      frozenReason,
      onAction: (ev) => {
        if (this.getSystemPauseReason(proj.sourceSystemId)) return;
        this.routeCommandToSystem(proj.sourceSystemId, {
          type: 'proj_input',
          windowId: proj.sourceWindowId,
          event: ev,
        });
      },
    });
  }

  _endProjectionByKey(key, reason = '投送已结束') {
    const pWin = this.projections.get(key);
    if (!pWin) return;
    this.projections.delete(key);
    this.closeWindow(pWin.id, true, true);
    this.notify('跨层投送已结束', `${pWin.title} (${reason})`);
  }

  _endProjectionsUnderSubtree(childId, reason) {
    const ids = new Set(this._collectSubtreeIds(childId));
    for (const [key, pWin] of [...this.projections.entries()]) {
      if (ids.has(pWin.sourceSystemId)) {
        this._endProjectionByKey(key, reason);
      }
    }
  }

  // ---- Cross-Layer File Read Helper (for drag-out from nested subsystems) ----

  _readFileFromAnySystem(sysId, filePath) {
    if (sysId === 'outer') return this.vfsRead(filePath);
    const findCtx = (ctx, targetId) => {
      if (!ctx?.module || !ctx.globals) return null;
      const idx = ctx.module.globals.indexOf('KSTATE');
      if (idx < 0) return null;
      const cst = ctx.globals[idx];
      if (!cst) return null;
      if (cst.systemId === targetId) return cst;
      for (const p of (cst.procs || [])) {
        if (p.kind === 'carrier' && p.ctx) {
          const found = findCtx(p.ctx, targetId);
          if (found) return found;
        }
      }
      return null;
    };
    for (const c of this.children.values()) {
      const cst = findCtx(c.ctx, sysId);
      if (cst?.vfs) {
        const np = normPath(filePath);
        const nd = cst.vfs[np];
        if (nd && nd.kind === 'file') return { ok: true, content: nd.content, path: np };
      }
    }
    return { ok: false, error: '无法读取源文件' };
  }

  transferFileCrossLayer(fromSysId, srcPath, targetSysId, targetDir) {
    const rd = this._readFileFromAnySystem(fromSysId, srcPath);
    if (!rd.ok) {
      this.notify('跨层传文件失败', rd.error);
      return;
    }
    const fileName = baseName(srcPath);
    if (targetSysId === 'outer') {
      const dest = targetDir === '/' ? '/' + fileName : `${normPath(targetDir)}/${fileName}`;
      const doWrite = () => {
        const wr = this.vfsWrite(dest, rd.content);
        this.notify(wr.ok ? '跨层接收文件成功' : '跨层传输失败', wr.ok ? `outer:${dest}` : wr.error);
      };
      if (this.vfs[dest]) {
        this.showConfirmModal({
          title: '文件重名确认',
          message: `根系统目标路径 ${dest} 已存在同名文件，是否覆盖？`,
          buttons: [
            { label: '覆盖', kind: 'danger', onClick: doWrite },
            { label: '取消', kind: 'secondary', onClick: () => {} },
          ],
        });
      } else {
        doWrite();
      }
      return;
    }
    // Deliver into nested subsystem via cross-layer OS interface!
    if (this.getSystemPauseReason(targetSysId)) {
      this.notify('跨层传输已暂缓', `目标系统 ${targetSysId} 当前已暂停`);
      return;
    }
    this.routeCommandToSystem(targetSysId, {
      type: 'fs_transfer_in',
      fromSystemId: fromSysId,
      targetDir,
      fileName,
      content: rd.content,
      overwrite: false,
    });
    this.notify('已跨层传递文件', `${fileName} → ${targetSysId}:${targetDir}`);
  }

  // ==================== Fixed-Step Scheduler Loop (Immune to rAF Occlusion!) ====================

  _startLoop() {
    const BASE_DT = 1 / 30;
    const stepOnce = () => {
      try {
        this._tick(BASE_DT);
      } catch (e) {
        console.error('Tick error:', e);
      }
    };
    // Use setInterval (never throttled with backgroundThrottling: false & occlusion switches!)
    this._loopTimer = setInterval(stepOnce, 33);
  }

  _tick(baseDt) {
    this.vtime += baseDt;
    const nowMs = performance.now();

    // 1. Update Root Widgets (real-time countdown timer & stopwatch!)
    const ws = this.widgetsState;
    if (ws.timerRunning) {
      const elapsed = Math.max(0, (nowMs - ws.timerLastTick) / 1000);
      ws.timerLastTick = nowMs;
      ws.timerRemaining -= elapsed;
      if (ws.timerRemaining <= 0) {
        ws.timerRemaining = 0;
        ws.timerRunning = false;
        this.notify('倒计时结束', `${ws.timerInputSec} 秒倒计时已到时！`);
      }
    }
    if (ws.swRunning) {
      ws.swElapsedMs += Math.max(0, nowMs - ws.swLastTick);
      ws.swLastTick = nowMs;
    }
    if (this.widgetsOpen && this.widgetsDrawerEl) {
      renderWidgetsContent(this, this.widgetsDrawerEl, 'widgets-panel');
    }
    for (const w of this.windows) {
      if (w.appId === 'widgets' && !w.minimized) {
        renderWidgetsContent(this, w.bodyEl, w.id);
      }
    }

    // Update taskbar clock every ~1s
    if (this.clockEl) {
      const d = new Date();
      const txt = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      if (this.clockEl.textContent !== txt) this.clockEl.textContent = txt;
    }

    // 2. Flush live workbook updates to unpaused subsystems
    this._flushLiveQueues();

    // 3. Execute Root custom .nos processes + Direct Child Subsystem Carriers under shared outer budget!
    let remBudget = this.budgetConfig;
    let usedTotal = 0;

    // 3a. Root custom .nos processes
    const activeRootProcs = this.rootProcs.filter((p) => p.state === 'ready' || p.state === 'waiting' || p.state === 'waiting_msg');
    for (const p of activeRootProcs) {
      p.stepsTick = 0;
      if (p.state === 'waiting' && p.wakeAt >= 0 && this.vtime >= p.wakeAt) {
        p.state = 'ready';
        p.wakeAt = -1;
        replySyscall(p.ctx, true);
      }
      if (p.state === 'ready' && remBudget > 0) {
        const slice = Math.min(25000, remBudget);
        const r = runVM(p.ctx, slice, Math.floor(this.memQuota * 0.35));
        p.stepsTick += r.stepsUsed;
        p.stepsTotal += r.stepsUsed;
        p.pendingWork = r.pendingWork;
        p.memBytes = r.memBytes;
        remBudget -= r.stepsUsed;
        usedTotal += r.stepsUsed;
        if (r.status === 'syscall') {
          this._handleRootProcSyscall(p, r.name, r.args);
        } else if (r.status === 'exited') {
          p.state = 'exited';
          if (r.value !== null && p.result === null) p.result = r.value;
          p.memBytes = 0;
        } else if (r.status === 'error') {
          p.state = 'error';
          p.error = r.error;
        }
      }
    }

    // 3b. Direct child subsystem carriers (fairly sharing remaining outer budget!)
    const openWbList = Array.from(this.openWorkbooks.values()).map((wb) => ({
      docId: wb.docId,
      title: wb.title,
      path: wb.path,
    }));

    const runnableCarriers = Array.from(this.children.values()).filter(
      (c) => c.ctx && c.state !== 'error' && (!c.paused || c.stepReq > 0)
    );
    const shareEach = runnableCarriers.length > 0 ? Math.floor(remBudget / runnableCarriers.length) : 0;

    for (const c of this.children.values()) {
      c.selfStepsTick = 0;
      c.childStepsTick = 0;
      if (!c.ctx || c.state === 'error') continue;

      const allowRun = !c.paused || c.stepReq > 0;
      if (!allowRun) continue;
      let isStep = false;
      if (c.paused && c.stepReq > 0) {
        c.stepReq -= 1;
        isStep = true;
      }

      const grant = Math.min(c.grantCap, Math.max(shareEach, Math.min(remBudget, c.grantCap)));
      if (grant <= 0) continue;

      let carrierBudget = grant;
      let guard = 0;
      // Carrier hard ceiling includes kernel-state headroom so user-process OOM inside
      // the child kernel trips cleanly at c.memCap without killing the child kernel itself.
      const carrierMemLimit = c.memCap > 0 ? Math.floor(c.memCap * 1.35) + 4 * 1048576 : 0;
      while (carrierBudget > 0 && guard++ < 64) {
        const res = runVM(c.ctx, carrierBudget, carrierMemLimit);
        carrierBudget -= res.stepsUsed;
        remBudget -= res.stepsUsed;
        usedTotal += res.stepsUsed;
        c.selfStepsTick += res.selfSteps;
        c.childStepsTick += res.childSteps;
        c.memBytes = res.memBytes;

        if (res.status === 'syscall') {
          if (res.name === 'host_alloc_id') {
            replySyscall(c.ctx, this.allocGlobalSystemId());
          } else if (res.name === 'host_poll') {
            const rawEvents = c.rawEvents;
            const commands = c.commands;
            c.rawEvents = [];
            c.commands = [];
            replySyscall(c.ctx, {
              dt: baseDt,
              allowRun: true,
              budget: Math.max(2000, carrierBudget),
              memCap: c.memCap,
              storageCap: c.storageCap,
              viewport: c.viewport,
              rawEvents,
              commands,
              ancestors: [{ id: 'outer', name: this.settings.systemName, depth: 0 }],
              openWorkbooks: openWbList,
            });
          } else if (res.name === 'host_present') {
            const pkt = res.args[0];
            replySyscall(c.ctx, { ok: true });
            if (pkt) {
              c.lastDisplay = pkt.display;
              c.lastMetrics = pkt.metrics;
              c.timeRate = pkt.timeRate || c.timeRate;
              if (pkt.name) c.name = pkt.name;
              // Handle outbound requests (live subscriptions, cross-layer file transfer, projection end)
              for (const ob of (pkt.outbound || [])) {
                this._handleChildOutbound(ob);
              }
              // Handle projections targeting 'outer'
              for (const pj of (pkt.projections || [])) {
                if (pj.targetSystemId === 'outer') {
                  this._handleProjectionToOuter(pj);
                }
              }
            }
            break; // One full logical tick presented!
          } else {
            replySyscall(c.ctx, null);
          }
        } else if (res.status === 'error') {
          c.state = 'error';
          c.error = res.error;
          c.lastDisplay = null;
          this.notify('子系统内核异常', `${c.id}: ${res.error}`);
          break;
        } else if (res.status === 'exited') {
          c.state = 'error';
          c.error = '内核主循环意外退出';
          break;
        } else {
          break;
        }
      }

      if (isStep) {
        // Keep paused cleanly after single step
        c.paused = true;
      }
    }

    this.lastTickUsed = usedTotal;

    // 4. Refresh visible subsystem windows & projection windows on Root Desktop!
    for (const w of this.windows) {
      if (w.appId === 'subsystem' && !w.minimized) {
        const c = this.children.get(w.childId);
        if (c && w.subMountEl) {
          this._renderRootSubsystemHostBar(w, c);
          const frozenReason = c.paused ? `子系统 ${c.id} 已暂停` : null;
          this.displayDevice.renderDesktop(w.subMountEl, c.lastDisplay, {
            isRootChild: true,
            frozenReason,
            errorText: c.state === 'error' ? c.error : null,
            systemIdHint: c.id,
          });
        }
      } else if (w.appId === 'projection' && !w.minimized) {
        this._renderOuterProjectionWindow(w);
      }
    }
  }

  _handleRootProcSyscall(proc, name, args) {
    if (name === 'time') return replySyscall(proc.ctx, this.vtime);
    if (name === 'sleep') {
      proc.state = 'waiting';
      proc.wakeAt = this.vtime + Number(args[0] || 0);
      return;
    }
    if (name === 'yield') return replySyscall(proc.ctx, true);
    if (name === 'getpid') return replySyscall(proc.ctx, { pid: proc.pid, systemId: 'outer', name: proc.name });
    if (name === 'log') {
      proc.logs.push({ t: this.vtime, text: String(args[0] ?? '') });
      if (proc.logs.length > 60) proc.logs.shift();
      return replySyscall(proc.ctx, true);
    }
    if (name === 'set_result') {
      proc.result = deepCloneValue(args[0]);
      return replySyscall(proc.ctx, true);
    }
    if (name === 'fs_read') return replySyscall(proc.ctx, this.vfsRead(args[0]));
    if (name === 'fs_write') return replySyscall(proc.ctx, this.vfsWrite(args[0], args[1]));
    if (name === 'fs_list') return replySyscall(proc.ctx, this.vfsList(args[0]));
    if (name === 'find_proc') {
      const needle = String(args[0] || '').toLowerCase();
      const found = this.rootProcs
        .filter((x) => x.state !== 'exited' && x.state !== 'error' && x.name.toLowerCase().includes(needle))
        .map((x) => ({ pid: x.pid, name: x.name }));
      return replySyscall(proc.ctx, found);
    }
    if (name === 'send') {
      const target = this.rootProcs.find((x) => x.pid === Number(args[0]) && x.state !== 'exited');
      if (!target) return replySyscall(proc.ctx, { ok: false, error: '目标进程不存在' });
      const msg = { fromPid: proc.pid, sentAt: this.vtime, data: deepCloneValue(args[1]) };
      target.inbox.push(msg);
      if (target.state === 'waiting_msg') {
        target.state = 'ready';
        replySyscall(target.ctx, target.inbox.shift());
      }
      return replySyscall(proc.ctx, { ok: true, delivered: true });
    }
    if (name === 'recv') {
      if (proc.inbox.length > 0) return replySyscall(proc.ctx, proc.inbox.shift());
      if (Number(args[0]) === 0) return replySyscall(proc.ctx, null);
      proc.state = 'waiting_msg';
      return;
    }
    replySyscall(proc.ctx, null);
  }

  _handleChildOutbound(ob) {
    if (!ob) return;
    if (ob.type === 'live_subscribe') {
      const key = `${ob.systemId}:${ob.windowId}`;
      const sub = {
        systemId: ob.systemId,
        windowId: ob.windowId,
        docId: ob.docId,
        range: ob.range || 'A1:D4',
        lastEnqueuedVersion: -1,
        pendingQueue: [],
      };
      this.liveSubs.set(key, sub);
      const doc = this.openWorkbooks.get(ob.docId);
      if (doc) {
        this.publishWorkbookUpdate(doc);
      } else {
        sub.pendingQueue.push({ type: 'live_data', windowId: ob.windowId, docId: ob.docId, status: 'source_closed' });
        this._flushLiveQueues();
      }
    } else if (ob.type === 'live_unsubscribe') {
      this.liveSubs.delete(`${ob.systemId}:${ob.windowId}`);
    } else if (ob.type === 'projection_ended' && ob.targetSystemId === 'outer') {
      this._endProjectionByKey(`${ob.sourceSystemId}:${ob.sourceWindowId}`, ob.reason);
    } else if (ob.type === 'subtree_stopped' || ob.type === 'subtree_restarted') {
      this._endProjectionsUnderSubtree(ob.systemId, ob.type === 'subtree_stopped' ? '源子树已停止' : '源子树已重启');
      this._removeLiveSubsUnderSubtree(ob.systemId);
    } else if (ob.type === 'focus_parent') {
      if (ob.targetSystemId === 'outer') {
        this.focusedWinId = null;
        for (const w of this.windows) {
          w.focused = false;
          w.el.classList.remove('is-focused');
        }
        this._renderTaskbar();
        this.rootEl.focus();
      }
    } else if (ob.type === 'fs_transfer') {
      if (ob.targetSystemId === 'outer') {
        const dest = ob.targetDir === '/' ? '/' + ob.fileName : `${normPath(ob.targetDir)}/${ob.fileName}`;
        this.vfsWrite(dest, ob.content);
        this.notify('跨层接收文件', `outer:${dest}`);
      } else {
        this.routeCommandToSystem(ob.targetSystemId, {
          type: 'fs_transfer_in',
          fromSystemId: ob.fromSystemId,
          targetDir: ob.targetDir,
          fileName: ob.fileName,
          content: ob.content,
          overwrite: false,
        });
      }
    }
  }

  // ==================== Root Shell DOM, Windows, Menus, Widgets, Notifications ====================

  _buildShellDOM() {
    this.mountEl.innerHTML = `
      <div id="root-os" class="root-desktop" data-testid="os-desktop" data-system-id="outer" tabindex="0">
        <div class="root-wallpaper"></div>
        <div class="root-icons"></div>
        <div class="root-windows"></div>
        <div class="root-snap-preview" style="display:none"></div>

        <!-- Start Menu -->
        <div class="start-menu root-start-menu" data-testid="start-menu" data-system-id="outer" style="display:none">
          <div class="sm-header">
            <span class="sm-badge">L1 · outer</span>
            <span class="sm-title root-sm-sysname">主境 OS</span>
          </div>
          <input class="nos-input sm-search" type="text" placeholder="搜索应用..." aria-label="搜索应用"/>
          <div class="sm-grid root-sm-grid"></div>
        </div>

        <!-- Widgets Panel -->
        <div class="side-drawer widgets-drawer" data-testid="widgets-panel" data-system-id="outer" style="display:none">
          <div class="drawer-hd">
            <span>小组件面板</span>
            <button class="btn-xxs drawer-close" data-close="widgets">✕</button>
          </div>
          <div class="drawer-body widgets-drawer-body"></div>
        </div>

        <!-- Notification Center Drawer -->
        <div class="side-drawer notifs-drawer" data-testid="notifications-panel" data-system-id="outer" style="display:none">
          <div class="drawer-hd">
            <span>通知中心</span>
            <div class="drawer-hd-btns">
              <button class="btn-xxs notifs-dnd-btn">免打扰</button>
              <button class="btn-xxs notifs-clear-btn">清空</button>
              <button class="btn-xxs drawer-close" data-close="notifs">✕</button>
            </div>
          </div>
          <div class="drawer-body notifs-drawer-body"></div>
        </div>

        <!-- Context Menu & Modal & Toasts & Drag Pill -->
        <div class="ctx-menu root-ctx-menu" data-system-id="outer" style="display:none"></div>
        <div class="os-modal-backdrop root-modal-backdrop" style="display:none"></div>
        <div class="toast-stack root-toast-stack"></div>
        <div class="cross-drag-pill" style="display:none"></div>

        <!-- Root Bottom Taskbar -->
        <div class="root-taskbar">
          <div class="tb-left">
            <button class="tb-start" data-testid="start-toggle" data-system-id="outer" aria-label="开始菜单">
              ${iconHtml('start', 'tb-ico')}<span>开始</span>
            </button>
            <button class="tb-pin" data-pin="files" title="文件管理器">${iconHtml('files', 'tb-ico')}</button>
            <button class="tb-pin" data-pin="spreadsheet" title="电子表格">${iconHtml('spreadsheet', 'tb-ico')}</button>
            <button class="tb-pin" data-pin="browser" title="Chromium 浏览器">${iconHtml('browser', 'tb-ico')}</button>
            <button class="tb-pin" data-pin="tasks" title="任务与系统树管理器">${iconHtml('tasks', 'tb-ico')}</button>
            <button class="tb-pin tb-pin-sub" data-pin="new_sub" title="新建子系统">${iconHtml('subsystem', 'tb-ico')}</button>
          </div>
          <div class="tb-center root-tb-items"></div>
          <div class="tb-right">
            <button class="tb-tray-btn" data-testid="widgets-toggle" data-system-id="outer" aria-label="小组件面板" title="小组件面板">
              ${iconHtml('widgets', 'tb-ico')}<span>小组件</span>
            </button>
            <button class="tb-tray-btn" data-testid="notifications-toggle" data-system-id="outer" aria-label="通知中心" title="通知中心">
              ${iconHtml('bell', 'tb-ico')}<span class="notif-badge" style="display:none">0</span>
            </button>
            <span class="tb-clock root-clock" data-testid="taskbar-clock" title="点击打开小组件与时钟" style="cursor:pointer">00:00:00</span>
          </div>
        </div>
      </div>
    `;

    this.rootEl = this.mountEl.querySelector('#root-os');
    this.wallpaperEl = this.rootEl.querySelector('.root-wallpaper');
    this.iconsEl = this.rootEl.querySelector('.root-icons');
    this.windowsEl = this.rootEl.querySelector('.root-windows');
    this.snapPreviewEl = this.rootEl.querySelector('.root-snap-preview');
    this.startMenuEl = this.rootEl.querySelector('.root-start-menu');
    this.smGridEl = this.rootEl.querySelector('.root-sm-grid');
    this.smSearchEl = this.rootEl.querySelector('.sm-search');
    this.widgetsDrawerWrap = this.rootEl.querySelector('.widgets-drawer');
    this.widgetsDrawerEl = this.rootEl.querySelector('.widgets-drawer-body');
    this.notifsDrawerWrap = this.rootEl.querySelector('.notifs-drawer');
    this.notifsDrawerEl = this.rootEl.querySelector('.notifs-drawer-body');
    this.notifBadgeEl = this.rootEl.querySelector('.notif-badge');
    this.ctxMenuEl = this.rootEl.querySelector('.root-ctx-menu');
    this.modalBackdropEl = this.rootEl.querySelector('.root-modal-backdrop');
    this.toastStackEl = this.rootEl.querySelector('.root-toast-stack');
    this.dragPillEl = this.rootEl.querySelector('.cross-drag-pill');
    this.tbItemsEl = this.rootEl.querySelector('.root-tb-items');
    this.clockEl = this.rootEl.querySelector('.root-clock');

    this.clockEl.style.cursor = 'pointer';
    this.clockEl.title = '点击打开时钟、日历与小组件面板';
    this.clockEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleWidgetsPanel();
    });

    this._renderDesktopIcons();
    this._renderStartMenuApps('');

    // Start menu toggle & search
    this.rootEl.querySelector('[data-testid="start-toggle"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.startMenuOpen = !this.startMenuOpen;
      this.startMenuEl.style.display = this.startMenuOpen ? 'flex' : 'none';
      this.ctxMenuEl.style.display = 'none';
      if (this.startMenuOpen) this.smSearchEl.focus();
    });
    this.smSearchEl.addEventListener('input', () => this._renderStartMenuApps(this.smSearchEl.value));

    // Pinned taskbar apps
    this.rootEl.querySelectorAll('.tb-pin').forEach((b) => {
      b.addEventListener('click', () => {
        const p = b.dataset.pin;
        if (p === 'new_sub') this.createChildSystem();
        else this.openApp(p);
      });
    });

    // Widgets & Notifications tray toggles
    this.rootEl.querySelector('[data-testid="widgets-toggle"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleWidgetsPanel();
    });
    this.rootEl.querySelector('[data-testid="notifications-toggle"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleNotificationsPanel();
    });
    this.rootEl.querySelectorAll('.drawer-close').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.close === 'widgets') this.toggleWidgetsPanel(false);
        else this.toggleNotificationsPanel(false);
      });
    });
    this.rootEl.querySelector('.notifs-dnd-btn').addEventListener('click', () => {
      this.updateSettings({ dnd: !this.settings.dnd });
      this._renderNotificationsDrawer();
    });
    this.rootEl.querySelector('.notifs-clear-btn').addEventListener('click', () => {
      this.notifications.length = 0;
      this.unreadNotifs = 0;
      this._renderNotificationsDrawer();
    });

    // Desktop right-click & click-away & Escape key
    this.rootEl.addEventListener('contextmenu', (e) => {
      if (e.target === this.rootEl || e.target === this.wallpaperEl || e.target === this.iconsEl || e.target === this.windowsEl) {
        e.preventDefault();
        this.showContextMenu(e.clientX, e.clientY, [
          { label: '新建子系统 (inner)', onClick: () => this.createChildSystem() },
          { label: '打开文件管理器', onClick: () => this.openApp('files') },
          { label: '打开电子表格', onClick: () => this.openApp('spreadsheet') },
          { label: '打开 Chromium 浏览器', onClick: () => this.openApp('browser') },
          { label: '个性化与设置', onClick: () => this.openApp('settings') },
          { label: '查看简体中文操作说明', onClick: () => this.openApp('help') },
        ]);
      }
    });

    this.rootEl.addEventListener('mousedown', (e) => {
      if (!e.target.closest('.root-start-menu') && !e.target.closest('[data-testid="start-toggle"]')) {
        this.startMenuOpen = false;
        this.startMenuEl.style.display = 'none';
      }
      if (!e.target.closest('.root-ctx-menu')) {
        this.ctxMenuEl.style.display = 'none';
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.ctxMenuEl.style.display !== 'none') {
          this.ctxMenuEl.style.display = 'none';
        } else if (this.startMenuOpen) {
          this.startMenuOpen = false;
          this.startMenuEl.style.display = 'none';
        } else if (this.notifsOpen) {
          this.toggleNotificationsPanel(false);
        }
      }
    });
  }

  _hideAllPopups() {
    this.startMenuEl.style.display = 'none';
    this.widgetsDrawerWrap.style.display = 'none';
    this.notifsDrawerWrap.style.display = 'none';
    this.ctxMenuEl.style.display = 'none';
    this.modalBackdropEl.style.display = 'none';
  }

  _renderDesktopIcons() {
    const icons = [
      { label: '文件管理器', icon: 'files', appId: 'files' },
      { label: '电子表格', icon: 'spreadsheet', appId: 'spreadsheet' },
      { label: 'Chromium 浏览器', icon: 'browser', appId: 'browser' },
      { label: '小组件', icon: 'widgets', appId: 'widgets' },
      { label: '程序编辑器', icon: 'editor', appId: 'editor' },
      { label: '任务管理器', icon: 'tasks', appId: 'tasks' },
      { label: '系统设置', icon: 'settings', appId: 'settings' },
      { label: '启动子系统', icon: 'subsystem', appId: 'new_sub' },
      { label: '示例工作簿', icon: 'spreadsheet', filePath: '/Demo/sample.sheet' },
      { label: '操作说明', icon: 'help', appId: 'help' },
    ];
    this.iconsEl.innerHTML = icons.map((ic, idx) => {
      const attr = ic.filePath ? `data-file-path="${ic.filePath}"` : `data-app-id="${ic.appId}"`;
      return `<div class="desktop-icon root-icon" data-idx="${idx}" data-testid="desktop-icon" data-system-id="outer" ${attr} aria-label="${ic.label}">
        ${iconHtml(ic.icon, 'di-svg')}
        <span class="di-label">${ic.label}</span>
      </div>`;
    }).join('');

    this.iconsEl.querySelectorAll('.root-icon').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.iconsEl.querySelectorAll('.root-icon').forEach((x) => x.classList.remove('selected'));
        el.classList.add('selected');
      });
      el.addEventListener('dblclick', () => {
        const fp = el.dataset.filePath;
        const aid = el.dataset.appId;
        if (fp) {
          if (fp.endsWith('.sheet')) this.openApp('spreadsheet', { openPath: fp });
          else this.openApp('editor', { openPath: fp });
        } else if (aid === 'new_sub') {
          this.createChildSystem();
        } else if (aid === 'widgets') {
          this.toggleWidgetsPanel(true);
        } else {
          this.openApp(aid);
        }
      });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const fp = el.dataset.filePath;
        const aid = el.dataset.appId;
        this.showContextMenu(e.clientX, e.clientY, [
          {
            label: `打开 ${el.getAttribute('aria-label')}`,
            onClick: () => {
              if (fp) this.openApp(fp.endsWith('.sheet') ? 'spreadsheet' : 'editor', { openPath: fp });
              else if (aid === 'new_sub') this.createChildSystem();
              else if (aid === 'widgets') this.toggleWidgetsPanel(true);
              else this.openApp(aid);
            },
          },
          { label: '新建子系统 (inner)', onClick: () => this.createChildSystem() },
        ]);
      });
    });
  }

  _renderStartMenuApps(filter) {
    const q = String(filter || '').trim().toLowerCase();
    const apps = [
      { id: 'files', label: '文件管理器', testid: 'launch-files', icon: 'files' },
      { id: 'spreadsheet', label: '电子表格', testid: 'launch-spreadsheet', icon: 'spreadsheet' },
      { id: 'widgets', label: '小组件面板', testid: 'launch-widgets', icon: 'widgets' },
      { id: 'editor', label: '程序编辑器', testid: 'launch-editor', icon: 'editor' },
      { id: 'browser', label: 'Chromium 浏览器', testid: 'launch-browser', icon: 'browser' },
      { id: 'tasks', label: '任务管理器', testid: 'launch-tasks', icon: 'tasks' },
      { id: 'settings', label: '系统设置', testid: 'launch-settings', icon: 'settings' },
      { id: 'new_sub', label: '新建子系统', testid: 'system-new', icon: 'subsystem', accent: true },
      { id: 'help', label: '操作说明', testid: 'launch-help', icon: 'help' },
    ].filter((a) => !q || a.label.toLowerCase().includes(q) || a.id.includes(q));

    this.smGridEl.innerHTML = apps.map((a) => `
      <button class="sm-app-btn${a.accent ? ' sm-app-accent' : ''}" data-testid="${a.testid}" data-system-id="outer" data-launch="${a.id}" aria-label="${a.label}">
        ${iconHtml(a.icon, 'sm-ico')}<span>${a.label}</span>
      </button>
    `).join('');

    this.smGridEl.querySelectorAll('[data-launch]').forEach((b) => {
      b.addEventListener('click', () => {
        this.startMenuOpen = false;
        this.startMenuEl.style.display = 'none';
        const id = b.dataset.launch;
        if (id === 'new_sub') this.createChildSystem();
        else if (id === 'widgets') this.toggleWidgetsPanel(true);
        else this.openApp(id);
      });
    });
  }

  toggleWidgetsPanel(force) {
    this.widgetsOpen = force !== undefined ? force : !this.widgetsOpen;
    this.widgetsDrawerWrap.style.display = this.widgetsOpen ? 'flex' : 'none';
    if (this.widgetsOpen) {
      this.notifsOpen = false;
      this.notifsDrawerWrap.style.display = 'none';
      renderWidgetsContent(this, this.widgetsDrawerEl, 'widgets-panel');
    }
  }

  toggleNotificationsPanel(force) {
    this.notifsOpen = force !== undefined ? force : !this.notifsOpen;
    this.notifsDrawerWrap.style.display = this.notifsOpen ? 'flex' : 'none';
    if (this.notifsOpen) {
      this.widgetsOpen = false;
      this.widgetsDrawerWrap.style.display = 'none';
      this.unreadNotifs = 0;
      this._renderNotificationsDrawer();
    }
  }

  _renderNotificationsDrawer() {
    this.notifBadgeEl.style.display = this.unreadNotifs > 0 ? 'inline-flex' : 'none';
    this.notifBadgeEl.textContent = String(this.unreadNotifs);
    const dndBtn = this.rootEl.querySelector('.notifs-dnd-btn');
    if (dndBtn) dndBtn.textContent = this.settings.dnd ? '免打扰：开' : '免打扰：关';
    if (this.notifications.length === 0) {
      this.notifsDrawerEl.innerHTML = `<div class="w-empty">暂无通知记录</div>`;
    } else {
      this.notifsDrawerEl.innerHTML = this.notifications.map((n) => `
        <div class="w-notif-item">
          <div class="wn-top"><strong>${n.title}</strong><span>${n.timeStr}</span></div>
          <div class="wn-body">${n.body}</div>
        </div>
      `).join('');
    }
  }

  notify(title, body) {
    const timeStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    this.notifications.unshift({ title, body, timeStr });
    if (this.notifications.length > 40) this.notifications.pop();
    if (!this.notifsOpen) this.unreadNotifs += 1;
    this._renderNotificationsDrawer();

    if (!this.settings.dnd) {
      const toast = document.createElement('div');
      toast.className = 'root-toast';
      toast.innerHTML = `<strong>${title}</strong><span>${body}</span>`;
      this.toastStackEl.appendChild(toast);
      setTimeout(() => toast.remove(), 3800);
    }
  }

  recordClipboard(text, source = '根系统') {
    if (!text) return;
    this.clipboardHistory.unshift({ text: String(text), source, at: Date.now() });
    if (this.clipboardHistory.length > 25) this.clipboardHistory.pop();
  }

  getLatestClipboard() {
    return this.clipboardHistory[0]?.text || '';
  }

  updateSettings(patch) {
    Object.assign(this.settings, patch);
    this._applySettingsToDOM();
    this.saveSettingsAndWidgets();
  }

  _applySettingsToDOM() {
    const wp = WALLPAPERS.find((w) => w.value === this.settings.wallpaper) || WALLPAPERS[0];
    this.wallpaperEl.style.backgroundImage = `url("${wp.src}")`;
    this.rootEl.style.setProperty('--accent', this.settings.accent || '#38bdf8');
    const sc = Number(this.settings.scale || 1);
    this.rootEl.style.zoom = String(sc);
    const smName = this.rootEl.querySelector('.root-sm-sysname');
    if (smName) smName.textContent = this.settings.systemName;
  }

  showContextMenu(clientX, clientY, items) {
    const rect = this.rootEl.getBoundingClientRect();
    const x = ((clientX - rect.left) / Math.max(1, rect.width)) * this.rootEl.clientWidth;
    const y = ((clientY - rect.top) / Math.max(1, rect.height)) * this.rootEl.clientHeight;
    this.ctxMenuEl.innerHTML = items.map((it, i) => `<button class="ctx-item" data-ci="${i}">${it.label}</button>`).join('');
    this.ctxMenuEl.style.left = `${Math.min(x, Math.max(8, this.rootEl.clientWidth - 180))}px`;
    this.ctxMenuEl.style.top = `${Math.min(y, Math.max(8, this.rootEl.clientHeight - items.length * 32 - 20))}px`;
    this.ctxMenuEl.style.display = 'flex';
    this.ctxMenuEl.querySelectorAll('[data-ci]').forEach((b) => {
      b.addEventListener('click', () => {
        this.ctxMenuEl.style.display = 'none';
        items[Number(b.dataset.ci)]?.onClick?.();
      });
    });
  }

  showConfirmModal({ title, message, buttons }) {
    this.modalBackdropEl.innerHTML = `
      <div class="os-modal">
        <div class="os-modal-title">${title}</div>
        <div class="os-modal-msg" style="white-space:pre-wrap">${message}</div>
        <div class="os-modal-actions">
          ${buttons.map((b, i) => `<button class="btn-${b.kind || 'secondary'}" data-mi="${i}">${b.label}</button>`).join('')}
        </div>
      </div>
    `;
    this.modalBackdropEl.style.display = 'flex';
    this.modalBackdropEl.querySelectorAll('[data-mi]').forEach((el) => {
      el.addEventListener('click', () => {
        this.modalBackdropEl.style.display = 'none';
        buttons[Number(el.dataset.mi)]?.onClick?.();
      });
    });
  }

  // ==================== Root Window Management ====================

  _getWorkArea() {
    const w = this.rootEl.clientWidth || window.innerWidth;
    const h = Math.max(240, (this.rootEl.clientHeight || window.innerHeight) - 42);
    return { w, h };
  }

  _clientToRoot(clientX, clientY) {
    const rect = this.rootEl.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / Math.max(1, rect.width)) * this.rootEl.clientWidth,
      y: ((clientY - rect.top) / Math.max(1, rect.height)) * this.rootEl.clientHeight,
    };
  }

  _createWindow({ appId, title, w, h, x, y, childId = null, projKey = null, sourceSystemId = null, sourceWindowId = null, sourceAppId = null }) {
    const area = this._getWorkArea();
    const id = `w-outer-${this.nextWinSeq++}`;
    const ww = Math.min(w || 820, area.w - 20);
    const wh = Math.min(h || 540, area.h - 20);
    const off = (this.windows.length % 6) * 28;
    const wx = x !== undefined ? x : Math.max(10, Math.min(area.w - ww - 10, 110 + off));
    const wy = y !== undefined ? y : Math.max(10, Math.min(area.h - wh - 10, 26 + off));

    const el = document.createElement('div');
    el.className = 'os-window root-window';
    el.dataset.testid = 'app-window';
    el.dataset.systemId = 'outer';
    el.dataset.windowId = id;
    el.dataset.appId = appId;
    el.style.left = `${wx}px`;
    el.style.top = `${wy}px`;
    el.style.width = `${ww}px`;
    el.style.height = `${wh}px`;

    el.innerHTML = `
      <div class="win-titlebar" data-testid="window-titlebar" data-system-id="outer" data-window-id="${id}">
        <div class="win-title-left">
          ${iconHtml(appId, 'win-ico')}
          <span class="win-title-text">${title}</span>
        </div>
        <div class="win-controls">
          <button class="win-btn" data-testid="window-minimize" data-system-id="outer" data-window-id="${id}" aria-label="最小化">—</button>
          <button class="win-btn" data-testid="window-maximize" data-system-id="outer" data-window-id="${id}" aria-label="最大化">□</button>
          <button class="win-btn win-btn-close" data-testid="window-close" data-system-id="outer" data-window-id="${id}" aria-label="关闭">✕</button>
        </div>
      </div>
      <div class="win-body"></div>
      <div class="win-resize-handle r-e" data-dir="e"></div>
      <div class="win-resize-handle r-s" data-dir="s"></div>
      <div class="win-resize-handle r-w" data-dir="w"></div>
      <div class="win-resize-handle r-n" data-dir="n"></div>
      <div class="win-resize-handle r-se" data-testid="window-resize" data-system-id="outer" data-window-id="${id}" data-dir="se"></div>
      <div class="win-resize-handle r-sw" data-dir="sw"></div>
      <div class="win-resize-handle r-ne" data-dir="ne"></div>
      <div class="win-resize-handle r-nw" data-dir="nw"></div>
    `;

    this.windowsEl.appendChild(el);
    const bodyEl = el.querySelector('.win-body');

    const win = {
      id,
      appId,
      title,
      x: wx,
      y: wy,
      w: ww,
      h: wh,
      prevRect: { x: wx, y: wy, w: ww, h: wh },
      state: 'normal',
      minimized: false,
      focused: false,
      z: ++this.zCounter,
      el,
      bodyEl,
      childId,
      projKey,
      sourceSystemId,
      sourceWindowId,
      sourceAppId,
      controller: null,
    };
    this.windows.push(win);
    this._wireWindowChrome(win);
    this.focusWindow(id);
    this._renderTaskbar();
    return win;
  }

  _wireWindowChrome(win) {
    const { el } = win;
    const tb = el.querySelector('.win-titlebar');

    el.addEventListener('mousedown', () => this.focusWindow(win.id));

    el.querySelector('[data-testid="window-minimize"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.minimizeWindow(win.id);
    });
    el.querySelector('[data-testid="window-maximize"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMaximizeWindow(win.id);
    });
    el.querySelector('[data-testid="window-close"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeWindow(win.id, false);
    });

    tb.addEventListener('dblclick', (e) => {
      if (e.target.closest('button')) return;
      this.toggleMaximizeWindow(win.id);
    });

    // Titlebar drag + left/right half-screen snap!
    tb.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      e.preventDefault();
      this.focusWindow(win.id);
      const start = this._clientToRoot(e.clientX, e.clientY);
      let origX = win.x;
      let origY = win.y;
      let snap = null;

      // Disable webview pointer events during drag so mousemove never gets swallowed by Chromium OOPIF!
      this.rootEl.classList.add('is-dragging-win');

      const onMove = (me) => {
        const cur = this._clientToRoot(me.clientX, me.clientY);
        const area = this._getWorkArea();
        if (win.state !== 'normal' && (Math.abs(cur.x - start.x) > 6 || Math.abs(cur.y - start.y) > 6)) {
          win.state = 'normal';
          win.w = win.prevRect.w;
          win.h = win.prevRect.h;
          origX = Math.max(0, Math.min(area.w - win.w, cur.x - win.w / 2));
          origY = Math.max(0, cur.y - 16);
          start.x = cur.x;
          start.y = cur.y;
        }
        win.x = Math.max(-win.w + 80, Math.min(area.w - 80, origX + (cur.x - start.x)));
        win.y = Math.max(0, Math.min(area.h - 34, origY + (cur.y - start.y)));
        this._syncWindowRect(win);

        if (cur.x <= 24) {
          snap = 'left';
          this.snapPreviewEl.style.display = 'block';
          this.snapPreviewEl.className = 'root-snap-preview snap-left';
        } else if (cur.x >= area.w - 24) {
          snap = 'right';
          this.snapPreviewEl.style.display = 'block';
          this.snapPreviewEl.className = 'root-snap-preview snap-right';
        } else {
          snap = null;
          this.snapPreviewEl.style.display = 'none';
        }
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        this.rootEl.classList.remove('is-dragging-win');
        this.snapPreviewEl.style.display = 'none';
        if (snap) {
          const area = this._getWorkArea();
          win.prevRect = { x: origX, y: origY, w: win.prevRect.w, h: win.prevRect.h };
          if (snap === 'left') {
            win.state = 'snapped-left';
            win.x = 0; win.y = 0; win.w = Math.floor(area.w / 2); win.h = area.h;
          } else {
            win.state = 'snapped-right';
            win.x = Math.floor(area.w / 2); win.y = 0; win.w = area.w - win.x; win.h = area.h;
          }
          this._syncWindowRect(win);
        } else if (win.state === 'normal') {
          win.prevRect = { x: win.x, y: win.y, w: win.w, h: win.h };
        }
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });

    // 8-direction resize handles
    el.querySelectorAll('.win-resize-handle').forEach((handle) => {
      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || win.state === 'maximized') return;
        e.preventDefault();
        e.stopPropagation();
        this.focusWindow(win.id);
        const dir = handle.dataset.dir;
        const start = this._clientToRoot(e.clientX, e.clientY);
        const o = { x: win.x, y: win.y, w: win.w, h: win.h };
        this.rootEl.classList.add('is-dragging-win');

        const onMove = (me) => {
          const cur = this._clientToRoot(me.clientX, me.clientY);
          const dx = cur.x - start.x;
          const dy = cur.y - start.y;
          const area = this._getWorkArea();
          let nx = o.x, ny = o.y, nw = o.w, nh = o.h;
          if (dir.includes('e')) nw = Math.max(300, Math.min(area.w - nx, o.w + dx));
          if (dir.includes('s')) nh = Math.max(200, Math.min(area.h - ny, o.h + dy));
          if (dir.includes('w')) {
            const cDx = Math.max(-o.x, Math.min(o.w - 300, dx));
            nx = o.x + cDx; nw = o.w - cDx;
          }
          if (dir.includes('n')) {
            const cDy = Math.max(-o.y, Math.min(o.h - 200, dy));
            ny = o.y + cDy; nh = o.h - cDy;
          }
          win.x = nx; win.y = ny; win.w = nw; win.h = nh;
          win.prevRect = { x: nx, y: ny, w: nw, h: nh };
          this._syncWindowRect(win);
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          this.rootEl.classList.remove('is-dragging-win');
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    });
  }

  _syncWindowRect(win) {
    win.el.style.left = `${win.x}px`;
    win.el.style.top = `${win.y}px`;
    win.el.style.width = `${win.w}px`;
    win.el.style.height = `${win.h}px`;
    win.el.classList.toggle('is-maximized', win.state === 'maximized');
    if (win.appId === 'subsystem' && win.childId) {
      const c = this.children.get(win.childId);
      if (c) c.viewport = { w: Math.max(280, win.w), h: Math.max(180, win.h - 62) };
    }
    if (win.appId === 'projection') {
      this._renderOuterProjectionWindow(win);
    }
  }

  setWindowTitle(winId, title) {
    const win = this.windows.find((w) => w.id === winId);
    if (!win) return;
    win.title = title;
    const tEl = win.el.querySelector('.win-title-text');
    if (tEl) tEl.textContent = title;
    this._renderTaskbar();
  }

  focusWindow(winId) {
    const win = this.windows.find((w) => w.id === winId);
    if (!win) return;
    if (win.minimized) {
      win.minimized = false;
      win.el.style.display = 'flex';
      if (win.controller?.setMinimized) win.controller.setMinimized(false);
    }
    win.z = ++this.zCounter;
    win.el.style.zIndex = String(win.z);
    this.focusedWinId = winId;
    for (const w of this.windows) {
      w.focused = w.id === winId;
      w.el.classList.toggle('is-focused', w.focused);
    }
    this._renderTaskbar();
  }

  minimizeWindow(winId) {
    const win = this.windows.find((w) => w.id === winId);
    if (!win) return;
    win.minimized = true;
    win.el.style.display = 'none';
    if (win.controller?.setMinimized) win.controller.setMinimized(true);
    if (this.focusedWinId === winId) {
      const next = [...this.windows].filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0];
      this.focusedWinId = next ? next.id : null;
      for (const w of this.windows) {
        w.focused = w.id === this.focusedWinId;
        w.el.classList.toggle('is-focused', w.focused);
      }
    }
    this._renderTaskbar();
  }

  toggleMaximizeWindow(winId) {
    const win = this.windows.find((w) => w.id === winId);
    if (!win) return;
    const area = this._getWorkArea();
    if (win.state === 'maximized') {
      win.state = 'normal';
      win.x = win.prevRect.x;
      win.y = win.prevRect.y;
      win.w = win.prevRect.w;
      win.h = win.prevRect.h;
    } else {
      if (win.state === 'normal') win.prevRect = { x: win.x, y: win.y, w: win.w, h: win.h };
      win.state = 'maximized';
      win.x = 0; win.y = 0; win.w = area.w; win.h = area.h;
    }
    this._syncWindowRect(win);
    const maxBtn = win.el.querySelector('[data-testid="window-maximize"]');
    if (maxBtn) maxBtn.textContent = win.state === 'maximized' ? '❐' : '□';
  }

  closeWindow(winId, force = false, silentProj = false) {
    const idx = this.windows.findIndex((w) => w.id === winId);
    if (idx < 0) return;
    const win = this.windows[idx];

    if (!force && win.appId === 'subsystem') {
      this.showConfirmModal({
        title: '确认关闭子系统',
        message: `关闭 ${win.childId} 将停止该子系统及所有后代中的程序。已保存的快照仍可重新打开。是否确认？`,
        buttons: [
          { label: '确认停止子树', kind: 'danger', onClick: () => this.closeWindow(winId, true) },
          { label: '取消', kind: 'secondary', onClick: () => {} },
        ],
      });
      return;
    }

    if (!force && win.controller?.beforeClose) {
      win.controller.beforeClose(() => this.closeWindow(winId, true));
      return;
    }

    if (win.appId === 'subsystem' && win.childId) {
      this._stopChildCarrier(win.childId);
    }
    if (win.appId === 'projection' && win.projKey) {
      this.projections.delete(win.projKey);
      if (!silentProj) {
        this.routeCommandToSystem(win.sourceSystemId, { type: 'proj_stop', windowId: win.sourceWindowId });
      }
    }
    if (win.controller?.destroy) {
      try { win.controller.destroy(); } catch {}
    }

    win.el.remove();
    this.windows.splice(idx, 1);
    if (this.focusedWinId === winId) {
      const next = [...this.windows].filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0];
      this.focusedWinId = next ? next.id : null;
      for (const w of this.windows) {
        w.focused = w.id === this.focusedWinId;
        w.el.classList.toggle('is-focused', w.focused);
      }
    }
    this._renderTaskbar();
  }

  _renderTaskbar() {
    this.tbItemsEl.innerHTML = this.windows.map((w) => `
      <button class="tb-item${w.focused ? ' focused' : ''}${w.minimized ? ' minimized' : ''}"
        data-testid="taskbar-item" data-system-id="outer" data-window-id="${w.id}" aria-label="${w.title}">
        ${iconHtml(w.appId, 'tb-ico')}<span class="tb-item-txt">${w.title}</span>
      </button>
    `).join('');

    this.tbItemsEl.querySelectorAll('[data-testid="taskbar-item"]').forEach((b) => {
      b.addEventListener('click', () => {
        const wid = b.dataset.windowId;
        const win = this.windows.find((x) => x.id === wid);
        if (!win) return;
        if (win.minimized) this.focusWindow(wid);
        else if (this.focusedWinId === wid) this.minimizeWindow(wid);
        else this.focusWindow(wid);
      });
    });
  }

  openApp(appId, launchArgs = {}) {
    if (appId === 'files') {
      const w = this._createWindow({ appId: 'files', title: '文件管理器', w: 760, h: 480 });
      w.controller = mountRootFilesApp(this, w, w.bodyEl, launchArgs);
      return w;
    }
    if (appId === 'spreadsheet') {
      const w = this._createWindow({ appId: 'spreadsheet', title: '电子表格', w: 800, h: 510 });
      w.controller = mountSpreadsheetApp(this, w, w.bodyEl, launchArgs);
      return w;
    }
    if (appId === 'browser') {
      const w = this._createWindow({ appId: 'browser', title: 'Chromium 浏览器', w: 980, h: 640 });
      w.controller = mountBrowserApp(this, w, w.bodyEl, launchArgs);
      return w;
    }
    if (appId === 'editor') {
      const w = this._createWindow({ appId: 'editor', title: '文本与程序编辑器', w: 780, h: 540 });
      w.controller = mountRootEditorApp(this, w, w.bodyEl, launchArgs);
      return w;
    }
    if (appId === 'tasks') {
      const w = this._createWindow({ appId: 'tasks', title: '任务与系统树管理器', w: 860, h: 590 });
      w.controller = mountRootTasksApp(this, w, w.bodyEl);
      return w;
    }
    if (appId === 'settings') {
      const w = this._createWindow({ appId: 'settings', title: '系统设置', w: 640, h: 520 });
      w.controller = mountRootSettingsApp(this, w, w.bodyEl);
      return w;
    }
    if (appId === 'widgets') {
      const w = this._createWindow({ appId: 'widgets', title: '小组件中心', w: 620, h: 520 });
      renderWidgetsContent(this, w.bodyEl, w.id);
      return w;
    }
    if (appId === 'help') {
      const w = this._createWindow({ appId: 'help', title: 'Nested OS 简体中文操作说明', w: 860, h: 580 });
      w.controller = mountRootHelpApp(this, w, w.bodyEl);
      return w;
    }
    return null;
  }

  openSubsystemWindow(carrier) {
    const area = this._getWorkArea();
    const ww = Math.min(Math.floor(area.w * 0.78), area.w - 110);
    const wh = Math.min(Math.floor(area.h * 0.84), area.h - 24);
    const wx = Math.max(96, Math.floor((area.w - ww) * 0.72));
    const wy = 16;
    const win = this._createWindow({
      appId: 'subsystem',
      title: `${carrier.name} (${carrier.id})`,
      w: ww,
      h: wh,
      x: wx,
      y: wy,
      childId: carrier.id,
    });
    win.bodyEl.className = 'win-body win-body-sub';
    const bar = document.createElement('div');
    bar.className = 'sub-host-bar';
    const mount = document.createElement('div');
    mount.className = 'sub-host-viewport';
    win.bodyEl.append(bar, mount);
    win.subBarEl = bar;
    win.subMountEl = mount;
    carrier.viewport = { w: Math.max(280, ww), h: Math.max(180, wh - 62) };
    this._renderRootSubsystemHostBar(win, carrier);
    return win;
  }

  _renderRootSubsystemHostBar(win, c) {
    const vt = c.lastMetrics?.vtime ?? 0;
    const key = `${c.id}|${c.state}|${c.paused}|${c.timeRate}|${vt.toFixed(1)}`;
    if (win._lastSubBarKey === key) return;
    win._lastSubBarKey = key;
    const stText = c.state === 'error' ? '内核错误' : (c.paused ? '已暂停' : '运行中');
    win.subBarEl.innerHTML = `
      <span class="shb-status st-${c.state === 'error' ? 'error' : (c.paused ? 'paused' : 'running')}">${stText} · ${c.id}</span>
      <span class="shb-time">T ${vt.toFixed(1)}s · ${Number(c.timeRate || 1).toFixed(1)}x</span>
      <div class="shb-btns">
        ${c.paused
          ? `<button class="mini-btn" data-testid="system-resume" data-system-id="outer" data-target-system-id="${c.id}" data-sa="resume">继续</button>`
          : `<button class="mini-btn" data-testid="system-pause" data-system-id="outer" data-target-system-id="${c.id}" data-sa="pause">暂停</button>`}
        <button class="mini-btn" data-sa="step" ${c.paused ? '' : 'disabled'}>单步</button>
        <button class="mini-btn" data-testid="system-restart" data-system-id="outer" data-target-system-id="${c.id}" data-sa="restart">重启</button>
        <button class="mini-btn" data-testid="kernel-open" data-system-id="outer" data-target-system-id="${c.id}" data-sa="open_kernel">打开内核</button>
        <button class="mini-btn" data-sa="snapshot">快照</button>
        <button class="mini-btn" data-sa="fork_last">分叉</button>
      </div>
    `;
    win.subBarEl.querySelectorAll('[data-sa]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const act = b.dataset.sa;
        if (act === 'snapshot') this.snapshotChildSystem(c.id);
        else if (act === 'fork_last') {
          const r = this.forkLastSnapshotForChild(c.id);
          if (!r.ok) {
            const sr = this.snapshotChildSystem(c.id);
            if (sr.ok) this.forkChildSnapshot(sr.path);
          }
        } else {
          this.controlChildSystem(c.id, { action: act });
        }
      });
    });
  }

  // ==================== Bidirectional Cross-Layer File Drag-and-Drop ====================

  _initCrossLayerDragDrop() {
    let dragInfo = null; // { fromSysId, filePath, fileName }
    let lastDropEl = null;

    const findTopmostDropZone = (clientX, clientY) => {
      const els = document.elementsFromPoint(clientX, clientY);
      for (const el of els) {
        // Stop if occluded by a non-drop window above!
        if (el.matches?.('[data-drop-system-id]')) {
          return { el, targetSysId: el.dataset.dropSystemId, targetDir: el.dataset.dropDir || '/Documents' };
        }
        const win = el.closest?.('[data-testid="app-window"]');
        if (win && win.dataset.appId !== 'files' && win.dataset.appId !== 'subsystem') {
          return null;
        }
      }
      return null;
    };

    const clearDropHighlight = () => {
      if (lastDropEl) lastDropEl.classList.remove('drop-target-active');
      lastDropEl = null;
      this.dragPillEl.style.display = 'none';
    };

    // 1. HTML5 Drag-and-Drop (supports browser/Playwright dragTo!)
    document.addEventListener('dragstart', (e) => {
      const row = e.target.closest?.('[data-drag-file-path]');
      if (!row) return;
      dragInfo = {
        fromSysId: row.dataset.dragSystemId,
        filePath: row.dataset.dragFilePath,
        fileName: baseName(row.dataset.dragFilePath),
      };
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', JSON.stringify(dragInfo));
    });

    document.addEventListener('dragover', (e) => {
      if (!dragInfo) return;
      const hit = findTopmostDropZone(e.clientX, e.clientY);
      if (hit && hit.targetSysId !== dragInfo.fromSysId) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (lastDropEl && lastDropEl !== hit.el) lastDropEl.classList.remove('drop-target-active');
        lastDropEl = hit.el;
        hit.el.classList.add('drop-target-active');
        const loc = this._clientToRoot(e.clientX, e.clientY);
        this.dragPillEl.style.display = 'block';
        this.dragPillEl.style.left = `${loc.x + 14}px`;
        this.dragPillEl.style.top = `${loc.y + 14}px`;
        this.dragPillEl.textContent = `跨层传递 ${dragInfo.fileName} → ${hit.targetSysId}:${hit.targetDir}`;
      } else {
        clearDropHighlight();
      }
    });

    document.addEventListener('drop', (e) => {
      if (!dragInfo) return;
      const hit = findTopmostDropZone(e.clientX, e.clientY);
      const info = dragInfo;
      dragInfo = null;
      clearDropHighlight();
      if (hit && hit.targetSysId !== info.fromSysId) {
        e.preventDefault();
        this.transferFileCrossLayer(info.fromSysId, info.filePath, hit.targetSysId, hit.targetDir);
      }
    });

    document.addEventListener('dragend', () => {
      dragInfo = null;
      clearDropHighlight();
    });

    // 2. Pointer-based cross-layer drag fallback (for synthetic pointer drags / touch / non-HTML5 environments)
    let ptrDrag = null;
    document.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const row = e.target.closest?.('[data-drag-file-path]');
      if (!row) return;
      ptrDrag = {
        fromSysId: row.dataset.dragSystemId,
        filePath: row.dataset.dragFilePath,
        fileName: baseName(row.dataset.dragFilePath),
        startX: e.clientX,
        startY: e.clientY,
        active: false,
      };
    });
    document.addEventListener('dragstart', () => {
      // HTML5 drag took over — yield to HTML5 handler so we never double-transfer
      ptrDrag = null;
    });
    window.addEventListener('pointermove', (e) => {
      if (!ptrDrag || dragInfo) return;
      const dist = Math.hypot(e.clientX - ptrDrag.startX, e.clientY - ptrDrag.startY);
      if (!ptrDrag.active && dist > 10) {
        ptrDrag.active = true;
      }
      if (!ptrDrag.active) return;
      const hit = findTopmostDropZone(e.clientX, e.clientY);
      if (hit && hit.targetSysId !== ptrDrag.fromSysId) {
        if (lastDropEl && lastDropEl !== hit.el) lastDropEl.classList.remove('drop-target-active');
        lastDropEl = hit.el;
        hit.el.classList.add('drop-target-active');
        const loc = this._clientToRoot(e.clientX, e.clientY);
        this.dragPillEl.style.display = 'block';
        this.dragPillEl.style.left = `${loc.x + 14}px`;
        this.dragPillEl.style.top = `${loc.y + 14}px`;
        this.dragPillEl.textContent = `跨层传递 ${ptrDrag.fileName} → ${hit.targetSysId}:${hit.targetDir}`;
      } else {
        clearDropHighlight();
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (!ptrDrag) return;
      const pd = ptrDrag;
      ptrDrag = null;
      if (pd.active && !dragInfo) {
        const hit = findTopmostDropZone(e.clientX, e.clientY);
        clearDropHighlight();
        if (hit && hit.targetSysId !== pd.fromSysId) {
          this.transferFileCrossLayer(pd.fromSysId, pd.filePath, hit.targetSysId, hit.targetDir);
        }
      }
    });
    window.addEventListener('pointercancel', () => {
      if (ptrDrag?.active) clearDropHighlight();
      ptrDrag = null;
    });
  }

  // ==================== Telemetry & window.bench.inspect() ====================

  getTotalMemUsed() {
    let total = 2 * 1048576;
    for (const p of this.rootProcs) total += p.memBytes || 0;
    for (const c of this.children.values()) total += c.memBytes || 0;
    return total;
  }

  getAllBrowserTabs() {
    const out = [];
    for (const b of this.browsers.values()) {
      out.push(...b.getTabsInfo());
    }
    return out;
  }

  getSystemTreeHierarchy() {
    const convert = (m, fallback) => {
      const id = m?.systemId || fallback.id;
      return {
        id,
        parentId: m?.parentId || fallback.parentId,
        name: m?.name || fallback.name,
        state: fallback.overrideState || m?.state || 'running',
        vtime: m?.vtime || 0,
        timeRate: m?.timeRate || fallback.timeRate || 1,
        children: (m?.children || []).map((ch) => convert(ch, { id: ch.systemId, parentId: id, name: ch.name })),
      };
    };
    const list = [];
    for (const c of this.children.values()) {
      const st = c.state === 'error' ? 'error' : (c.paused ? 'paused' : 'running');
      list.push(convert(c.lastMetrics, { id: c.id, parentId: 'outer', name: c.name, overrideState: st, timeRate: c.timeRate }));
    }
    return list;
  }

  countAllSubsystems() {
    let n = 0;
    const walk = (arr) => {
      for (const x of arr) { n += 1; walk(x.children || []); }
    };
    walk(this.getSystemTreeHierarchy());
    return n;
  }

  inspectState() {
    const systems = [
      { id: 'outer', parentId: null, name: this.settings.systemName, state: 'running', vtime: Number(this.vtime.toFixed(3)), timeRate: 1 },
    ];
    const windows = [];
    const players = [];
    const charts = [];
    const projections = [];

    for (const w of this.windows) {
      const st = w.minimized ? 'minimized' : w.state;
      windows.push({ id: w.id, systemId: 'outer', appId: w.appId, title: w.title, state: st });
      if (w.appId === 'projection') {
        projections.push({
          windowId: w.id,
          systemId: 'outer',
          sourceSystemId: w.sourceSystemId,
          sourceWindowId: w.sourceWindowId,
          sourceAppId: w.sourceAppId,
          state: this.getSystemPauseReason(w.sourceSystemId) ? 'paused' : 'active',
        });
      }
    }

    const collectSubtree = (m, fallbackId, parentId, forcedState) => {
      const sysId = m?.systemId || fallbackId;
      const sysState = forcedState || m?.state || 'running';
      systems.push({
        id: sysId,
        parentId,
        name: m?.name || sysId,
        state: sysState,
        vtime: Number((m?.vtime || 0).toFixed(3)),
        timeRate: m?.timeRate || 1,
      });
      if (m) {
        for (const w of (m.windows || [])) {
          windows.push({
            id: w.id,
            systemId: sysId,
            appId: w.appId,
            title: w.title,
            state: w.state,
          });
        }
        for (const p of (m.players || [])) {
          players.push({
            windowId: p.windowId,
            systemId: sysId,
            state: p.state,
            position: p.position,
            duration: p.duration,
            rate: p.rate,
            scene: p.scene,
            frameTime: p.frameTime,
          });
        }
        for (const ch of (m.charts || [])) {
          charts.push({
            windowId: ch.windowId,
            systemId: sysId,
            sourceTitle: ch.sourceTitle,
            range: ch.range,
            chartType: ch.chartType,
            connectionState: ch.connectionState,
          });
        }
        for (const sub of (m.children || [])) {
          collectSubtree(sub, sub.systemId, sysId, null);
        }
      }
    };

    for (const c of this.children.values()) {
      const st = c.state === 'error' ? 'error' : (c.paused ? 'paused' : 'running');
      collectSubtree(c.lastMetrics, c.id, 'outer', st);
    }

    return {
      systems,
      windows,
      browsers: this.getAllBrowserTabs(),
      players,
      charts,
      projections,
    };
  }
}
