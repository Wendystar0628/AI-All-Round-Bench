'use strict';
// 子系统实例宿主运行器：提供执行环境、显示设备接入与原始事件路由。
// 内核策略（调度/消息/文件/系统调用分发）全部在 kernel.os 程序内运行。
const { VM } = require('../lang/lang.js');

const NO_REPLY = Symbol('NO_REPLY');
const BLOCKED = Symbol('BLOCKED');
const LOGICAL_DT = 1 / 30;

class Instance {
  constructor(os, opts) {
    this.os = os;
    this.id = opts.id;
    this.name = opts.name;
    this.parentId = opts.parentId;
    this.depth = opts.depth;
    this.kernelProgram = opts.kernelProgram;
    this.bootFiles = opts.files;
    this.bootChildren = opts.children || [];
    this.cfg = Object.assign({ budget: 90000, memory: 64 * 1024 * 1024, storage: 48 * 1024 * 1024, grantCap: 45000 }, opts.cfg || {});
    this.clock = opts.clock || 0;
    this.speed = opts.speed || 1;
    this.paused = !!opts.paused;
    this.state = 'running';
    this.kernelVM = null;
    this.vms = new Map();
    this.childInstances = new Map(); // hostPid -> Instance
    this.kernelInbox = [];
    this.work = 0;
    this.totalWork = 0;
    this.kernelWorkTotal = 0;
    this.userWorkTotal = 0;
    this.windows = [];
    this.focusWindow = 0;
    this.compilerReq = null;
    this.compilerPid = 2;
    this.pendingMgmt = new Map();
    this.mgmtReqId = 1;
    this.surface = null;
    this.viewport = opts.viewport || { w: 1000, h: 680 };
    this.rngCounter = opts.rngCounter || 1000;
    this.appStatus = new Map(); // windowId -> status (player/charts)
    this.memCache = 0;
    this.sliceCount = 0;
    this.error = null;
    this.boot(opts.restored || null);
  }

  boot(restored) {
    if (restored) {
      this.kernelVM = VM.fromJSON(this.kernelProgram, restored.kernelVM);
      for (const v of restored.vms) {
        this.vms.set(v.pid, { vm: VM.fromJSON(v.program, v.state), program: v.program, suspended: v.suspended, slices: 0 });
      }
      this.kernelInbox = restored.kernelInbox || [];
      this.clock = restored.clock;
      this.windows = restored.windows || [];
      this.focusWindow = restored.focusWindow || 0;
      this.compilerReq = restored.compilerReq || null;
      this.rngCounter = restored.rngCounter || 1000;
      this.cfg = restored.cfg || this.cfg;
      for (const c of restored.children || []) {
        const child = this.os.createChildFromNode(this, c.node, c.hostPid);
        this.childInstances.set(c.hostPid, child);
      }
      this.os.device.restoreInstance(this, restored.device || {});
      if (this.surface) this.surface.layout(this.windows);
      this.kernelInbox.push({ type: 'system_restored' });
      return;
    }
    this.kernelVM = new VM(this.kernelProgram, { rngSeed: (this.rngCounter += 7919) });
    this.kernelInbox = [];
  }

  bootData() {
    return {
      id: this.id, name: this.name,
      files: this.bootFiles,
      children: this.bootChildren,
      budget: this.cfg.budget, memory: this.cfg.memory, storage: this.cfg.storage, grantCap: this.cfg.grantCap,
      compilerProgram: this.os.compilerProgram,
      viewport: this.viewport
    };
  }

  cfgFromKernel() {
    try {
      const c = this.kernelVM.envs[0].vars.cfg;
      if (c) return c;
    } catch (e) { }
    return this.cfg;
  }

  effectivePaused() {
    if (this.paused) return true;
    return this.os.ancestorPaused(this.parentId);
  }

  step(budget, dt) {
    if (this.state !== 'running') return 0;
    this.clock += dt * this.speed;
    this.work = 0;
    this.stepDt = dt * this.speed;
    const cfg = this.cfgFromKernel();
    const tickBudget = Math.min(cfg.budget, budget);
    this.kernelInbox.push({ type: 'tick', now: this.clock, dt: this.stepDt, budget: tickBudget, kernelWork: this.kernelWorkTotal });
    this.runKernel(budget);
    this.totalWork += this.work;
    return this.work;
  }

  runKernel(budget) {
    let guard = 0;
    while (this.work < budget && guard++ < 20000) {
      const slice = Math.min(3000, budget - this.work);
      const r = this.kernelVM.run(slice);
      this.work += r.work;
      this.kernelWorkTotal += r.work;
      if (r.status === 'error') { this.kernelError(r.error); return; }
      if (r.status === 'done') { this.kernelError('内核程序已退出'); return; }
      if (r.status === 'budget') continue;
      if (r.status === 'syscall') {
        let reply;
        try { reply = this.handlePrivileged(r.call, r.args); }
        catch (e) { this.kernelError('宿主服务错误: ' + (e.message || e)); return; }
        if (reply === BLOCKED) return;
        if (reply === NO_REPLY) return;
        this.kernelVM.reply(reply);
      }
    }
  }

  kernelError(msg) {
    this.state = 'kernelError';
    this.error = msg;
    this.os.onKernelError(this, msg);
  }

  memEstimate() {
    let total = 0;
    for (const [pid, v] of this.vms) total += v.vm.memSize();
    total += this.kernelVM.memSize();
    total += this.os.device.instanceMem(this);
    return total;
  }

  handlePrivileged(call, args) {
    const os = this.os;
    switch (call) {
      case 'sys_boot': return this.bootData();
      case 'sys_host_time': return this.clock;
      case 'sys_slice': {
        const pid = args[0], n = args[1];
        const child = this.childInstances.get(pid);
        if (child) {
          if (child.state === 'stopped') return { status: 'exit', work: 0 };
          if (child.effectivePaused()) return { status: 'paused', work: 0 };
          const cfg = child.cfgFromKernel();
          const grant = Math.min(n, cfg.budget);
          const w = child.step(grant, this.stepDt || LOGICAL_DT);
          this.userWorkTotal += 0;
          return { status: 'budget', work: w, mem: Math.round(child.memEstimate() / 1024) * 1024 };
        }
        const v = this.vms.get(pid);
        if (!v) return { status: 'exit', work: 0 };
        if (v.suspended) return { status: 'paused', work: 0 };
        const r = v.vm.run(n);
        this.work += r.work;
        this.userWorkTotal += r.work;
        v.slices++;
        let mem = undefined;
        if (r.status !== 'budget' || v.slices % 40 === 0) { mem = v.vm.memSize(); v.mem = mem; }
        if (r.status === 'error' && pid === this.compilerPid && this.compilerReq != null) {
          // 编译器进程崩溃：向内核报告编译失败并重建编译器
          this.kernelInbox.push({ type: 'compiled', payload: { reqId: this.compilerReq, ok: false, error: '编译器错误: ' + r.error } });
          this.compilerReq = null;
          v.vm = new VM(v.program, { rngSeed: (this.rngCounter += 104729) });
          return { status: 'budget', work: r.work, mem };
        }
        if (r.status === 'syscall') return { status: 'syscall', call: r.call, args: r.args, work: r.work, mem };
        if (r.status === 'error') return { status: 'error', error: r.error, work: r.work, mem };
        if (r.status === 'done') return { status: 'done', work: r.work, mem };
        return { status: 'budget', work: r.work, mem };
      }
      case 'sys_reply': {
        const v = this.vms.get(args[0]);
        if (v) {
          v.vm.reply(args[1]);
          if (args[0] === this.compilerPid && args[1] && args[1].type === 'compile') this.compilerReq = args[1].payload.reqId;
        }
        return { ok: true };
      }
      case 'sys_newvm': {
        const pid = args[0], program = args[1];
        const cfg = this.cfgFromKernel();
        const est = JSON.stringify(program).length + 4096;
        if (this.memEstimate() + est > cfg.memory) return { error: '内存配额不足，无法创建进程' };
        const vm = new VM(program, { rngSeed: (this.rngCounter += 15485863) });
        this.vms.set(pid, { vm, program, suspended: false, slices: 0, mem: est });
        return { ok: true, mem: est };
      }
      case 'sys_dropvm': {
        this.vms.delete(args[0]);
        os.device.dropOwner(this, args[0]);
        const win = this.windows.find(w => w.ownerPid === args[0]);
        if (win) os.endProjectionsOfSource(this.id, win.id, '源应用已结束');
        return { ok: true };
      }
      case 'sys_suspendvm': { const v = this.vms.get(args[0]); if (v) v.suspended = true; return { ok: true }; }
      case 'sys_resumevm': { const v = this.vms.get(args[0]); if (v) v.suspended = false; return { ok: true }; }
      case 'sys_recompile': {
        const v = this.vms.get(args[0]);
        if (v) { v.program = args[1]; v.vm = new VM(args[1], { rngSeed: (this.rngCounter += 32452843) }); }
        return { ok: true };
      }
      case 'sys_child_spawn': {
        const name = args[0], program = args[1], overrides = args[2];
        const hostPid = this.kernelVM.envs[0].vars.nextPid;
        const child = os.createChild(this, name, program, overrides, hostPid);
        this.childInstances.set(hostPid, child);
        return { ok: true, id: child.id, hostPid };
      }
      case 'sys_child_adopt': {
        const name = args[0], node = args[1];
        const hostPid = this.kernelVM.envs[0].vars.nextPid;
        const child = os.createChildFromNode(this, node, hostPid, name);
        this.childInstances.set(hostPid, child);
        return { ok: true, id: child.id, hostPid };
      }
      case 'sys_child_cmd': {
        const hostPid = args[0], cmd = args[1], cargs = args[2] || {};
        const child = this.childInstances.get(hostPid);
        if (!child) return { ok: false, error: '子系统不存在' };
        return os.childCommand(this, child, cmd, cargs);
      }
      case 'sys_host_display': {
        os.device.submit2d(this, args[0], args[1], args[2]);
        return { ok: true };
      }
      case 'sys_host_windows': {
        this.windows = args[0] || [];
        this.focusWindow = args[1] || 0;
        if (this.surface) this.surface.layout(this.windows);
        os.updateFocusChain(this);
        return { ok: true };
      }
      case 'sys_host_scene': {
        const cfg = this.cfgFromKernel();
        const size = JSON.stringify(args[1]).length;
        if (this.memEstimate() + size > cfg.memory) return { ok: false, error: '内存配额不足，无法载入场景' };
        return os.device.loadScene(this, args[0], args[1]);
      }
      case 'sys_host_scene_state': {
        os.device.sceneState(this, args[0], args[1], args[2]);
        return { ok: true };
      }
      case 'sys_host_scene_close': {
        os.device.closeScene(this, args[0], args[1]);
        return { ok: true };
      }
      case 'sys_host_request': {
        return os.routeRequest(this, args[0], args[1], args[2]);
      }
      case 'sys_host_log': {
        os.device.appendLog(this, args[0], args[1]);
        return { ok: true };
      }
      case 'sys_host_notify': {
        os.notifyFrom(this, args[0], args[1]);
        return { ok: true };
      }
      case 'sys_host_selfmsg': {
        this.kernelInbox.push(args[0]);
        return { ok: true };
      }
      case 'sys_host_reply': {
        const res = this.pendingMgmt.get(args[0]);
        if (res) { this.pendingMgmt.delete(args[0]); res(args[1]); }
        return { ok: true };
      }
      case 'sys_host_child_event': {
        const child = this.childInstances.get(args[0]);
        if (child && child.state === 'running') {
          const msg = args[1];
          if (msg.type === 'input') {
            const ev = Object.assign({}, msg.payload.event);
            const win = this.windows.find(w => w.kind === 'system' && w.childId === child.id);
            if (win && typeof ev.x === 'number') {
              const TITLE_H = 34;
              const wx = win.maximized ? 0 : win.x;
              const wy = win.maximized ? 0 : win.y;
              ev.x = ev.x - wx;
              ev.y = ev.y - wy - TITLE_H;
            }
            child.kernelInbox.push({ type: 'input', event: ev });
          }
          else child.kernelInbox.push({ type: 'child_msg', payload: msg });
        }
        return { ok: true };
      }
      case 'sys_recv': {
        if (this.kernelInbox.length) return this.kernelInbox.shift();
        return BLOCKED;
      }
      case 'sys_host_focus': return { ok: true };
      default:
        return { ok: false, error: '未知特权调用 ' + call };
    }
  }

  // 父系统管理接口（异步结果经 sys_host_reply 返回）
  mgmt(action, args) {
    return new Promise(resolve => {
      if (this.state !== 'running') { resolve({ ok: false, error: '系统未运行' }); return; }
      const reqId = this.mgmtReqId++;
      this.pendingMgmt.set(reqId, resolve);
      this.kernelInbox.push({ type: 'mgmt', action, args: args || {}, reqId });
      this.os.requestStep(this);
    });
  }

  resize(w, h) {
    this.viewport = { w, h };
    this.kernelInbox.push({ type: 'viewport', w, h });
    this.os.requestStep(this);
  }

  input(event) {
    if (this.state !== 'running') return;
    this.kernelInbox.push({ type: 'input', event });
    this.os.requestStep(this);
  }

  snapshotNode() {
    const vms = [];
    for (const [pid, v] of this.vms) {
      vms.push({ pid, program: v.program, suspended: v.suspended, state: v.vm.toJSON() });
    }
    const children = [];
    for (const [hostPid, child] of this.childInstances) {
      if (child.state !== 'stopped') children.push({ hostPid, node: child.snapshotNode() });
    }
    return {
      id: this.id, name: this.name, clock: this.clock, speed: this.speed, paused: this.paused,
      cfg: this.cfgFromKernel(),
      kernelProgram: this.kernelProgram,
      kernelVM: this.kernelVM.toJSON(),
      kernelInbox: this.kernelInbox,
      vms, children,
      windows: this.windows, focusWindow: this.focusWindow,
      compilerReq: this.compilerReq, rngCounter: this.rngCounter,
      device: this.os.device.snapshotInstance(this),
      appStatus: Array.from(this.appStatus.entries())
    };
  }

  stop() {
    this.state = 'stopped';
    for (const [, child] of this.childInstances) child.stop();
    this.childInstances.clear();
    this.vms.clear();
    this.os.device.dropInstance(this);
    if (this.surface) { this.surface.destroy(); this.surface = null; }
  }
}

module.exports = { Instance, LOGICAL_DT, NO_REPLY, BLOCKED };
