'use strict';
// 根系统内核（宿主原生实现，题面 2.7 允许）。
// 提供与子系统内核相同语义的服务：进程表、消息、文件、编译器、子系统承载、预算调度。
const { VM } = require('../lang/lang.js');
const { LOGICAL_DT } = require('./instance.js');

class RootKernel {
  constructor(os) {
    this.os = os;
    this.id = 'outer';
    this.procs = new Map();
    this.nextPid = 10;
    this.timers = [];
    this.pendingSpawns = new Map();
    this.nextReq = 1;
    this.compilerPid = 2;
    this.clock = 0;
    this.speed = 1;
    this.paused = false;
    this.cfg = { budget: 320000, memory: 512 * 1024 * 1024, storage: 256 * 1024 * 1024, grantCap: 130000 };
    this.work = 0;
    this.nativeWork = 0;
    this.totalWork = 0;
    this.kernelWorkTotal = 0;
    this.compilerReq = null;
    this.compilerVM = new VM(os.compilerProgram, { rngSeed: 99991 });
    this.compilerSuspended = false;
    this.rr = 0;
    this.addProc(1, '根内核', '', 'kernel');
    this.addProc(2, '编译器', '/System/compiler.os', 'compiler');
  }
  addProc(pid, name, path, kind) {
    const p = { pid, name, path, kind, state: 'ready', work: 0, mem: 4096, error: null, cap: 12000, inbox: [], waitInfo: null, vm: null, program: null, childInst: null, suspended: false, appId: null, windowId: null };
    this.procs.set(pid, p);
    return p;
  }
  charge(n) { this.work += n; this.nativeWork += n; }
  registerApp(name, appId) {
    const pid = this.nextPid++;
    const p = this.addProc(pid, name, '', 'app');
    p.appId = appId;
    return p;
  }
  deliver(pid, msg) {
    const p = this.procs.get(pid);
    if (!p || p.state === 'exited' || p.state === 'error') return false;
    if (p.kind === 'child') {
      if (p.childInst && p.childInst.state === 'running') {
        if (msg.type === 'input') p.childInst.kernelInbox.push({ type: 'input', event: msg.payload.event });
        else p.childInst.kernelInbox.push({ type: 'child_msg', payload: msg });
      }
      return true;
    }
    if (p.waitInfo === 'recv') {
      p.waitInfo = null; p.state = 'ready';
      p.vm.reply(msg);
      return true;
    }
    p.inbox.push(msg);
    return true;
  }
  requestCompile(source, info) {
    const reqId = this.nextReq++;
    this.pendingSpawns.set(reqId, info);
    this.deliver(this.compilerPid, { from: 1, type: 'compile', payload: { reqId, source } });
  }
  finishSpawn(reqId, ok, program, error) {
    const info = this.pendingSpawns.get(reqId);
    this.pendingSpawns.delete(reqId);
    if (!info) return;
    let result;
    if (!ok) result = { ok: false, error };
    else if (info.tag === 'kernel_compiled') {
      result = { ok: true, program };
    } else if (info.tag === 'recompile') {
      this.onCompilerRecompile(program);
      result = { ok: true, pid: this.compilerPid, recompiled: true };
    } else if (info.tag === 'child') {
      const hostPid = this.nextPid++;
      const child = this.os.createChild(this, info.name, program, info.overrides || null, hostPid);
      const p = this.addProc(hostPid, info.name + ' 承载', '/System/kernel.os', 'child');
      p.childInst = child;
      result = { ok: true, pid: hostPid, id: child.id };
    } else {
      const pid = this.nextPid++;
      const p = this.addProc(pid, info.name, info.path, 'user');
      p.program = program;
      p.vm = new VM(program, { rngSeed: 1234567 + pid * 7919 });
      p.args = info.args;
      result = { ok: true, pid };
    }
    if (info.caller === 1) {
      this.os.onRootSpawnResult(info, result);
    } else {
      const cp = this.procs.get(info.caller);
      if (cp && cp.waitInfo === 'spawn') { cp.waitInfo = null; cp.state = 'ready'; }
      if (cp && cp.vm) cp.vm.reply(result);
    }
  }
  step(dt) {
    if (this.paused) return;
    this.clock += dt * this.speed;
    this.work = 0;
    this.nativeWork = 0;
    // 计时器
    const keep = [];
    for (const t of this.timers) {
      const p = this.procs.get(t.pid);
      if (p && p.state === 'waiting' && p.waitInfo === 'timer' && t.at <= this.clock) {
        p.state = 'ready'; p.waitInfo = null; p.vm.reply(null);
      } else if (p && p.state !== 'exited' && p.state !== 'error') keep.push(t);
    }
    this.timers = keep;
    // 调度：编译器、自定义进程、子系统承载
    let remaining = Math.max(0, this.cfg.budget - this.nativeWork);
    let guard = 0;
    const list = Array.from(this.procs.values());
    while (remaining > 200 && guard++ < 40) {
      let ran = 0;
      for (let i = 0; i < list.length; i++) {
        const p = list[(this.rr + i) % list.length];
        if (p.state !== 'ready' || remaining <= 200) continue;
        if (p.kind === 'app' || p.kind === 'kernel') continue;
        let slice = Math.min(p.cap, remaining);
        if (p.kind === 'child') {
          slice = Math.min(slice, this.cfg.grantCap);
          const child = p.childInst;
          if (!child || child.state === 'stopped') { p.state = 'exited'; continue; }
          if (child.effectivePaused()) { p.state = 'paused'; continue; }
          const cfg = child.cfgFromKernel();
          const w = child.step(Math.min(slice, cfg.budget), dt * this.speed);
          remaining -= w; ran += w; this.work += w; p.work += w;
          p.mem = Math.round(child.memEstimate() / 1024) * 1024;
          continue;
        }
        if (p.suspended) { p.state = 'suspended'; continue; }
        const vm = p.kind === 'compiler' ? this.compilerVM : p.vm;
        if (!vm) { p.state = 'exited'; continue; }
        const r = vm.run(slice);
        remaining -= r.work; ran += r.work; this.work += r.work; p.work += r.work;
        if (p.kind === 'compiler') this.kernelWorkTotal += r.work;
        if (r.status === 'budget') { if (r.work > 0) p.mem = vm.memSize(); continue; }
        if (r.status === 'done') { p.state = 'exited'; continue; }
        if (r.status === 'error') {
          if (p.kind === 'compiler' && this.compilerReq != null) {
            this.finishSpawn(this.compilerReq, false, null, '编译器错误: ' + r.error);
            this.compilerReq = null;
            this.compilerVM = new VM(this.os.compilerProgram, { rngSeed: 99991 });
            continue;
          }
          p.state = 'error'; p.error = r.error;
          this.os.notifyRoot('进程错误', p.name + ': ' + r.error);
          continue;
        }
        if (r.status === 'syscall') {
          if (p.kind === 'compiler') {
            if (r.call === 'sys_recv') {
              if (p.inbox.length) { vm.reply(p.inbox.shift()); }
              else { p.state = 'waiting'; p.waitInfo = 'recv'; }
              continue;
            }
            if (r.call === 'sys_send') {
              const payload = r.args[2];
              if (r.args[0] === 1 && payload && payload.reqId != null) {
                this.compilerReq = null;
                this.finishSpawn(payload.reqId, payload.ok, payload.program, payload.error);
              }
              vm.reply({ ok: true });
              continue;
            }
          }
          this.dispatch(p, r.call, r.args);
        }
      }
      this.rr = (this.rr + 1) % (list.length + 1);
      if (ran === 0) break;
    }
    this.totalWork += this.work;
  }
  dispatch(p, call, args) {
    const os = this.os;
    const pid = p.pid;
    const reply = v => { p.vm.reply(v); };
    const files = os.rootFS;
    switch (call) {
      case 'sys_self': return reply(pid);
      case 'sys_time': return reply(this.clock);
      case 'sys_args': return reply(p.args || null);
      case 'sys_wait': {
        if (args[0] <= 0) return reply(null);
        p.state = 'waiting'; p.waitInfo = 'timer';
        this.timers.push({ pid, at: this.clock + args[0] / 1000 });
        return;
      }
      case 'sys_recv': {
        if (p.inbox.length) return reply(p.inbox.shift());
        p.state = 'waiting'; p.waitInfo = 'recv';
        return;
      }
      case 'sys_poll': return reply(p.inbox.length ? p.inbox.shift() : null);
      case 'sys_send': {
        const to = args[0];
        const tp = this.procs.get(to);
        if (!tp || tp.state === 'exited' || tp.state === 'error') return reply({ ok: false, error: '目标进程不存在: ' + to });
        this.deliver(to, { from: pid, type: args[1], payload: JSON.parse(JSON.stringify(args[2])) });
        return reply({ ok: true });
      }
      case 'sys_spawn': {
        const path = os.normPath(args[0]);
        if (!files[path] || files[path].dir) return reply({ ok: false, error: '程序文件不存在: ' + path });
        this.requestCompile(files[path].content, { caller: pid, name: args[1] || os.baseName(path), path, args: args[2], tag: '' });
        p.state = 'waiting'; p.waitInfo = 'spawn';
        return;
      }
      case 'sys_exit': { p.state = 'exited'; os.device.dropOwner(os.rootSystem(), pid); os.endProjectionsOfSource('outer', null, '源应用已结束'); return reply(null); }
      case 'sys_kill': {
        const tp = this.procs.get(args[0]);
        if (tp && tp.state !== 'exited') {
          tp.state = 'exited';
          if (tp.kind === 'child' && tp.childInst) os.stopInstance(tp.childInst);
          if (tp.kind === 'app') os.desktop.closeAppByPid(args[0]);
        }
        return reply({ ok: true });
      }
      case 'sys_suspend': { const tp = this.procs.get(args[0]); if (tp && tp.state !== 'exited' && tp.state !== 'error') { tp.state = 'suspended'; tp.suspended = true; } return reply({ ok: true }); }
      case 'sys_resume_proc': {
        const tp = this.procs.get(args[0]);
        if (tp && tp.state === 'suspended') { tp.suspended = false; tp.state = tp.waitInfo ? 'waiting' : 'ready'; }
        return reply({ ok: true });
      }
      case 'sys_read': {
        const path = os.normPath(args[0]);
        if (!files[path] || files[path].dir) return reply({ ok: false, error: '文件不存在: ' + path });
        this.charge(2 + files[path].content.length);
        return reply({ ok: true, content: files[path].content });
      }
      case 'sys_write': {
        const path = os.normPath(args[0]);
        const content = typeof args[1] === 'string' ? args[1] : JSON.stringify(args[1]);
        const old = files[path] && !files[path].dir ? files[path].content.length : 0;
        if (os.rootStorageUsed() - old + content.length > this.cfg.storage) return reply({ ok: false, error: '存储配额不足' });
        os.rootEnsureDir(os.parentPath(path));
        files[path] = { dir: false, content };
        this.charge(2 + content.length);
        os.onRootFSChanged();
        return reply({ ok: true });
      }
      case 'sys_list': {
        const path = os.normPath(args[0]);
        if (path !== '/' && (!files[path] || !files[path].dir)) return reply({ ok: false, error: '目录不存在: ' + path });
        const items = [];
        for (const k of Object.keys(files)) {
          if (k !== path && os.parentPath(k) === path) items.push({ name: os.baseName(k), path: k, dir: files[k].dir, size: files[k].content.length });
        }
        items.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
        this.charge(2 + items.length * 4);
        return reply({ ok: true, items });
      }
      case 'sys_mkdir': {
        const path = os.normPath(args[0]);
        if (files[path]) return reply({ ok: false, error: '路径已存在' });
        os.rootEnsureDir(path); os.onRootFSChanged();
        return reply({ ok: true });
      }
      case 'sys_delete': {
        const path = os.normPath(args[0]);
        if (!files[path]) return reply({ ok: false, error: '路径不存在' });
        for (const k of Object.keys(files)) if (k === path || k.startsWith(path + '/')) delete files[k];
        os.onRootFSChanged();
        return reply({ ok: true });
      }
      case 'sys_rename': {
        const src = os.normPath(args[0]), dst = os.normPath(args[1]);
        if (!files[src]) return reply({ ok: false, error: '源不存在' });
        if (files[dst]) return reply({ ok: false, error: '目标已存在' });
        for (const k of Object.keys(files)) {
          if (k === src) { files[dst] = files[k]; delete files[k]; }
          else if (k.startsWith(src + '/')) { files[dst + k.slice(src.length)] = files[k]; delete files[k]; }
        }
        os.onRootFSChanged();
        return reply({ ok: true });
      }
      case 'sys_fcopy': {
        const src = os.normPath(args[0]), dst = os.normPath(args[1]);
        if (!files[src]) return reply({ ok: false, error: '源不存在' });
        if (files[dst] && !args[2]) return reply({ ok: false, error: '目标已存在', exists: true });
        os.rootEnsureDir(os.parentPath(dst));
        files[dst] = { dir: files[src].dir, content: files[src].content };
        this.charge(2 + files[src].content.length);
        os.onRootFSChanged();
        return reply({ ok: true });
      }
      case 'sys_exists': return reply(!!files[os.normPath(args[0])]);
      case 'sys_stat': {
        const path = os.normPath(args[0]);
        if (!files[path]) return reply({ ok: false, error: '不存在' });
        return reply({ ok: true, dir: files[path].dir, size: files[path].content.length });
      }
      case 'sys_display': {
        os.device.submit2d(os.rootSystem(), pid, args[0], args[1]);
        os.desktop.ensureConsole(pid, p.name);
        return reply({ ok: true });
      }
      case 'sys_scene': {
        const r = os.device.loadScene(os.rootSystem(), pid, args[0]);
        if (r.ok) os.desktop.ensureConsole(pid, p.name);
        return reply(r);
      }
      case 'sys_scene_state': { os.device.sceneState(os.rootSystem(), pid, args[0], args[1]); return reply({ ok: true }); }
      case 'sys_scene_close': { os.device.closeScene(os.rootSystem(), pid, args[0]); return reply({ ok: true }); }
      case 'sys_ps': return reply(this.psResult());
      case 'sys_log': { os.device.appendLog(os.rootSystem(), pid, args[0]); os.desktop.ensureConsole(pid, p.name); return reply({ ok: true }); }
      case 'sys_set': {
        const key = args[0], val = args[1];
        if (key === 'budget') this.cfg.budget = val;
        else if (key === 'memory') this.cfg.memory = val;
        else if (key === 'storage') this.cfg.storage = val;
        else if (key === 'grantCap') this.cfg.grantCap = val;
        else if (key === 'cap') { const tp = this.procs.get(args[1]); if (tp) tp.cap = val; }
        return reply({ ok: true, cfg: Object.assign({}, this.cfg) });
      }
      case 'sys_request': return reply(os.routeRequest(os.rootSystem(), pid, args[0], args[1]));
      case 'sys_subscribe': {
        const sub = os.routeRequest(os.rootSystem(), pid, 'sheet.subscribe', args[0]);
        return reply(sub);
      }
      case 'sys_unsubscribe': { os.routeRequest(os.rootSystem(), pid, 'sheet.unsubscribe', args[0]); return reply({ ok: true }); }
      case 'sys_child_create': {
        const kpath = '/System/kernel.os';
        if (!files[kpath]) return reply({ ok: false, error: '缺少内核源文件' });
        this.requestCompile(files[kpath].content, { caller: pid, name: args[0], tag: 'child', overrides: args[1] });
        p.state = 'waiting'; p.waitInfo = 'spawn';
        return;
      }
      case 'sys_child_cmd': {
        const tp = this.procs.get(args[0]);
        if (!tp || !tp.childInst) return reply({ ok: false, error: '子系统不存在' });
        return reply(os.childCommand(this, tp.childInst, args[1], args[2] || {}));
      }
      case 'sys_child_list': {
        const out = [];
        for (const tp of this.procs.values()) {
          if (tp.kind === 'child' && tp.childInst && tp.childInst.state !== 'stopped') {
            const c = tp.childInst;
            out.push({ hostPid: tp.pid, id: c.id, name: c.name, state: c.state, clock: c.clock, speed: c.speed, work: c.totalWork, paused: c.paused });
          }
        }
        return reply({ ok: true, children: out });
      }
      case 'sys_meminfo': return reply({ ok: true, memUsed: this.memUsed(), memCap: this.cfg.memory, storageUsed: os.rootStorageUsed(), storageCap: this.cfg.storage });
      case 'sys_recompile': {
        if (!files['/System/compiler.os']) return reply({ ok: false, error: '缺少编译器源文件' });
        this.requestCompile(files['/System/compiler.os'].content, { caller: pid, name: '编译器', tag: 'recompile' });
        p.state = 'waiting'; p.waitInfo = 'spawn';
        return;
      }
      case 'sys_windows': return reply({ ok: true });
      default: return reply({ ok: false, error: '未知系统调用: ' + call });
    }
  }
  onCompilerRecompile(program) {
    this.os.compilerProgram = program;
    this.compilerVM = new VM(program, { rngSeed: 99991 });
  }
  psResult() {
    const out = [];
    for (const p of this.procs.values()) {
      out.push({ pid: p.pid, name: p.name, path: p.path, kind: p.kind, state: p.state, work: p.work, mem: p.mem, error: p.error, cap: p.cap, queued: p.inbox.length, waitInfo: p.waitInfo, childId: p.childInst ? p.childInst.id : 0, appId: p.appId });
    }
    return { ok: true, procs: out, now: this.clock, cfg: Object.assign({}, this.cfg), storageUsed: this.os.rootStorageUsed(), memUsed: this.memUsed(), kernelWork: this.kernelWorkTotal };
  }
  memUsed() {
    let total = 0;
    for (const p of this.procs.values()) {
      if (p.kind === 'child' && p.childInst) total += p.childInst.memEstimate();
      else if (p.vm) total += p.vm.memSize();
      else total += p.mem;
    }
    total += this.compilerVM.memSize();
    return total;
  }
}

module.exports = { RootKernel };
