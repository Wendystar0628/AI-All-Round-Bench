// ===========================================================================
//  子系统运行时（宿主侧）
//  · 每个「系统实例」有一份内核程序进程、独立文件系统、虚拟时钟、预算与配额
//  · 内核经原始系统服务驱动自己的进程表；直属子系统的内核进程由父内核 step，
//    宿主在 step 时递归推进子实例（时间、预算、暂停状态均由宿主逐级约束）
// ===========================================================================
(function () {
  const NSL = window.NSL;
  const fsMod = window.require ? window.require('fs') : null;
  const pathMod = window.require ? window.require('path') : null;

  const TICK = 1 / 60;              // 逻辑步：1/60 秒虚拟时间
  const ROOT_BUDGET = 160000;       // 根系统每个逻辑步的总执行预算（指令）
  const DEFAULT_GRANT = 60000;      // 直属子系统默认拨付上限
  const DEFAULT_MEM = 24 * 1024 * 1024;
  const DEFAULT_STORAGE = 8 * 1024 * 1024;

  function now() { return Date.now(); }

  class Instance {
    constructor(host, opts) {
      this.host = host;
      this.id = opts.id;
      this.name = opts.name || opts.id;
      this.parentId = opts.parentId || null;
      this.depth = opts.depth || 0;
      this.isRoot = !!opts.isRoot;
      this.fs = opts.fs || {};                 // path -> {d, k, m}
      this.kernel = null;                      // 内核进程
      this.procs = {};                         // pid -> process
      this.nextPid = 1;
      this.kernelPids = {};                    // pid -> child instance id
      this.children = [];
      this.clock = 0;
      this.rate = 1;
      this.paused = false;
      this.state = this.isRoot ? 'running' : 'init';   // init|running|paused|error|stopped
      this.error = null;
      this.budgetLimit = this.isRoot ? ROOT_BUDGET : DEFAULT_GRANT;
      this.budgetUsed = 0;
      this.budgetUsedTotal = 0;
      this.memQuota = DEFAULT_MEM;
      this.storageQuota = DEFAULT_STORAGE;
      this.display = { buffers: {}, dirty: true, sceneDirty: true };
      this.input = [];
      this.screen = { w: 900, h: 600 };
      this.kernelWork = 0;      // 内核自身指令
      this.innerWork = 0;       // 内核内部工作（子进程）
      this.appWork = {};        // name -> work
      this.compiledCache = {};
      this.pendingChart = [];   // 范围外暂存的图表更新
      this.meta = {};
      this.lastTickAt = 0;
    }
  }

  class Runtime {
    constructor() {
      this.instances = {};
      this.root = null;
      this.order = [];             // 全局创建顺序
      this.counter = 0;
      this.tickCount = 0;
      this.rootBudget = ROOT_BUDGET;
      this.rootBudgetUsed = 0;
      this.rootAppWork = 0;
      this.listeners = [];
      this.hooks = {};             // display / input / projection 回调
      this.pausedAll = false;
      this.stepOnce = new Set();   // 需要单步的实例 id
      this.oninstancechange = null;
      this.log = [];
    }

    // ---- 实例管理 ----
    createRoot(rootFs) {
      const inst = new Instance(this, { id: 'outer', name: 'outer', isRoot: true, depth: 0, fs: rootFs });
      inst.state = 'running';
      this.root = inst;
      this.instances.outer = inst;
      return inst;
    }

    createInstance(parent, name) {
      const id = 'inner-' + (++this.counter);
      const inst = new Instance(this, {
        id, name: name || id, parentId: parent.id, depth: parent.depth + 1,
        fs: this.makeSubsystemFS()
      });
      inst.rate = 1;
      this.instances[id] = inst;
      this.order.push(id);
      parent.children.push(id);
      // 父系统文件系统中的内核源文件
      const kdir = '/Systems/' + id;
      this.fsMkdir(parent, kdir);
      this.fsWrite(parent, kdir + '/kernel.nsl', this.fixtureSource('Kernel.nsl'), 'nsl');
      this.emitChange();
      return inst;
    }

    // 子系统初始文件系统（预置程序、编译器、场景、示例）
    makeSubsystemFS() {
      const files = {};
      const put = (p, data, k) => { files[p] = { d: data == null ? '' : String(data), k: k || 'text', m: now() }; };
      const prog = (n) => this.fixtureSource(n);
      const strSum = (s) => { let n = 0; for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) % 1000000007; return n; };
      // 预编译可执行文件与校验和：源文件未改动时直接载入，改过则由系统内编译器重新编译
      const precompiled = ['Compiler', 'WM', 'Files', 'Editor', 'Tasks', 'Systems', 'Player', 'Charts', 'Flight', 'Fx', 'FlightController', 'Sum', 'Send', 'Recv', 'Busy', 'Sensors'];
      for (const n of precompiled) {
        const src = prog(n + '.nsl');
        const bin = prog(n + '.nsl.bin');
        if (src && bin) {
          put('/System/' + n + '.nsl.bin', bin, 'bin');
          put('/System/' + n + '.nsl.sum', String(strSum(src)), 'text');
          put('/Programs/' + n + '.nsl.bin', bin, 'bin');
          put('/Programs/' + n + '.nsl.sum', String(strSum(src)), 'text');
        }
      }
      put('/System/Kernel.nsl', prog('Kernel.nsl'), 'nsl');
      put('/System/Compiler.nsl', prog('Compiler.nsl'), 'nsl');
      put('/System/Compiler.bin', prog('Compiler.bin'), 'bin');
      put('/System/Compiler.sum', String(strSum(prog('Compiler.nsl'))), 'text');
      put('/System/WM.nsl', prog('WM.nsl'), 'nsl');
      put('/System/Files.nsl', prog('Files.nsl'), 'nsl');
      put('/System/Editor.nsl', prog('Editor.nsl'), 'nsl');
      put('/System/Tasks.nsl', prog('Tasks.nsl'), 'nsl');
      put('/System/Systems.nsl', prog('Systems.nsl'), 'nsl');
      put('/System/Player.nsl', prog('Player.nsl'), 'nsl');
      put('/System/Charts.nsl', prog('Charts.nsl'), 'nsl');
      put('/System/FlightController.nsl', prog('FlightController.nsl'), 'nsl');
      put('/Programs/Sum.nsl', prog('Sum.nsl'), 'nsl');
      put('/Programs/Send.nsl', prog('Send.nsl'), 'nsl');
      put('/Programs/Recv.nsl', prog('Recv.nsl'), 'nsl');
      put('/Programs/Busy.nsl', prog('Busy.nsl'), 'nsl');
      put('/Programs/Sensors.nsl', prog('Sensors.nsl'), 'nsl');
      put('/Demo/helicopter-24.scene', this.fixtureSource('helicopter-24.scene'), 'scene');
      put('/Demo/minimal.scene', this.fixtureSource('minimal.scene'), 'scene');
      put('/Demo/默认演出.rec', this.fixtureSource('default-performance.rec'), 'rec');
      put('/Documents/说明.txt', '这是一个由内核程序运行的子系统。\n\n· 文件管理器、编辑器、播放器、图表工作台都是本系统里的程序\n· 在编辑器里打开 /System/Kernel.nsl 可以查看内核源文件（本系统自己的内核在父系统的 /Systems/' + 'inner-x/kernel.nsl）\n· 打开「系统」应用可以继续创建子系统\n', 'text');
      put('/Documents/飞行记录/演示.rec', this.fixtureSource('default-performance.rec'), 'rec');
      put('/Snapshots', '', 'dir');
      put('/Systems', '', 'dir');
      return files;
    }

    fixtureSource(name) {
      if (this._fixtures && this._fixtures[name] !== undefined) return this._fixtures[name];
      if (fsMod && pathMod) {
        const root = (window.U && window.U.projectRoot) ? window.U.projectRoot() : process.cwd();
        const base = pathMod.join(root, 'programs');
        const assets = pathMod.join(root, 'assets', 'fixtures');
        const candidates = [pathMod.join(base, name), pathMod.join(assets, name)];
        for (const p of candidates) {
          try { return fsMod.readFileSync(p, 'utf8'); } catch (e) { /* continue */ }
        }
      }
      return '';
    }

    // ---- 文件系统（宿主原始存储，目录语义由内核实现；这里提供按路径的键值存取）----
    fsGet(inst, p) { return inst.fs[p] || null; }
    fsWrite(inst, p, data, kind) {
      const cur = inst.fs[p];
      const d = String(data == null ? '' : data);
      const delta = d.length - (cur ? cur.d.length : 0);
      if (this.fsUsed(inst) + delta > inst.storageQuota) return { ok: false, error: '存储配额不足' };
      inst.fs[p] = { d, k: kind || (cur ? cur.k : 'text'), m: now() };
      return { ok: true };
    }
    fsMkdir(inst, p) { if (!inst.fs[p]) inst.fs[p] = { d: '', k: 'dir', m: now() }; return { ok: true }; }
    fsUsed(inst) {
      let s = 0;
      for (const k in inst.fs) s += inst.fs[k].d.length + 32;
      return s;
    }
    fsList(inst, p) {
      const prefix = p === '/' ? '/' : p.replace(/\/$/, '') + '/';
      const out = {};
      for (const k in inst.fs) {
        if (k === p || k.indexOf(prefix) !== 0) continue;
        const rest = k.slice(prefix.length);
        if (!rest) continue;
        const i = rest.indexOf('/');
        const name = i < 0 ? rest : rest.slice(0, i);
        if (!out[name]) out[name] = { name, dir: i >= 0, size: i >= 0 ? 0 : inst.fs[k].d.length };
      }
      return Object.values(out);
    }

    // ---- 预算 ----
    remaining(inst) { return inst.budgetLimit - inst.budgetUsed; }
    charge(inst, n) {
      inst.budgetUsed += n;
      return inst.budgetUsed <= inst.budgetLimit;
    }

    // ---- 启动内核 ----
    startKernel(inst, bin) {
      if (inst.kernel) { this.stopKernel(inst); }
      inst.procs = {};
      inst.nextPid = 1;
      inst.kernelPids = {};
      inst.error = null;
      inst.state = 'running';
      inst.budgetUsed = 0;
      inst.budgetUsedTotal = 0;
      inst.kernelWork = 0;
      inst.innerWork = 0;
      const p = NSL.createProcess(bin, { id: 0, tag: 'kernel' });
      p.memLimit = inst.memQuota;
      inst.kernel = p;
      inst.kernelName = bin.name || 'kernel';
      // 立即运行一次，让内核完成引导
      this.runKernel(inst, 0, true);
      this.emitChange();
    }

    stopKernel(inst) {
      inst.kernel = null;
      inst.procs = {};
      inst.kernelPids = {};
      for (const cid of inst.children) {
        const c = this.instances[cid];
        if (c && c.kernel) this.stopKernel(c);
      }
      inst.state = 'stopped';
    }

    // ---- 每逻辑步推进 ----
    tick(dtReal) {
      this.tickCount++;
      const root = this.root;
      if (!root) return;
      root.budgetUsed = 0;
      root.clock += dtReal * root.rate;
      root.lastTickAt = now();
      this.rootBudgetUsed = 0;
      for (const cid of root.children) {
        const c = this.instances[cid];
        if (c) this.runInstance(c, dtReal * root.rate);
      }
      // 单步请求
      for (const id of Array.from(this.stepOnce)) {
        this.stepOnce.delete(id);
        const inst = this.instances[id];
        if (inst && inst.paused) this.runInstance(inst, TICK, true);
      }
      this.emit('tick');
    }

    runInstance(inst, dtFromParent, force) {
      if (!inst.kernel) return;
      if (inst.paused && !force) { inst.state = 'paused'; return; }
      if (inst.state === 'stopped' || inst.state === 'error') return;
      const dt = dtFromParent * inst.rate;
      inst.clock += dt;
      inst.state = 'running';
      inst.dt = dt;
      inst.budgetUsed = 0;
      this.runKernel(inst, dt, false);
      inst.budgetUsedTotal += inst.budgetUsed;
      // 直属子系统由内核 step 时递归推进，这里无需再遍历
    }

    runKernel(inst, dt, boot) {
      const k = inst.kernel;
      if (!k) return;
      k.memLimit = inst.memQuota;
      let guard = 0;
      while (guard++ < 4000) {
        const rem = this.remaining(inst);
        if (rem <= 0) break;
        const r = NSL.step(k, Math.min(rem, 50000));
        inst.budgetUsed += r.used;
        inst.kernelWork += r.used;
        inst.budgetUsedTotal += r.used;
        if (r.status === 'sys') {
          if (r.sys === 'wait_tick') { NSL.resume(k, boot ? 0 : dt); return; }
          const res = this.rawSyscall(inst, r.sys, r.args || []);
          if (k.state === 'error') break;
          if (k.state === 'exit') break;
          NSL.resume(k, res === undefined ? null : res);
          continue;
        }
        if (r.status === 'exit') { inst.state = 'stopped'; this.emitChange(); return; }
        if (r.status === 'error') {
          inst.state = 'error';
          inst.error = String(r.error || '内核错误');
          this.emitChange();
          return;
        }
      }
      if (guard >= 4000) { inst.state = 'error'; inst.error = '内核未在预算内让出（可能死循环）'; this.emitChange(); }
    }

    // ---- 原始系统服务（只有内核进程能到达）----
    rawSyscall(inst, name, args) {
      const A = args;
      switch (name) {
        case 'log': { this.log.push({ t: inst.clock, sys: inst.id, msg: A[0] }); if (this.log.length > 400) this.log.shift(); return null; }
        case 'budget': return Math.max(0, this.remaining(inst));
        case 'budget_limit': return inst.budgetLimit;
        case 'time': return inst.clock;
        case 'screen': return { w: inst.screen.w, h: inst.screen.h };
        case 'input': return inst.input.length ? inst.input.shift() : null;
        case 'mem_quota': return inst.memQuota;
        case 'storage_quota': return inst.storageQuota;
        case 'storage_used': return this.fsUsed(inst);
        case 'spawn': {
          const bin = A[0];
          if (!bin || !bin.code) return { ok: false, error: '无效的程序' };
          const pid = inst.nextPid++;
          const p = NSL.createProcess(bin, { id: pid, tag: A[1] || bin.name || 'prog' });
          p.name = A[1] || bin.name || 'prog';
          p.memLimit = Math.min(inst.memQuota, 4 * 1024 * 1024);
          p.quota = 0;
          inst.procs[pid] = p;
          return { ok: true, pid };
        }
        case 'step': {
          const pid = A[0];
          let n = Math.floor(A[1] || 0);
          const childId = inst.kernelPids[pid];
          if (childId) {
            const child = this.instances[childId];
            if (!child || !child.kernel) return { status: 'exit', used: 0, error: '子系统已停止' };
            const before = child.budgetUsed;
            // 子系统推进由宿主递归完成，预算从本实例扣除
            const cap = Math.min(n, this.remaining(inst));
            if (cap <= 0) return { status: 'preempt', used: 0 };
            const savedLimit = child.budgetLimit;
            child.budgetLimit = Math.min(savedLimit, cap);
            const beforeUsed = child.budgetUsed;
            this.runInstance(child, inst.dt || TICK, false);
            const used = child.budgetUsed - beforeUsed;
            this.charge(inst, used);
            child.budgetLimit = savedLimit;
            inst.innerWork += used;
            if (child.paused) return { status: 'preempt', used };
            if (child.state === 'error') return { status: 'error', used, error: child.error };
            return { status: 'ok', used };
          }
          const p = inst.procs[pid];
          if (!p) return { status: 'exit', used: 0, error: '进程不存在' };
          if (n > this.remaining(inst)) n = this.remaining(inst);
          if (n <= 0) return { status: 'preempt', used: 0 };
          const r = NSL.step(p, n);
          this.charge(inst, r.used);
          inst.innerWork += r.used;
          if (r.status === 'sys') {
            p.pendingSys = r.sys; p.pendingArgs = r.args;
            return { status: 'sys', sys: r.sys, args: r.args, used: r.used };
          }
          if (r.status === 'exit') return { status: 'exit', used: r.used, value: r.value };
          if (r.status === 'error') return { status: 'error', used: r.used, error: r.error };
          return { status: 'ok', used: r.used };
        }
        case 'resume': {
          const p = inst.procs[A[0]];
          if (!p) return false;
          return NSL.resume(p, A[1] === undefined ? null : A[1]);
        }
        case 'kill': {
          const pid = A[0];
          const p = inst.procs[pid];
          if (!p) return false;
          if (inst.kernelPids[pid]) {
            const cid = inst.kernelPids[pid];
            const child = this.instances[cid];
            if (child) { this.stopKernel(child); child.state = 'stopped'; }
            delete inst.kernelPids[pid];
          }
          p.state = 'exit'; p.exitValue = null;
          delete inst.procs[pid];
          this.emitChange();
          return true;
        }
        case 'proc_list': {
          const out = [];
          for (const pid in inst.procs) {
            const p = inst.procs[pid];
            out.push({
              pid: Number(pid), name: p.name, state: p.state === 'sys' ? '等待系统服务' : p.state,
              used: p.used, mem: p.mem, quota: p.quota, error: p.error,
              kernel: !!inst.kernelPids[pid]
            });
          }
          return out;
        }
        case 'proc_info': {
          const p = inst.procs[A[0]];
          if (!p) return null;
          return { pid: A[0], name: p.name, state: p.state, used: p.used, mem: p.mem, memLimit: p.memLimit, error: p.error, pending: p.pendingSys || null };
        }
        case 'mem_set': { const p = inst.procs[A[0]]; if (p) p.memLimit = Math.min(A[1], inst.memQuota); return true; }
        case 'quota_set': { const p = inst.procs[A[0]]; if (p) p.quota = A[1]; return true; }
        case 'load_bin': {
          const f = inst.fs[A[0]];
          if (!f) return null;
          try { return JSON.parse(f.d); } catch (e) { return null; }
        }
        case 'save_bin': {
          const r = this.fsWrite(inst, A[0], JSON.stringify(A[1]), 'bin');
          return r.ok ? { ok: true } : r;
        }
        case 'compile_text': {
          // 宿主引导用（仅在编译器自举失败时兜底）
          const c = window.NSLC.compile(A[0], A[1] || 'program');
          return c.err ? { ok: false, error: c.err } : { ok: true, prog: c.prog };
        }
        case 'fs_list': return this.fsList(inst, A[0]);
        case 'fs_keys': return Object.keys(inst.fs);
        case 'fs_size': { const f = inst.fs[A[0]]; return f ? f.d.length : 0; }
        case 'fs_read': { const f = inst.fs[A[0]]; return f ? f.d : null; }
        case 'fs_write': return this.fsWrite(inst, A[0], A[1], A[2]);
        case 'fs_mkdir': return this.fsMkdir(inst, A[0]);
        case 'fs_delete': { if (inst.fs[A[0]]) { delete inst.fs[A[0]]; return { ok: true }; } return { ok: false, error: '文件不存在' }; }
        case 'fs_move': {
          const s = inst.fs[A[0]];
          if (!s) return { ok: false, error: '源不存在' };
          if (inst.fs[A[1]]) return { ok: false, error: '目标已存在', code: 'exists' };
          inst.fs[A[1]] = s; delete inst.fs[A[0]];
          return { ok: true };
        }
        case 'fs_copy': {
          const s = inst.fs[A[0]];
          if (!s) return { ok: false, error: '源不存在' };
          if (inst.fs[A[1]]) return { ok: false, error: '目标已存在', code: 'exists' };
          if (this.fsUsed(inst) + s.d.length > inst.storageQuota) return { ok: false, error: '存储配额不足' };
          inst.fs[A[1]] = { d: s.d, k: s.k, m: now() };
          return { ok: true };
        }
        case 'display': {
          inst.display.buffers[A[0]] = { type: '2d', list: A[1], w: A[2] || 0, h: A[3] || 0, t: inst.clock };
          inst.display.dirty = true;
          return true;
        }
        case 'scene': {
          inst.display.buffers[A[0]] = { type: 'scene', state: A[1], w: A[2] || 0, h: A[3] || 0, t: inst.clock };
          inst.display.dirty = true; inst.display.sceneDirty = true;
          return true;
        }
        case 'buffer_get': { const b = inst.display.buffers[A[0]]; return b ? b : null; }
        case 'buffer_names': { return Object.keys(inst.display.buffers); }
        case 'scene_load': {
          const f = inst.fs[A[0]];
          if (!f) return null;
          try { return JSON.parse(f.d); } catch (e) { return null; }
        }
        case 'subsystem_create': {
          const parent = inst;
          const name = A[0];
          const child = this.createInstance(parent, name);
          return { ok: true, id: child.id, name: child.name };
        }
        case 'subsystem_attach': {
          inst.kernelPids[A[1]] = A[0];
          const child = this.instances[A[0]];
          const p = inst.procs[A[1]];
          if (child && p) { child.kernel = p; child.state = 'running'; }
          return true;
        }
        case 'subsystem_list': {
          const out = [];
          for (const cid of inst.children) {
            const c = this.instances[cid];
            if (!c) continue;
            out.push({
              id: c.id, name: c.name, parentId: inst.id, state: c.state,
              paused: c.paused, rate: c.rate, clock: c.clock, depth: c.depth,
              kernelPid: Object.keys(inst.kernelPids).find((k) => inst.kernelPids[k] === c.id) || null,
              error: c.error || null
            });
          }
          return out;
        }
        case 'subsystem_control': {
          return this.control(A[0], A[1], A[2] || {});
        }
        case 'subsystem_snapshot': return this.snapshot(A[0], A[1]);
        case 'subsystem_restore': return this.restore(A[0], A[1], A[2]);
        case 'subsystem_fork': return this.fork(A[0], A[1]);
        case 'subsystem_restart': return this.restart(A[0]);
        case 'subsystem_info': {
          const c = this.instances[A[0]];
          if (!c) return null;
          return { id: c.id, name: c.name, state: c.state, paused: c.paused, rate: c.rate, clock: c.clock, error: c.error, depth: c.depth };
        }
        case 'host_request': return this.hostRequest(inst, A[0], A[1] || {});
        case 'chart_updates': {
          // 取出属于本实例的图表更新
          const out = inst.pendingChart;
          inst.pendingChart = [];
          return out;
        }
        default:
          return { error: '未知系统服务 ' + name };
      }
    }

    // ---- 控制 ----
    control(id, op, args) {
      const inst = this.instances[id];
      if (!inst) return { ok: false, error: '子系统不存在' };
      switch (op) {
        case 'pause': inst.paused = true; inst.state = 'paused'; this.emitChange(); return { ok: true };
        case 'resume': inst.paused = false; inst.state = inst.kernel ? 'running' : 'stopped'; this.emitChange(); return { ok: true };
        case 'step': if (inst.paused) this.stepOnce.add(id); return { ok: true };
        case 'rate': inst.rate = Math.max(0.1, Math.min(16, Number(args.rate) || 1)); this.emitChange(); return { ok: true };
        case 'stop': this.stopKernel(inst); this.emitChange(); return { ok: true };
        case 'budget': inst.budgetLimit = Math.max(1000, Number(args.budget) || inst.budgetLimit); this.emitChange(); return { ok: true };
        case 'mem': inst.memQuota = Math.max(65536, Number(args.mem) || inst.memQuota); return { ok: true };
        case 'storage': inst.storageQuota = Math.max(1024, Number(args.storage) || inst.storageQuota); return { ok: true };
        default: return { ok: false, error: '未知操作 ' + op };
      }
    }

    restart(id) {
      const inst = this.instances[id];
      if (!inst) return { ok: false, error: '子系统不存在' };
      const bin = this.compileKernelFor(inst);
      if (!bin) return { ok: false, error: '内核源文件无法编译' };
      this.stopKernel(inst);
      // 保留系统树结构与文件，重新从初始状态启动
      this.startKernel(inst, bin);
      return { ok: true };
    }

    compileKernelFor(inst) {
      const parent = this.instances[inst.parentId];
      if (!parent) return null;
      const src = parent.fs['/Systems/' + inst.id + '/kernel.nsl'];
      if (!src) return null;
      if (parent.isRoot) {
        const c = window.NSLC.compile(src.d, 'kernel');
        return c.err ? null : c.prog;
      }
      // 子系统父级：由父内核的编译器进程编译
      return this.compileViaKernel(parent, src.d);
    }

    compileViaKernel(inst, src) {
      // 用实例内的常驻编译器进程编译（内核启动时已准备好）
      const pid = inst.compilerPid;
      if (!pid) return null;
      const p = inst.procs[pid];
      if (!p) return null;
      const send = { op: 'compile', src };
      let guard = 0;
      let result = null;
      // 先把请求放进编译器的收件箱
      inst.compilerInbox = inst.compilerInbox || {};
      inst.compilerInbox[pid] = inst.compilerInbox[pid] || [];
      inst.compilerInbox[pid].push(send);
      while (guard++ < 400) {
        const r = NSL.step(p, 20000);
        this.charge(inst, r.used);
        if (r.status === 'sys') {
          if (r.sys === 'recv') {
            const box = inst.compilerInbox[pid] || [];
            NSL.resume(p, box.length ? box.shift() : null);
          } else if (r.sys === 'reply') { result = r.args[0]; NSL.resume(p, null); }
          else NSL.resume(p, null);
        } else break;
      }
      return result;
    }

    // ---- 快照 ----
    snapshot(id, targetPath) {
      const inst = this.instances[id];
      if (!inst) return { ok: false, error: '子系统不存在' };
      const snap = { v: 1, id: inst.id, name: inst.name, parentId: inst.parentId, clock: inst.clock, rate: inst.rate, paused: inst.paused, takenAt: now(), systems: [] };
      const walk = (i) => {
        const s = {
          id: i.id, name: i.name, parentId: i.parentId, depth: i.depth,
          clock: i.clock, rate: i.rate, paused: i.paused, state: i.state,
          budgetLimit: i.budgetLimit, memQuota: i.memQuota, storageQuota: i.storageQuota,
          fs: i.fs,
          kernel: i.kernel ? NSL.serialize(i.kernel) : null,
          procs: {}, kernelPids: i.kernelPids, nextPid: i.nextPid,
          display: i.display, screen: i.screen,
          kernelWork: i.kernelWork, innerWork: i.innerWork,
          pendingChart: i.pendingChart
        };
        for (const pid in i.procs) s.procs[pid] = NSL.serialize(i.procs[pid]);
        snap.systems.push(s);
        for (const cid of i.children) { const c = this.instances[cid]; if (c) walk(c); }
      };
      walk(inst);
      const data = JSON.stringify(snap);
      const parent = this.instances[inst.parentId];
      const p = targetPath || ('/Snapshots/' + inst.name + '-' + Date.now() + '.snap');
      const r = parent ? this.fsWrite(parent, p, data, 'snap') : { ok: true };
      if (!r.ok) return r;
      return { ok: true, path: p, size: data.length };
    }

    restore(path, targetId, opts) {
      const parent = this.instances[targetId || (this.root && this.root.id)];
      const src = parent.fs[path];
      if (!src) return { ok: false, error: '快照不存在' };
      let snap;
      try { snap = JSON.parse(src.d); } catch (e) { return { ok: false, error: '快照损坏' }; }
      const target = this.instances[snap.id];
      if (!target) return { ok: false, error: '目标子系统不存在' };
      // 停止旧子树
      this.stopKernel(target);
      target.children.forEach((cid) => { const c = this.instances[cid]; if (c) this.stopKernel(c); });
      const remap = {};
      for (const s of snap.systems) {
        remap[s.id] = s.id;
        const i = this.instances[s.id] || new Instance(this, { id: s.id, parentId: s.parentId, depth: s.depth, name: s.name });
        this.instances[s.id] = i;
        i.name = s.name; i.clock = s.clock; i.rate = s.rate; i.paused = s.paused;
        i.budgetLimit = s.budgetLimit; i.memQuota = s.memQuota; i.storageQuota = s.storageQuota;
        i.fs = s.fs; i.kernelPids = s.kernelPids; i.nextPid = s.nextPid;
        i.display = s.display; i.screen = s.screen;
        i.kernelWork = s.kernelWork; i.innerWork = s.innerWork;
        i.pendingChart = s.pendingChart || [];
        i.procs = {};
        for (const pid in s.procs) i.procs[pid] = NSL.deserialize(s.procs[pid]);
        i.kernel = s.kernel ? NSL.deserialize(s.kernel) : null;
        i.state = i.kernel ? 'running' : 'stopped';
      }
      this.emitChange();
      return { ok: true };
    }

    fork(path, targetId) {
      const parent = this.instances[targetId];
      if (!parent) return { ok: false, error: '目标不存在' };
      const src = parent.fs[path];
      if (!src) return { ok: false, error: '快照不存在' };
      let snap;
      try { snap = JSON.parse(src.d); } catch (e) { return { ok: false, error: '快照损坏' }; }
      // 新身份
      const idMap = {};
      for (const s of snap.systems) { idMap[s.id] = 'inner-' + (++this.counter); }
      const rootSnap = snap.systems[0];
      const newInst = new Instance(this, {
        id: idMap[rootSnap.id], name: rootSnap.name + ' 分叉', parentId: targetId,
        depth: parent.depth + 1, fs: {}
      });
      this.instances[newInst.id] = newInst;
      this.order.push(newInst.id);
      parent.children.push(newInst.id);
      for (const s of snap.systems) {
        const i = s === rootSnap ? newInst : new Instance(this, { id: idMap[s.id], parentId: idMap[s.parentId] || targetId, depth: s.depth, name: s.name, fs: {} });
        this.instances[i.id] = i;
        i.name = s === rootSnap ? rootSnap.name + ' 分叉' : s.name;
        i.clock = s.clock; i.rate = s.rate; i.paused = s.paused;
        i.budgetLimit = s.budgetLimit; i.memQuota = s.memQuota; i.storageQuota = s.storageQuota;
        i.fs = JSON.parse(JSON.stringify(s.fs));
        i.kernelPids = s.kernelPids; i.nextPid = s.nextPid;
        i.display = JSON.parse(JSON.stringify(s.display)); i.screen = s.screen;
        i.kernelWork = s.kernelWork; i.innerWork = s.innerWork;
        i.pendingChart = JSON.parse(JSON.stringify(s.pendingChart || []));
        i.procs = {};
        for (const pid in s.procs) i.procs[pid] = NSL.deserialize(JSON.parse(JSON.stringify(s.procs[pid])));
        i.kernel = s.kernel ? NSL.deserialize(JSON.parse(JSON.stringify(s.kernel))) : null;
        i.state = i.kernel ? 'running' : 'stopped';
      }
      // 父系统文件系统中登记新子系统
      this.fsMkdir(parent, '/Systems/' + newInst.id);
      this.fsWrite(parent, '/Systems/' + newInst.id + '/kernel.nsl', this.fixtureSource('Kernel.nsl'), 'nsl');
      this.emitChange();
      return { ok: true, id: newInst.id, name: newInst.name };
    }

    // ---- 跨层请求（投送、图表数据、文件拖放）----
    hostRequest(inst, service, args) {
      if (this.hooks.hostRequest) {
        return this.hooks.hostRequest(inst, service, args);
      }
      return { ok: false, error: '宿主未提供该服务' };
    }

    sceneResource(inst, p) {
      if (!p) return null;
      if (!this._sceneCache) this._sceneCache = {};
      const f = inst.fs[p];
      if (!f) return null;
      if (this._sceneCache[p] && this._sceneCache[p].src === f.d) return this._sceneCache[p].res;
      try {
        const res = JSON.parse(f.d);
        this._sceneCache[p] = { src: f.d, res };
        return res;
      } catch (e) { return null; }
    }
    emit(evt) { if (this.hooks.emit) this.hooks.emit(evt, this); }
    emitChange() { if (this.oninstancechange) this.oninstancechange(this); }

    // ---- 查询 ----
    listSystems() {
      const out = [];
      const walk = (i, parentId) => {
        out.push({ id: i.id, parentId, name: i.name, state: i.state, paused: i.paused, rate: i.rate, depth: i.depth, clock: i.clock, children: i.children.slice(), error: i.error || null });
        for (const cid of i.children) { const c = this.instances[cid]; if (c) walk(c, i.id); }
      };
      if (this.root) walk(this.root, null);
      return out;
    }
    getInstance(id) { return this.instances[id] || null; }
  }

  window.NSLRuntime = { Runtime, Instance, TICK, ROOT_BUDGET };
})();
