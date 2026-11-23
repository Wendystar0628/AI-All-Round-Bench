/* 系统实例引擎（宿主侧）
 * 每个非根系统实例：一个 Instance，包含 VFS、配置、进程表（OSL VM），
 * 以及直属子系统（递归 Instance）。kernel.osl 作为本实例的承载程序运行；
 * 内核通过 host-sys 管理本系统的进程（spawn/调度/消息/文件/显示/子系统）。
 *
 * 工作量计量：指令（OSL 节点步）；宿主服务（文件、场景、编译）按数据规模收费。
 */
'use strict';
window.NOS = window.NOS || {};

let nextPid = 1;
function newPid() { return nextPid++; }

class Proc {
  constructor(pid, name, prog, entry, args, priority, quota) {
    this.pid = pid;
    this.name = name;
    this.prog = prog;           // {id,path,text,compiled}
    this.entry = entry || 'main';
    this.args = args || [];
    this.vm = null;
    this.state = 'ready';       // ready|running|waiting|suspended|done|error
    this.priority = priority || 0;
    this.quota = quota || 0;    // 每逻辑步指令上限（0=受总预算约束）
    this.usedStep = 0;
    this.usedTotal = 0;
    this.inbox = [];            // 消息 [{from,to,value,time,seq}]
    this.waiting = null;        // {type:'time'|'msg'|..., until, timeout}
    this.error = null;
    this.mem = 0;
    this.startTime = 0;
    this.workLeft = 0;          // 未完成工作描述（供进程管理器）
  }
}

const KERNEL_PATH = '/System/kernel.osl';

class Instance {
  constructor(opts) {
    this.id = opts.id;                       // 'inner-1' 等
    this.parent = opts.parent || null;       // Instance | null
    this.parentVfs = opts.parentVfs || null; // 内核源文件与子盘所在 FS
    this.depth = opts.depth || 1;
    this.store = opts.store;                 // blob 存储
    this.name = opts.name || this.id;
    this.state = 'created';                  // created|running|paused|stopped|kernel-error|closed
    this.kernelError = null;
    this.time = 0;                           // 虚拟时间 ms
    this.rate = opts.rate || 1;
    this.totalBudget = opts.totalBudget || 60000;   // 每逻辑步总指令
    this.memQuota = opts.memQuota || 16 * 1024 * 1024;
    this.storageQuota = opts.storageQuota || 8 * 1024 * 1024;
    this.childGrantCap = opts.childGrantCap || 0.55; // 直属承载合计上限比例
    this.grantToMe = opts.grantToMe || 0;    // 父本步实际拨付（指令）
    this.procs = [];
    this.nextPid = 10;
    this.children = [];
    this.vfs = null;
    this.ui = null;                          // 最近提交的桌面 UI 树
    this.uiVersion = 0;
    this.scenes = {};                        // pid -> 已提交场景状态（设备渲染用）
    this.desktopState = { windows: [], icons: null, zTop: 0 };
    this.hostEvents = [];                    // 宿主->内核事件队列（指针/键盘/控件）
    this.charts = {};                        // pid -> 图表状态（数据/连接）
    this.projections = [];                  // 投送到祖先的窗口 {id,sourcePid,app,targetId,winId,state}
    this.notifications = [];
    this.rngSeed = opts.rngSeed || (Math.random() * 1e9 | 0);
    this.tickCount = 0;
    this.usedStep = { kernel: 0, user: 0, children: 0 };
    this.dataPending = {};                   // 跨层更新暂存（系统暂停时）
    this.programs = {};                      // path -> prog cache
    this.kernelVm = null;
    this.kernelProc = null;
    this.config = {
      scheduler: opts.scheduler || 'round-robin'
    };
    this._workInFlight = [];                 // 分块工作（按规模付费，续做）
    this.childrenBudget = {};
  }

  /* ---------- 文件系统 ---------- */
  initFreshFiles() {
    this.vfs = NOS.VFS.fresh(this.store, this.storageQuota);
    // 子系统预置：从模板目录拷贝
    const tpl = this.parentVfs.read('/System/child-template.json');
    if (tpl) {
      const tree = JSON.parse(tpl);
      this.vfs.importObject(tree);
    }
  }

  loadProgram(path, text) {
    if (text === undefined) text = this.vfs.read(path);
    if (text == null) throw new Error('程序不存在: ' + path);
    try {
      // 经系统编译器（/System/compiler.osl，可在系统内修改）
      const result = NOS.hostsvcs['compile'](this, [text, path]);
      if (result && result.__error) throw new Error(result.__error);
      const compiled = { ast: result.ast, defs: result.defs, globals: [] };
      const prog = { id: path + ':' + NOS.util.hash(text), path, text, compiled };
      this.programs[path] = prog;
      return prog;
    } catch (e) {
      throw new Error('编译失败 ' + path + ': ' + e.message);
    }
  }

  /* ---------- 启动 ---------- */
  start() {
    if (this.state === 'running') return;
    try {
      const kernelText = this.parentVfs.read(KERNEL_PATH);
      if (kernelText == null) throw new Error('缺少内核程序 ' + KERNEL_PATH);
      const kprog = this._loadKernelProgram(kernelText);
      this.nextPid = 10;
      this.procs = [];
      const kproc = new Proc(1, 'kernel', kprog, 'kernel-main', [this.id, this.depth], -1, 0);
      this.kernelProc = kproc;
      kproc.vm = new NOS.VM(kprog, null, { rngState: this.rngSeed });
      kproc.vm.start('kernel-main', [this.id, this.depth]);
      this.procs.push(kproc);
      this.state = 'running';
      this.kernelError = null;
    } catch (e) {
      this.state = 'kernel-error';
      this.kernelError = e.message || String(e);
    }
  }

  _loadKernelProgram(text) {
    // 内核由“系统编译器”编译；compiler.osl 可改编译行为；引导时宿主提供解析器
    try {
      const ast = NOS.osl.parse(text);
      const compiled = NOS.osl.compileAST(ast);
      return { id: KERNEL_PATH, path: KERNEL_PATH, text, compiled };
    } catch (e) {
      throw new Error('内核语法错误: ' + e.message);
    }
  }

  /* ---------- 子系统管理 ---------- */
  createChild(opts) {
    const inst = new Instance(Object.assign({
      parent: this, parentVfs: this.vfs, depth: this.depth + 1, store: this.store
    }, opts));
    inst.initFreshFiles();
    inst.start();
    this.children.push(inst);
    return inst;
  }

  findChild(id) { return this.children.find(c => c.id === id); }
  findDescendant(id) {
    for (const c of this.children) {
      if (c.id === id) return c;
      const d = c.findDescendant(id);
      if (d) return d;
    }
    return null;
  }
  allDescendants(out) {
    out = out || [];
    for (const c of this.children) { out.push(c); c.allDescendants(out); }
    return out;
  }
  ancestors() {
    const out = [];
    let p = this.parent;
    while (p) { out.push(p); p = p.parent; }
    return out;
  }

  pauseTree() {
    this.state = 'paused';
    for (const c of this.children) c.pauseTree();
  }
  resumeTree() {
    if (this.state === 'paused') this.state = 'running';
    for (const c of this.children) if (c.state === 'paused') c.resumeTree();
  }
  stopTree() {
    this.state = 'stopped';
    for (const c of this.children) c.stopTree();
  }

  closeTree() {
    this.state = 'closed';
    for (const c of this.children) c.closeTree();
    // 通知投送窗口关闭
    this._closeMyProjections();
  }

  _closeMyProjections() {
    // 由 rootvm 在主循环中根据 state 处理
  }

  /* ---------- 单步：固定逻辑时间步 33.3ms ---------- */
  static STEP_MS = 100 / 3;

  singleStep() {
    if (this.state !== 'paused') return false;
    this._advanceTree(Instance.STEP_MS, true);
    return true;
  }

  /* ---------- 主推进 ---------- */
  advance(dtReal) {
    if (this.state !== 'running') {
      // 暂停/停止：不推进
      return;
    }
    const dt = dtReal * this.rate;
    this._advanceTree(dt, false);
  }

  _advanceTree(dt, singleStepMode) {
    this.time += dt;
    this.tickCount++;
    // 1) 内核承载：把本步拨付交给内核 VM（内核内部调度用户进程与子承载）
    const cap = this.grantToMe > 0 ? Math.min(this.totalBudget, this.grantToMe) : this.totalBudget;
    this._runKernel(cap, dt);
    // 2) 子系统：仅当内核本步未自行驱动时兜底（避免重复推进）
    if (this.state === 'running' || singleStepMode) {
      for (const ch of this.children) {
        if (ch.state === 'paused') continue;
        if (ch._drivenThisTick) { ch._drivenThisTick = false; continue; }
        const g = this.childrenBudget[ch.id] !== undefined ? this.childrenBudget[ch.id] : Math.floor(cap * this.childGrantCap / Math.max(1, this.children.length));
        ch.grantToMe = g;
        ch.advance(dt);
      }
    }
  }

  _runKernel(budget, dt) {
    const kp = this.kernelProc;
    if (!kp || !kp.vm) return;
    let remaining = budget;
    let guard = 0;
    const wakeTimer = () => {};
    while (remaining > 0 && guard++ < 2000) {
      const vm = kp.vm;
      if (vm.state === 'done') { this.state = this.state === 'running' ? 'running' : this.state; break; }
      if (vm.state === 'error') { this.state = 'kernel-error'; this.kernelError = vm.error; break; }
      if (vm.state === 'waiting') {
        const handled = this._serviceKernelWait(vm, dt);
        if (!handled) break; // 等待条件未满足，让出本步
      }
      const before = vm.totalUsed;
      const slice = Math.min(remaining, 20000);
      const st = vm.runStep(slice);
      const consumed = vm.totalUsed - before;
      remaining -= Math.max(0, consumed);
      kp.usedStep = consumed;
      kp.usedTotal += Math.max(0, consumed);
      if (st === 'waiting') continue;
      if (st === 'ready') continue; // 预算片用完
      if (st === 'done') break;
      if (st === 'error') { this.state = 'kernel-error'; this.kernelError = vm.error; break; }
    }
    this.usedStep.kernel = budget - Math.max(0, remaining);
  }

  /* 内核 VM 等待点服务：执行 host-sys，或处理时间/消息等待 */
  _serviceKernelWait(vm, dt) {
    const w = vm.wait;
    if (!w) return false;
    const ctx = w.ctx;
    if (ctx.type === 'time') {
      ctx._left = (ctx._left === undefined ? ctx.ms : ctx._left) - dt;
      if (ctx._left <= 0) { vm.resume(null); return true; }
      return false;
    }
    if (ctx.type === 'yield') { vm.resume(null); return true; }
    if (ctx.type === 'msg') {
      // 内核自身邮箱（host 事件）
      if (this.hostEvents.length) {
        const ev = this.hostEvents.shift();
        vm.resume(ev);
        return true;
      }
      if (ctx.timeout != null) {
        ctx._left = (ctx._left === undefined ? ctx.timeout : ctx._left) - dt;
        if (ctx._left <= 0) { vm.resume(null); return true; }
      }
      return false;
    }
    if (ctx.type === 'syscall') {
      // 内核特权系统调用
      const result = this._kernelHostSys(ctx.name, ctx.args);
      if (result && result.__async) {
        if (result.ready) { vm.resume(result.value); return true; }
        return false;
      }
      vm.resume(result === undefined ? null : result);
      return true;
    }
    return false;
  }

  /* ---------- 内核特权调用（宿主服务；结果可按规模计费） ---------- */
  _kernelHostSys(name, args) {
    const H = NOS.hostsvcs;
    const fn = H[name];
    if (!fn) return { __error: '未知宿主服务: ' + name };
    try {
      return fn(this, args);
    } catch (e) {
      return { __error: e.message || String(e) };
    }
  }

  /* ---------- 快照 ---------- */
  serialize() {
    const procs = this.procs.map(p => ({
      pid: p.pid, name: p.name, progPath: p.prog && p.prog.path, entry: p.entry, args: p.args,
      state: p.state, priority: p.priority, quota: p.quota,
      usedTotal: p.usedTotal, inbox: p.inbox, waiting: p.waiting, error: p.error, mem: p.mem,
      vm: p.vm ? p.vm.serialize() : null
    }));
    return {
      id: this.id, name: this.name, state: this.state === 'running' ? 'paused' : this.state,
      time: this.time, rate: this.rate, totalBudget: this.totalBudget,
      memQuota: this.memQuota, storageQuota: this.storageQuota, childGrantCap: this.childGrantCap,
      nextPid: this.nextPid, config: this.config, rngSeed: this.rngSeed, tickCount: this.tickCount,
      vfs: this.vfs ? this.vfs.serialize() : null,
      procs,
      desktopState: this.desktopState, uiVersion: this.uiVersion,
      charts: this.charts, projections: this.projections, notifications: this.notifications,
      children: this.children.map(c => c.serializeTree())
    };
  }

  serializeTree() { return this.serialize(); }

  saveSnapshot() {
    // 父系统的工作：按规模收费（在 rootvm 层记账）
    return JSON.stringify(this.serialize());
  }

  postHostEvent(ev) {
    ev.time = this.time;
    // wm-command/pointer/key/app-event 路由给窗口管理器(pid=2)；其余给内核
    const wmTypes = new Set(['wm-command', 'pointer', 'key', 'app-event', 'resize', 'projection-close', 'open-request']);
    if (wmTypes.has(ev.type)) {
      this.wmEvents = this.wmEvents || [];
      this.wmEvents.push(ev);
      // wm 在等待消息时也能收到：写入其邮箱
      const wm = this.procs.find(p => p.pid === 2);
      if (wm && wm.vm && wm.vm.state === 'waiting' && wm.vm.wait.ctx.type === 'msg') {
        this.wmEvents.push.length;
      }
    } else this.hostEvents.push(ev);
  }
}

/* 恢复（不启动内核，直接恢复 VM） */
Instance.restore = function (data, parent, parentVfs, store, depth) {
  const inst = new Instance({
    id: data.id, name: data.name, parent, parentVfs, store, depth,
    rate: data.rate, totalBudget: data.totalBudget, memQuota: data.memQuota,
    storageQuota: data.storageQuota, childGrantCap: data.childGrantCap
  });
  inst.state = data.state; inst.time = data.time; inst.nextPid = data.nextPid;
  inst.config = data.config || {}; inst.rngSeed = data.rngSeed; inst.tickCount = data.tickCount;
  inst.vfs = NOS.VFS.deserialize(data.vfs, store);
  inst.desktopState = data.desktopState || { windows: [] };
  inst.uiVersion = data.uiVersion || 0;
  inst.charts = data.charts || {}; inst.projections = data.projections || [];
  inst.notifications = data.notifications || [];
  // 恢复进程
  inst.procs = (data.procs || []).map(pd => {
    const p = new Proc(pd.pid, pd.name, null, pd.entry, pd.args, pd.priority, pd.quota);
    p.usedTotal = pd.usedTotal; p.inbox = pd.inbox || []; p.waiting = pd.waiting; p.error = pd.error; p.mem = pd.mem;
    p.state = pd.state;
    return p;
  });
  // 内核 VM
  const kp = inst.procs.find(p => p.pid === 1);
  if (kp) {
    const ktext = parentVfs.read(KERNEL_PATH);
    kp.prog = inst._loadKernelProgram(ktext);
    kp.vm = NOS.VM.restore(kp.vm0 || data.procs.find(x => x.pid === 1).vm, kp.prog, null, {});
    inst.kernelProc = kp;
  }
  // 子实例
  inst.children = (data.children || []).map(cd => Instance.restore(cd, inst, inst.vfs, store, depth + 1));
  return inst;
};

NOS.Instance = Instance;
NOS.Proc = Proc;
NOS.KERNEL_PATH = KERNEL_PATH;
