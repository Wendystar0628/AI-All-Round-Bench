'use strict';
// ============ 系统核心：进程、文件系统、调度运行时、消息、预算与配额 ============
(function (NS) {
  const VM = NS.VM;
  const STEP_MS = 50;          // 每个逻辑步的虚拟时间基数（1 倍速）
  const SLICE = 3000;          // 单次连续执行指令上限（抢占粒度）
  const ROOT_BUDGET = 6000;    // 根系统每逻辑步总预算
  const CHILD_BUDGET = 2600;   // 子系统默认每逻辑步预算
  const CHILD_GRANT_CAP = 950; // 父系统对每个直属子系统的默认拨付上限
  const ROOT_MEM = 4 * 1024 * 1024;
  const ROOT_STORAGE = 8 * 1024 * 1024;

  let SYSTEMS = [];
  let NEXT_INSTANCE = 1;

  function makeErr(code, msg) { const e = new Error(msg); e.errCode = code; return e; }

  // ---------------- 文件系统 ----------------
  class FS {
    constructor() { this.root = { name: '/', type: 'dir', children: {}, mtime: 0 }; this._usage = 0; }
    _split(p) {
      if (!p) return [];
      return String(p).replace(/\\/g, '/').split('/').filter(x => x.length && x !== '.');
    }
    _norm(p) {
      const parts = this._split(p);
      const out = [];
      for (const x of parts) { if (x === '..') out.pop(); else out.push(x); }
      return '/' + out.join('/');
    }
    _walk(path, create) {
      const parts = this._split(this._norm(path));
      let n = this.root;
      for (const p of parts) {
        if (n.type !== 'dir') throw makeErr('ENOTDIR', '不是目录: ' + path);
        if (!n.children[p]) {
          if (create) n.children[p] = { name: p, type: 'dir', children: {}, mtime: Date.now() };
          else return null;
        }
        n = n.children[p];
      }
      return n;
    }
    exists(path) { try { return !!this._walk(path, false); } catch (e) { return false; } }
    isDir(path) { try { const n = this._walk(path, false); return n && n.type === 'dir'; } catch (e) { return false; } }
    read(path) {
      const n = this._walk(path, false);
      if (!n) throw makeErr('ENOENT', '文件不存在: ' + path);
      if (n.type === 'dir') throw makeErr('EISDIR', '是目录: ' + path);
      return n.content || '';
    }
    write(path, content, opts) {
      opts = opts || {};
      content = content == null ? '' : String(content);
      const np = this._norm(path);
      const parent = this._walk(np.substring(0, np.lastIndexOf('/')) || '/', true);
      const name = np.substring(np.lastIndexOf('/') + 1);
      if (!name) throw makeErr('EINVAL', '无效路径: ' + path);
      const old = parent.children[name];
      if (old && old.type === 'dir') throw makeErr('EISDIR', '是目录: ' + path);
      const add = (content.length + 16) - (old ? (old.content ? old.content.length + 16 : 0) : 0);
      if (!opts.skipQuota && this.quotaFn) {
        const q = this.quotaFn(add);
        if (q && !q.ok) throw makeErr('ENOSPC', q.msg || '存储配额不足');
      }
      parent.children[name] = { name, type: 'file', content, mtime: Date.now(), size: content.length };
      this._usage += add;
      return true;
    }
    append(path, content) {
      const cur = this.exists(path) ? this.read(path) : '';
      return this.write(path, cur + (content == null ? '' : String(content)));
    }
    listdir(path) {
      const n = this._walk(this._norm(path), false);
      if (!n) throw makeErr('ENOENT', '目录不存在: ' + path);
      if (n.type !== 'dir') throw makeErr('ENOTDIR', '不是目录: ' + path);
      return Object.values(n.children).map(c => ({ name: c.name, type: c.type, size: c.type === 'file' ? (c.size || 0) : 0, mtime: c.mtime || 0 }));
    }
    mkdir(path) {
      const np = this._norm(path);
      if (np === '/') return true;
      this._walk(np, true);
      return true;
    }
    delete(path) {
      const np = this._norm(path);
      if (np === '/') throw makeErr('EINVAL', '不能删除根目录');
      const parent = this._walk(np.substring(0, np.lastIndexOf('/')) || '/', false);
      const name = np.substring(np.lastIndexOf('/') + 1);
      const node = parent && parent.children[name];
      if (!node) throw makeErr('ENOENT', '不存在: ' + path);
      const freed = this._sizeOf(node);
      delete parent.children[name];
      this._usage -= freed;
      return true;
    }
    _sizeOf(n) {
      if (n.type === 'file') return (n.content ? n.content.length : 0) + 16;
      let s = 0;
      for (const k in n.children) s += this._sizeOf(n.children[k]);
      return s;
    }
    rename(a, b) {
      const na = this._walk(this._norm(a), false);
      if (!na) throw makeErr('ENOENT', '不存在: ' + a);
      this.copy(a, b, { skipQuota: true });
      this.delete(a);
      return true;
    }
    copy(a, b, opts) {
      const na = this._walk(this._norm(a), false);
      if (!na) throw makeErr('ENOENT', '不存在: ' + a);
      if (na.type === 'dir') {
        this.mkdir(b);
        for (const c of Object.values(na.children)) this.copy(this._norm(a) + '/' + c.name, this._norm(b) + '/' + c.name, opts);
        return true;
      }
      this.write(this._norm(b), na.content || '', opts);
      return true;
    }
    stat(path) {
      const n = this._walk(this._norm(path), false);
      if (!n) throw makeErr('ENOENT', '不存在: ' + path);
      return { type: n.type, size: n.type === 'file' ? (n.size || 0) : this._sizeOf(n), mtime: n.mtime || 0 };
    }
    usage() { return this._usage; }
    quotaCheck(add) {
      if (this.quotaFn) return this.quotaFn(add);
      return { ok: true };
    }
    toJSON() {
      const conv = n => n.type === 'dir' ? { t: 'd', m: n.mtime, c: Object.values(n.children).map(conv) } : { t: 'f', m: n.mtime, v: n.content || '' };
      return conv(this.root);
    }
    fromJSON(j) {
      const conv = n => {
        if (n.t === 'd') { const o = { name: '', type: 'dir', children: {}, mtime: n.m || 0 }; for (const c of (n.c || [])) { const cc = conv(c); cc.name = c.name || ('item' + Math.random().toString(36).slice(2, 7)); o.children[cc.name] = cc; } return o; }
        return { name: '', type: 'file', content: n.v || '', mtime: n.m || 0, size: (n.v || '').length };
      };
      this.root = conv(j);
      this._usage = this._sizeOf(this.root);
    }
  }

  // ---------------- 进程 ----------------
  let PIDSEQ = 1;
  class Proc {
    constructor(sys, name, role, opts) {
      opts = opts || {};
      this.pid = PIDSEQ++;
      this.sys = sys;
      this.name = name || ('proc-' + this.pid);
      this.role = role || 'user';           // kernel | user | carrier | app
      this.state = 'ready';                  // ready|running|waiting|suspended|ended|error
      this.src = opts.src || null;
      this.program = null;
      this.vm = { pc: 0, sp: 0, frames: null, stack: [], handlers: [] };
      this.waitInfo = null;
      this.work = 0;                         // 累计工作量
      this.quota = opts.quota != null ? opts.quota : Infinity;  // 每步可用上限
      this.quotaUsed = 0;
      this.mailbox = [];
      this.error = null;
      this.log = [];
      this.meta = opts.meta || {};
      this.hostId = opts.hostId || null;     // 关联的应用窗口 id
      this._resumeHas = false; this._resumeVal = undefined;
      this._rpcResult = undefined; this._rpcHas = false;
      this.memBase = opts.memBase || 0;
    }
    memSize() {
      let s = this.memBase + (this.src ? this.src.length : 0) + 64;
      try { s += JSON.stringify([this.vm.stack, this.vm.frames, this.mailbox, this.log.slice(-8)]).length; } catch (e) { s += 256; }
      return s;
    }
    serialize() {
      return {
        pid: this.pid, name: this.name, role: this.role, state: this.state, src: this.src,
        vm: this.state === 'error' ? null : this.vm, waitInfo: this.waitInfo, work: this.work,
        quota: this.quota === Infinity ? 'inf' : this.quota, mailbox: this.mailbox, error: this.error,
        log: this.log.slice(-40), meta: this.meta, hostId: this.hostId, memBase: this.memBase
      };
    }
    static deserialize(sys, j) {
      const p = new Proc(sys, j.name, j.role, { src: j.src, meta: j.meta, hostId: j.hostId, memBase: j.memBase });
      p.pid = j.pid; p.state = j.state; p.vm = j.vm || { pc: 0, sp: 0, frames: null, stack: [], handlers: [] };
      p.waitInfo = j.waitInfo; p.work = j.work; p.quota = j.quota === 'inf' ? Infinity : j.quota;
      p.mailbox = j.mailbox || []; p.error = j.error; p.log = j.log || [];
      if (p.src && !j.vm) {
        try { p.program = VM.compile(p.src); } catch (e) { p.state = 'error'; p.error = '编译失败: ' + e.message; }
      } else if (p.src) {
        try { p.program = VM.compile(p.src); } catch (e) { p.state = 'error'; p.error = '编译失败: ' + e.message; }
      }
      return p;
    }
  }

  // ---------------- 系统 ----------------
  class Sys {
    constructor(parent, opts) {
      opts = opts || {};
      this.parent = parent || null;
      this.id = opts.id || (parent ? NS.makeId('sys') : 'outer');
      this.depth = parent ? parent.depth + 1 : 0;
      this.isRoot = !parent;
      this.name = opts.name || (parent ? ('inner-' + (NEXT_INSTANCE++)) : '主系统');
      this.state = 'running';                 // running|paused|errored|stopped
      this.kernelError = null;
      this.vtime = 0;
      this.rate = 1;
      this.paused = false;
      this.budgetPerStep = opts.budgetPerStep || (this.isRoot ? ROOT_BUDGET : CHILD_BUDGET);
      this.grantFromParent = this.budgetPerStep;
      this.grantCapDefault = CHILD_GRANT_CAP;
      this.grantCaps = {};                    // childSysId -> units/step
      this.usedLastStep = 0;
      this.kernelWork = 0;
      this.totalWorkAll = 0;
      this.pendingCharge = 0;                 // 应用工作计费（下一步扣除）
      this.chargedTotal = 0;
      this.chargeKinds = {};
      this.memoryQuota = opts.memoryQuota || (this.isRoot ? ROOT_MEM : 900 * 1024);
      this.storageQuota = opts.storageQuota || (this.isRoot ? ROOT_STORAGE : 2 * 1024 * 1024);
      this.appMem = 0;
      this.fs = new FS();
      const self = this;
      this.fs.quotaFn = (add) => self._storageQuotaCheck(add);
      this.procs = new Map();
      this.nextPid = 1;
      this.outbox = [];
      this.msgSeq = 1;
      this.children = [];                     // 子系统的 carrier proc 列表在 procs 中，children 保存 Sys 引用
      this.windows = [];                      // 窗口管理器数据（host 侧）
      this.policies = { wm: null, files: null, charts: null };
      this.sceneState = null;
      this.notifications = [];
      this.dnd = null;
      this.desktop = null;                    // Desktop 视图引用
      this.accent = opts.accent || null;
      this.kernelProc = null;
      this.carrierProcs = new Map();          // childSysId -> Proc
      this.rehearsal = null;                  // 排演设备状态
      this.apps = new Map();                  // appId -> app instance 注册表
      this._ctxRef = null;
      this.booted = false;
      SYSTEMS.push(this);
    }

    // ---------- 配额 ----------
    memUsed() {
      let s = this.appMem + 65536;
      this.procs.forEach(p => { s += p.memSize(); });
      return s;
    }
    storageUsed() { return this.fs.usage(); }
    _storageQuotaCheck(add) {
      if (this.storageUsed() + add > this.storageQuota) return { ok: false, msg: '存储配额不足（' + NS.fmtBytes(this.storageUsed()) + '/' + NS.fmtBytes(this.storageQuota) + '）' };
      return { ok: true };
    }
    charge(units, kind) {
      units = Math.max(0, units || 0);
      this.pendingCharge += units;
      this.chargedTotal += units;
      if (kind) this.chargeKinds[kind] = (this.chargeKinds[kind] || 0) + units;
    }

    // ---------- 进程管理 ----------
    addProc(p) {
      this.procs.set(p.pid, p);
      if (p.role === 'kernel') this.kernelProc = p;
      return p;
    }
    spawnNIL(src, name, opts) {
      opts = opts || {};
      let prog;
      try { prog = VM.compile(src); } catch (e) { return { error: '编译失败: ' + e.message }; }
      const p = new Proc(this, name || 'program', opts.role || 'user', { src, quota: opts.quota, meta: opts.meta, hostId: opts.hostId });
      p.program = prog;
      this.addProc(p);
      this._notifyKernelSched();
      return { proc: p };
    }
    registerApp(appId, title, opts) {
      opts = opts || {};
      const p = new Proc(this, title || appId, 'app', { meta: { appId }, hostId: opts.hostId, memBase: opts.mem || 0 });
      p.state = 'running';
      this.addProc(p);
      return p;
    }
    killProc(pid, reason) {
      const p = this.procs.get(pid);
      if (!p) return false;
      if (p.role === 'carrier') { this.stopSubtree(p.meta.childId, reason || '结束'); return true; }
      if (p.role === 'app' && p.hostId) NS.AppHost.closeAppByPid(this, pid, reason);
      p.state = 'ended';
      p.error = reason || '已结束';
      this.procs.delete(pid);
      this._notifyKernelSched();
      return true;
    }
    suspendProc(pid) {
      const p = this.procs.get(pid);
      if (!p) return false;
      if (p.state === 'running' || p.state === 'ready') { p.state = 'suspended'; if (p.role==='app') NS.AppHost.onAppProcStateChange(this, p); }
      return true;
    }
    resumeProc(pid) {
      const p = this.procs.get(pid);
      if (!p) return false;
      if (p.state === 'suspended') { p.state = 'ready'; if (p.role==='app') NS.AppHost.onAppProcStateChange(this, p); this._notifyKernelSched(); }
      return true;
    }
    _notifyKernelSched() {
      if (this.kernelProc && this.kernelProc.state === 'waiting') {
        this.kernelProc.state = 'ready';
        this.kernelProc._resumeHas = true; this.kernelProc._resumeVal = null;
        this.kernelProc.waitInfo = null;
      }
    }
    setGrantCap(childSysId, units) { this.grantCaps[childSysId] = units; }
    grantFor(childSysId) { return this.grantCaps[childSysId] != null ? this.grantCaps[childSysId] : this.grantCapDefault; }

    // ---------- 内核与启动 ----------
    boot(kernelSrc) {
      if (this.booted) return;
      this.booted = true;
      if (this.isRoot) {
        // 根系统内核由宿主直接实现；不创建 NIL 内核进程
        return;
      }
      if (!kernelSrc) { this.state = 'errored'; this.kernelError = '缺少内核源文件'; return; }
      let prog;
      try { prog = VM.compile(kernelSrc); } catch (e) {
        this.state = 'errored'; this.kernelError = '内核编译失败: ' + e.message; return;
      }
      const kp = new Proc(this, this.name + ' 内核', 'kernel', { src: kernelSrc });
      kp.program = prog;
      this.addProc(kp);
      // 启动策略程序（窗口管理规则）
      this._loadPolicies();
      this._notifyKernelSched();
    }
    _loadPolicies() {
      try {
        if (this.fs.exists('/System/wm-rules.nil')) {
          const src = this.fs.read('/System/wm-rules.nil');
          const r = this.spawnNIL(src, 'wm-policy', { role: 'user', meta: { policyKind: 'wm' } });
          if (r.error) this.kernelError = null;
        }
      } catch (e) {}
    }
    reloadKernel() {
      // 重新载入内核源文件（重启时调用）
      if (this.isRoot) return;
      const parentFs = this.parent.fs;
      const path = '/Systems/' + this.name + '/kernel.nil';
      let src = null;
      try { if (parentFs.exists(path)) src = parentFs.read(path); } catch (e) {}
      if (!src) { this.state = 'errored'; this.kernelError = '找不到内核源文件 ' + path; return; }
      // 移除旧内核进程
      if (this.kernelProc) { this.procs.delete(this.kernelProc.pid); this.kernelProc = null; }
      this.kernelError = null;
      this.state = 'running';
      let prog;
      try { prog = VM.compile(src); } catch (e) {
        this.state = 'errored'; this.kernelError = '内核编译失败: ' + e.message; return;
      }
      const kp = new Proc(this, this.name + ' 内核', 'kernel', { src });
      kp.program = prog;
      this.addProc(kp);
      this._notifyKernelSched();
    }

    // ---------- 步骤推进 ----------
    ancestorsRunning() {
      let s = this;
      while (s) { if (s.state !== 'running' || s.paused) return false; s = s.parent; }
      return true;
    }
    grantAvailable() {
      let avail = Math.min(this.budgetPerStep, this.grantFromParent);
      if (this.pendingCharge > 0) {
        const deduct = Math.min(avail, this.pendingCharge);
        avail -= deduct; this.pendingCharge -= deduct;
      }
      return avail;
    }
    // 推进一个逻辑步（dt 为虚拟毫秒）
    advance(dt) {
      if (this.state !== 'running' || this.paused) return 0;
      this.vtime += dt;
      this._wakeTimers(dt);
      const avail = this.grantAvailable();
      this._usedThisStep = 0;
      this.kernelWorkDelta = 0;
      const ctx = { left: avail, slice: SLICE, sys: this, owner: this };
      this._ctxRef = ctx;
      this._executeSystem(ctx);
      this.usedLastStep = this._usedThisStep;
      if (this.isRoot) this._checkProcErrors();
      else this._checkProcErrors();
      return this.usedLastStep;
    }
    advanceOneStep(dtOverride) {
      // 单步：覆盖子树（后代遵守各自暂停状态）
      if (this.state !== 'running') return;
      const dt = dtOverride != null ? dtOverride : STEP_MS * this.rate;
      this.advance(dt);
    }
    _wakeTimers(dt) {
      this.procs.forEach(p => {
        if (p.state === 'waiting' && p.waitInfo && p.waitInfo.type === 'timer') {
          p.waitInfo.remaining -= dt;
          if (p.waitInfo.remaining <= 0) {
            p.state = 'ready'; p.waitInfo = null;
            p._resumeHas = true; p._resumeVal = null;
          }
        }
      });
    }
    _checkProcErrors() {
      this.procs.forEach(p => {
        if (p.state === 'error' && p.role !== 'kernel' && !p.errorReported) {
          p.errorReported = true;
          this.notify('程序错误', p.name + ': ' + (p.error || ''), { kind: 'error' });
        }
      });
    }
    // 用给定共享预算上下文执行本系统（根=宿主调度；子系统=NIL 内核）
    _executeSystem(ctx) {
      if (this.isRoot) this._rootSchedule(ctx);
      else this._kernelSchedule(ctx);
    }
    _kernelSchedule(ctx) {
      const kp = this.kernelProc;
      if (!kp) return;
      if (kp.state === 'error' || kp.state === 'ended') {
        if (this.state === 'running') { this.state = 'errored'; this.kernelError = kp.error || '内核异常退出'; }
        return;
      }
      if (kp.state === 'suspended') return;
      // 每个逻辑步重置各进程额度计数
      this.procs.forEach(p => { p.quotaUsed = 0; });
      kp.quotaUsed = 0;
      // 每步向内核投递 tick（若内核在等待则唤醒）
      kp.mailbox.push({ kind: 'msg', args: ['tick'], t: this.vtime });
      if (kp.state === 'waiting') { kp.state = 'ready'; kp.waitInfo = null; kp._resumeHas = true; kp._resumeVal = null; }
      kp._ctx = ctx;
      const before = ctx.left;
      const r = VM.exec(this, kp, ctx);
      const used = before - ctx.left;
      kp.work += used; this.kernelWork += used; this.kernelWorkDelta = used; this._usedThisStep += used; this.totalWorkAll += used;
      kp._ctx = null;
      if (r === 'error') { this.state = 'errored'; this.kernelError = kp.error || '内核错误'; }
      else if (r === 'ended') { this.state = 'errored'; this.kernelError = '内核程序退出'; }
    }
    _rootSchedule(ctx) {
      this.procs.forEach(p => { p.quotaUsed = 0; });
      let guard = 0;
      while (ctx.left > 0 && guard++ < 200) {
        const ready = [];
        this.procs.forEach(p => { if (p.state === 'ready' && (p.role === 'user' || p.role === 'carrier')) ready.push(p); });
        if (!ready.length) break;
        const share = Math.max(1, Math.floor(ctx.left / ready.length));
        let any = false;
        for (const p of ready) {
          if (ctx.left <= 0) break;
          if (p.quotaUsed >= p.quota) continue;
          const give = Math.min(share, p.quota - p.quotaUsed, ctx.left);
          const before = ctx.left;
          this._runProcBudget(p, ctx, give);
          const used = before - ctx.left;
          if (used > 0) any = true;
        }
        if (!any) break;
      }
    }
    // 在共享上下文中执行一个进程/承载进程，返回消耗
    _runProcBudget(p, ctx, units) {
      units = Math.min(units, ctx.left);
      if (units <= 0) return 0;
      const before = ctx.left;
      if (p.role === 'carrier') {
        this._carrierStep(p, ctx, units);
      } else if (p.state === 'ready' || p.state === 'running') {
        const saved = ctx.left;
        ctx.left = Math.min(saved, units);
        p.state = 'ready';
        p._ctx = ctx;
        const r = VM.exec(this, p, ctx);
        const used = Math.min(saved, units) - ctx.left;
        ctx.left = saved - used;
        p._ctx = null;
        if (r === 'error') { /* 保留错误进程 */ }
      }
      const used = before - ctx.left;
      p.work += used; p.quotaUsed += used;
      this._usedThisStep += used; this.totalWorkAll += used;
      return used;
    }
    _carrierStep(carrier, ctx, units) {
      const child = SYSTEMS.find(s => s.id === (carrier.meta && carrier.meta.childId));
      if (!child || child.state === 'stopped') return;
      if (child.paused || child.state !== 'running') return;
      // 每个父系统逻辑步只推进一次
      if (child._lastAdvanceAt === this.vtime) return;
      child._lastAdvanceAt = this.vtime;
      const allowed = Math.min(units, this.grantFor(child.id), child.budgetPerStep, ctx.left);
      if (allowed <= 0) { child.grantFromParent = 0; return; }
      child.grantFromParent = allowed;
      const savedLeft = ctx.left;
      ctx.left = Math.min(ctx.left, allowed);
      // 推进子系统的虚拟时间与内核（消耗计入父系统预算）
      child.vtime += STEP_MS * child.rate;
      child._wakeTimers(STEP_MS * child.rate);
      child._usedThisStep = 0;
      const subCtx = { left: ctx.left, slice: SLICE, sys: child, owner: child, parentCtx: ctx };
      child._ctxRef = subCtx;
      child._executeSystem(subCtx);
      child.usedLastStep = child._usedThisStep;
      const consumed = allowed - subCtx.left;
      ctx.left = savedLeft - consumed;
      carrier.work += consumed; carrier.quotaUsed += consumed;
      this._usedThisStep += consumed; this.totalWorkAll += consumed;
    }
    subsystemStepOnce(sysOrId) {
      // 父系统命令：让暂停的直属子系统执行一个固定逻辑时间步（覆盖其子树）
      const child = typeof sysOrId === 'string' ? SYSTEMS.find(s => s.id === sysOrId) : sysOrId;
      if (!child || child.parent !== this) return { error: '子系统不存在' };
      if (this.state !== 'running' || this.paused) return { error: '当前系统处于暂停状态，无法发起单步' };
      if (child.state !== 'running') return { error: '子系统状态异常' };
      // 临时解除本系统的祖父暂停限制（祖先链必须运行），由调用方保证
      const wasPaused = child.paused;
      child.paused = false;
      child.advanceOneStep(STEP_MS * child.rate);
      child.paused = wasPaused;
      return { ok: true };
    }

    // ---------- 承载进程 ----------
    createChild(opts) {
      opts = opts || {};
      const name = opts.name || ('inner-' + (NEXT_INSTANCE++));
      const child = new Sys(this, { name, accent: opts.accent });
      // 内核源文件放在父文件系统
      const kpath = '/Systems/' + name + '/kernel.nil';
      let kernelSrc = opts.kernelSrc != null ? opts.kernelSrc : null;
      if (kernelSrc == null) {
        try {
          if (!this.fs.isDir('/Systems/' + name)) this.fs.mkdir('/Systems/' + name);
          if (!this.fs.exists(kpath)) this.fs.write(kpath, NS.KernelSources.defaultKernel(name), { skipQuota: false });
          kernelSrc = this.fs.read(kpath);
        } catch (e) { return { error: '写入内核源文件失败: ' + e.message }; }
      }
      child.kernelSourcePath = kpath;
      child.kernelSourceStored = kernelSrc;
      // 预置素材
      child.seedFixtures();
      // 父系统中的承载进程
      const carrier = new Proc(this, name + ' (承载)', 'carrier', { meta: { childId: child.id }, quota: Infinity });
      this.addProc(carrier);
      this.carrierProcs.set(child.id, carrier);
      child.carrierProcId = carrier.pid;
      this.children.push(child);
      child.boot(kernelSrc);
      NS.DesktopAPI.onSystemCreated(child);
      return { sys: child, carrier };
    }
    stopSubtree(sysOrId, reason) {
      const child = typeof sysOrId === 'string' ? SYSTEMS.find(s => s.id === sysOrId) : sysOrId;
      if (!child) return;
      // 深度优先停止
      child.children.slice().forEach(c => child.stopSubtree(c, reason));
      child.state = 'stopped'; child.paused = false;
      child.procs.forEach(p => { if (p.role !== 'app') { p.state = 'ended'; p.error = reason || '已停止'; } });
      child.procs.clear();
      if (child.desktop) NS.DesktopAPI.onSystemStopped(child);
      const idx = SYSTEMS.indexOf(child); if (idx >= 0) SYSTEMS.splice(idx, 1);
      if (child.parent) {
        const cp = child.parent.carrierProcs.get(child.id);
        if (cp) { child.parent.procs.delete(cp.pid); child.parent.carrierProcs.delete(child.id); }
        const ci = child.parent.children.indexOf(child); if (ci >= 0) child.parent.children.splice(ci, 1);
      }
      NS.SnapshotAPI.onSystemStopped(child);
    }
    restart() {
      // 结束子树内原有进程，重新载入内核源文件，从初始运行状态重启，保留已保存的文件
      const tree = this.subtreeList();
      const savedFiles = new Map();
      tree.forEach(s => savedFiles.set(s.id, s.fs.toJSON()));
      tree.forEach(s => {
        s.procs.forEach(p => { if (p.role !== 'carrier') p.state = 'ended'; });
        const carriers = [];
        s.procs.forEach(p => { if (p.role === 'carrier') carriers.push(p); });
        s.procs.clear();
        carriers.forEach(c => s.procs.set(c.pid, c));
        s.kernelProc = null;
        s.vtime = 0; s.rate = 1; s.paused = false;
        s.state = 'running'; s.kernelError = null;
        s.usedLastStep = 0; s.pendingCharge = 0;
        s.fs.fromJSON(NS.jsonClone(savedFiles.get(s.id)));
        s.booted = false;
        s.sceneState = null;
      });
      tree.forEach(s => { if (!s.isRoot) { s.reloadKernel(); s._loadPolicies(); } });
      if (this.desktop) NS.DesktopAPI.onSystemRestarted(this);
    }
    subtreeList() { const out = [this]; this.children.forEach(c => out.push(...c.subtreeList())); return out; }
    seedFixtures() {
      const K = NS.KernelSources;
      try {
        this.fs.mkdir('/Demo'); this.fs.mkdir('/Documents'); this.fs.mkdir('/Programs'); this.fs.mkdir('/System');
        if (!this.fs.exists('/Demo/helicopter-24.scene')) this.fs.write('/Demo/helicopter-24.scene', K.sampleScene(), { skipQuota: true });
        if (!this.fs.exists('/Demo/sample.sheet')) this.fs.write('/Demo/sample.sheet', K.sampleSheet(), { skipQuota: true });
        if (!this.fs.exists('/Programs/sum.nil')) this.fs.write('/Programs/sum.nil', K.progSum(), { skipQuota: true });
        if (!this.fs.exists('/Programs/sender.nil')) this.fs.write('/Programs/sender.nil', K.progSender(), { skipQuota: true });
        if (!this.fs.exists('/Programs/receiver.nil')) this.fs.write('/Programs/receiver.nil', K.progReceiver(), { skipQuota: true });
        if (!this.fs.exists('/Programs/endless.nil')) this.fs.write('/Programs/endless.nil', K.progEndless(), { skipQuota: true });
        if (!this.fs.exists('/Programs/flycontrol.nil')) this.fs.write('/Programs/flycontrol.nil', K.progFlyControl(), { skipQuota: true });
        if (!this.fs.exists('/Programs/timeline.nil')) this.fs.write('/Programs/timeline.nil', K.progTimeline(), { skipQuota: true });
        if (!this.fs.exists('/Programs/scene.nil')) this.fs.write('/Programs/scene.nil', K.progScene(), { skipQuota: true });
        if (!this.fs.exists('/Programs/fx.nil')) this.fs.write('/Programs/fx.nil', K.progFx(), { skipQuota: true });
        if (!this.fs.exists('/Programs/chart-recv.nil')) this.fs.write('/Programs/chart-recv.nil', K.progChartRecv(), { skipQuota: true });
        if (!this.fs.exists('/System/wm-rules.nil')) this.fs.write('/System/wm-rules.nil', K.wmRules(), { skipQuota: true });
        if (!this.fs.exists('/System/file-rules.cfg')) this.fs.write('/System/file-rules.cfg', K.fileRules(), { skipQuota: true });
        if (!this.fs.exists('/System/chart-rules.nil')) this.fs.write('/System/chart-rules.nil', K.chartRules(), { skipQuota: true });
        if (!this.fs.exists('/Documents/欢迎.txt')) this.fs.write('/Documents/欢迎.txt', '欢迎使用嵌套操作系统。\n\n请从桌面或开始菜单打开应用。\n', { skipQuota: true });
      } catch (e) { console.warn('seed fixtures failed', e); }
    }

    // ---------- 通知 ----------
    notify(title, body, opts) {
      opts = opts || {};
      const n = { id: NS.uid('ntf'), title, body: body || '', time: Date.now(), read: false, kind: opts.kind || 'info', systemId: this.id };
      this.notifications.unshift(n);
      if (this.notifications.length > 60) this.notifications.pop();
      if (this.desktop) this.desktop.onNotify(n);
      return n;
    }
    unreadCount() { return this.notifications.filter(n => !n.read).length; }

    // ---------- 运行时 syscall 分发 ----------
    runtime = {
      procSyscall: (proc, name, args) => this._procSyscall(proc, name, args)
    };

    _procSyscall(proc, name, args) {
      // 直接实现的系统调用（无需内核）
      const direct = DIRECT_SYSCALLS[name];
      if (direct) return this._guard(proc, name, () => direct(this, proc, args));
      // 内置函数（数学/字符串/类型），任何进程可用
      const b = BUILTIN_SYSCALLS[name];
      if (b) return this._guard(proc, name, () => b(this, proc, args));
      // 内核原始原语：只有内核进程可以调用
      const priv = PRIV_SYSCALLS[name];
      if (priv) {
        if (proc.role === 'kernel' || this.isRoot) return this._guard(proc, name, () => priv(this, proc, args));
        return this._routeToKernel(proc, name, args);
      }
      // 用户级系统调用（内核实现语义）
      if (proc.role === 'kernel' || this.isRoot) {
        const h = USER_SYSCALLS[name];
        if (h) return this._guard(proc, name, () => h(this, proc, args));
      }
      return this._routeToKernel(proc, name, args);
    }
    _guard(proc, name, fn) {
      try { return fn() || { value: null }; }
      catch (e) {
        if (NS.DEBUG_SYSCALL) console.error('[syscall]', name, e.stack || e);
        if (e && e.errCode) return { error: e.message };
        if (e instanceof VM.NilError) return { error: e.message };
        return { error: (e && e.message) || String(e) };
      }
    }
    _routeToKernel(proc, name, args) {
      const kernel = this.kernelProc;
      if (!kernel) return { error: '本系统没有内核' };
      const req = { from: proc.pid, id: this.msgSeq++, name, args: NS.jsonClone(args) };
      kernel.mailbox.push({ kind: 'msg', args: ['syscall', proc.pid, req.id, name, NS.jsonClone(args)], t: this.vtime });
      if (kernel.state === 'waiting') { kernel.state = 'ready'; kernel.waitInfo = null; kernel._resumeHas = true; kernel._resumeVal = null; }
      return { block: { type: 'rpc', req } };
    }
    deliverReply(toPid, reqId, value, isError) {
      const p = this.procs.get(toPid);
      if (!p) return;
      p.mailbox.push({ kind: 'reply', id: reqId, value: value === undefined ? null : value, error: !!isError });
      this._wakeForMessage(p);
    }
    _wakeForMessage(p) {
      if (p.state === 'waiting' && p.waitInfo) {
        if (p.waitInfo.type === 'msg') {
          const m = p.mailbox.shift();
          if (m) {
            p.waitInfo = null; p.state = 'ready';
            p._resumeHas = true;
            p._resumeVal = (m && m.kind === 'reply') ? m.value : (m ? m.args : null);
            if (m && m.kind === 'reply' && m.error) p._resumeIsError = true;
          }
        } else if (p.waitInfo.type === 'rpc') {
          const i = p.mailbox.findIndex(m => m.kind === 'reply' && m.id === p.waitInfo.req.id);
          if (i >= 0) {
            const m = p.mailbox.splice(i, 1)[0];
            p.waitInfo = null; p.state = 'ready';
            p._rpcHas = true; p._rpcResult = m.value; p._rpcError = !!m.error;
          }
        }
      } else if (p.state === 'suspended') {
        // 挂起时保留消息
      }
    }
    deliverToProc(pid, args, opts) {
      opts = opts || {};
      const p = this.procs.get(pid);
      if (!p) return false;
      const m = { kind: opts.kind || 'msg', args: NS.jsonClone(args), t: this.vtime, seq: this.msgSeq++, from: opts.from != null ? opts.from : 'host' };
      p.mailbox.push(m);
      this._wakeForMessage(p);
      return true;
    }
    hostSend(pid, ...args) { return this.deliverToProc(pid, args); }
  }

  // ---------------- 内置函数（数学/字符串/类型） ----------------
  const BUILTIN_SYSCALLS = {
    rand: (s, p, a) => ({ value: Math.random() }),
    abs: (s, p, a) => ({ value: Math.abs(VM.toNum(a[0])) }),
    floor: (s, p, a) => ({ value: Math.floor(VM.toNum(a[0])) }),
    ceil: (s, p, a) => ({ value: Math.ceil(VM.toNum(a[0])) }),
    round: (s, p, a) => ({ value: Math.round(VM.toNum(a[0])) }),
    sqrt: (s, p, a) => ({ value: Math.sqrt(VM.toNum(a[0])) }),
    pow: (s, p, a) => ({ value: Math.pow(VM.toNum(a[0]), VM.toNum(a[1])) }),
    sin: (s, p, a) => ({ value: Math.sin(VM.toNum(a[0])) }),
    cos: (s, p, a) => ({ value: Math.cos(VM.toNum(a[0])) }),
    tan: (s, p, a) => ({ value: Math.tan(VM.toNum(a[0])) }),
    atan2: (s, p, a) => ({ value: Math.atan2(VM.toNum(a[0]), VM.toNum(a[1])) }),
    min: (s, p, a) => ({ value: Math.min(...a.map(VM.toNum)) }),
    max: (s, p, a) => ({ value: Math.max(...a.map(VM.toNum)) }),
    clamp: (s, p, a) => ({ value: NS.clamp(VM.toNum(a[0]), VM.toNum(a[1]), VM.toNum(a[2])) }),
    lerp: (s, p, a) => ({ value: NS.lerp(VM.toNum(a[0]), VM.toNum(a[1]), VM.toNum(a[2])) }),
    len: (s, p, a) => {
      const v = a[0];
      if (Array.isArray(v) || typeof v === 'string') return { value: v.length };
      if (v && typeof v === 'object') return { value: Object.keys(v).length };
      return { value: 0 };
    },
    type: (s, p, a) => {
      const v = a[0];
      if (v === null) return { value: 'null' };
      if (Array.isArray(v)) return { value: 'array' };
      return { value: typeof v };
    },
    str: (s, p, a) => ({ value: VM.toStr(a[0]) }),
    num: (s, p, a) => { const n = VM.toNum(a[0]); return { value: isNaN(n) ? null : n }; },
    keys: (s, p, a) => ({ value: a[0] && typeof a[0] === 'object' ? Object.keys(a[0]) : [] }),
    push: (s, p, a) => { if (Array.isArray(a[0])) { a[0].push(a[1]); return { value: a[0].length }; } return { error: 'push 需要数组' }; },
    pop: (s, p, a) => { if (Array.isArray(a[0])) return { value: a[0].pop() }; return { error: 'pop 需要数组' }; },
    substr: (s, p, a) => {
      const str = VM.toStr(a[0]); let st = VM.toNum(a[1]) || 0; let en = a[2] === undefined ? str.length : VM.toNum(a[2]);
      if (st < 0) st = 0; if (en > str.length) en = str.length;
      return { value: str.substring(st, en) };
    },
    find: (s, p, a) => ({ value: VM.toStr(a[0]).indexOf(VM.toStr(a[1])) }),
    split: (s, p, a) => ({ value: VM.toStr(a[0]).split(VM.toStr(a[1] || '')) }),
    join: (s, p, a) => ({ value: (a[0] || []).map(VM.toStr).join(VM.toStr(a[1] || '')) }),
    replace: (s, p, a) => ({ value: VM.toStr(a[0]).split(VM.toStr(a[1])).join(VM.toStr(a[2])) }),
    upper: (s, p, a) => ({ value: VM.toStr(a[0]).toUpperCase() }),
    lower: (s, p, a) => ({ value: VM.toStr(a[0]).toLowerCase() }),
    trim: (s, p, a) => ({ value: VM.toStr(a[0]).trim() }),
    json_enc: (s, p, a) => { try { return { value: JSON.stringify(a[0]) }; } catch (e) { return { error: 'json_enc 失败' }; } },
    json_dec: (s, p, a) => { try { return { value: JSON.parse(VM.toStr(a[0])) }; } catch (e) { return { error: 'json_dec 失败: ' + e.message }; } },
    range: (s, p, a) => { const n = VM.toNum(a[0]); const r = []; for (let i = 0; i < n; i++) r.push(i); return { value: r }; },
    fmt_num: (s, p, a) => ({ value: Number(VM.toNum(a[0])).toFixed(a[1] === undefined ? 2 : VM.toNum(a[1])) })
  };

  // ---------------- 直接系统调用（不需内核） ----------------
  const DIRECT_SYSCALLS = {
    time: (s, p) => ({ value: s.vtime }),
    sleep: (s, p, a) => {
      const ms = Math.max(0, VM.toNum(a[0]) || 0);
      return { block: { type: 'timer', remaining: ms } };
    },
    myid: (s, p) => ({ value: p.pid }),
    yield: (s, p) => { p.quotaUsed = p.quota; return { value: null }; },
    halt: (s, p) => { p.state = 'ended'; return { value: null }; },
    print: (s, p, a) => {
      const line = a.map(VM.toStr).join(' ');
      p.log.push(line);
      if (p.log.length > 200) p.log.shift();
      NS.AppHost.onProcOutput(s, p, line);
      return { value: null };
    },
    log: (s, p, a) => {
      const line = a.map(VM.toStr).join(' ');
      p.log.push(line);
      if (p.log.length > 200) p.log.shift();
      NS.AppHost.onProcOutput(s, p, line);
      return { value: null };
    },
    send: (s, p, a) => {
      if (!a.length) return { error: 'send 需要收件人' };
      const to = VM.toNum(a[0]);
      const entry = { seq: s.msgSeq++, from: p.pid, to, args: NS.jsonClone(a.slice(1)), t: s.vtime };
      s.outbox.push(entry);
      return { value: entry.seq };
    },
    recv: (s, p) => {
      if (p.mailbox.length) {
        const m = p.mailbox.shift();
        if (m.kind === 'reply') return { value: m.error ? null : (m.value === undefined ? null : m.value) };
        return { value: m.args === undefined ? null : m.args };
      }
      return { block: { type: 'msg' } };
    },
    hasmsg: (s, p) => ({ value: p.mailbox.length > 0 }),
    budget_info: (s, p) => ({
      value: {
        total: s.budgetPerStep, grant: s.grantFromParent, used: s.usedLastStep,
        pending: s.pendingCharge, mem: s.memUsed(), memQuota: s.memoryQuota,
        storage: s.storageUsed(), storageQuota: s.storageQuota, vtime: s.vtime, rate: s.rate
      }
    }),
    proc_info: (s, p, a) => {
      const t = s.procs.get(VM.toNum(a[0]));
      if (!t) return { value: null };
      return { value: { pid: t.pid, name: t.name, role: t.role, state: t.state, work: t.work, mem: t.memSize(), error: t.error } };
    },
    notify: (s, p, a) => {
      s.notify(VM.toStr(a[0] || '提示'), VM.toStr(a[1] || ''), { kind: 'program' });
      return { value: null };
    }
  };

  // ---------------- 内核原始原语 ----------------
  const PRIV_SYSCALLS = {
    fs_read: (s, p, a) => {
      try { return { value: s.fs.read(VM.toStr(a[0])) }; } catch (e) { return { error: e.message }; }
    },
    fs_write: (s, p, a) => {
      try { s.fs.write(VM.toStr(a[0]), VM.toStr(a[1]), {}); return { value: true }; } catch (e) { return { error: e.message }; }
    },
    fs_append: (s, p, a) => {
      try { s.fs.append(VM.toStr(a[0]), VM.toStr(a[1])); return { value: true }; } catch (e) { return { error: e.message }; }
    },
    fs_list: (s, p, a) => {
      try { return { value: s.fs.listdir(VM.toStr(a[0] || '/')).map(e => e.name + (e.type === 'dir' ? '/' : '')) }; } catch (e) { return { error: e.message }; }
    },
    fs_list_ex: (s, p, a) => {
      try { return { value: s.fs.listdir(VM.toStr(a[0] || '/')) }; } catch (e) { return { error: e.message }; }
    },
    fs_mkdir: (s, p, a) => {
      try { s.fs.mkdir(VM.toStr(a[0])); return { value: true }; } catch (e) { return { error: e.message }; }
    },
    fs_delete: (s, p, a) => {
      try { s.fs.delete(VM.toStr(a[0])); return { value: true }; } catch (e) { return { error: e.message }; }
    },
    fs_rename: (s, p, a) => {
      try { s.fs.rename(VM.toStr(a[0]), VM.toStr(a[1])); return { value: true }; } catch (e) { return { error: e.message }; }
    },
    fs_copy: (s, p, a) => {
      try { s.fs.copy(VM.toStr(a[0]), VM.toStr(a[1])); return { value: true }; } catch (e) { return { error: e.message }; }
    },
    fs_exists: (s, p, a) => ({ value: s.fs.exists(VM.toStr(a[0])) }),
    fs_stat: (s, p, a) => {
      try { return { value: s.fs.stat(VM.toStr(a[0])) }; } catch (e) { return { error: e.message }; }
    },
    fs_usage: (s, p) => ({ value: s.fs.usage() }),
    proc_list: (s, p) => ({
      value: Array.from(s.procs.values()).map(t => ({
        pid: t.pid, name: t.name, role: t.role, state: t.state, work: t.work,
        quota: t.quota === Infinity ? -1 : t.quota, quotaUsed: t.quotaUsed,
        mem: t.memSize(), app: t.meta.appId || null, hostId: t.hostId, error: t.error
      }))
    }),
    sched_run: (s, p, a) => {
      const target = s.procs.get(VM.toNum(a[0]));
      if (!target) return { value: 0 };
      if (target.state === 'suspended' || target.state === 'ended' || target.state === 'error') return { value: 0 };
      let units = VM.toNum(a[1]);
      const ctx = p._ctx;
      if (!ctx) return { value: 0 };
      if (target.state === 'waiting') {
        if (target.waitInfo && target.waitInfo.type === 'timer') return { value: 0 };
      }
      if (target.quota !== Infinity) units = Math.min(units, Math.max(0, target.quota - target.quotaUsed));
      if (s._spentCap != null) units = Math.min(units, Math.max(0, s._spentCap - (s._spent || 0)));
      units = Math.min(units, ctx.left);
      if (NS.DEBUG_SCHED) console.log('[sched_run]', target.name, target.state, 'units=', units, 'ctxLeft=', ctx.left);
      if (units <= 0) return { value: 0 };
      const saved = ctx.left;
      ctx.left = Math.min(saved, units);
      target.state = 'ready';
      target._ctx = ctx;
      const r = VM.exec(s, target, ctx);
      const used = Math.min(saved, units) - ctx.left;
      ctx.left = saved - used;
      target.work += used; target.quotaUsed += used;
      s._spent = (s._spent || 0) + used;
      if (s._onSpend) s._onSpend(used, target);
      target._ctx = null;
      return { value: used };
    },
    spawn_proc: (s, p, a) => {
      const src = VM.toStr(a[0]);
      const name = a[1] !== undefined ? VM.toStr(a[1]) : 'program';
      const r = s.spawnNIL(src, name, { role: 'user', meta: { spawnedBy: p.pid } });
      if (r.error) return { error: r.error };
      return { value: r.proc.pid };
    },
    kill_proc: (s, p, a) => {
      const pid = VM.toNum(a[0]);
      const reason = a[1] !== undefined ? VM.toStr(a[1]) : '被结束';
      if (pid === s.kernelProc.pid) return { error: '不能结束内核' };
      s.killProc(pid, reason);
      return { value: true };
    },
    proc_quota_get: (s, p, a) => {
      const t = s.procs.get(VM.toNum(a[0]));
      if (!t) return { error: '进程不存在' };
      return { value: t.quota === Infinity ? -1 : t.quota };
    },
    proc_quota_set: (s, p, a) => {
      const t = s.procs.get(VM.toNum(a[0]));
      if (!t) return { error: '进程不存在' };
      const q = VM.toNum(a[1]);
      t.quota = q < 0 ? Infinity : q;
      return { value: true };
    },
    proc_suspend: (s, p, a) => { s.suspendProc(VM.toNum(a[0])); return { value: true }; },
    proc_resume: (s, p, a) => { s.resumeProc(VM.toNum(a[0])); return { value: true }; },
    msg_poll: (s, p) => {
      if (!s.outbox.length) return { value: null };
      return { value: s.outbox.shift() };
    },
    msg_deliver: (s, p, a) => {
      const m = a[0];
      if (!m) return { error: '缺少消息' };
      const target = s.procs.get(VM.toNum(m.to));
      if (!target) {
        // 目标不存在：给发送方明确结果（作为普通消息回执）
        const sender = s.procs.get(VM.toNum(m.from));
        if (sender) {
          sender.mailbox.push({ kind: 'msg', args: ['send-error', '收件人不存在: pid=' + VM.toStr(m.to), VM.toStr(m.to)], t: s.vtime, from: 'kernel', seq: m.seq });
          s._wakeForMessage(sender);
        }
        return { value: { delivered: false, reason: '目标不存在' } };
      }
      target.mailbox.push({ kind: 'msg', args: NS.jsonClone(m.args), t: s.vtime, from: m.from, seq: m.seq });
      s._wakeForMessage(target);
      return { value: { delivered: true } };
    },
    msg_send_proc: (s, p, a) => {
      const pid = VM.toNum(a[0]);
      const args = a[1];
      if (!s.deliverToProc(pid, Array.isArray(args) ? args : [args], { from: p.pid })) return { error: '目标不存在' };
      return { value: true };
    },
    msg_reply: (s, p, a) => {
      const to = VM.toNum(a[0]), id = VM.toNum(a[1]);
      const val = a.length > 2 ? a[2] : null;
      const isErr = !!(a.length > 3 && a[3]);
      const t = s.procs.get(to);
      if (!t) return { value: false };
      t.mailbox.push({ kind: 'reply', id, value: val === undefined ? null : NS.jsonClone(val), error: isErr, t: s.vtime });
      s._wakeForMessage(t);
      return { value: true };
    },
    proc_step_reset: (s, p) => {
      s.procs.forEach(t => { t.quotaUsed = 0; });
      return { value: true };
    },
    ui_apply: (s, p, a) => {
      try { NS.DesktopAPI.applyUiOp(s, NS.jsonClone(a[0] || {}), p); return { value: true }; }
      catch (e) { return { error: e.message }; }
    },
    wm_policy: (s, p, a) => { s.policies.wm = NS.jsonClone(a[0] || {}); return { value: true }; },
    wm_list: (s, p) => ({ value: (s.windows || []).map(w => ({ id: w.id, app: w.appId, title: w.title, x: w.x, y: w.y, w: w.w, h: w.h, z: w.z, state: w.state, focused: !!w.focused })) }),
    scene_submit: (s, p, a) => {
      try {
        s.sceneState = NS.jsonClone(a[0] || null);
        s.sceneTime = VM.toNum((a[0] || {}).t || 0);
        NS.SceneHost.onSceneSubmit(s, s.sceneState);
        return { value: true };
      } catch (e) { return { error: e.message }; }
    },
    scene_submit_layer: (s, p, a) => {
      try {
        s.fxState = NS.jsonClone(a[0] || null);
        NS.SceneHost.onFxSubmit(s, s.fxState);
        return { value: true };
      } catch (e) { return { error: e.message }; }
    },
    sensor_read: (s, p) => {
      const r = s.rehearsal;
      if (!r) return { error: '排演未启动' };
      return { value: [r.t, r.pos[0], r.pos[1], r.pos[2], r.vel[0], r.vel[1], r.vel[2], r.roll, r.pitch, r.yaw, r.rpm, r.collective, r.wind[0], r.wind[1]] };
    },
    actuator_write: (s, p, a) => {
      const r = s.rehearsal;
      if (!r) return { error: '排演未启动' };
      r.ctrl.collective = VM.toNum(a[0]); r.ctrl.pitch = VM.toNum(a[1]); r.ctrl.roll = VM.toNum(a[2]); r.ctrl.yaw = VM.toNum(a[3]);
      r.ctrlWrittenAt = s.vtime;
      return { value: true };
    },
    actuator_read: (s, p) => {
      const r = s.rehearsal;
      if (!r) return { error: '排演未启动' };
      return { value: [r.ctrl.collective, r.ctrl.pitch, r.ctrl.roll, r.ctrl.yaw, r.wind[0], r.wind[1], r.headingTarget, r.faultAt, r.faultActive ? 1 : 0, r.origin ? r.origin : null] };
    },
    host_send: (s, p, a) => {
      s.hostMessages = s.hostMessages || [];
      s.hostMessages.push(NS.jsonClone(a));
      return { value: true };
    },
    notify_host: (s, p, a) => { s.notify(VM.toStr(a[0] || '通知'), VM.toStr(a[1] || ''), { kind: 'program' }); return { value: true }; },
    sys_info: (s, p) => ({
      value: { id: s.id, name: s.name, depth: s.depth, vtime: s.vtime, rate: s.rate, budget: s.budgetPerStep, grant: s.grantFromParent, state: s.state }
    }),
    new_carrier: (s, p, a) => {
      const name = VM.toStr(a[0] || '');
      const r = s.createChild({ name: name || undefined });
      if (r.error) return { error: r.error };
      return { value: r.sys.id };
    },
    compile_src: (s, p, a) => {
      try { const prog = VM.compile(VM.toStr(a[0])); return { value: JSON.stringify({ consts: prog.consts, code: prog.code, funcs: prog.funcs, mainNlocals: prog.mainNlocals }) }; }
      catch (e) { return { error: '编译失败: ' + e.message }; }
    },
    app_state: (s, p, a) => {
      // 应用进程保存/读取自己的键值状态（存于系统文件）
      const key = 'appstate:' + (p.meta.appId || p.pid);
      const path = '/System/' + key + '.json';
      if (a[0] === 'save') {
        try { s.fs.write(path, VM.toStr(a[1] || '{}')); return { value: true }; } catch (e) { return { error: e.message }; }
      }
      try { return { value: s.fs.exists(path) ? JSON.parse(s.fs.read(path)) : null }; } catch (e) { return { value: null }; }
    },
    budget_set: (s, p, a) => {
      const v = VM.toNum(a[0]);
      if (!(v > 0)) return { error: '预算必须为正数' };
      s.budgetPerStep = Math.floor(v);
      return { value: true };
    },
    grant_set: (s, p, a) => {
      const childId = VM.toStr(a[0]); const v = VM.toNum(a[1]);
      if (v < 0) return { error: '拨付不能为负' };
      s.setGrantCap(childId, Math.floor(v));
      return { value: true };
    },
    mem_set: (s, p, a) => { const v = VM.toNum(a[0]); if (v > 0) { s.memoryQuota = Math.floor(v); return { value: true }; } return { error: '无效内存配额' }; },
    storage_set: (s, p, a) => { const v = VM.toNum(a[0]); if (v > 0) { s.storageQuota = Math.floor(v); return { value: true }; } return { error: '无效存储配额' }; }
  };

  // ---------------- 用户级系统调用（内核 NIL 实现语义，根系统由宿主实现） ----------------
  const USER_SYSCALLS = {
    read: (s, p, a) => {
      try { return { value: s.fs.read(VM.toStr(a[0])) }; } catch (e) { return { error: e.message }; }
    },
    write: (s, p, a) => {
      try { s.fs.write(VM.toStr(a[0]), VM.toStr(a[1] == null ? '' : a[1])); return { value: true }; } catch (e) { return { error: e.message }; }
    },
    append: (s, p, a) => {
      try { s.fs.append(VM.toStr(a[0]), VM.toStr(a[1] == null ? '' : a[1])); return { value: true }; } catch (e) { return { error: e.message }; }
    },
    listdir: (s, p, a) => {
      try { return { value: s.fs.listdir(VM.toStr(a[0] || '/')).map(e => e.name + (e.type === 'dir' ? '/' : '')) }; } catch (e) { return { error: e.message }; }
    },
    mkdir: (s, p, a) => {
      try { s.fs.mkdir(VM.toStr(a[0])); return { value: true }; } catch (e) { return { error: e.message }; }
    },
    delete: (s, p, a) => {
      try { s.fs.delete(VM.toStr(a[0])); return { value: true }; } catch (e) { return { error: e.message }; }
    },
    rename: (s, p, a) => {
      try { s.fs.rename(VM.toStr(a[0]), VM.toStr(a[1])); return { value: true }; } catch (e) { return { error: e.message }; }
    },
    copy: (s, p, a) => {
      try { s.fs.copy(VM.toStr(a[0]), VM.toStr(a[1])); return { value: true }; } catch (e) { return { error: e.message }; }
    },
    exists: (s, p, a) => ({ value: s.fs.exists(VM.toStr(a[0])) }),
    stat: (s, p, a) => {
      try { return { value: s.fs.stat(VM.toStr(a[0])) }; } catch (e) { return { error: e.message }; }
    },
    spawn: (s, p, a) => {
      const src = VM.toStr(a[0]); const name = a[1] !== undefined ? VM.toStr(a[1]) : 'program';
      const r = s.spawnNIL(src, name, { meta: { spawnedBy: p.pid } });
      if (r.error) return { error: r.error };
      return { value: r.proc.pid };
    },
    kill: (s, p, a) => { s.killProc(VM.toNum(a[0]), VM.toStr(a[1] || '已结束')); return { value: true }; },
    suspend: (s, p, a) => { s.suspendProc(VM.toNum(a[0])); return { value: true }; },
    resume_pid: (s, p, a) => { s.resumeProc(VM.toNum(a[0])); return { value: true }; },
    run_program: (s, p, a) => {
      const path = VM.toStr(a[0]);
      let src;
      try { src = s.fs.read(path); } catch (e) { return { error: '读取程序失败: ' + e.message }; }
      const r = s.spawnNIL(src, path.split('/').pop().replace(/\.nil$/, ''), { meta: { path } });
      if (r.error) return { error: r.error };
      return { value: r.proc.pid };
    },
    toast: (s, p, a) => { s.notify(VM.toStr(a[0] || '提示'), VM.toStr(a[1] || ''), {}); return { value: true }; }
  };

  NS.Sys = Sys;
  NS.Proc = Proc;
  NS.FS = FS;
  NS.SYSTEMS = SYSTEMS;
  NS.NEXT_INSTANCE = () => NEXT_INSTANCE;
  NS.resetInstances = () => { NEXT_INSTANCE = 1; };
  NS.STEP_MS = STEP_MS;
  NS.SLICE = SLICE;
})(window.NOS = window.NOS || {});
