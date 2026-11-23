/*
 * 宿主运行时：系统树、进程、预算调度、虚拟时间、内核宿主、快照。
 * 根系统由宿主直接实现；子系统由其父系统中保存的内核程序（NSL）驱动。
 */
(function (g) {
  const NOS = (g.NOS = g.NOS || {});
  const NSL = g.NSL;

  const STEP_MS = 40;           // 一个逻辑步的时长（虚拟毫秒）
  const ROOT_BUDGET = 260000;   // 根系统每步总执行预算（指令）
  const CHILD_BUDGET = 90000;   // 子系统配置预算上限
  const CHILD_SHARE = 0.55;     // 父系统向直属子系统拨付的比例

  let pidSeq = 1;
  let winSeq = 1;
  let connSeq = 1;

  class Proc {
    constructor(sys, name, role, prog, path) {
      this.sys = sys;
      this.id = pidSeq++;
      this.name = name;
      this.role = role || 'user';
      this.prog = prog;
      this.path = path || '';
      this.state = 'ready';       // ready running waiting suspended done error
      this.saved = null;
      this.consumed = 0;
      this.remaining = 0;
      this.error = null;
      this.inbox = [];
      this.memory = 0;
      this.yielded = false;
      this.tags = 0;
      this.pending = new Map();   // tag -> data（系统调用回复）
      this.waitTag = null;        // 正在等待某个系统调用的回复
      this.pendingTag = null;     // 上一次系统调用分配的 tag（续行时匹配）
      this.resumeTag = null;      // 待交付的回复 tag
      this.resumeData = null;     // 待交付的回复内容
      this.wakeAt = null;         // 定时唤醒时刻（虚拟毫秒）
      this.waitFlag = false;      // 等待消息
      this.launchArgs = '';       // 启动参数（JSON）
    }
    /* 依据等待条件计算进程状态 */
    refresh(sys) {
      const before = this.state;
      let out = this.state;
      if (this.state === 'done' || this.state === 'error' || this.state === 'suspended') return this.state;
      if (this.waitTag !== null) { this.state = 'waiting'; out = this.state; }
      else if (this.wakeAt !== null) {
        if (sys.time >= this.wakeAt) { this.wakeAt = null; this.state = 'ready'; out = this.state; }
        else { this.state = 'waiting'; out = this.state; }
      } else if (this.waitFlag) { this.state = 'waiting'; out = this.state; }
      else { this.state = 'ready'; out = this.state; }
      if (before !== out && sys.rt && sys.rt.opts.trace) {
        sys.rt.log('[状态] ' + this.name + ' ' + before + '->' + out + ' tag=' + this.waitTag + ' wake=' + this.wakeAt + ' flag=' + this.waitFlag);
      }
      return this.state;
    }
  }

  class System {
    constructor(rt, id, parentId, name, depth) {
      this.rt = rt;
      this.id = id;
      this.parentId = parentId;
      this.name = name;
      this.depth = depth;
      this.state = 'running';     // running paused stopped error
      this.time = 0;              // 虚拟时间（毫秒）
      this.rate = 1;              // 时间速率
      this.budgetTotal = parentId ? CHILD_BUDGET : ROOT_BUDGET;
      this.budgetGrant = 0;       // 本步实际拨付
      this.budgetUsed = 0;        // 本步实际消耗
      this.childPool = 0;         // 本步为直属子系统预留的额度
      this.memQuota = parentId ? 24 * 1024 * 1024 : 192 * 1024 * 1024;
      this.memUsed = 0;
      this.storageQuota = parentId ? 8 * 1024 * 1024 : 64 * 1024 * 1024;
      this.fs = new NOS.VFS();
      this.processes = [];
      this.windows = [];          // 渲染用（由内核 wm.sync 或宿主应用写入）
      this.focusWindow = null;
      this.children = [];
      this.kernelProc = null;
      this.compilerProg = null;
      this.compilerSource = '';
      this.compilerVersion = 0;
      this.pendingEvents = [];    // 交给内核的事件队列
      this.notifications = [];
      this.wallpaper = null;
      this.accent = '#7c5cff';
      this.scale = 1;
      this.systemName = name;
      this.sceneCache = new Map();
      this.chartSubs = new Map();
      this.projectionWindows = new Map();
    }
    path() { return this.rt.pathOf(this); }
  }

  class Runtime {
    constructor(opts) {
      this.opts = opts || {};
      this.systems = new Map();
      this.root = null;
      this.innerCounter = 0;
      this.logs = [];
      this.events = [];
      this.charge = null;
      this.paused = false;
      this.stepCount = 0;
      this.running = false;
      this.onUpdate = null;
      this.sheetBus = null;      // 根表格发布总线
      this.chartConns = new Map();  // 图表数据连接
    }
    /* 小工具：安全取整数 */
    numOr(v, d) { const n = Number(v); return Number.isFinite(n) ? Math.floor(n) : d; }
    log(t) {
      this.logs.push(String(t));
      if (this.logs.length > 500) this.logs.shift();
      if (this.opts.verbose) console.log('[nested-os]', t);
    }
    pathOf(sys) {
      const parts = [];
      let s = sys;
      while (s && s.parentId) { parts.unshift(s.id); s = this.systems.get(s.parentId); }
      return parts.join('/');
    }
    sys(id) { return this.systems.get(id); }
    childrenOf(id) { return Array.from(this.systems.values()).filter((s) => s.parentId === id); }

    /* ---------------- 系统创建 ---------------- */
    createRoot() {
      const root = new System(this, 'outer', null, '根系统', 0);
      root.systemName = '根系统';
      this.systems.set('outer', root);
      this.root = root;
      this.seedSystemFiles(root, true);
      return root;
    }
    createChild(parent, opts) {
      const id = 'inner-' + (++this.innerCounter);
      const child = new System(this, id, parent.id, opts && opts.name ? opts.name : '子系统 ' + id, parent.depth + 1);
      this.systems.set(id, child);
      parent.children.push(child);
      this.seedSystemFiles(child, false);
      return child;
    }
    seedSystemFiles(sys, isRoot) {
      const F = this.opts.fixtures || {};
      sys.fs.mkdir('/Documents');
      sys.fs.mkdir('/Downloads');
      sys.fs.mkdir('/RecycleBin');
      sys.fs.mkdir('/Demo');
      sys.fs.mkdir('/System');
      sys.fs.mkdir('/System/apps');
      // 内核源文件（用于创建本系统的子级）与编译器、飞控程序
      if (F.kernel) sys.fs.write('/System/kernel.nsl', F.kernel);
      if (F.compiler) sys.fs.write('/System/compiler.nsl', F.compiler);
      if (F.flightController) sys.fs.write('/System/flight-controller.nsl', F.flightController);
      if (F.scene) sys.fs.write('/Demo/helicopter-24.scene', F.scene);
      if (F.sceneCopy) sys.fs.write('/Demo/helicopter-24.scene', F.sceneCopy);
      if (F.apps) {
        for (const name of Object.keys(F.apps)) {
          sys.fs.write('/System/apps/' + name + '.nsl', F.apps[name]);
        }
      }
      if (F.programs) {
        for (const name of Object.keys(F.programs)) {
          sys.fs.write('/System/apps/' + name + '.nsl', F.programs[name]);
        }
      }
      if (isRoot) {
        if (F.workbook) sys.fs.write('/Demo/sample.sheet', F.workbook);
        if (F.readme) sys.fs.write('/Documents/操作说明.md', F.readme);
      }
    }

    /* ---------------- 编译器服务 ---------------- */
    compileWithSystem(sys, source) {
      if (!sys.compilerProg) throw new Error('系统 ' + sys.id + ' 尚未装载编译器');
      const ctx = {
        globals: {}, budget: 40000000,
        log: (t) => this.log('[编译] ' + sys.id + ': ' + t),
        now: () => sys.time, rngState: 0x2545f491,
      };
      const r = NSL.callFunction(sys.compilerProg, 'compileProgram', [source], ctx);
      if (r.status === 'error') throw new Error('编译器运行错误: ' + r.error);
      if (r.status !== 'done') throw new Error('编译器未完成');
      const obj = JSON.parse(r.value);
      if (obj.error) throw new Error('编译错误: ' + obj.error);
      obj.funcNames = (obj.funcs || []).map((f) => f.name);
      return obj;
    }
    loadCompiler(sys) {
      const src = sys.fs.read('/System/compiler.nsl');
      if (!src.ok) { this.log('系统 ' + sys.id + ' 缺少编译器'); return false; }
      try {
        // 用父系统的编译器编译本系统的编译器；根系统用引导器
        const parent = sys.parentId ? this.systems.get(sys.parentId) : null;
        let prog;
        if (parent && parent.compilerProg) {
          const ctx = {
            globals: {}, budget: 40000000, log: (t) => this.log(t),
            now: () => parent.time, rngState: 7,
          };
          const r = NSL.callFunction(parent.compilerProg, 'compileProgram', [src.content], ctx);
          if (r.status !== 'done') throw new Error('状态 ' + r.status);
          const obj = JSON.parse(r.value);
          if (obj.error) throw new Error(obj.error);
          obj.funcNames = (obj.funcs || []).map((f) => f.name);
          prog = obj;
        } else {
          prog = NSL.compileSource(src.content);
        }
        sys.compilerProg = prog;
        sys.compilerVersion++;
        this.log('系统 ' + sys.id + ' 装载编译器 v' + sys.compilerVersion);
        return true;
      } catch (e) {
        this.log('系统 ' + sys.id + ' 编译器装载失败: ' + e.message);
        sys.compilerProg = null;
        return false;
      }
    }

    /* ---------------- 进程 ---------------- */
    makeCtx(proc) {
      const sys = proc.sys;
      const self = this;
      return {
        globals: null,
        budget: Infinity,
        log: (t) => self.log('[' + sys.id + '/' + proc.name + '] ' + t),
        now: () => sys.time,
        rngState: 12345,
        svc: (code, args) => self.kernelService(sys, code, args, proc),
        syscall: (code, args) => self.userSyscall(sys, code, args, proc),
        selfId: () => proc.id,
        inbox: () => JSON.stringify(proc.inbox),
        takeMsg: () => { const m = proc.inbox.shift(); return m ? JSON.stringify(m) : ''; },
        pendingTag: proc.pendingTag,
        resumeTag: proc.resumeTag,
        resumeData: proc.resumeData,
        takeResume: () => {
          if (proc.resumeTag === null || proc.resumeTag === undefined) return null;
          const out = { tag: proc.resumeTag, data: proc.resumeData };
          proc.resumeTag = null;
          proc.resumeData = null;
          return out;
        },
      };
    }
    runProc(proc, quota) {
      proc.refresh(proc.sys);
      if (proc.state === 'done' || proc.state === 'error' || proc.state === 'suspended') return { consumed: 0, status: proc.state };
      if (proc.state === 'waiting') return { consumed: 0, status: 'waiting' };
      const ctx = this.makeCtx(proc);
      let r;
      if (proc.saved) {
        ctx.globals = proc.saved.globals;
        r = NSL.resume(proc.prog, proc.saved, ctx, quota);
        proc.saved = { globals: r.globals, frames: r.frames, stack: r.stack };
      } else {
        r = NSL.execute(proc.prog, ctx);
        proc.saved = { globals: r.globals, frames: r.frames, stack: r.stack };
      }
      proc.consumed += r.consumed;
      this.afterRun(proc, r);
      return r;
    }
    afterRun(proc, r) {
      if (r.status === 'done') { proc.state = 'done'; proc.remaining = 0; proc.saved = null; }
      else if (r.status === 'error') { proc.state = 'error'; proc.error = r.error; this.log('进程 ' + proc.name + ' 异常: ' + r.error); }
      else if (r.status === 'wait') {
        // 阻塞在系统调用上：等待内核回复
        proc.state = 'waiting';
        proc.waitTag = r.tag === undefined ? proc.waitTag : r.tag;
      } else if (r.status === 'parked') { proc.state = 'parked'; }
      else if (r.status === 'budget') {
        proc.state = 'ready';
        proc.remaining = Math.max(0, 1000 - (proc.consumed % 1000));
      } else {
        proc.state = 'ready';
      }
    }

    /* ---------------- 内核服务（内核程序调用宿主） ---------------- */
    kernelService(sys, code, args, proc) {
      const self = this;
      let a = {};
      try { a = args ? JSON.parse(args) : {}; } catch (e) { a = {}; }
      const ch = this.charge;
      switch (code) {
        case 'time.now': return sys.time;
        case 'time.sleep': {
          const p = this.procOf(sys, a.pid);
          if (p) { p.wakeAt = sys.time + (a.ms || 0); p.refresh(sys); }
          return 1;
        }
        case 'kernel.event': {
          const ev = sys.pendingEvents.shift();
          if (ev && this.opts.trace) this.log('[事件] ' + sys.id + ' ' + JSON.stringify(ev).slice(0, 160));
          return ev ? JSON.stringify(ev) : '';
        }
        case 'kernel.park': {
          /* 让出本轮执行：虚拟机挂起在这条指令上，续行时再执行一次即通过 */
          if (proc) {
            if (proc.parkPending) { proc.parkPending = false; return 0; }
            proc.parkPending = true;
          }
          return { __nslPark: 1 };
        }
        case 'proc.spawn': {
          let prog = null;
          try { prog = this.compileWithSystem(sys, self.readProgram(sys, a.path)); }
          catch (e) { this.log('装载程序失败 ' + a.path + ': ' + e.message); return 0; }
          const p = new Proc(sys, a.name || 'proc', a.role || 'user', prog, a.path);
          p.launchArgs = a.args || '';
          sys.processes.push(p);
          self.chargeMem(sys, p);
          return p.id;
        }
        case 'proc.args': {
          const p = this.procOf(sys, a.pid);
          return p ? (p.launchArgs || '') : '';
        }
        case 'sys.quota': {
          if (a.budget > 0) sys.budgetTotal = Math.floor(a.budget);
          if (a.memory > 0) sys.memQuota = Math.floor(a.memory);
          if (a.storage > 0) sys.storageQuota = Math.floor(a.storage);
          return JSON.stringify({ ok: true, budgetTotal: sys.budgetTotal, memQuota: sys.memQuota, storageQuota: sys.storageQuota });
        }
        case 'chart.docs': {
          if (this.opts.onChartDocs) return this.opts.onChartDocs() || '[]';
          return '[]';
        }
        /* ---- 子系统管理（由子系统内的管理程序调用） ---- */
        case 'sys.children': {
          const arr = this.childrenOf(sys.id).map((c) => ({
            id: c.id, name: c.systemName || c.name, state: c.state, time: c.time,
            depth: c.depth, budget: c.budgetTotal, rate: c.rate,
          }));
          return JSON.stringify(arr);
        }
        case 'sys.newchild': {
          if (!this.opts.onNewChild) return 0;
          const child = this.opts.onNewChild(sys.id);
          return child ? child.id : 0;
        }
        case 'sys.childctl': {
          if (!this.opts.onChildControl) return JSON.stringify({ ok: false, error: '宿主未提供控制接口' });
          return JSON.stringify(this.opts.onChildControl(sys.id, a.id || '', a.action || '', a) || { ok: false });
        }
        case 'sys.openeditor': {
          if (!this.opts.onOpenEditor) return JSON.stringify({ ok: false, error: '宿主未提供编辑器接口' });
          return JSON.stringify(this.opts.onOpenEditor(sys.id, a.id || '') || { ok: false });
        }
        case 'sys.ancestors': {
          const out = [];
          let p = sys.parentId ? this.systems.get(sys.parentId) : null;
          while (p) {
            out.push({ id: p.id, name: p.systemName || p.name, depth: p.depth });
            p = p.parentId ? this.systems.get(p.parentId) : null;
          }
          return JSON.stringify(out);
        }
        case 'proc.run': {
          const p = this.procOf(sys, a.pid);
          if (!p) return JSON.stringify({ consumed: 0, status: 'gone' });
          let q = Math.max(0, a.quota || 0);
          if (ch) { q = Math.min(q, ch.allowance, ch.parentRemaining); }
          if (q <= 0) return JSON.stringify({ consumed: 0, status: 'blocked' });
          const r = this.runProc(p, q);
          if (ch) { ch.allowance -= r.consumed; ch.parentRemaining -= r.consumed; }
          return JSON.stringify({ consumed: r.consumed, status: p.state, error: p.error });
        }
        case 'proc.kill': {
          const p = this.procOf(sys, a.pid);
          if (p) { p.state = 'done'; p.saved = null; }
          return p ? 1 : 0;
        }
        case 'proc.suspend': { const p = this.procOf(sys, a.pid); if (p) p.state = 'suspended'; return p ? 1 : 0; }
        case 'proc.resume': { const p = this.procOf(sys, a.pid); if (p && p.state === 'suspended') p.state = 'ready'; return p ? 1 : 0; }
        case 'proc.info': {
          const p = this.procOf(sys, a.pid);
          if (!p) return '';
          return JSON.stringify({ id: p.id, name: p.name, role: p.role, state: p.state, consumed: p.consumed, error: p.error, memory: p.memory, inbox: p.inbox.length });
        }
        case 'proc.list': {
          const arr = sys.processes.map((p) => ({
            id: p.id, name: p.name, role: p.role, state: p.state, consumed: p.consumed,
            error: p.error, memory: p.memory, inbox: p.inbox.length, path: p.path,
          }));
          return JSON.stringify(arr);
        }
        case 'msg.post': {
          const p = this.procOf(sys, a.pid);
          if (this.opts.trace) this.log('[投递] pid ' + a.pid + ' -> ' + String(a.payload).slice(0, 120));
          if (!p) return 0;
          p.inbox.push({ from: a.from || 0, payload: a.payload || '', at: sys.time, tag: a.tag || 0 });
          if (p.waitFlag) p.waitFlag = false;
          p.refresh(sys);
          return 1;
        }
        case 'msg.inbox': { const p = this.procOf(sys, a.pid); return p ? p.inbox.length : 0; }
        case 'msg.peek': {
          const p = this.procOf(sys, a.pid);
          if (!p || !p.inbox[a.i]) return '';
          return JSON.stringify(p.inbox[a.i]);
        }
        case 'msg.take': {
          const p = this.procOf(sys, a.pid);
          if (!p || !p.inbox[a.i]) return '';
          const m = p.inbox.splice(a.i, 1)[0];
          return JSON.stringify(m);
        }
        case 'fs.list': return JSON.stringify(this.safeFs(sys, (fs) => fs.list(a.path), { ok: false, error: '目录不存在' }));
        case 'fs.read': return JSON.stringify(this.safeFs(sys, (fs) => fs.read(a.path), { ok: false, error: '文件不存在' }));
        case 'fs.write': return JSON.stringify(this.safeFs(sys, (fs) => fs.write(a.path, a.content), { ok: false, error: '写入失败' }));
        case 'fs.mkdir': return JSON.stringify(this.safeFs(sys, (fs) => fs.mkdir(a.path), { ok: false, error: '创建失败' }));
        case 'fs.delete': return JSON.stringify(this.safeFs(sys, (fs) => fs.remove(a.path, a.toBin !== false), { ok: false, error: '删除失败' }));
        case 'fs.copy': return JSON.stringify(this.safeFs(sys, (fs) => fs.copy(a.src, a.dst), { ok: false, error: '复制失败' }));
        case 'fs.move': return JSON.stringify(this.safeFs(sys, (fs) => fs.move(a.src, a.dst), { ok: false, error: '移动失败' }));
        case 'fs.rename': return JSON.stringify(this.safeFs(sys, (fs) => fs.rename(a.path, a.name), { ok: false, error: '重命名失败' }));
        case 'fs.stat': return JSON.stringify(this.safeFs(sys, (fs) => fs.stat(a.path), null));
        case 'fs.quota': {
          const u = sys.fs.usage();
          return JSON.stringify({ storage: u.bytes, storageQuota: sys.storageQuota, mem: sys.memUsed, memQuota: sys.memQuota });
        }
        case 'prog.load': {
          const src = this.readProgram(sys, a.path);
          try {
            const prog = this.compileWithSystem(sys, src);
            return JSON.stringify(prog);
          } catch (e) { return JSON.stringify({ error: e.message }); }
        }
        case 'wm.sync': {
          sys.windows = a.windows || [];
          sys.focusWindow = a.focus || null;
          sys.widgets = a.widgets || {};
          if (this.opts.onSync) this.opts.onSync(sys);
          return 1;
        }
        case 'scene.submit': {
          sys.sceneCache.set(a.key, a.data);
          if (this.opts.onScene) this.opts.onScene(sys, a.key, a.data);
          return 1;
        }
        case 'notify': {
          sys.notifications.unshift({ title: a.title || '系统', text: a.text || '', at: sys.time });
          if (sys.notifications.length > 50) sys.notifications.pop();
          if (this.opts.onNotify) this.opts.onNotify(sys, a);
          return 1;
        }
        case 'log': this.log('[' + sys.id + '] ' + (a.text || '')); return 1;
        case 'sys.info': {
          return JSON.stringify({
            id: sys.id, name: sys.systemName, time: sys.time, rate: sys.rate,
            budgetTotal: sys.budgetTotal, budgetGrant: sys.budgetGrant, budgetUsed: sys.budgetUsed,
            memUsed: sys.memUsed, memQuota: sys.memQuota, storageUsed: sys.fs.usage().bytes, storageQuota: sys.storageQuota,
            depth: sys.depth, parentId: sys.parentId,
          });
        }
        case 'reply': {
          const p = this.procOf(sys, a.pid);
          if (this.opts.trace) this.log('[回复] pid ' + a.pid + ' tag ' + a.tag + ' data ' + String(a.data).slice(0, 120));
          if (p) {
            p.pending.set(a.tag, a.data);
            if (p.waitTag === a.tag) {
              p.waitTag = null;
              p.resumeTag = a.tag;
              p.resumeData = a.data;
            }
            p.waitFlag = false;   // 系统调用已完成
            p.refresh(sys);
          }
          return 1;
        }
        case 'proc.waiting': {
          const p = this.procOf(sys, a.pid);
          if (p) { p.waitFlag = true; p.refresh(sys); }
          return 1;
        }
        /* ---- 数据连接（根表格 → 子系统图表） ---- */
        case 'chart.connect': {
          const conn = {
            id: numOr(a.id, 0), systemId: sys.id, pid: a.pid, docId: a.docId || '',
            range: a.range || '', labelCol: a.labelCol || 'A', series: a.series || '',
            state: 'connected', version: 0, data: null, at: sys.time,
          };
          this.chartConns.set(conn.id, conn);
          let initial = '';
          if (this.opts.onChartConnect) {
            try { initial = this.opts.onChartConnect(conn) || ''; } catch (e) { initial = ''; }
          }
          conn.data = initial;
          return initial;
        }
        case 'chart.disconnect': {
          const id = numOr(a.id, 0);
          const conn = this.chartConns.get(id);
          if (conn) { conn.state = 'disconnected'; this.chartConns.delete(id); }
          return 1;
        }
        /* ---- 跨层窗口投送 ---- */
        case 'project.create': {
          if (!this.opts.onProject) return 0;
          let pid = 0;
          try {
            pid = this.opts.onProject({
              target: a.target || 'outer', sourceSystemId: sys.id, sourcePid: a.sourcePid,
              sourceWindow: a.sourceWindow, app: a.app || 'player',
            }) || 0;
          } catch (e) { this.log('投送失败: ' + e.message); pid = 0; }
          return pid;
        }
        default:
          this.log('未知内核服务: ' + JSON.stringify(code) + ' args=' + JSON.stringify(a));
          return '';
      }
    }
    safeFs(sys, fn, dflt) {
      const u = sys.fs.usage();
      if (u.bytes > sys.storageQuota) return { ok: false, error: '存储配额不足' };
      try { return fn(sys.fs); } catch (e) { return { ok: false, error: e.message }; }
    }
    readProgram(sys, path) {
      const r = sys.fs.read(path);
      if (!r.ok) throw new Error('程序不存在: ' + path);
      return r.content;
    }
    procOf(sys, pid) { return sys.processes.find((p) => p.id === pid); }
    chargeMem(sys, proc) {
      const size = proc.prog ? (proc.prog.consts.length * 8 + proc.prog.main.code.length * 12 + 4096) : 4096;
      proc.memory = size;
      sys.memUsed += size;
    }

    /* ---------------- 用户程序系统调用（转交内核） ---------------- */
    userSyscall(sys, code, args, proc) {
      const tag = ++proc.tags;
      if (this.opts.trace) this.log('[请求] ' + proc.name + ' #' + tag + ' ' + code + ' ' + String(args || '').slice(0, 120));
      sys.pendingEvents.push({ kind: 'syscall', pid: proc.id, tag, code, args: args || '' });
      proc.pendingTag = tag;
      proc.waitTag = tag;
      proc.state = 'waiting';
      return { tag };
    }

    /* ---------------- 逻辑步 ---------------- */
    step() {
      if (this.paused) return;
      this.stepCount++;
      const dt = STEP_MS;
      // 1. 时间推进（父先子后，逐级乘以速率）
      for (const sys of this.systems.values()) {
        if (sys.state !== 'running') continue;
        const parent = sys.parentId ? this.systems.get(sys.parentId) : null;
        const parentAdvance = parent && parent.state === 'running' ? dt * parent.rate : (parent ? 0 : dt * sys.rate);
        sys.time += parentAdvance * sys.rate;
      }
      // 2. 根系统：宿主应用工作 + 为子树预留的份额
      const root = this.root;
      root.budgetGrant = root.budgetTotal;
      root.childPool = Math.floor(root.budgetGrant * CHILD_SHARE);
      root.budgetUsed = 0;
      if (root.state === 'running' && this.opts.onRootStep) {
        const used = this.opts.onRootStep(root, root.budgetTotal) || 0;
        root.budgetUsed += used;
      }
      // 3. 子系统：逐层拨付，兄弟共享父系统为子树保留的额度
      const order = Array.from(this.systems.values()).filter((s) => s.parentId !== null);
      for (const sys of order) {
        if (sys.state !== 'running') continue;
        const parent = this.systems.get(sys.parentId);
        if (!parent) continue;
        const sibs = this.childrenOf(parent.id).filter((s) => s.state === 'running');
        const share = sibs.length ? Math.floor(Math.max(0, parent.childPool) / sibs.length) : 0;
        let allowance = Math.min(sys.budgetTotal, share);
        if (parent.state !== 'running') allowance = 0;
        sys.budgetGrant = allowance;
        sys.childPool = Math.floor(allowance * CHILD_SHARE);
        sys.budgetUsed = 0;
        parent.childPool = Math.max(0, parent.childPool - share);
        this.runKernel(sys, allowance, parent);
        parent.budgetUsed += sys.budgetUsed;   // 后代工作计入承载进程
      }
      // 4. 唤醒时间到点的等待进程
      for (const sys of this.systems.values()) {
        for (const p of sys.processes) {
          if (p.wakeAt !== null && p.wakeAt !== undefined && sys.time >= p.wakeAt) {
            p.wakeAt = null;
            p.waitFlag = false;
            p.refresh(sys);
          }
        }
      }
    }
    runKernel(sys, allowance, parent) {
      const kp = sys.kernelProc;
      if (!kp || kp.state === 'error' || kp.state === 'done') return;
      if (kp.state === 'parked' || kp.state === 'waiting') kp.state = 'ready';
      const own = Math.max(500, allowance - sys.childPool);   // 本系统自身可用额度
      this.charge = { allowance: own, parentRemaining: own, parent };
      const self = this;
      const ctx = this.makeCtx(kp);
      ctx.svc = (code, args) => {
        const before = this.charge.allowance;
        try {
          return this.kernelService(sys, code, args, kp);
        } finally {
          const used = Math.max(0, before - this.charge.allowance);
          this.charge.allowance = before;
          this.charge.parentRemaining -= used;
        }
      };
      let r;
      if (kp.saved) {
        ctx.globals = kp.saved.globals;
        r = NSL.resume(kp.prog, kp.saved, ctx, Math.max(1, own));
      } else {
        r = NSL.execute(kp.prog, ctx);
      }
      kp.saved = { globals: r.globals, frames: r.frames, stack: r.stack };
      kp.consumed += r.consumed;
      sys.budgetUsed += r.consumed;
      if (r.status === 'error') {
        kp.state = 'error'; kp.error = r.error;
        sys.state = 'error';
        this.log('内核错误 (' + sys.id + '): ' + r.error);
      } else if (r.status === 'done') {
        kp.state = 'done';
      }
      this.charge = null;
    }

  /* ================= 快照 / 恢复 / 分叉 ================= */
    /* 序列化一个进程：含字节码现场（函数名 + pc + 局部变量）与全局变量 */
    serializeProc(p) {
      return {
        id: p.id, ownerId: p.sys.id, name: p.name, role: p.role, path: p.path,
        state: p.state, consumed: p.consumed, remaining: p.remaining, error: p.error,
        memory: p.memory, tags: p.tags, inbox: p.inbox.slice(),
        waitTag: p.waitTag, pendingTag: p.pendingTag, wakeAt: p.wakeAt, waitFlag: p.waitFlag,
        launchArgs: p.launchArgs,
        prog: p.prog ? { consts: p.prog.consts, names: p.prog.names, main: p.prog.main, funcs: p.prog.funcs } : null,
        saved: p.saved ? {
          globals: p.saved.globals,
          stack: p.saved.stack,
          frames: (p.saved.frames || []).map((f) => ({ fn: f.fn && f.fn.name, pc: f.pc, locals: f.locals, base: f.base })),
        } : null,
      };
    }
    deserializeProc(sys, d, idOverride) {
      const prog = d.prog ? {
        consts: d.prog.consts, names: d.prog.names, main: d.prog.main,
        funcs: d.prog.funcs.map((f) => ({ name: f.name, nlocals: f.nlocals, code: f.code })),
      } : null;
      if (prog) prog.funcNames = prog.funcs.map((f) => f.name);
      const p = new Proc(sys, d.name, d.role, prog, d.path);
      p.id = (idOverride !== undefined && idOverride !== null) ? idOverride : d.id;
      p.state = d.state === 'parked' ? 'ready' : d.state;
      p.consumed = d.consumed || 0;
      p.remaining = d.remaining || 0;
      p.error = d.error || null;
      p.memory = d.memory || 0;
      p.tags = d.tags || 0;
      p.inbox = (d.inbox || []).slice();
      p.waitTag = d.waitTag === undefined ? null : d.waitTag;
      p.pendingTag = d.pendingTag === undefined ? null : d.pendingTag;
      p.wakeAt = d.wakeAt === undefined ? null : d.wakeAt;
      p.waitFlag = !!d.waitFlag;
      p.launchArgs = d.launchArgs || '';
      if (d.saved && prog) {
        const byName = new Map(prog.funcs.map((f) => [f.name, f]));
        const frames = (d.saved.frames || []).map((f) => ({
          fn: byName.get(f.fn) || prog.funcs[0], pc: f.pc, locals: f.locals, base: f.base,
        }));
        p.saved = { globals: d.saved.globals, frames, stack: d.saved.stack };
      }
      return p;
    }
    /* 采集一棵子树 */
    collect(sys, out) {
      const rec = {
        id: sys.id, parentId: sys.parentId, name: sys.name, systemName: sys.systemName,
        depth: sys.depth, state: sys.state, time: sys.time, rate: sys.rate,
        budgetTotal: sys.budgetTotal, memQuota: sys.memQuota, storageQuota: sys.storageQuota,
        accent: sys.accent, scale: sys.scale, wallpaper: sys.wallpaper,
        fs: sys.fs.dump(),
        windows: sys.windows, widgets: sys.widgets || {}, focusWindow: sys.focusWindow,
        notifications: sys.notifications.slice(0, 12),
        processes: sys.processes.map((p) => this.serializeProc(p)),
        scene: Array.from(sys.sceneCache.entries()),
        charts: Array.from(sys.chartSubs.entries()),
        projections: Array.from(sys.projectionWindows.entries()),
        children: [],
      };
      out.push(rec);
      for (const c of sys.children) this.collect(c, rec.children);
      return rec;
    }
    snapshot(sys) {
      const snap = { format: 'nested-os-snapshot-1', at: Date.now(), systems: [] };
      this.collect(sys, snap.systems);
      return snap;
    }
    findRec(list, id) {
      for (const r of list || []) {
        if (r.id === id) return r;
        const hit = this.findRec(r.children, id);
        if (hit) return hit;
      }
      return null;
    }
    /* 先建立子树结构（实例身份），再恢复状态 */
    buildTree(sys, rec) {
      for (const cd of rec.children || []) {
        let child = this.systems.get(cd.id);
        if (!child) {
          child = new System(this, cd.id, sys.id, cd.name || cd.id, cd.depth || (sys.depth + 1));
          this.systems.set(cd.id, child);
          sys.children.push(child);
          this.seedSystemFiles(child, false);
        }
        child.parentId = sys.id;
        this.buildTree(child, cd);
      }
    }
    /* 把一份快照记录装回某个系统实例 */
    apply(sys, rec, opts) {
      const o = opts || {};
      this.buildTree(sys, rec);
      sys.name = rec.name || sys.name;
      sys.systemName = rec.systemName || sys.systemName;
      sys.state = rec.state === 'stopped' ? 'running' : rec.state;
      sys.time = rec.time || 0;
      sys.rate = rec.rate || 1;
      sys.budgetTotal = rec.budgetTotal || sys.budgetTotal;
      sys.memQuota = rec.memQuota || sys.memQuota;
      sys.storageQuota = rec.storageQuota || sys.storageQuota;
      sys.accent = rec.accent || sys.accent;
      sys.scale = rec.scale || sys.scale;
      sys.wallpaper = rec.wallpaper !== undefined ? rec.wallpaper : sys.wallpaper;
      if (rec.fs) sys.fs.restoreDump(rec.fs);
      sys.windows = (rec.windows || []).slice();
      sys.widgets = rec.widgets || {};
      sys.focusWindow = rec.focusWindow || null;
      sys.notifications = (rec.notifications || []).slice();
      sys.sceneCache = new Map(rec.scene || []);
      sys.chartSubs = new Map(rec.charts || []);
      sys.projectionWindows = new Map(rec.projections || []);
      sys.processes = [];
      sys.memUsed = 0;
      for (const pd of rec.processes || []) {
        const owner = this.systems.get(pd.ownerId) || sys;
        let idOverride;
        if (pd.role === 'kernel' && o.newKernelIds) idOverride = o.newKernelIds.get(pd.ownerId);
        const p = this.deserializeProc(owner, pd, idOverride);
        sys.processes.push(p);
        sys.memUsed += p.memory || 0;
        if (p.role === 'kernel') owner.kernelProc = p;
      }
      for (const cd of rec.children || []) {
        const child = this.systems.get(cd.id);
        if (child) this.apply(child, cd, o);
      }
    }
    restore(sys, snap) {
      if (!snap || !snap.systems || !snap.systems.length) throw new Error('快照内容为空');
      const rec = this.findRec(snap.systems, sys.id) || snap.systems[0];
      const ids = new Map();
      for (const r of rec.children || []) ids.set(r.id, 'inner-' + (++this.innerCounter));
      this.apply(sys, rec, { newKernelIds: ids });
      this.log('已恢复 ' + sys.id + ' 的快照');
      return true;
    }
    fork(sys, snap) {
      const src = snap || this.snapshot(sys);
      const rec = this.findRec(src.systems, sys.id);
      if (!rec) throw new Error('快照中没有 ' + sys.id);
      const parent = sys.parentId ? this.systems.get(sys.parentId) : this.root;
      const idMap = new Map();
      const walk = (r) => {
        idMap.set(r.id, 'inner-' + (++this.innerCounter));
        for (const c of r.children || []) walk(c);
      };
      walk(rec);
      const clone = JSON.parse(JSON.stringify(rec));
      const remap = (r) => {
        r.id = idMap.get(r.id);
        if (r.parentId && idMap.has(r.parentId)) r.parentId = idMap.get(r.parentId);
        for (const p of r.processes || []) {
          if (idMap.has(p.ownerId)) p.ownerId = idMap.get(p.ownerId);
        }
        for (const c of r.children || []) remap(c);
      };
      remap(clone);
      const makeTree = (r, p) => {
        const child = new System(this, r.id, p.id, r.name, r.depth);
        this.systems.set(r.id, child);
        p.children.push(child);
        this.seedSystemFiles(child, false);
        for (const c of r.children || []) makeTree(c, child);
        return child;
      };
      const root = makeTree(clone, parent);
      const newKernelIds = new Map();
      const collectKernel = (r) => {
        for (const p of r.processes || []) {
          if (p.role === 'kernel') newKernelIds.set(p.ownerId, ++pidSeq);
        }
        for (const c of r.children || []) collectKernel(c);
      };
      collectKernel(clone);
      this.apply(root, clone, { newKernelIds });
      for (const conn of Array.from(this.chartConns.values())) {
        if (idMap.has(conn.systemId)) {
          const nc = Object.assign({}, conn, { id: ++connSeq, systemId: idMap.get(conn.systemId), state: 'reconnect' });
          this.chartConns.set(nc.id, nc);
        }
      }
      this.log('已从 ' + sys.id + ' 分叉出 ' + root.id);
      return root;
    }
  }

  NOS.Runtime = Runtime;
  NOS.System = System;
  NOS.Proc = Proc;
  NOS.STEP_MS = STEP_MS;
  NOS.ROOT_BUDGET = ROOT_BUDGET;
  NOS.CHILD_BUDGET = CHILD_BUDGET;
})(typeof globalThis !== 'undefined' ? globalThis : this);
