// 系统运行时：进程表、调度、消息、文件系统、虚拟时钟、系统调用、快照
import { Process, Builtins, compile } from './lang.js';
import { deepClone, clamp } from './util.js';

export const STEP_MS = 20;
export const VERSION = 1;

const utf8len = s => new TextEncoder().encode(String(s || '')).length;

export function normalizePath(p) {
  if (!p) return '/';
  let path = String(p).replace(/\\/g, '/');
  if (!path.startsWith('/')) path = '/' + path;
  const parts = [];
  for (const seg of path.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return '/' + parts.join('/');
}
export function dirname(p) { const n = normalizePath(p); const i = n.lastIndexOf('/'); return i <= 0 ? '/' : n.slice(0, i); }
export function basename(p) { const n = normalizePath(p); const i = n.lastIndexOf('/'); return n.slice(i + 1); }
export function joinPath(a, b) { return normalizePath(normalizePath(a) + '/' + b); }
export function extOf(p) { const b = basename(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1).toLowerCase() : ''; }

export class FS {
  constructor() {
    this.files = new Map();
    this.ensureDir('/');
  }
  ensureDir(path) {
    path = normalizePath(path);
    if (!this.files.has(path)) {
      this.files.set(path, { path, dir: true, content: '', modified: 0, size: 0 });
    }
    let parent = dirname(path);
    while (parent && parent !== '/') {
      if (!this.files.has(parent)) this.files.set(parent, { path: parent, dir: true, content: '', modified: 0, size: 0 });
      parent = dirname(parent);
    }
  }
  list(path) {
    path = normalizePath(path);
    const node = this.files.get(path);
    if (!node || !node.dir) return null;
    const out = [];
    for (const [p, f] of this.files) {
      if (dirname(p) === path) out.push(f);
    }
    return out;
  }
  get(path) { return this.files.get(normalizePath(path)) || null; }
  exists(path) { return this.files.has(normalizePath(path)); }
  isDir(path) { const f = this.get(path); return !!(f && f.dir); }
  read(path) { const f = this.get(path); return f && !f.dir ? f.content : null; }
  write(path, content, modified = 0) {
    path = normalizePath(path);
    if (this.isDir(path)) return false;
    this.ensureDir(dirname(path));
    const f = this.files.get(path) || { path };
    f.dir = false; f.content = String(content); f.modified = modified; f.size = utf8len(f.content);
    this.files.set(path, f);
    return true;
  }
  mkdir(path) { path = normalizePath(path); this.ensureDir(path); return true; }
  remove(path) { return this.files.delete(normalizePath(path)); }
  rename(oldPath, newPath) {
    oldPath = normalizePath(oldPath); newPath = normalizePath(newPath);
    const f = this.get(oldPath);
    if (!f) return false;
    if (f.dir) {
      const prefix = oldPath === '/' ? '/' : oldPath + '/';
      const entries = [...this.files.entries()].filter(([p]) => p === oldPath || p.startsWith(prefix));
      for (const [p, node] of entries) {
        const np = newPath + p.slice(oldPath.length);
        this.files.delete(p);
        node.path = np;
        this.files.set(np, node);
      }
      return true;
    }
    this.files.delete(oldPath);
    f.path = newPath;
    f.modified = Date.now();
    this.files.set(newPath, f);
    return true;
  }
  copy(oldPath, newPath) {
    oldPath = normalizePath(oldPath); newPath = normalizePath(newPath);
    const f = this.get(oldPath);
    if (!f) return false;
    if (f.dir) {
      const prefix = oldPath === '/' ? '/' : oldPath + '/';
      const entries = [...this.files.entries()].filter(([p]) => p === oldPath || p.startsWith(prefix));
      for (const [p, node] of entries) {
        const np = newPath + p.slice(oldPath.length);
        this.ensureDir(dirname(np));
        this.files.set(np, { ...deepClone(node), path: np });
      }
      return true;
    }
    this.ensureDir(dirname(newPath));
    this.files.set(newPath, { ...deepClone(f), path: newPath, modified: Date.now() });
    return true;
  }
  storageUsed() { let n = 0; for (const f of this.files.values()) if (!f.dir) n += f.size; return n; }
  toJSON() { return [...this.files.values()].map(f => ({ ...f })); }
  static fromJSON(arr) {
    const fs = new FS();
    fs.files.clear();
    for (const f of arr || []) fs.files.set(f.path, { ...f });
    if (!fs.files.has('/')) fs.files.set('/', { path: '/', dir: true, content: '', modified: 0, size: 0 });
    return fs;
  }
}

export class System {
  constructor(os, opts = {}) {
    this.os = os;
    this.id = opts.id;
    this.name = opts.name || opts.id;
    this.parentId = opts.parentId ?? null;
    this.parent = opts.parent || null;
    this.depth = opts.depth ?? 0;
    this.state = opts.state || 'running';
    this.speed = opts.speed ?? 1;
    this.clock = opts.clock ?? 0;
    this.stepMs = STEP_MS;
    this.budget = opts.budget ?? 60000;
    this.grantRatio = opts.grantRatio ?? 0.5;
    this.lastGrant = opts.lastGrant ?? this.budget;
    this.ownShare = opts.ownShare ?? 0.5;
    this.memoryLimit = opts.memoryLimit ?? 512 * 1024 * 1024;
    this.storageLimit = opts.storageLimit ?? 256 * 1024 * 1024;
    this.fs = opts.fs || new FS();
    this.processes = [];
    this.nextPid = opts.nextPid ?? 1;
    this.kernel = null;
    this.kernelSourcePath = opts.kernelSourcePath || null;
    this.kernelSource = opts.kernelSource || '';
    this.policy = { quantum: 420, priorities: {}, msgLimit: 64, fsRules: [] };
    this.rngState = opts.rngState ?? 123456789;
    this.apps = opts.apps || {};
    this.projectionWindows = [];
    this.totalUsed = 0;
    this.totalMem = 0;
    this.storageUsed = 0;
    this.grant = 0;
    this.errorLog = [];
    this.lastStepUsed = 0;
    this.stepCount = 0;
    this.kernelErrors = 0;
    this.msgSeq = 1;
    this.serviceReq = 1;
    this.pendingServices = new Map();
    this.processLimit = opts.processLimit ?? 64;
    this.forceStep = false;
    this._childGrants = {};
    this._childUsed = {};
    this.children = [];
    this.compilerConfig = { maxDepth: 32, maxOps: 200000, allowIndex: 1 };
    this.panelState = {};
    this.wmConfig = { cascade: 26, focusRule: 1 };
    this.filesSort = 0;
    if (this.parent) { this.depth = this.parent.depth + 1; this.parentId = this.parent.id; }
    this.syncStorage();
  }
  get isRoot() { return !this.parent; }
  get effectiveState() {
    let s = this.state;
    let p = this.parent;
    while (p) {
      if (p.state === 'paused') return 'paused';
      if (p.state === 'stopped' || p.state === 'error') return s === 'stopped' ? 'stopped' : 'blocked';
      if (s === 'stopped' || s === 'paused' || s === 'error') return s;
      p = p.parent;
    }
    return s;
  }
  get running() {
    if (this.effectiveState === 'running') return true;
    return this.forceStep && this.state === 'paused' && this.parent && this.parent.effectiveState === 'running';
  }
  get isPaused() { return this.effectiveState === 'paused'; }
  get blockedByAncestor() {
    let p = this.parent;
    while (p) {
      if (p.state === 'paused') return true;
      if (p.state === 'stopped' || p.state === 'error') return true;
      p = p.parent;
    }
    return false;
  }
  syncStorage() { this.storageUsed = this.fs.storageUsed(); }
  addLog(msg) { this.errorLog.push({ t: this.clock, msg }); if (this.errorLog.length > 50) this.errorLog.shift(); }

  spawn(name, source, opts = {}) {
    let program;
    try { program = compile(source); } catch (e) {
      return { ok: false, error: '编译失败：' + e.message };
    }
    if (this.compilerConfig) {
      if (program.code.length > this.compilerConfig.maxOps) return { ok: false, error: '编译失败：指令数超过编译器上限' };
    }
    const pid = opts.pid ?? this.nextPid++;
    if (pid >= this.nextPid) this.nextPid = pid + 1;
    const proc = new Process(this, name, source, program, { id: pid, quota: opts.quota, type: opts.type, meta: opts.meta });
    if (opts.pid != null) proc.id = pid;
    this.processes.push(proc);
    this.chargeMemory(proc, 512 + utf8len(source));
    return { ok: true, proc };
  }

  chargeMemory(proc, bytes) {
    proc.mem = (proc.mem || 0) + bytes;
    this.totalMem = this.processes.reduce((n, p) => n + (p.state === 'finished' ? 0 : (p.mem || 0)), 0);
    if (this.totalMem > this.memoryLimit) this.addLog(`内存配额不足：${this.totalMem} / ${this.memoryLimit}`);
  }
  nextPidValue() { return this.nextPid++; }

  setPolicy(patch) { Object.assign(this.policy, patch); }
  setQuantum(q) { this.policy.quantum = clamp(Math.round(q), 20, 20000); }
  setPriority(pid, w) { this.policy.priorities[pid] = w; }
  setMsgLimit(n) { this.policy.msgLimit = clamp(Math.round(n), 1, 10000); }
  setFsRule(prefix, repl) {
    if (!prefix) this.policy.fsRules = [];
    else this.policy.fsRules = [{ prefix: normalizePath(prefix), repl: String(repl || '') }];
  }
  applyFsPath(path) {
    let p = normalizePath(path);
    for (const r of this.policy.fsRules) {
      if (r.prefix === '/') { p = normalizePath((r.repl || '') + p); continue; }
      if (p === r.prefix) { p = normalizePath(r.repl || '/'); break; }
      if (p.startsWith(r.prefix + '/')) { p = normalizePath((r.repl || '') + p.slice(r.prefix.length)); break; }
    }
    return p;
  }

  wakeDue() {
    for (const p of this.processes) {
      if (p.state === 'waiting' && p.waitKind === 'time' && this.clock >= p.wakeAt) {
        p.state = 'ready';
        p.waitKind = null;
        if (p.wakePushSet) { p.pendingPush = p.wakePush; p.wakePushSet = false; }
      } else if (p.state === 'waiting' && p.waitKind === 'msg' && p.inbox.length) {
        const m = p.inbox.shift();
        p.pendingPush = m.value;
        p.state = 'ready';
        p.waitKind = null;
      }
    }
  }

  deliver(pid, value, from) {
    const p = this.processes.find(x => x.id === pid);
    if (!p) return -1;
    if (p.inbox.length >= this.policy.msgLimit) return -2;
    p.inbox.push({ from: from ?? -1, value: deepClone(value), seq: this.msgSeq++ });
    if (p.state === 'waiting' && p.waitKind === 'msg') {
      const m = p.inbox.shift();
      p.pendingPush = m.value;
      p.state = 'ready';
      p.waitKind = null;
    }
    p.mem = (p.mem || 0) + 32 + utf8len(JSON.stringify(value));
    return 1;
  }

  allocate(total) {
    const children = this.children.filter(c => c.state === 'running');
    const ratios = children.map(c => c.grantRatio ?? 0.4);
    const sum = ratios.reduce((a, b) => a + b, 0);
    const cap = 0.88;
    const scale = sum > cap ? cap / sum : 1;
    const grants = {};
    children.forEach((c, i) => { grants[c.id] = total * ratios[i] * scale; });
    const usedForChildren = Object.values(grants).reduce((a, b) => a + b, 0);
    return { grants, own: Math.max(total * 0.08, total - usedForChildren) };
  }

  step(totalBudget, opts = {}) {
    if (!this.running) return 0;
    let speedProduct = 1;
    let walk = this;
    while (walk) { speedProduct *= (walk.speed || 1); walk = walk.parent; }
    const dt = this.forceStep ? this.stepMs : this.stepMs * speedProduct;
    this.clock += dt;
    this.stepCount++;
    this.wakeDue();
    for (const p of this.processes) { p.usedStep = 0; }
    const alloc = this.allocate(totalBudget);
    this.grant = totalBudget;
    this.lastGrant = totalBudget;
    const ownBudget = alloc.own;
    this._childGrants = alloc.grants;
    let used = 0;

    const kernel = this.processes.find(p => p.type === 'kernel');
    let remaining = ownBudget;
    if (kernel && kernel.state === 'ready') {
      const slice = Math.max(0, Math.min(kernel.quota - kernel.usedStep, ownBudget, Math.max(160, ownBudget * 0.18)));
      const u = kernel.runBudget(slice, this);
      used += u; remaining -= u;
      if (kernel.state === 'error') this.kernelFailed(kernel);
    }

    const runnable = this.processes.filter(p => p !== kernel && p.state === 'ready' && p.quota > 0);
    runnable.sort((a, b) => {
      const wa = this.policy.priorities[a.id] || 0, wb = this.policy.priorities[b.id] || 0;
      if (wb !== wa) return wb - wa;
      return a.id - b.id;
    });
    let guard = 0;
    const quantum = this.policy.quantum;
    while (remaining > 0 && guard < 200) {
      let progressed = false;
      for (const p of runnable) {
        if (remaining <= 0) break;
        if (p.state !== 'ready') continue;
        const room = p.quota - p.usedStep;
        if (room <= 0) continue;
        const slice = Math.min(quantum, room, remaining);
        const u = p.runBudget(slice, this);
        if (u > 0) { remaining -= u; used += u; progressed = true; }
        if (p.state === 'finished' && !p._finishNotified) {
          p._finishNotified = true;
          if (this.os?.onProcessFinished) this.os.onProcessFinished(this, p);
        }
      }
      guard++;
      if (!progressed) break;
      if (!runnable.some(p => p.state === 'ready' && p.quota - p.usedStep > 0)) break;
    }

    let childUsed = 0;
    for (const c of this.children) {
      if (c.state === 'stopped') continue;
      const g = alloc.grants[c.id] ?? 0;
      const before = c.totalUsed;
      if (c.state === 'paused') { this._childUsed[c.id] = 0; continue; }
      const u = c.step(g, { dtScale: this.speed });
      childUsed += u;
      this._childUsed[c.id] = c.totalUsed - before;
    }
    used += childUsed;
    this.lastStepUsed = used;
    this.totalUsed += used;
    this.totalMem = this.processes.reduce((n, p) => n + (p.state === 'finished' ? 0 : (p.mem || 0)), 0);
    this.syncStorage();
    if (this.os?.onSystemStep) this.os.onSystemStep(this, used, alloc);
    return used;
  }

  kernelFailed(proc) {
    this.state = 'error';
    this.kernelErrors++;
    const msg = proc.error || '内核程序异常';
    this.addLog('内核错误：' + msg);
    if (this.os?.onKernelError) this.os.onKernelError(this, msg);
  }

  syscall(name, args, proc) {
    const A = args || [];
    const n = (i, d = 0) => (typeof A[i] === 'number' ? A[i] : d);
    const s = (i, d = '') => (A[i] == null ? d : String(A[i]));
    switch (name) {
      case 'time': return { value: this.clock / 1000 };
      case 'clock': return { value: this.clock / 1000 };
      case 'sleep': {
        const ms = Math.max(0, n(0, 0));
        if (ms <= 0) { proc.yieldFlag = true; return { value: 0 }; }
        return { block: { kind: 'time', wakeAt: this.clock + ms } };
      }
      case 'yield': proc.yieldFlag = true; return { value: 0 };
      case 'self': return { value: proc.id };
      case 'pid': return { value: proc.id };
      case 'name': return { value: proc.name };
      case 'spawn': {
        const path = this.applyFsPath(s(0));
        const f = this.fs.get(path);
        if (!f || f.dir) { proc.log('启动失败：找不到程序 ' + path); return { value: -1, cost: 4 }; }
        const nm = s(1) || basename(path).replace(/\.[^.]+$/, '');
        if (this.processes.length >= this.processLimit) { proc.log('启动失败：进程额度已满'); return { value: -1, cost: 4 }; }
        if (this.totalMem + utf8len(f.content) + 1024 > this.memoryLimit) { proc.log('启动失败：内存配额不足'); return { value: -1, cost: 4 }; }
        const r = this.spawn(nm, f.content, { type: 'program', quota: 1200 });
        if (!r.ok) { proc.log(r.error); return { value: -1, cost: 4 }; }
        proc.log(`启动进程 ${r.proc.id}：${nm}`);
        return { value: r.proc.id, cost: 12 + Math.ceil(utf8len(f.content) / 100) };
      }
      case 'kill': {
        const pid = n(0, -1);
        if (pid === 0) return { value: 0, cost: 2 };
        const p = this.processes.find(x => x.id === pid);
        if (!p) return { value: -1, cost: 2 };
        p.state = 'finished'; p.error = null;
        return { value: 1, cost: 3 };
      }
      case 'send': {
        const pid = n(0, -1);
        const val = A[1];
        const r = this.deliver(pid, val, proc.id);
        return { value: r, cost: 4 + Math.ceil(utf8len(JSON.stringify(val ?? '')) / 30) };
      }
      case 'recv': {
        const timeout = A.length ? n(0, -1) : -1;
        if (proc.inbox.length) {
          const m = proc.inbox.shift();
          return { value: m.value, cost: 3 };
        }
        if (timeout === 0) return { value: -1, cost: 2 };
        if (timeout < 0) return { block: { kind: 'msg' } };
        proc.wakeAt = this.clock + timeout;
        proc.wakePushSet = true;
        proc.wakePush = -1;
        return { block: { kind: 'time', wakeAt: proc.wakeAt } };
      }
      case 'msg_count': return { value: proc.inbox.length, cost: 1 };
      case 'file_read': {
        const path = this.applyFsPath(s(0));
        const f = this.fs.get(path);
        if (!f || f.dir) { proc.log('读取失败：' + path); return { value: '', cost: 2 }; }
        return { value: f.content, cost: 2 + Math.ceil(f.size / 200) };
      }
      case 'file_write': {
        const path = this.applyFsPath(s(0));
        const content = s(1);
        if (this.fs.storageUsed() - (this.fs.get(path)?.size || 0) + utf8len(content) > this.storageLimit) {
          proc.log('写入失败：存储配额不足');
          return { value: 0, cost: 3 };
        }
        const ok = this.fs.write(path, content, Date.now());
        this.syncStorage();
        if (this.os?.onFsChange) this.os.onFsChange(this, path);
        return { value: ok ? 1 : 0, cost: 2 + Math.ceil(utf8len(content) / 120) };
      }
      case 'file_exists': return { value: this.fs.exists(this.applyFsPath(s(0))) ? 1 : 0, cost: 2 };
      case 'file_list': {
        const list = this.fs.list(this.applyFsPath(s(0))) || [];
        return { value: list.map(f => f.path), cost: 2 + Math.ceil(list.length / 8) };
      }
      case 'file_delete': {
        const path = this.applyFsPath(s(0));
        const f = this.fs.get(path);
        if (!f || f.dir) return { value: 0, cost: 2 };
        this.fs.remove(path);
        this.syncStorage();
        if (this.os?.onFsChange) this.os.onFsChange(this, path);
        return { value: 1, cost: 2 + Math.ceil(f.size / 400) };
      }
      case 'file_mkdir': { const ok = this.fs.mkdir(this.applyFsPath(s(0))); if (this.os?.onFsChange) this.os.onFsChange(this, s(0)); return { value: ok ? 1 : 0, cost: 2 }; }
      case 'log': proc.log(A.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(' ')); return { value: 1, cost: 1 };
      case 'rand': {
        this.rngState = (Math.imul(this.rngState, 1664525) + 1013904223) >>> 0;
        const r = this.rngState / 4294967296;
        return { value: A.length ? Math.floor(r * n(0, 1)) : r, cost: 1 };
      }
      case 'wm_config': {
        if (this.os?.onWmConfig) this.os.onWmConfig(this, n(0, 26), n(1, 1));
        return { value: 1, cost: 1 };
      }
      case 'files_config': {
        if (this.os?.onFilesConfig) this.os.onFilesConfig(this, n(0, 0));
        return { value: 1, cost: 1 };
      }
      case 'player_tick': {
        const r = this.os?.playerTick ? this.os.playerTick(this) : null;
        return { value: r || 0, cost: r?.cost || 2 };
      }
      case 'flight_tick': {
        const r = this.os?.flightTick ? this.os.flightTick(this) : null;
        return { value: r || 0, cost: r?.cost || 2 };
      }
      case 'chart_tick': {
        const r = this.os?.chartTick ? this.os.chartTick(this) : null;
        return { value: r || 0, cost: r?.cost || 2 };
      }
      case 'chart_handle': {
        const r = this.os?.chartHandle ? this.os.chartHandle(this, A[0]) : null;
        return { value: r || 0, cost: r?.cost || 2 };
      }
      case 'sensor': return { value: this.os?.sensor ? this.os.sensor(this, n(0, 0)) : 0, cost: 1 };
      case 'control': {
        if (this.os?.control) this.os.control(this, n(0, .5), n(1, 0), n(2, 0), n(3, 0));
        return { value: 1, cost: 1 };
      }
      case 'set_quantum': this.setQuantum(n(0, 400)); return { value: 1, cost: 1 };
      case 'set_priority': this.setPriority(n(0, -1), n(1, 0)); return { value: 1, cost: 1 };
      case 'set_msg_limit': this.setMsgLimit(n(0, 64)); return { value: 1, cost: 1 };
      case 'set_fs_rule': this.setFsRule(s(0), s(1)); return { value: 1, cost: 1 };
      case 'set_own_share': this.ownShare = clamp(n(0, this.ownShare), 0.05, 0.95); return { value: 1, cost: 1 };
      case 'compiler_config': {
        this.compilerConfig = { maxDepth: n(0, 32), maxOps: n(1, 200000), allowIndex: n(2, 1) };
        return { value: 1, cost: 1 };
      }
      case 'service': {
        const req = this.serviceReq++;
        const tag = s(0);
        const value = A[1];
        const kernel = this.processes.find(p => p.type === 'kernel');
        if (!kernel) return { value: -1, cost: 2 };
        this.deliver(kernel.id, [tag, value, req], proc.id);
        proc.serviceReq = req;
        proc.waitKind = 'service';
        return { block: { kind: 'service' } };
      }
      case 'service_reply': {
        const req = n(0, -1), val = A[1];
        const entry = [...this.pendingServices.values()].find(e => e.req === req);
        if (!entry) return { value: 0, cost: 1 };
        entry.proc.serviceValue = undefined;
        if (entry.proc.state === 'waiting' && entry.proc.waitKind === 'service') {
          entry.proc.pendingPush = val;
          entry.proc.state = 'ready';
          entry.proc.waitKind = null;
        }
        this.pendingServices.delete(entry.proc.id);
        return { value: 1, cost: 1 };
      }
      case 'kernel_stats': {
        const runnable = this.processes.filter(p => p.state === 'ready').length;
        return { value: [this.processes.length, runnable, Math.round(this.totalUsed)], cost: 1 };
      }
      case 'panel_clear': {
        const r = this.os?.panelClear ? this.os.panelClear(this, s(0), s(1)) : null;
        return { value: 1, cost: r?.cost || 1 };
      }
      case 'panel_rect': {
        const r = this.os?.panelRect ? this.os.panelRect(this, s(0), n(1), n(2), n(3), n(4), s(5)) : null;
        return { value: 1, cost: r?.cost || 1 };
      }
      case 'panel_text': {
        const r = this.os?.panelText ? this.os.panelText(this, s(0), n(1), n(2), s(3), s(4)) : null;
        return { value: 1, cost: r?.cost || 1 };
      }
      case 'scene_submit': {
        const r = this.os?.sceneSubmit ? this.os.sceneSubmit(this, A[0], A[1], proc) : null;
        return { value: r?.value ?? 0, cost: r?.cost || 2 };
      }
      default: {
        const b = Builtins.call(name, A, proc, this);
        if (b) return b;
        proc.log('未知系统调用：' + name);
        return { value: null, cost: 1 };
      }
    }
  }

  registerService(proc) {
    this.pendingServices.set(proc.id, { proc, req: proc.serviceReq });
  }

  serialize() {
    return {
      id: this.id, name: this.name, parentId: this.parentId, depth: this.depth,
      state: this.state, speed: this.speed, clock: this.clock,
      budget: this.budget, grantRatio: this.grantRatio, lastGrant: this.lastGrant,
      ownShare: this.ownShare, memoryLimit: this.memoryLimit, storageLimit: this.storageLimit,
      fs: this.fs.toJSON(), processes: this.processes.map(p => p.toSnapshot()),
      nextPid: this.nextPid, kernelSourcePath: this.kernelSourcePath,
      policy: deepClone(this.policy), rngState: this.rngState,
      apps: deepClone(this.apps), totalUsed: this.totalUsed, stepCount: this.stepCount,
      errorLog: this.errorLog.slice(-20), msgSeq: this.msgSeq
    };
  }

  static fromJSON(os, data, parent = null) {
    const sys = new System(os, {
      id: data.id, name: data.name, parentId: data.parentId ?? parent?.id ?? null,
      parent, depth: data.depth, state: data.state, speed: data.speed, clock: data.clock,
      budget: data.budget, grantRatio: data.grantRatio, lastGrant: data.lastGrant,
      ownShare: data.ownShare, memoryLimit: data.memoryLimit, storageLimit: data.storageLimit,
      fs: FS.fromJSON(data.fs), nextPid: data.nextPid, kernelSourcePath: data.kernelSourcePath,
      rngState: data.rngState, apps: data.apps
    });
    sys.policy = data.policy || sys.policy;
    sys.totalUsed = data.totalUsed || 0;
    sys.stepCount = data.stepCount || 0;
    sys.errorLog = data.errorLog || [];
    sys.msgSeq = data.msgSeq || 1;
    sys.kernelError = data.kernelError || null;
    sys.serviceReq = data.serviceReq || 1;
    sys.processes = [];
    for (const ps of data.processes || []) {
      let program;
      try { program = compile(ps.source); } catch (e) {
        program = { code: [{ op: 'halt', args: [], line: 0 }], source: ps.source };
      }
      const proc = new Process(sys, ps.name, ps.source, program, {
        id: ps.id, quota: ps.quota, type: ps.type, meta: ps.meta
      });
      proc.pc = ps.pc || 0;
      proc.stack = ps.stack || [];
      proc.vars = ps.vars || {};
      proc.state = ps.state || 'ready';
      proc.error = ps.error || null;
      proc.usedTotal = ps.usedTotal || 0;
      proc.wakeAt = ps.wakeAt || 0;
      proc.waitKind = ps.waitKind || null;
      proc.inbox = ps.inbox || [];
      proc.output = ps.output || [];
      proc.mem = ps.mem || 0;
      sys.processes.push(proc);
      if (proc.type === 'kernel') sys.kernel = proc;
    }
    for (const ps of data.pendingServices || []) {
      const p = sys.processes.find(x => x.id === ps.procId);
      if (p) sys.pendingServices.set(p.id, { proc: p, req: ps.req });
    }
    if (sys.nextPid == null) sys.nextPid = Math.max(1, ...sys.processes.map(p => p.id + 1));
    sys.syncStorage();
    return sys;
  }
}

export function createKernelProcess(sys, source, quota = 900) {
  const r = sys.spawn('kernel', source, { type: 'kernel', quota, pid: 0 });
  if (r.ok) sys.kernel = r.proc;
  return r;
}

export class Scheduler {
  constructor(os) {
    this.os = os;
    this.acc = 0;
    this.lastReal = performance.now();
    this.timer = null;
    this.running = false;
  }
  start() {
    if (this.timer) return;
    this.lastReal = performance.now();
    this.timer = setInterval(() => this.tick(), 16);
    this.running = true;
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; this.running = false; }
  tick() {
    const now = performance.now();
    let dt = now - this.lastReal;
    this.lastReal = now;
    if (dt > 250) dt = 250;
    const root = this.os.root;
    if (!root) return;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP_MS && steps < 4) {
      this.acc -= STEP_MS;
      steps++;
      if (root.effectiveState === 'running' || root.forceStep) {
        root.step(root.budget, {});
      }
    }
    this.os.afterTick(dt);
  }
}