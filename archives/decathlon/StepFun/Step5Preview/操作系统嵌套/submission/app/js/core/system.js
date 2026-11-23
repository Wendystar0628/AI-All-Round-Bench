// ============================================================
// 核心运行时：系统实例、进程表、系统调用分发、宿主调度器
// - 根系统由宿主直接实现（JS 内核）
// - 非根系统由存放在父系统文件系统中的内核程序运行（字节码虚拟机）
// ============================================================
import { VM, compileSource } from '../lib/vm.js';
import { VFS, deepClone } from './fs.js';
import { defaultHandlers } from './defaults.js';

export const STEP_MS = 1000 / 60;   // 逻辑步长（1 倍速每步推进的虚拟毫秒）
export const SINGLE_STEP_MS = 100;  // 单步固定推进的虚拟毫秒
const MAX_INBOX = 400;

let PROC_SEQ = 1;

export class Proc {
  constructor(system, o) {
    this.pid = o.pid;
    this.name = o.name || 'program';
    this.kind = o.kind || 'app';       // kernel | carrier | app | demo
    this.code = o.code;                // 字节码程序
    this.vm = new VM(this.code, o.globals || {});
    this.quota = o.quota || 0;         // 每逻辑步额度上限（0=不限制）
    this.used = 0;                     // 累计消耗（指令）
    this.stepUsed = 0;
    this.status = 'ready';             // ready|running|waiting|suspended|ended|error
    this.blocked = null;
    this.err = null;
    this.out = [];
    this.mem = o.mem || 0;
    this.childSystemId = o.childSystemId || null;
    this.spawnedAt = system ? system.vtime : 0;
    if (o.state) this.vm.loadState(o.state);
  }
  info() {
    return {
      pid: this.pid, name: this.name, kind: this.kind, status: this.status,
      quota: this.quota, used: this.used, stepUsed: this.stepUsed, err: this.err,
      blocked: this.blocked, out: this.out.slice(-40), childSystemId: this.childSystemId
    };
  }
}

export class System {
  constructor(host, o) {
    this.host = host;
    this.id = o.id;
    this.parentId = o.parentId || null;
    this.name = o.name || o.id;
    this.kind = o.kind || 'inner';     // root | inner
    this.vfs = o.vfs || new VFS();
    this.config = Object.assign({ budget: 12000, memQuota: 4000000, storageQuota: 2000000, procQuota: 4000, childGrant: 5000, quantum: 900 }, o.config || {});
    this.vtime = o.vtime || 0;
    this.rate = o.rate || 1;
    this.ownPaused = !!o.ownPaused;
    this.procs = new Map();
    this.nextPid = o.nextPid || 10;
    this.kernelPid = o.kernelPid || null;
    this.carrierPid = o.carrierPid || null;   // 承载进程在父系统中的 pid
    this.inbox = o.inbox || [];
    this.frame2d = o.frame2d || null;
    this.views3d = o.views3d || {};
    this.flight = o.flight || { state: null, ctrl: null };
    this.console = o.console || [];
    this.kernelError = o.kernelError || null;
    this.alive = o.alive !== false;
    this.createdAt = o.createdAt || Date.now();
    this.kernelSourcePath = o.kernelSourcePath || null;
    this.subscriptions = o.subscriptions || [];
    this.compilerPid = o.compilerPid || null;
    this.pendingStep = 0;
    this.depth = o.depth || 1;
  }

  get isRoot() { return this.kind === 'root'; }

  effectivePaused() {
    let s = this;
    while (s) { if (s.ownPaused) return true; s = s.parentId ? this.host.systems.get(s.parentId) : null; }
    return false;
  }

  spawnProc(o) {
    const p = new Proc(this, Object.assign({ pid: this.nextPid++ }, o));
    this.procs.set(p.pid, p);
    return p;
  }
  getProc(pid) { return this.procs.get(pid) || null; }

  // ---- 消息 ----
  // 非根系统的“内核收件箱”就是承载进程在本系统中的消息队列
  pushInbox(msg) {
    if (this.isRoot) {
      this.inbox.push(msg);
      if (this.inbox.length > MAX_INBOX) this.inbox.splice(0, this.inbox.length - MAX_INBOX);
      return;
    }
    const carrier = this.kernelCarrier();
    if (carrier) this.pushMessage(carrier.pid, msg);
    else { this.inbox.push(msg); if (this.inbox.length > MAX_INBOX) this.inbox.splice(0, this.inbox.length - MAX_INBOX); }
  }
  pushMessage(pid, msg) {
    const p = this.getProc(pid);
    if (!p) return false;
    if (p.status === 'ended' || p.status === 'error') return false;
    p.vm.blocked = p.vm.blocked; // noop
    (p._queue = p._queue || []).push(msg);
    return true;
  }
  popMessage(pid) {
    const p = this.getProc(pid);
    if (!p || !p._queue || p._queue.length === 0) return null;
    return p._queue.shift();
  }
  queueLen(pid) { const p = this.getProc(pid); return p && p._queue ? p._queue.length : 0; }

  // ---- 计费 ----
  charge(proc, units) {
    if (!proc) return;
    proc.used += units; proc.stepUsed += units;
    if (proc.kind === 'carrier' || proc.kind === 'kernel') {
      if (proc.vm) proc.vm.left = Math.max(0, (proc.vm.left || 0) - units);
    }
  }

  // ---- 执行进程 ----
  runProc(proc, quantum, chargeTo) {
    if (!proc || proc.status === 'ended' || proc.status === 'error' || proc.status === 'suspended') {
      return { status: proc ? proc.status : 'gone', used: 0 };
    }
    proc.status = 'running';
    // 承载进程（内核程序）虽然登记在父系统的进程表中，但它的系统调用
    // 必须落到它所承载的那个子系统的上下文（文件、进程表、显示）
    let sysCtx = this;
    if ((proc.kind === 'carrier' || proc.kind === 'kernel') && proc.childSystemId) {
      const ch = this.host.systems.get(proc.childSystemId);
      if (ch) sysCtx = ch;
    }
    const sysFn = (name, args) => {
      if (proc.kind === 'kernel' || proc.kind === 'carrier') return sysCtx.bare(name, args, proc);
      return sysCtx.sysApp(name, args, proc);
    };
    const r = proc.vm.run(quantum, sysFn);
    proc.used += r.used; proc.stepUsed += r.used;
    if (chargeTo && chargeTo !== proc) this.charge(chargeTo, r.used);
    if (r.status === 'blocked') { proc.status = 'waiting'; proc.blocked = r.block; }
    else if (r.status === 'error') {
      proc.status = 'error'; proc.err = r.error; proc.blocked = null;
      this.console.push({ t: this.vtime, pid: proc.pid, name: proc.name, text: '进程错误: ' + r.error });
      if (proc.kind === 'kernel' || proc.kind === 'carrier') this.kernelError = r.error;
    } else if (r.status === 'ended') { proc.status = 'ended'; proc.blocked = null; }
    else { proc.status = 'ready'; proc.blocked = null; }
    return r;
  }

  wakeIfReady(proc) {
    if (proc.status !== 'waiting' || !proc.blocked) return false;
    const b = proc.blocked;
    if (b.kind === 'msg') { if (this.queueLen(proc.pid) > 0 || (proc.kind === 'kernel' && this.inbox.length > 0)) { proc.status = 'ready'; proc.blocked = null; return true; } }
    if (b.kind === 'vtime') { if (this.vtime >= b.until) { proc.status = 'ready'; proc.blocked = null; return true; } }
    return false;
  }

  // ---- 应用级系统调用：交给内核程序（或宿主默认实现） ----
  sysApp(name, args, proc) {
    this.charge(proc, 3);
    const carrier = this.kernelCarrier();
    const ctx = { pid: proc.pid, name: proc.name, system: this.id, args: args || [] };
    if (carrier) {
      const kvm = carrier.vm;
      const r = kvm.callFn('h_' + name, [ctx], (n, a) => this.bare(n, a, carrier), kvm.left || 4000);
      if (r.error && !/没有处理函数/.test(r.error)) return { error: '内核错误: ' + r.error };
      if (r.error) {
        // 内核未实现该调用，回落到宿主默认实现
        if (name === 'sleep') return { block: { kind: 'vtime', until: this.vtime + (args[0] || 0) } };
        if (name === 'recv') { const m = this.popMessage(proc.pid); return m === null ? { block: { kind: 'msg' } } : { value: m }; }
        const d = defaultHandlers[name];
        if (!d) return { error: '系统调用未实现: ' + name };
        return { value: d(this, proc, args) };
      }
      this.charge(carrier, r.used || 0);
      const v = r.value;
      if (v && typeof v === 'object' && v.block) return { block: v.block };
      return { value: v };
    }
    const d = defaultHandlers[name];
    if (!d) return { error: '系统调用未实现: ' + name };
    return { value: d(this, proc, args) };
  }

  kernelCarrier() {
    if (this.isRoot) return null;
    if (!this.parentId) return null;
    const parent = this.host.systems.get(this.parentId);
    if (!parent) return null;
    return parent.getProc(this.carrierPid) || null;
  }

  // ---- 内核原语（仅内核进程可调用） ----
  bare(name, args, proc) {
    const A = args || [];
    const self = this;
    switch (name) {
      case 'K_now': return { value: this.vtime };
      case 'K_self': return { value: proc.pid };
      case 'K_budget_left': return { value: Math.max(0, proc.vm.left || 0) };
      case 'K_poll': {
        if (!proc._queue || proc._queue.length === 0) return { value: null };
        return { value: proc._queue.shift() };
      }
      case 'K_recv': {
        if (!proc._queue || proc._queue.length === 0) return { block: { kind: 'msg' } };
        return { value: proc._queue.shift() };
      }
      case 'K_send': {
        const target = this.getProc(A[0]);
        if (!target) return { value: { ok: false, error: '进程不存在: ' + A[0] } };
        const ok = this.pushMessage(A[0], deepClone(A[1]));
        this.charge(proc, 2 + JSON.stringify(A[1]).length / 64);
        return { value: { ok, to: A[0] } };
      }
      case 'K_send_system': {
        const ok = this.host.routeMessage(A[0], deepClone(A[1]), this.id);
        return { value: { ok } };
      }
      case 'K_spawn': {
        const p = this.spawnProc({ name: A[1] || 'program', kind: A[2] || 'app', code: A[0], quota: A[3] || 0 });
        return { value: p.pid };
      }
      case 'K_spawn_file': {
        const src = this.vfs.read(A[0]);
        if (src === null) return { value: { error: '文件不存在: ' + A[0] } };
        const c = this.host.compile(src, this);
        if (c.error) return { value: { error: c.error } };
        const p = this.spawnProc({ name: A[1] || A[0], kind: A[2] || 'app', code: c.code, quota: A[3] || 0 });
        return { value: p.pid };
      }
      case 'K_run': {
        const target = this.getProc(A[0]);
        if (!target) return { value: { error: '进程不存在: ' + A[0] } };
        let q = Math.max(1, Math.min(A[1] || 500, proc.vm.left || 500));
        if (target.status === 'waiting') this.wakeIfReady(target);
        const r = this.runProc(target, q, proc);
        return { value: { status: r.status, used: r.used, error: r.error || null, blocked: target.blocked } };
      }
      case 'K_kill': {
        const t = this.getProc(A[0]); if (!t) return { value: false };
        t.status = 'ended'; t.blocked = null; t._queue = [];
        return { value: true };
      }
      case 'K_suspend': { const t = this.getProc(A[0]); if (!t) return { value: false }; t.status = 'suspended'; t.blocked = null; return { value: true }; }
      case 'K_resume': { const t = this.getProc(A[0]); if (!t) return { value: false }; if (t.status === 'suspended' || t.status === 'waiting') { t.status = 'ready'; t.blocked = null; } return { value: true }; }
      case 'K_procs': {
        return { value: [...this.procs.values()].map(p => ({ pid: p.pid, name: p.name, kind: p.kind, status: p.status, quota: p.quota, used: p.used, err: p.err, blocked: p.blocked, child: p.childSystemId })) };
      }
      case 'K_qpush': { const ok = this.pushMessage(A[0], deepClone(A[1])); this.charge(proc, 2); return { value: ok }; }
      case 'K_qpop': return { value: this.popMessage(A[0]) };
      case 'K_qlen': return { value: this.queueLen(A[0]) };
      case 'K_set_quota': { const t = this.getProc(A[0]); if (t) t.quota = A[1]; return { value: !!t }; }
      case 'K_fs_read': { const v = this.vfs.read(A[0]); this.charge(proc, 4 + (v ? v.length / 32 : 0)); return { value: v }; }
      case 'K_fs_write': { const e = this.vfs.write(A[0], A[1]); this.charge(proc, 6 + String(A[1]).length / 16); return { value: e ? { error: e } : { ok: true } }; }
      case 'K_fs_list': { const l = this.vfs.list(A[0]); this.charge(proc, 4 + (l ? l.length : 0)); return { value: l }; }
      case 'K_fs_delete': { const e = this.vfs.remove(A[0]); return { value: e ? { error: e } : { ok: true } }; }
      case 'K_fs_mkdir': { const e = this.vfs.mkdir(A[0]); return { value: e ? { error: e } : { ok: true } }; }
      case 'K_fs_exists': return { value: this.vfs.exists(A[0]) };
      case 'K_fs_move': { const e = this.vfs.move(A[0], A[1]); return { value: e ? { error: e } : { ok: true } }; }
      case 'K_fs_copy': { const e = this.vfs.copy(A[0], A[1]); return { value: e ? { error: e } : { ok: true } }; }
      case 'K_submit': {
        const f = A[0];
        const prims = f && f.wins ? f.wins.reduce((s, w) => s + (w.content ? w.content.length : 0), 0) : 0;
        this.charge(proc, 8 + prims);
        this.frame2d = f;
        this.host.onFrame(this);
        return { value: { ok: true } };
      }
      case 'K_submit3d': {
        const viewId = A[0], res = A[1], st = A[2];
        const v = this.views3d[viewId] || (this.views3d[viewId] = { resource: null, state: null });
        if (res) v.resource = deepClone(res);
        v.state = deepClone(st);
        const cost = 20 + (st && st.parts ? st.parts.length * 4 : 0) + (st && st.particles ? st.particles.length * 3 : 0);
        this.charge(proc, cost);
        this.host.onFrame(this);
        return { value: { ok: true } };
      }
      case 'K_get3d': { const v = this.views3d[A[0]]; return { value: v ? { resource: v.resource, state: v.state } : null }; }
      case 'K_input': { const evs = this._inputQueue ? this._inputQueue.splice(0) : []; return { value: evs }; }
      case 'K_create_system': {
        const r = this.host.createChildSystem(this.id, A[0]);
        return { value: r };
      }
      case 'K_step_child': {
        const r = this.host.singleStep(A[0]);
        return { value: r };
      }
      case 'K_snapshot_save': {
        const r = this.host.saveSnapshotTo(this, A[0], A[1]);
        return { value: r };
      }
      case 'K_snapshot_load': {
        const r = this.host.restoreSnapshot(this, A[0], false);
        return { value: r };
      }
      case 'K_snapshot_fork': {
        const r = this.host.restoreSnapshot(this, A[0], true);
        return { value: r };
      }
      case 'K_charge': this.charge(this.getProc(A[0]) || proc, A[1] || 0); return { value: null };
      case 'K_project': {
        const r = this.host.project(A[0], this.id);
        return { value: r };
      }
      case 'K_projection_input': {
        const r = this.host.projectionInput(A[0], A[1]);
        return { value: r };
      }
      case 'K_get_projection': {
        const p = this.host.projections.get(A[0]);
        return { value: p ? { id: p.id, kind: p.kind, title: p.title, payload: p.payload, active: p.active, sourceWindowId: p.sourceWindowId } : null };
      }
      case 'K_self_close': { this.host.destroySubtree(this.id, false); return { value: { ok: true } }; }
      case 'K_self_restart': { const r = this.host.restartSubtree(this.id); return { value: r }; }
      case 'K_compile': {
        const c = this.host.compile(A[0], this);
        return { value: c.error ? { error: c.error } : { ok: true, code: c.code } };
      }
      case 'K_parse': {
        // 宿主内建解析器：把源程序转为字节码（编译器程序在此基础上做变换）
        try { return { value: { ok: true, code: compileSource(A[0]) } }; }
        catch (e) { return { value: { error: (e.osl ? '程序错误: ' : '编译错误: ') + e.message } }; }
      }
      case 'K_set_compiler': { this.compilerPid = A[0]; return { value: true }; }
      case 'K_transfer_file': {
        const r = this.host.transferFile(this.id, A[0], A[1], A[2]);
        return { value: r };
      }
      case 'K_flight_set': { this.flight.state = deepClone(A[0]); return { value: null }; }
      case 'K_flight_get': return { value: this.flight.state };
      case 'K_ctrl_set': { this.flight.ctrl = deepClone(A[0]); return { value: null }; }
      case 'K_ctrl_get': return { value: this.flight.ctrl };
      case 'K_set_config': {
        const c = A[0] || {};
        for (const k in c) if (typeof c[k] === 'number') this.config[k] = c[k];
        return { value: this.config };
      }
      case 'K_set_time': { this.vtime = A[0] || 0; return { value: null }; }
      case 'K_log': { this.console.push({ t: this.vtime, pid: proc.pid, name: proc.name, text: String(A[0]) }); return { value: null }; }
      case 'K_set_title': { this.title = A[0]; return { value: null }; }
      case 'K_fail': return { error: String(A[0] || '内核失败') };
      case 'K_child_info': {
        const ch = this.host.systems.get(A[0]);
        if (!ch) return { value: null };
        return { value: { id: ch.id, name: ch.name, rate: ch.rate, paused: ch.ownPaused, vtime: ch.vtime, alive: ch.alive, depth: ch.depth } };
      }
      case 'K_mem_used': return { value: this.memUsed() };
      case 'K_mem_quota': return { value: this.config.memQuota };
      case 'K_storage_used': return { value: this.vfs.size() };
      case 'K_storage_quota': return { value: this.config.storageQuota };
      case 'K_set_mem': { const t = this.getProc(A[0]); if (t) t.mem = A[1]; return { value: !!t }; }
      default: return { error: '未知内核原语: ' + name };
    }
  }

  // ---- 内存估算（变量、消息队列、已载入图形资源） ----
  memUsed() {
    let total = 0;
    for (const p of this.procs.values()) {
      let sz = 0;
      try { sz = JSON.stringify(p.code).length; } catch (e) { }
      try { sz += JSON.stringify(p.vm.globals).length; } catch (e) { }
      if (p._queue) for (const m of p._queue) { try { sz += JSON.stringify(m).length; } catch (e) { } }
      total += sz + p.mem;
    }
    for (const k in this.views3d) {
      const v = this.views3d[k];
      try { total += JSON.stringify(v.resource || {}).length; } catch (e) { }
      try { total += JSON.stringify(v.state || {}).length; } catch (e) { }
    }
    return total;
  }

  // ---- 序列化（快照） ----
  serialize() {
    return {
      id: this.id, parentId: this.parentId, name: this.name, kind: this.kind,
      config: this.config, vtime: this.vtime, rate: this.rate, ownPaused: this.ownPaused,
      vfs: JSON.parse(this.vfs.serialize()), nextPid: this.nextPid, kernelPid: this.kernelPid,
      carrierPid: this.carrierPid, inbox: deepClone(this.inbox), frame2d: this.frame2d,
      views3d: this.views3d, flight: this.flight, console: this.console.slice(-60),
      kernelError: this.kernelError, kernelSourcePath: this.kernelSourcePath,
      subscriptions: this.subscriptions, compilerPid: this.compilerPid, depth: this.depth, createdAt: this.createdAt,
      procs: [...this.procs.values()].map(p => ({
        pid: p.pid, name: p.name, kind: p.kind, code: p.code, quota: p.quota, used: p.used,
        status: p.status === 'running' ? 'ready' : p.status, err: p.err, out: p.out.slice(-30),
        childSystemId: p.childSystemId, state: p.vm.saveState(), queue: p._queue ? deepClone(p._queue) : []
      })),
      carrier: (() => {
        const c = this.kernelCarrier();
        return c ? { pid: c.pid, name: c.name, kind: c.kind, code: c.code, quota: c.quota, used: c.used, status: c.status, err: c.err, state: c.vm.saveState(), queue: c._queue ? deepClone(c._queue) : [], childSystemId: c.childSystemId } : null;
      })()
    };
  }

  static deserialize(host, d) {
    const s = new System(host, {
      id: d.id, parentId: d.parentId, name: d.name, kind: d.kind, config: d.config,
      vtime: d.vtime, rate: d.rate, ownPaused: d.ownPaused, nextPid: d.nextPid,
      kernelPid: d.kernelPid, carrierPid: d.carrierPid, inbox: d.inbox, frame2d: d.frame2d,
      views3d: d.views3d, flight: d.flight, console: d.console, kernelError: d.kernelError,
      kernelSourcePath: d.kernelSourcePath, subscriptions: d.subscriptions, compilerPid: d.compilerPid, depth: d.depth,
      createdAt: d.createdAt, alive: true
    });
    s.vfs.load(d.vfs);
    for (const p of d.procs || []) {
      const proc = new Proc(s, { pid: p.pid, name: p.name, kind: p.kind, code: p.code, quota: p.quota, state: p.state, childSystemId: p.childSystemId });
      proc.used = p.used; proc.status = p.status; proc.err = p.err; proc.out = p.out || [];
      proc._queue = p.queue || [];
      s.procs.set(proc.pid, proc);
    }
    return s;
  }
}

// ============================================================
// 宿主：系统树、调度、路由、投送、快照
// ============================================================
export class Host {
  constructor() {
    this.systems = new Map();
    this.projections = new Map();
    this.pendingFor = {};       // 暂停范围外暂存的消息 systemId -> [msg]
    this.dataSubs = new Map();  // 根系统数据订阅
    this.listeners = [];
    this.projSeq = 1;
    this.subSeq = 1;
    this.snapSeq = 1;
    this.stats = { steps: 0 };
  }
  on(ev, fn) { this.listeners.push([ev, fn]); }
  emit(ev, data) { for (const [e, f] of this.listeners) if (e === ev) f(data); }

  addSystem(s) { this.systems.set(s.id, s); this.emit('system-added', s); }
  removeSystem(id) { const s = this.systems.get(id); this.systems.delete(id); this.emit('system-removed', s); }

  createChildSystem(parentId, opts) {
    const parent = this.systems.get(parentId);
    if (!parent) return { error: '父系统不存在' };
    opts = opts || {};
    const id = 'inner-' + (this.innerSeq = (this.innerSeq || 0) + 1);
    const name = opts.name || id;
    // 存储配额检查
    const need = 200000;
    if (parent.vfs.size() + need > parent.config.storageQuota) return { error: '父系统存储配额不足，无法写入子系统内核文件' };
    const kernelPath = opts.kernelPath || ('/System/Kernels/' + id + '.osprog');
    const w = parent.vfs.write(kernelPath, opts.kernelSource || '');
    if (w) return { error: w };
    const child = new System(this, {
      id, parentId, name, kind: 'inner', depth: (parent.depth || 1) + 1,
      config: Object.assign({}, parent.config, { budget: 12000, memQuota: 4000000, storageQuota: 2000000, procQuota: 4000, childGrant: 5000 }),
      kernelSourcePath: kernelPath
    });
    // 预置子系统文件
    this.hostSeedChild(child, opts.preset !== false);
    this.addSystem(child);
    // 在父系统中创建承载进程
    const src = parent.vfs.read(kernelPath);
    const c = this.compile(src, parent);
    if (c.error) { child.kernelError = c.error; return { error: c.error, id }; }
    const carrier = parent.spawnProc({ name: 'kernel:' + name, kind: 'carrier', code: c.code, quota: 0, childSystemId: id });
    child.carrierPid = carrier.pid;
    carrier.vm.globals.SYS_ID = id;
    carrier.vm.globals.SYS_NAME = name;
    carrier.vm.globals.PARENT_ID = parentId;
    carrier.vm.globals.ROOT_ID = this.root.id;
    carrier.vm.globals.DEPTH = child.depth;
    // 启动消息：携带系统身份
    parent.pushMessage(carrier.pid, { t: 'boot', system: id, name: name, parent: parentId, depth: child.depth, kernelPath });
    return { ok: true, id, name, carrierPid: carrier.pid, kernelPath };
  }

  hostSeedChild(child, seed) {
    if (!seed) return;
    const P = this.presets;
    if (!P) return;
    const vfs = child.vfs;
    vfs.mkdir('/System'); vfs.mkdir('/System/Programs'); vfs.mkdir('/System/Kernels');
    vfs.mkdir('/Demo'); vfs.mkdir('/Documents'); vfs.mkdir('/Desktop');
    for (const [path, content] of P.innerFiles) {
      const e = vfs.write(path, content);
      if (e) console.warn('seed', path, e);
    }
  }

  compile(src, system) {
    // 若系统内有编译器程序，则用它编译（可被修改）；否则用宿主内建编译器
    if (system && system.compilerPid) {
      const cp = system.getProc(system.compilerPid);
      if (cp && cp.vm && (cp.status === 'ready' || cp.status === 'waiting' || cp.status === 'running' || cp.status === 'suspended')) {
        const r = cp.vm.callFn('compile_src', [src], (n, a) => system.bare(n, a, cp), 20000);
        if (r.error) return { error: '编译器错误: ' + r.error };
        if (r.value && r.value.code) return { code: r.value.code, via: 'program' };
        if (r.value && r.value.error) return { error: r.value.error };
      }
    }
    try { return { code: compileSource(src), via: 'host' }; }
    catch (e) { return { error: (e.osl ? '程序错误: ' : '编译错误: ') + e.message }; }
  }

  // ---- 每逻辑步：根系统调度 ----
  frame() {
    const root = this.root;
    if (!root) return;
    this.stats.steps++;
    for (const s of this.systems.values()) s.stepUsed = 0;
    this.pumpRoot();
    if (root.effectivePaused()) { this.flushPending(); return; }
    root.vtime += STEP_MS * root.rate;
    let budget = root.config.budget;
    // 1. 直属子系统承载进程
    const carriers = [...root.procs.values()].filter(p => p.kind === 'carrier');
    for (const c of carriers) {
      const child = this.systems.get(c.childSystemId);
      if (!child || !child.alive) continue;
      if (child.effectivePaused()) continue;
      const grant = Math.min(root.config.childGrant, Math.floor(budget * 0.7));
      if (grant < 300) break;
      budget -= grant;
      child.pendingStep = 0;
      root.pushMessage(c.pid, { t: 'step', dt: STEP_MS * root.rate * child.rate, budget: grant });
      if (c.status === 'waiting' && c.blocked && c.blocked.kind === 'msg' && root.queueLen(c.pid) > 0) { c.status = 'ready'; c.blocked = null; }
      this.runProc(root, c, grant);
    }
    // 2. 根系统演示程序
    for (const p of [...root.procs.values()]) {
      if (p.kind !== 'demo') continue;
      if (p.status === 'waiting') root.wakeIfReady(p);
      if (p.status === 'ready' || p.status === 'running') {
        const q = Math.min(p.quota || 1500, Math.max(200, budget));
        budget -= q;
        this.runProc(root, p, q);
      }
    }
    // 3. 剩余额度供根系统桌面应用使用
    root.appBudget = Math.max(0, budget);
    root.stepUsed = root.config.budget - Math.max(0, budget) - (root.appBudget || 0);
    this.flushPending();
  }

  runProc(system, proc, quantum) { return system.runProc(proc, quantum); }

  flushPending() {
    for (const sid in this.pendingFor) {
      const s = this.systems.get(sid);
      if (!s) { delete this.pendingFor[sid]; continue; }
      if (s.effectivePaused()) continue;
      const list = this.pendingFor[sid];
      delete this.pendingFor[sid];
      for (const m of list) s.pushInbox(m);
    }
  }

  routeMessage(targetSystemId, msg, fromSystemId) {
    const s = this.systems.get(targetSystemId);
    if (!s) return false;
    if (s.effectivePaused()) {
      (this.pendingFor[targetSystemId] = this.pendingFor[targetSystemId] || []).push(msg);
      return true;
    }
    s.pushInbox(msg);
    return true;
  }

  // 根系统消息泵：根内核由宿主实现
  pumpRoot() {
    const root = this.root;
    if (!root || root.inbox.length === 0) return;
    const msgs = root.inbox.splice(0, 200);
    for (const m of msgs) {
      if (m.t === 'data_subscribe') { this.subscribeData(m.from, m); }
      else if (m.t === 'data_unsubscribe') { this.unsubscribeData(m.subId); }
      else if (m.t === 'file_incoming') { this.deliverFileToRoot(m); }
      else if (m.t === 'projection_open' || m.t === 'projection_closed' || m.t === 'projection_focus') { this.emit('root-projection', m); }
    }
  }

  deliverFileToRoot(m) {
    const root = this.root;
    const dir = m.destDir || '/Documents';
    if (!root.vfs.isDir(dir)) root.vfs.mkdir(dir);
    let name = m.name;
    if (root.vfs.exists(dir + '/' + name)) {
      const dot = name.lastIndexOf('.');
      const base = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : '';
      let i = 1;
      while (root.vfs.exists(dir + '/' + base + '(' + i + ')' + ext)) i++;
      name = base + '(' + i + ')' + ext;
    }
    const e = root.vfs.write(dir + '/' + name, m.content);
    this.emit('file-received', { dir, name, from: m.from, error: e });
  }

  // ---- 投送 ----
  project(payload, fromSystemId) {
    // payload: {winId, kind, title, target}
    const target = this.systems.get(payload.target);
    if (!target) return { error: '目标系统不存在' };
    const existing = [...this.projections.values()].find(p => p.sourceSystemId === fromSystemId && p.sourceWindowId === payload.winId);
    if (existing) {
      existing.active = true;
      this.routeMessage(existing.targetSystemId, { t: 'projection_focus', projId: existing.id });
      return { ok: true, projId: existing.id, existed: true };
    }
    const id = 'proj-' + this.projSeq++;
    const proj = {
      id, sourceSystemId: fromSystemId, sourceWindowId: payload.winId, sourceAppId: payload.appId || null,
      targetSystemId: payload.target, kind: payload.kind || '2d', title: payload.title || '投送窗口',
      payload: null, active: true
    };
    this.projections.set(id, proj);
    this.routeMessage(payload.target, { t: 'projection_open', projId: id, sourceSystemId: fromSystemId, sourceWindowId: payload.winId, kind: proj.kind, title: proj.title });
    this.emit('projection', proj);
    return { ok: true, projId: id };
  }

  projectionInput(projId, ev) {
    const p = this.projections.get(projId);
    if (!p) return { error: '投送不存在' };
    if (ev && ev.t === 'close') {
      this.projections.delete(projId);
      this.routeMessage(p.sourceSystemId, { t: 'projection_closed', projId });
      this.emit('projection', p);
      return { ok: true };
    }
    this.routeMessage(p.sourceSystemId, { t: 'projection_input', projId, ev });
    return { ok: true };
  }

  // 帧提交后：把源窗口内容复制到投送窗口
  onFrame(system) {
    for (const p of this.projections.values()) {
      if (p.sourceSystemId !== system.id || !p.active) continue;
      if (p.kind === '3d') {
        const v = system.views3d[p.sourceWindowId];
        if (v) p.payload = { resource: v.resource, state: v.state };
      } else {
        const f = system.frame2d;
        if (f && f.wins) {
          const w = f.wins.find(w => w.id === p.sourceWindowId);
          if (w) p.payload = { title: w.title, content: w.content, w: w.w, h: w.h };
        }
      }
    }
  }

  closeProjectionsOf(systemId) {
    for (const [id, p] of [...this.projections]) {
      if (p.sourceSystemId === systemId) {
        this.routeMessage(p.targetSystemId, { t: 'projection_closed', projId: id });
        this.projections.delete(id);
      }
    }
  }

  // ---- 跨层文件传递 ----
  transferFile(fromSystemId, path, targetSystemId, destDir) {
    const src = this.systems.get(fromSystemId);
    const dst = this.systems.get(targetSystemId);
    if (!src || !dst) return { error: '系统不存在' };
    const content = src.vfs.read(path);
    if (content === null) return { error: '文件不存在: ' + path };
    const size = content.length;
    if (dst.vfs.size() + size > dst.config.storageQuota) return { error: '目标系统存储配额不足' };
    this.chargeTransfer(src, size);
    const name = path.split('/').pop();
    this.routeMessage(targetSystemId, { t: 'file_incoming', name, content, size, from: fromSystemId, fromPath: path, destDir: destDir || '/Documents' });
    return { ok: true, size };
  }
  chargeTransfer(sys, size) {
    const c = sys.kernelCarrier();
    if (c) sys.charge(c, 10 + size / 32);
  }

  // ---- 快照 ----
  snapshotSubtree(systemId) {
    const root = this.systems.get(systemId);
    if (!root) return null;
    const out = { version: 1, rootId: systemId, systems: [], projections: [], dataSubs: [] };
    const walk = s => {
      out.systems.push(s.serialize());
      for (const c of s.procs.values()) if (c.kind === 'carrier' && c.childSystemId) { const ch = this.systems.get(c.childSystemId); if (ch) walk(ch); }
    };
    walk(root);
    for (const [id, p] of this.projections) if (out.systems.some(s => s.id === p.sourceSystemId) || out.systems.some(s => s.id === p.targetSystemId)) out.projections.push(Object.assign({}, p));
    return out;
  }

  saveSnapshotTo(parentSystem, childSystemId, path) {
    const snap = this.snapshotSubtree(childSystemId);
    if (!snap) return { error: '子系统不存在' };
    const json = JSON.stringify(snap);
    const e = parentSystem.vfs.write(path, json);
    if (e) return { error: e };
    parentSystem.charge(parentSystem.kernelCarrier() || null, 20 + json.length / 32);
    return { ok: true, path, size: json.length };
  }

  restoreSnapshot(parentSystem, path, fork) {
    const json = parentSystem.vfs.read(path);
    if (json === null) return { error: '快照文件不存在: ' + path };
    let snap;
    try { snap = JSON.parse(json); } catch (e) { return { error: '快照文件损坏' }; }
    return this.applySnapshot(parentSystem, snap, fork);
  }

  applySnapshot(parentSystem, snap, fork) {
    const idMap = {};
    if (fork) for (const s of snap.systems) idMap[s.id] = s.id === snap.rootId ? ('inner-' + (this.innerSeq = (this.innerSeq || 0) + 1)) : ('inner-' + (this.innerSeq = (this.innerSeq || 0) + 1));
    // 关闭原子树上对应的旧实例（恢复到原实例时）
    if (!fork) {
      const old = this.systems.get(snap.rootId);
      if (old) this.destroySubtree(snap.rootId, false);
    }
    const created = [];
    for (const sd of snap.systems) {
      const nid = fork ? idMap[sd.id] : sd.id;
      const s = System.deserialize(this, Object.assign({}, sd, { id: nid, parentId: sd.parentId === parentSystem.id ? parentSystem.id : (fork && idMap[sd.parentId] ? idMap[sd.parentId] : sd.parentId) }));
      s.alive = true;
      this.addSystem(s);
      created.push(s);
    }
    // 承载进程挂到父系统
    for (const s of created) {
      const cd = snap.systems.find(x => (fork ? idMap[x.id] : x.id) === s.id);
      if (!cd || !cd.carrier) continue;
      const parent = this.systems.get(s.parentId);
      if (!parent) continue;
      const proc = new Proc(parent, { pid: parent.nextPid++, name: 'kernel:' + s.name, kind: 'carrier', code: cd.carrier.code, childSystemId: s.id, state: cd.carrier.state });
      proc.used = cd.carrier.used; proc.status = cd.carrier.status === 'running' ? 'ready' : cd.carrier.status;
      proc._queue = (cd.carrier.queue || []).map(m => this.remapMsg(m, idMap));
      parent.procs.set(proc.pid, proc);
      s.carrierPid = proc.pid;
      proc.vm.globals.SYS_ID = s.id; proc.vm.globals.SYS_NAME = s.name; proc.vm.globals.PARENT_ID = parent.id;
      parent.pushMessage(proc.pid, { t: 'resume_from_snapshot', system: s.id });
    }
    // 投送关系
    for (const p of snap.projections || []) {
      const src = fork ? idMap[p.sourceSystemId] : p.sourceSystemId;
      const tgt = fork ? idMap[p.targetSystemId] : p.targetSystemId;
      if (!this.systems.has(src) || !this.systems.has(tgt)) continue;
      const np = Object.assign({}, p, { id: 'proj-' + this.projSeq++, sourceSystemId: src, targetSystemId: tgt });
      this.projections.set(np.id, np);
      this.routeMessage(tgt, { t: 'projection_open', projId: np.id, sourceSystemId: src, sourceWindowId: np.sourceWindowId, kind: np.kind, title: np.title });
      this.routeMessage(src, { t: 'projection_restored', projId: np.id, targetSystemId: tgt, winId: np.sourceWindowId });
    }
    parentSystem.charge(parentSystem.kernelCarrier() || null, 30 + JSON.stringify(snap).length / 64);
    return { ok: true, ids: created.map(s => s.id) };
  }

  remapMsg(m, idMap) {
    if (!m || typeof m !== 'object') return m;
    const s = JSON.stringify(m);
    let out = s;
    for (const k in idMap) out = out.split('"' + k + '"').join('"' + idMap[k] + '"');
    return JSON.parse(out);
  }

  destroySubtree(systemId, removeFiles) {
    const s = this.systems.get(systemId);
    if (!s) return;
    const children = [...s.procs.values()].filter(p => p.kind === 'carrier' && p.childSystemId).map(p => p.childSystemId);
    for (const c of children) this.destroySubtree(c, removeFiles);
    this.closeProjectionsOf(systemId);
    for (const [id, p] of [...this.projections]) if (p.targetSystemId === systemId) this.projections.delete(id);
    for (const k in this.dataSubs) if (this.dataSubs[k].systemId === systemId) delete this.dataSubs[k];
    const parent = this.systems.get(s.parentId);
    if (parent) { for (const p of [...parent.procs.values()]) if (p.childSystemId === systemId) parent.procs.delete(p.pid); }
    s.alive = false;
    this.removeSystem(systemId);
    this.emit('subtree-destroyed', systemId);
  }

  // ---- 重启子树：保留各实例文件系统，重新载入内核源文件 ----
  restartSubtree(systemId) {
    const s = this.systems.get(systemId);
    if (!s) return { error: '子系统不存在' };
    const fss = {}, parents = {}, order = [];
    const walk = sys => {
      order.push(sys.id); parents[sys.id] = sys.parentId; fss[sys.id] = sys.vfs.serialize();
      for (const p of sys.procs.values()) if (p.kind === 'carrier' && p.childSystemId) { const ch = this.systems.get(p.childSystemId); if (ch) walk(ch); }
    };
    walk(s);
    this.destroySubtree(systemId, false);
    const out = [];
    for (const id of order) {
      const parent = this.systems.get(parents[id]);
      if (!parent) return { error: '父系统缺失: ' + parents[id] };
      const r = this.rebuildSystem(parent, id, fss[id]);
      if (r.error) return r;
      out.push(r.id);
    }
    return { ok: true, ids: out };
  }

  rebuildSystem(parent, id, vfsJson) {
    const kernelPath = '/System/Kernels/' + id + '.osprog';
    const src = parent.vfs.read(kernelPath);
    if (src === null) return { error: '内核源文件缺失: ' + kernelPath };
    const c = this.compile(src, parent);
    if (c.error) return { error: '内核编译失败: ' + c.error };
    const sys = new System(this, {
      id, parentId: parent.id, name: id, kind: 'inner', depth: (parent.depth || 1) + 1,
      config: { budget: 12000, memQuota: 4000000, storageQuota: 2000000, procQuota: 4000, childGrant: 5000, quantum: 900 },
      kernelSourcePath: kernelPath
    });
    sys.vfs.load(vfsJson);
    this.addSystem(sys);
    const carrier = parent.spawnProc({ name: 'kernel:' + id, kind: 'carrier', code: c.code, childSystemId: id });
    sys.carrierPid = carrier.pid;
    carrier.vm.globals.SYS_ID = id; carrier.vm.globals.SYS_NAME = id;
    carrier.vm.globals.PARENT_ID = parent.id; carrier.vm.globals.ROOT_ID = this.root.id;
    carrier.vm.globals.DEPTH = sys.depth;
    parent.pushMessage(carrier.pid, { t: 'boot', system: id, name: id, parent: parent.id, depth: sys.depth, kernelPath });
    return { ok: true, id };
  }

  singleStep(childId) {    const child = this.systems.get(childId);
    if (!child) return { error: '子系统不存在' };
    const parent = this.systems.get(child.parentId);
    if (!parent) return { error: '父系统不存在' };
    if (parent.effectivePaused()) return { error: '父系统处于暂停状态，不能发起单步' };
    const carrier = parent.getProc(child.carrierPid);
    if (!carrier) return { error: '承载进程不存在' };
    const grant = Math.min(parent.config.childGrant, 6000);
    parent.pushMessage(carrier.pid, { t: 'step', dt: SINGLE_STEP_MS * child.rate, budget: grant, single: true });
    if (carrier.status === 'waiting') { carrier.status = 'ready'; carrier.blocked = null; }
    const before = child.vtime;
    this.runProc(parent, carrier, grant);
    return { ok: true, dt: child.vtime - before, vtime: child.vtime };
  }

  // ---- 数据订阅（根系统电子表格 -> 子系统图表） ----
  subscribeData(systemId, req) {
    const id = 'sub-' + this.subSeq++;
    this.dataSubs.set(id, { id, systemId, workbook: req.workbook, range: req.range, labelCol: req.labelCol, valueCols: req.valueCols, version: 0 });
    const snap = this.buildDataSnapshot(req.workbook, req.range, req.labelCol, req.valueCols, 1);
    this.routeMessage(systemId, Object.assign({ t: 'data_snapshot', subId: id }, snap));
    return { ok: true, subId: id };
  }
  unsubscribeData(subId) {
    const s = this.dataSubs.get(subId);
    if (s) { this.dataSubs.delete(subId); this.routeMessage(s.systemId, { t: 'data_closed', subId }); }
  }
  buildDataSnapshot(workbookPath, range, labelCol, valueCols, version) {
    const root = this.root;
    const content = root.vfs.read(workbookPath);
    if (content === null) return { error: '工作簿不存在: ' + workbookPath };
    let wb;
    try { wb = JSON.parse(content); } catch (e) { return { error: '工作簿文件损坏' }; }
    const m = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
    if (!m) return { error: '区域格式无效' };
    const c1 = colIdx(m[1]), r1 = parseInt(m[2], 10), c2 = colIdx(m[3]), r2 = parseInt(m[4], 10);
    const rows = [];
    for (let r = r1; r <= r2; r++) {
      const label = cellText(wb, labelCol + r);
      const vals = valueCols.map(c => { const v = cellText(wb, c + r); const n = Number(v); return isFinite(n) && v !== '' ? n : 0; });
      rows.push({ label, values: vals });
    }
    return { ok: true, version, range, labelCol, valueCols, rows, workbook: workbookPath };
  }
  publishDataVersion(workbookPath) {
    for (const [id, sub] of this.dataSubs) {
      if (sub.workbook !== workbookPath) continue;
      const snap = this.buildDataSnapshot(sub.workbook, sub.range, sub.labelCol, sub.valueCols, sub.version + 1);
      if (snap.error) continue;
      sub.version = snap.version;
      this.routeMessage(sub.systemId, Object.assign({ t: 'data_version', subId: id }, snap));
    }
  }
}

function colIdx(s) { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
function cellText(wb, ref) {
  const c = wb.cells && wb.cells[ref];
  if (!c) return '';
  if (c.f) return String(wb.values && wb.values[ref] !== undefined ? wb.values[ref] : '');
  return String(c.v === undefined || c.v === null ? '' : c.v);
}
