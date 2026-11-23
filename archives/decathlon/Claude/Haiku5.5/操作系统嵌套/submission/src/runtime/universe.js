'use strict';
/*
 * 系统树（宇宙）模型。
 *
 * 每个系统 (Sys) 包含：一份内核程序（存放在父系统的 /Kernels/ 下）、若干用户进程、
 * 自己的磁盘（键值存储，文件系统由内核程序在其上实现）、显示面、收件箱和虚拟时钟。
 * 宿主只提供：执行虚拟机、计量预算、磁盘配额、显示提交、外部输入和几项设备服务。
 *
 * 预算：每个逻辑步内，根系统拿到 cfg.budget 单位的预算；内核把它分给自己的进程与直属子系统（承载进程）。
 * 子系统的承载进程在父系统的调度中运行，子系统内部的消耗都从同一份计量中扣除，因此逐级受限。
 */
const NOS = require('./nos-vm.js');
const { makeStdlib } = require('./nos-stdlib.js');

const DT = 1 / 60;            // 固定逻辑步（父系统时间，秒）
const STEP_SEC = 0.1;         // 单步的固定时间长度（秒）
const COMPILE_BUDGET = 5e7;   // 编译器单次运行的上限（保护性）

function fnv(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

function cloneJSON(v) {
  return v === undefined ? null : JSON.parse(JSON.stringify(v));
}

function pathSize(text) {
  return text ? text.length : 0;
}

class Sys {
  constructor(u, id, parent) {
    this.u = u;
    this.id = id;
    this.parent = parent || null;
    this.kids = [];
    this.cfg = { budget: 60000, storQuota: 64 * 1024 * 1024 };
    this.rate = 1;
    this.clock = 0;
    this.paused = false;
    this.stepUsed = 0;
    this.lastUsed = 0;
    this.stat = { total: 0, self: 0, procs: 0, kids: 0 };
    this.disk = {};
    this.diskBytes = 0;
    this.kernelSrc = '';
    this.kernel = null;
    this.kernelErr = null;
    this.cpu = [];
    this.surf = {};
    this.surfV = 0;
    this.res = {};
    this.inbox = [];
    this.rngState = 0x2545f491;
    this.compilerImage = null;
    this.compilerKey = '';
    this.grantLog = [];
    this.stepping = false;
    this.grave = [];
  }

  get name() {
    return this.id;
  }

  frozen() {
    if (this.paused && !this.stepping) return true;
    return this.parent ? this.parent.frozen() : false;
  }

  rand() {
    // xorshift32，状态随系统保存，因此快照可以复现随机序列
    let x = this.rngState;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    this.rngState = x;
    return x / 4294967296;
  }

  setDisk(key, value) {
    const old = this.disk[key];
    const next = this.diskBytes - pathSize(old) + pathSize(value);
    if (value !== undefined && next > this.cfg.storQuota) {
      return '存储配额不足（需要 ' + Math.ceil(next / 1024) + ' KB，配额 ' + Math.ceil(this.cfg.storQuota / 1024) + ' KB）';
    }
    this.disk[key] = value;
    this.diskBytes = next;
    this.diskDirty = true;
    return true;
  }

  delDisk(key) {
    if (key in this.disk) {
      this.diskBytes -= pathSize(this.disk[key]);
      delete this.disk[key];
      this.diskDirty = true;
    }
  }

  // 按本系统的编译器编译源码；结果缓存（编译器与源码都相同则复用）。
  compile(src) {
    if (!this.compilerImage) return { ok: false, error: '系统缺少编译器（/System/compiler.nobj）' };
    const key = this.compilerKey + ':' + fnv(src) + ':' + src.length;
    const hit = this.u.compileCache.get(key);
    if (hit) return { ok: true, image: hit, cost: 0 };
    const m = new NOS.Machine(this.compilerImage, { natives: this.u.stdlib, env: {} });
    m.args = [src];
    const meter = { left: COMPILE_BUDGET };
    const st = m.run(meter);
    if (st !== 'exit') {
      const e = m.error || { message: '编译器异常', line: 0 };
      return { ok: false, error: e.message };
    }
    const r = m.result;
    if (!r || typeof r !== 'object' || !r.code) {
      return { ok: false, error: '编译器没有返回镜像' };
    }
    this.u.compileCache.set(key, r);
    return { ok: true, image: r, cost: COMPILE_BUDGET - meter.left };
  }

  kernelImage() {
    return this.compile(this.kernelSrc);
  }

  // 启动或重启内核：载入内核源文件并重新开始运行。进程与显示清空，磁盘保留。
  bootKernel(kernelSrc) {
    if (kernelSrc !== undefined) this.kernelSrc = kernelSrc;
    this.cpu = [];
    this.surf = {};
    this.inbox = [];
    this.kernelErr = null;
    this.clock = 0;
    const r = this.kernelImage();
    if (!r.ok) {
      this.kernelErr = { message: '内核无法编译：' + r.error, line: 0 };
      this.kernel = null;
      return false;
    }
    this.kernel = new NOS.Machine(r.image, { natives: this.u.stdlib, privs: this.u.kernelPrivs(this), priv: true, env: this.processEnv() });
    return true;
  }

  processEnv() {
    return {
      rand: () => this.rand(),
      measure: (text, size) => this.u.host.measure(text, size),
      sys: this,
    };
  }

  // 运行内核（及其承载的全部后代）。meter 为父系统拨付的计量。
  runKernel(meter, force) {
    if (!this.kernel || this.kernelErr) return 'stopped';
    if (!force && this.frozen()) return 'frozen';
    const before = meter.left;
    const st = this.kernel.run(meter);
    // 内核空闲时剩余的预算退还给父系统（空闲不计费）
    if (this.kernel.idleLeft !== undefined) {
      meter.left = this.kernel.idleLeft;
      this.kernel.idleLeft = undefined;
      this.idled = true;
    }
    this.stat.total += before - meter.left;
    if (st === 'error') {
      this.kernelErr = { message: this.kernel.error.message, line: this.kernel.error.line };
      this.u.emit({ type: 'kernel-error', sys: this.id, error: this.kernelErr });
    } else if (st === 'exit') {
      this.kernelErr = { message: '内核已经退出', line: 0 };
    }
    return st;
  }

  // 运行一个直属子系统的承载份额：返回实际消耗的单位。
  runChildSlice(child, sub, q) {
    if (child.kernelErr || !child.kernel) return { reason: 'frozen', used: 0 };
    if (child.frozen()) return { reason: 'frozen', used: 0 };
    const allow = Math.min(q, sub.left, child.cfg.budget - child.stepUsed);
    if (allow <= 0) return { reason: 'budget', used: 0 };
    const m = { left: allow };
    child.idled = false;
    child.runKernel(m, false);
    const used = allow - m.left;
    child.stepUsed += used;
    child.lastUsed += used;
    sub.left -= used;
    if (child.kernelErr) return { reason: 'frozen', used };
    return { reason: child.idled ? 'idle' : 'quantum', used };
  }

  info() {
    return {
      id: this.id,
      parentId: this.parent ? this.parent.id : null,
      name: this.id,
      state: this.kernelErr ? 'error' : this.frozen() ? (this.paused ? 'paused' : 'suspended') : 'running',
      paused: this.paused,
      rate: this.rate,
      clock: this.clock,
      budget: this.cfg.budget,
      storQuota: this.cfg.storQuota,
      diskBytes: this.diskBytes,
      lastUsed: this.lastUsed,
      stat: { ...this.stat, self: this.stat.total - this.stat.procs - this.stat.kids },
      kernelErr: this.kernelErr,
    };
  }

  // ---- 快照 ----
  toJSON() {
    return {
      id: this.id,
      rate: this.rate,
      clock: this.clock,
      paused: this.paused,
      cfg: { ...this.cfg },
      stat: { ...this.stat },
      rng: this.rngState,
      surfV: this.surfV,
      grave: cloneJSON(this.grave),
      disk: cloneJSON(this.disk),
      diskBytes: this.diskBytes,
      kernelSrc: this.kernelSrc,
      kernelErr: this.kernelErr,
      kernel: this.kernel ? this.kernel.snapshot() : null,
      cpu: this.cpu.map((p, pid) => {
        if (!p) return null;
        if (p.carrier) return { pid, carrier: p.carrier };
        return { pid, image: p.image, machine: p.snapshot(), name: p.name };
      }),
      surf: cloneJSON(this.surf),
      res: cloneJSON(this.res),
      inbox: cloneJSON(this.inbox),
      kids: this.kids.map((k) => k.toJSON()),
    };
  }
}

class Universe {
  // host: { measure(text,size), emit(event), web(sys, op, arg), dialog(...) }
  constructor(host) {
    this.host = host || {};
    this.systems = new Map();
    this.compileCache = new Map();
    this.stdlib = makeStdlib();
    this.processNatives = Object.assign({}, this.stdlib, require('./sim-natives.js').makeNatives());
    this.processNatives.measure = (a, vm) => (vm.env.measure ? vm.env.measure(String(a[0]), Number(a[1]) || 12) : String(a[0]).length * (Number(a[1]) || 12) * 0.6);
    this.stepNo = 0;
    this.seq = 0;
    this.root = null;
    this.drag = null;
    this.template = {};     // 路径 -> 文本（子系统的初始文件）
    this.rootTemplate = {}; // 只给根系统的文件
    this.events = [];
  }

  emit(ev) {
    this.events.push(ev);
    if (this.events.length > 200) this.events.splice(0, this.events.length - 200);
    if (this.host.emit) this.host.emit(ev);
  }

  get(id) {
    return this.systems.get(id) || null;
  }

  nextId() {
    this.seq += 1;
    return 'inner-' + this.seq;
  }

  preorder(fn, sys = this.root) {
    if (!sys) return;
    fn(sys);
    for (const k of sys.kids) this.preorder(fn, k);
  }

  // 创建系统并写入初始磁盘（模板文件）。磁盘与内核由调用者决定。
  newSys(id, parent, files) {
    const s = new Sys(this, id, parent);
    this.systems.set(id, s);
    if (parent) parent.kids.push(s);
    const idx = { '/': { t: 'd', s: 0, m: 0 } };
    for (const path of Object.keys(files)) {
      const parts = path.split('/').filter(Boolean);
      let dir = '';
      for (let i = 0; i < parts.length - 1; i++) {
        dir += '/' + parts[i];
        if (!idx[dir]) idx[dir] = { t: 'd', s: 0, m: 0 };
      }
      idx[path] = { t: 'f', s: files[path].length, m: 0 };
      s.setDisk('f:' + path, files[path]);
    }
    for (const d of ['/Documents', '/Downloads', '/Trash', '/Demo', '/System', '/Kernels', '/Snapshots']) {
      if (!idx[d]) idx[d] = { t: 'd', s: 0, m: 0 };
    }
    s.setDisk('fsidx', JSON.stringify(idx));
    s.compilerImage = this.compilerFromDisk(s);
    s.compilerKey = s.compilerImage ? fnv(s.disk['f:/System/compiler.nobj'] || '') : '';
    return s;
  }

  compilerFromDisk(s) {
    const text = s.disk['f:/System/compiler.nobj'];
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  makeRoot(rootFiles, kernelSrc) {
    const files = Object.assign({}, this.template, rootFiles);
    const r = this.newSys('outer', null, files);
    r.cfg = { budget: 120000, storQuota: 96 * 1024 * 1024 };
    this.root = r;
    r.bootKernel(kernelSrc);
    return r;
  }

  // 创建子系统：内核源文件由调用者（父系统内核）已经写入父磁盘，这里只创建实例并启动。
  makeChild(parent, id, kernelSrc, files) {
    const c = this.newSys(id, parent, files || this.template);
    c.cfg = { budget: 60000, storQuota: 48 * 1024 * 1024 };
    c.bootKernel(kernelSrc);
    return c;
  }

  // 删除子系统及其后代。
  removeSys(s) {
    for (const k of [...s.kids]) this.removeSys(k);
    this.systems.delete(s.id);
    if (s.parent) s.parent.kids = s.parent.kids.filter((x) => x !== s);
    s.kernel = null;
    s.cpu = [];
  }

  // 一个逻辑步：推进时间，再让根系统的内核运行（它会把预算逐级拨付下去）。
  tick() {
    this.stepNo += 1;
    this.preorder((s) => {
      s.stepUsed = 0;
      s.lastUsed = 0;
      if (!s.frozen()) s.clock += DT * s.rate;
    });
    const meter = { left: this.root.cfg.budget };
    this.root.runKernel(meter, false);
    this.root.lastUsed = this.root.cfg.budget - meter.left;
  }

  // 单步：父系统执行一个固定逻辑时间步，覆盖暂停的直属子系统及其后代。
  singleStep(child) {
    if (!child.parent || child.parent.frozen()) return { ok: false, error: '父系统或其祖先处于暂停，不能单步' };
    child.stepUsed = 0;
    const frozenBelow = (s) => {
      for (let x = s; x && x !== child; x = x.parent) if (x.paused) return true;
      return false;
    };
    this.preorder((s) => { if (!frozenBelow(s)) s.clock += STEP_SEC * s.rate; }, child);
    const meter = { left: child.cfg.budget };
    child.stepping = true;
    try {
      child.runKernel(meter, true);
    } finally {
      child.stepping = false;
    }
    const used = child.cfg.budget - meter.left;
    child.parent.stat.kids += used;
    child.parent.stat.total += used;
    child.stepUsed = used;
    return { ok: true, used };
  }

  setPaused(sys, v) {
    sys.paused = !!v;
    if (sys.parent && sys.parent.kernel) {
      sys.parent.inbox.push({ to: 'kernel', type: 'kid', id: sys.id, state: sys.paused ? 'frozen' : 'ready' });
    }
  }

  // ---- 内核特权调用 ----
  kernelPrivs(sys) {
    const u = this;
    return {
      priv_clock: () => sys.clock,
      priv_step: () => u.stepNo,
      priv_idle: (a, vm) => {
        if (vm.meter) { vm.idleLeft = vm.meter.left; vm.meter.left = 0; }
        return null;
      },
      priv_run: (a, vm) => {
        const pid = a[0];
        const q = a[1];
        const p = sys.cpu[pid];
        if (!p) return { reason: 'none', used: 0 };
        const meter = vm.meter;
        const sub = { left: Math.min(q, meter.left) };
        if (p.carrier) {
          const child = u.get(p.carrier);
          if (!child) return { reason: 'none', used: 0 };
          const r = sys.runChildSlice(child, sub, q);
          meter.left -= r.used;
          sys.stat.kids += r.used;
          return r;
        }
        const before = sub.left;
        const st = p.run(sub);
        const used = before - sub.left;
        meter.left -= used;
        sys.stat.procs += used;
        if (st === 'quantum') return { reason: 'quantum', used };
        if (st === 'trap') return { reason: 'trap', used, name: p.trap.name, args: p.trap.args };
        if (st === 'exit') return { reason: 'exit', used, result: p.result };
        return { reason: 'error', used, error: p.error };
      },
      priv_resume: (a) => {
        const p = sys.cpu[a[0]];
        if (p && !p.carrier) p.resume(a[1]);
        return null;
      },
      priv_proc_new: (a, vm) => {
        const pid = a[0];
        const r = sys.compile(a[1]);
        if (vm.meter) vm.meter.left -= r.cost || 0;
        if (!r.ok) return { ok: false, error: r.error };
        const m = new NOS.Machine(r.image, { natives: u.processNatives, env: sys.processEnv(), args: a[2] || [], name: pid });
        m.image = r.image;
        sys.cpu[pid] = m;
        return { ok: true };
      },
      priv_logs: (a) => {
        const p = sys.cpu[a[0]];
        if (p && p.logs) return p.logs.slice(-60);
        for (let i = sys.grave.length - 1; i >= 0; i--) {
          if (sys.grave[i].pid === a[0]) return sys.grave[i].logs.slice(-60);
        }
        return [];
      },
      priv_proc_free: (a) => {
        const p = sys.cpu[a[0]];
        if (p && p.logs && p.logs.length) {
          sys.grave.push({ pid: a[0], name: p.name, logs: p.logs.slice(-40) });
          if (sys.grave.length > 60) sys.grave.splice(0, sys.grave.length - 60);
        }
        sys.cpu[a[0]] = null;
        return null;
      },
      priv_carrier_new: (a) => {
        sys.cpu[a[0]] = { carrier: a[1] };
        return null;
      },
      priv_disk_get: (a, vm) => {
        const v = sys.disk[a[0]];
        if (v === undefined) return null;
        if (vm.charge) vm.charge(Math.ceil(v.length / 256));
        return v;
      },
      priv_disk_put: (a, vm) => {
        const r = sys.setDisk(a[0], a[1]);
        if (vm.charge) vm.charge(Math.ceil(String(a[1] || '').length / 256));
        return r;
      },
      priv_disk_del: (a) => { sys.delDisk(a[0]); return null; },
      priv_disk_move: (a, vm) => {
        const v = sys.disk[a[0]];
        if (v === undefined) return false;
        sys.delDisk(a[0]);
        sys.setDisk(a[1], v);
        if (vm.charge) vm.charge(Math.ceil(v.length / 1024));
        return true;
      },
      priv_submit: (a, vm) => {
        const nodes = cloneJSON(a[1] || []);
        sys.surfV += 1;
        sys.surf[a[0]] = { v: sys.surfV, nodes };
        if (vm.charge) vm.charge(1 + Math.ceil(nodes.length / 8));
        u.host.dirty && u.host.dirty();
        return null;
      },
      priv_inbox_pop: () => (sys.inbox.length ? sys.inbox.shift() : null),
      priv_post: (a) => {
        const t = u.get(a[0]);
        if (!t) return false;
        t.inbox.push(cloneJSON(a[1]));
        return true;
      },
      priv_drag_begin: (a) => { u.drag = { sys: sys.id, payload: a[0] }; u.host.dragBegin && u.host.dragBegin(u.drag); return null; },
      priv_drag_end: () => { u.drag = null; u.host.dragEnd && u.host.dragEnd(); return null; },
      priv_kids: () => sys.kids.map((k) => k.id),
      priv_kid_info: () => sys.kids.map((k) => k.info()),
      priv_child_new: (a) => {
        const src = a[0];
        const id = u.nextId();
        const r = sys.compile(src);
        if (!r.ok) return { ok: false, value: null, error: '子系统内核无法编译：' + r.error };
        const files = Object.assign({}, u.template);
        const c = u.makeChild(sys, id, src, files);
        if (c.kernelErr) return { ok: false, value: null, error: c.kernelErr.message };
        return { ok: true, value: id, error: null };
      },
      priv_child_ctl: (a) => {
        const [id, action, arg] = a;
        const c = u.get(id);
        if (!c || c.parent !== sys) return { ok: false, value: null, error: '找不到子系统 ' + id };
        if (action === 'pause') { u.setPaused(c, true); return { ok: true, value: true, error: null }; }
        if (action === 'resume') { u.setPaused(c, false); return { ok: true, value: true, error: null }; }
        if (action === 'step') { const r = u.singleStep(c); return { ok: r.ok, value: r.used || 0, error: r.error || null }; }
        if (action === 'rate') {
          const v = Number(arg);
          if (!(v > 0 && v <= 8)) return { ok: false, value: null, error: '速率必须在 0 到 8 之间' };
          c.rate = v;
          return { ok: true, value: v, error: null };
        }
        if (action === 'budget') {
          const v = Math.max(0, Math.min(2000000, Math.floor(Number(arg))));
          c.cfg.budget = v;
          return { ok: true, value: v, error: null };
        }
        if (action === 'storage') {
          const v = Math.max(64 * 1024, Math.floor(Number(arg)));
          c.cfg.storQuota = v;
          return { ok: true, value: v, error: null };
        }
        if (action === 'restart') {
          const src = sys.disk['f:/Kernels/' + id + '.ns'];
          if (src === undefined) return { ok: false, value: null, error: '找不到内核源文件' };
          u.restartSubtree(c, src);
          u.setPaused(c, false);
          return { ok: true, value: id, error: null };
        }
        if (action === 'close') {
          u.removeSys(c);
          return { ok: true, value: id, error: null };
        }
        return { ok: false, value: null, error: '未知的操作 ' + action };
      },
      priv_child_snapshot: (a) => JSON.stringify(u.snapshotSys(u.get(a[0]))),
      priv_child_restore: (a) => {
        let snap;
        try { snap = JSON.parse(a[0]); } catch (e) { return { ok: false, value: null, error: '快照文件已损坏' }; }
        const r = u.restoreSys(sys, snap, !!a[1]);
        if (!r.ok) return { ok: false, value: null, error: r.error };
        return { ok: true, value: r.id, error: null };
      },
      priv_sysinfo: () => ({ ...sys.info(), disk: sys.diskBytes, kids: sys.kids.map((k) => k.id), frozen: sys.frozen() }),
      priv_budget_set: (a) => {
        const k = a[0];
        const v = Number(a[1]);
        if (!isFinite(v) || v < 0) return { ok: false, value: null, error: '数值无效' };
        if (k === 'budget') sys.cfg.budget = Math.floor(v);
        else if (k === 'storQuota') sys.cfg.storQuota = Math.floor(v);
        else return { ok: false, value: null, error: '未知的配额项' };
        return { ok: true, value: v, error: null };
      },
      priv_ancestors: () => {
        const out = [];
        for (let p = sys.parent; p; p = p.parent) out.push({ id: p.id, name: p.id });
        return out;
      },
      priv_frozen: (a) => {
        const t = u.get(a[0]);
        return t ? t.frozen() : true;
      },
      priv_res_put: (a) => { sys.res[a[0]] = cloneJSON(a[1]); return true; },
      priv_web: (a) => (u.host.web ? u.host.web(sys, a[0], a[1]) : null),
      priv_host: (a) => (u.host.dialog ? u.host.dialog(sys, a[0], a[1], a[2]) : null),
    };
  }

  // ---- 子树重启：重新载入内核源文件，按保留的结构从初始状态重新启动 ----
  restartSubtree(s, src) {
    const kids = [...s.kids];
    s.bootKernel(src);
    s.rngState = 0x2545f491;
    s.stat = { total: 0, self: 0, procs: 0, kids: 0 };
    for (const k of kids) {
      const ksrc = s.disk['f:/Kernels/' + k.id + '.ns'];
      if (ksrc !== undefined) this.restartSubtree(k, ksrc);
    }
  }

  // ---- 快照 / 恢复 / 分叉 ----
  snapshotSys(s) {
    if (!s) return null;
    const snap = s.toJSON();
    snap.format = 'nested-os-snapshot';
    snap.version = 1;
    return snap;
  }

  restoreSys(parent, snap, fork) {
    if (!snap || snap.format !== 'nested-os-snapshot') return { ok: false, error: '不是有效的快照' };
    let data = snap;
    if (fork) {
      data = this.remapIds(snap, new Map());
    } else {
      // 恢复到原实例：先关闭同名的现有实例（包括其后代）
      const old = this.get(snap.id);
      if (old) this.removeSys(old);
      this.forEachId(snap, (id) => { const o = this.get(id); if (o) this.removeSys(o); });
    }
    const build = (d, par) => {
      const s = new Sys(this, d.id, par);
      this.systems.set(d.id, s);
      if (par) par.kids.push(s);
      s.rate = d.rate;
      s.clock = d.clock;
      s.paused = d.paused;
      s.cfg = { ...d.cfg };
      s.stat = { ...d.stat };
      s.rngState = d.rng;
      s.surfV = d.surfV;
      s.grave = cloneJSON(d.grave || []);
      s.disk = cloneJSON(d.disk);
      s.diskBytes = d.diskBytes;
      s.res = cloneJSON(d.res || {});
      s.surf = cloneJSON(d.surf || {});
      s.inbox = cloneJSON(d.inbox || []);
      s.compilerImage = this.compilerFromDisk(s);
      s.compilerKey = s.compilerImage ? fnv(s.disk['f:/System/compiler.nobj'] || '') : '';
      s.kernelSrc = d.kernelSrc;
      s.kernelErr = d.kernelErr;
      const kr = s.kernelImage();
      if (kr.ok && d.kernel) {
        s.kernel = new NOS.Machine(kr.image, { natives: this.stdlib, privs: this.kernelPrivs(s), priv: true, env: s.processEnv() });
        s.kernel.restore(d.kernel);
      }
      s.cpu = d.cpu.map((p) => {
        if (!p) return null;
        if (p.carrier) return { carrier: p.carrier };
        const m = new NOS.Machine(p.image, { natives: this.processNatives, env: s.processEnv(), name: p.name });
        m.image = p.image;
        m.restore(p.machine);
        return m;
      });
      for (const kd of d.kids) build(kd, s);
      return s;
    };
    const top = build(data, parent);
    // 让父系统的内核承载恢复后的子系统
    if (parent.kernel) parent.inbox.push({ to: 'kernel', type: 'kid-added', id: top.id });
    return { ok: true, id: top.id };
  }

  forEachId(d, fn) {
    fn(d.id);
    for (const k of d.kids) this.forEachId(k, fn);
  }

  // 分叉：把快照中的全部实例标识换成新的标识（字符串值与键同时替换）
  remapIds(snap, map) {
    const ids = [];
    this.forEachId(snap, (id) => ids.push(id));
    for (const id of ids) map.set(id, this.nextId());
    const walk = (v) => {
      if (typeof v === 'string') return map.has(v) ? map.get(v) : v;
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object') {
        const o = {};
        for (const k of Object.keys(v)) {
          const nk = map.has(k) ? map.get(k) : k;
          o[nk] = walk(v[k]);
        }
        return o;
      }
      return v;
    };
    return walk(snap);
  }

  // 根系统的磁盘（用于宿主持久化）
  rootDiskJSON() {
    return this.root ? JSON.stringify(this.root.disk) : '{}';
  }
}

module.exports = { Universe, Sys, DT, STEP_SEC, fnv };
