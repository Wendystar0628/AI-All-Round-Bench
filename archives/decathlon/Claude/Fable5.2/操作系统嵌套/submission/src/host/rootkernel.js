'use strict';
/*
 * 根系统内核（宿主直接实现）。
 * 根系统的调度、文件、进程表在这里；根系统之下的一切（内核、窗口管理、应用）都是 .nx 程序，
 * 这里只把它们当作承载进程调度，并实现与 kernel.nx 相同的“父系统接口”（boot/tick/gfx/bus/sysid/sysinfo）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./vm.js'));
  else root.RootKernelLib = factory(root.NVM);
})(typeof self !== 'undefined' ? self : this, function (NVM) {
  const STEP_MS = 1000 / 60;
  const BLOCK = { block: true };
  const err = (m) => ({ error: m });
  const isErr = (v) => v && typeof v === 'object' && !Array.isArray(v) && typeof v.error === 'string';

  // ---------------- 根文件系统 ----------------
  class RootFS {
    constructor() { this.nodes = new Map(); this.used = 0; this.listeners = new Set(); this.clock = () => 0; this.limit = () => Infinity; this.onPersist = null; }
    norm(path) {
      if (typeof path !== 'string') return '/';
      const out = [];
      for (const s of path.split('/')) { if (s === '..') out.pop(); else if (s !== '' && s !== '.') out.push(s); }
      return '/' + out.join('/');
    }
    parent(p) { const i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); }
    base(p) { return p.slice(p.lastIndexOf('/') + 1); }
    isDir(p) { return p === '/' || (this.nodes.has(p) && this.nodes.get(p).k === 'd'); }
    isFile(p) { return this.nodes.has(p) && this.nodes.get(p).k === 'f'; }
    exists(p) { return p === '/' || this.nodes.has(p); }
    emit(p) { for (const l of this.listeners) { try { l(p); } catch (e) { console.error(e); } } }
    _set(p, n) { this.nodes.set(p, n); if (this.onPersist) this.onPersist(p, n); }
    _del(p) { this.nodes.delete(p); if (this.onPersist) this.onPersist(p, null); }
    mkdirs(p) {
      if (p === '/' || this.nodes.has(p)) return this.isDir(p);
      if (!this.mkdirs(this.parent(p))) return false;
      this._set(p, { k: 'd', m: this.clock() }); this.emit(p);
      return true;
    }
    write(p, data) {
      if (typeof data !== 'string') return err('只能写入文本');
      if (p === '/' || this.isDir(p)) return err('这是一个目录：' + p);
      const old = this.nodes.has(p) ? this.nodes.get(p).d.length : 0, delta = data.length - old;
      if (delta > 0 && this.used + delta > this.limit()) return err('存储配额不足');
      if (!this.mkdirs(this.parent(p))) return err('上级路径不是目录');
      this._set(p, { k: 'f', d: data, m: this.clock(), h: NVM.hash(data) });
      this.used += delta; this.emit(p);
      return true;
    }
    read(p) { return this.isFile(p) ? this.nodes.get(p).d : err('找不到文件 ' + p); }
    list(dir) {
      if (!this.isDir(dir)) return err('找不到目录 ' + dir);
      const pre = dir === '/' ? '/' : dir + '/', n = pre.length, out = [];
      for (const [p, e] of this.nodes) if (p.length > n && p.startsWith(pre) && p.indexOf('/', n) < 0) out.push({ name: p.slice(n), path: p, dir: e.k === 'd', size: e.k === 'd' ? 0 : e.d.length, m: e.m });
      return out;
    }
    delete(p) {
      if (!this.nodes.has(p)) return err('找不到 ' + p);
      if (this.nodes.get(p).k === 'd') { const pre = p + '/'; for (const [q, e] of [...this.nodes]) if (q.startsWith(pre)) { if (e.k === 'f') this.used -= e.d.length; this._del(q); } }
      else this.used -= this.nodes.get(p).d.length;
      this._del(p); this.emit(p);
      return true;
    }
    rename(a, b) {
      if (!this.nodes.has(a)) return err('找不到 ' + a);
      if (a === b) return true;
      if (this.nodes.has(b)) return err('目标已存在：' + b);
      if (b.startsWith(a + '/')) return err('不能移动到自身内部');
      if (!this.mkdirs(this.parent(b))) return err('上级路径不是目录');
      if (this.nodes.get(a).k === 'd') { const pre = a + '/'; for (const [q, e] of [...this.nodes]) if (q.startsWith(pre)) { this._set(b + '/' + q.slice(pre.length), e); this._del(q); } }
      this._set(b, this.nodes.get(a)); this._del(a); this.emit(a); this.emit(b);
      return true;
    }
    copy(a, b) {
      if (!this.nodes.has(a)) return err('找不到 ' + a);
      if (this.nodes.get(a).k === 'f') return this.write(b, this.nodes.get(a).d);
      if (!this.mkdirs(b)) return err('无法创建目录 ' + b);
      const pre = a + '/';
      for (const [q, e] of [...this.nodes]) if (q.startsWith(pre)) { const t = b + '/' + q.slice(pre.length); if (e.k === 'd') this.mkdirs(t); else { const r = this.write(t, e.d); if (isErr(r)) return r; } }
      return true;
    }
    stat(p) {
      if (p === '/') return { dir: true, size: 0, m: 0 };
      const e = this.nodes.get(p); if (!e) return null;
      return e.k === 'd' ? { dir: true, size: 0, m: e.m } : { dir: false, size: e.d.length, m: e.m, hash: e.h };
    }
    hashOf(p) { const e = this.nodes.get(p); return e && e.k === 'f' ? e.h : null; }
    recount() { let n = 0; for (const e of this.nodes.values()) if (e.k === 'f') n += e.d.length; this.used = n; }
    loadImage(img) { for (const p in img) { const e = img[p]; this.nodes.set(p, e.k === 'd' ? { k: 'd', m: e.m || 0 } : { k: 'f', d: e.d, m: e.m || 0, h: e.h || NVM.hash(e.d) }); } this.recount(); }
  }

  // ---------------- 根内核 ----------------
  class RootKernel {
    constructor(host) {
      this.host = host || {};
      this.fs = new RootFS();
      this.cfg = { budget: 1000000, mem: 512e6, storage: 1024e6, sliceSteps: 2, procMem: 0, childShare: 0.4 };
      this.clock = 0; this.stepN = 0;
      this.procs = []; this.pmap = new Map(); this.pidSeq = 0; this.rq = [];
      this.children = {}; this.cstor = 0; this.sysSeq = 0;
      this.surf = new Map(); this.sidSeq = 0; this.scenes = new Map(); this.scSeq = 0; this.dev = {};
      this.stepUsed = 0; this.kown = 0; this.kownLast = 0; this.kstep = 0; this.sysMem = 0; this.hostMem = 0;
      this.rng = 20240601; this.cacheIdx = {}; this.klog = [];
      this.fs.clock = () => this.clock;
      this.fs.limit = () => this.cfg.storage - this.cstor;
      this.treeDirty = true; this.treeCache = null;
      this.svc = this.addProc({ name: '系统服务', kind: 'svc', app: 'service' });
      this.sc = this.makeSyscalls();
    }
    log(s) { this.klog.push('[' + Math.floor(this.clock) + '] ' + s); if (this.klog.length > 300) this.klog.shift(); }

    // ----- 进程 -----
    addProc(o) {
      const p = Object.assign({ pid: ++this.pidSeq, name: '', path: '', kind: 'vm', ctx: null, st: 1, inq: false, wake: 0, inbox: [], used: 0, last: 0, stepUsed: 0,
        quota: 0, slice: 0, out: [], err: '', exit: null, sys: null, owner: 0, linked: false, args: null, onexit: null, jobs: [], app: '', prev: 0, forced: false, born: this.clock, work: 0 }, o);
      this.procs.push(p); this.pmap.set(p.pid, p);
      return p;
    }
    ready(p) { p.st = 0; if (!p.inq) { p.inq = true; p.slice = Math.floor(this.cfg.budget * this.cfg.sliceSteps); this.rq.push(p); } }
    // 应用服务工作：按规模付费，付清后才提交结果
    work(p, cost, label, commit) {
      if (!p || p.st === 4 || p.st === 5) return false;
      p.jobs.push({ cost: Math.max(1, Math.ceil(cost)), paid: 0, label, commit });
      if (p.st === 1) this.ready(p);
      return true;
    }
    appProc(name, app) { return this.addProc({ name, kind: 'app', app }); }
    endProc(p) { if (!p || p.st === 4 || p.st === 5) return; p.st = 4; p.exit = 0; p.jobs = []; this.prune(); }
    cachePath(path) { return '/System/cache/' + this.fs.hashOf(path) + '.nxb'; }
    cacheValid(cache) {
      if (!this.fs.isFile(cache) || !this.fs.isFile(cache + '.dep')) return false;
      let deps; try { deps = JSON.parse(this.fs.read(cache + '.dep')); } catch (e) { return false; }
      if (!Array.isArray(deps)) return false;
      for (const d of deps) if (this.fs.hashOf(d[0]) !== d[1]) return false;
      return true;
    }
    startProc(p, bin) {
      let c;
      try { c = NVM.create(bin, null); } catch (e) { p.st = 5; p.err = '无法装载：' + e.message; this.procGone(p); return false; }
      p.ctx = c;
      if (p.sys == null && this.cfg.procMem > 0) c.limit = this.cfg.procMem;
      this.ready(p);
      return true;
    }
    exec(path, args, owner, linked) {
      path = this.fs.norm(path);
      if (!this.fs.isFile(path)) return err('找不到程序 ' + path);
      const p = this.addProc({ name: this.fs.base(path), path, args: args == null ? null : args, owner: owner || 0, linked: !!linked, st: 7 });
      if (path.endsWith('.nxb')) { this.startProc(p, this.fs.read(path)); return p; }
      const cache = this.cachePath(path);
      if (this.cacheValid(cache)) { this.startProc(p, this.fs.read(cache)); return p; }
      this.compileFor(path, cache, (ok, msg) => {
        if (p.st !== 7) return;
        if (ok) this.startProc(p, this.fs.read(cache)); else { p.st = 5; p.err = '编译失败：' + msg; this.procGone(p); }
      });
      return p;
    }
    compileFor(src, out, done, self) {
      const C = '/System/compiler.nxb';
      if (!this.fs.isFile(C)) { done(false, '缺少编译器 ' + C); return null; }
      const cp = this.addProc({ name: 'compiler', path: C, args: { src, out, self: !!self }, st: 7, app: 'compile' });
      cp.onexit = (ok) => {
        if (ok && this.fs.isFile(out + '.dep')) {
          try {
            const deps = JSON.parse(this.fs.read(out + '.dep')); deps.push([C, this.fs.hashOf(C)]); this.fs.write(out + '.dep', JSON.stringify(deps));
            const old = this.cacheIdx[src];
            if (old && old !== out && old !== this.cachePath('/System/kernel.nx')) { if (this.fs.exists(old)) this.fs.delete(old); if (this.fs.exists(old + '.dep')) this.fs.delete(old + '.dep'); }
            this.cacheIdx[src] = out;
          } catch (e) { /* 依赖文件损坏时忽略 */ }
        }
        done(ok && this.fs.isFile(out), cp.err);
      };
      this.startProc(cp, this.fs.read(C));
      return cp;
    }
    rebuildCompiler(done) {
      const out = '/System/compiler.next.nxb', C = '/System/compiler.nxb';
      return this.compileFor('/System/compiler.nx', out, (ok, msg) => {
        if (ok) {
          const bad = NVM.checkProgram(this.fs.read(out));
          if (bad) { ok = false; msg = bad; }
          else { this.fs.write('/System/compiler.prev.nxb', this.fs.read(C)); this.fs.write(C, this.fs.read(out)); this.fs.delete(out); if (this.fs.exists(out + '.dep')) this.fs.delete(out + '.dep'); this.log('编译器已更新'); }
        }
        if (done) done(ok, msg);
      }, true);
    }
    wake(p, v) { if (p.st === 1 || p.st === 2 || p.st === 6) { NVM.ret(p.ctx, v); this.ready(p); } }
    deliver(p, msg) {
      if (p.st === 4 || p.st === 5) return false;
      if (p.kind !== 'vm') return false;
      if (p.st === 1 && p.inbox.length === 0 && p.ctx && p.ctx.state === NVM.ST.SYS) { this.wake(p, msg); return true; }
      if (p.inbox.length >= 4096) return false;
      p.inbox.push(msg);
      return true;
    }
    kmsg(pid, body) { const p = this.pmap.get(pid); return p ? this.deliver(p, { from: 0, body }) : false; }
    procRelease(p) {
      for (const [sid, s] of [...this.surf]) if (s.pid === p.pid) { this.gfx('outer', 'free', sid); this.surf.delete(sid); }
      for (const [h, s] of [...this.scenes]) if (s.pid === p.pid) { this.gfx('outer', 'scene_close', h); this.scenes.delete(h); }
      for (const q of this.procs) if (q.owner === p.pid && q.linked && q.st !== 4 && q.st !== 5) this.procKill(q, '随所属应用结束');
      if (p.ctx && p.sys == null) NVM.kill(p.ctx);
      p.inbox = []; p.jobs = [];
      if (this.host.procEnded) this.host.procEnded(p);
    }
    procGone(p) {
      if (p.onexit) { const f = p.onexit; p.onexit = null; f(p.st === 4 && p.exit === 0); }
      if (p.owner > 0) this.kmsg(p.owner, { t: 'child_exit', pid: p.pid, code: p.exit, err: p.err });
      this.prune();
    }
    procExit(p, code) {
      if (p.st === 4 || p.st === 5) return;
      p.st = 4; p.exit = code;
      if (p.sys != null) { const c = this.children[p.sys]; if (c && c.state !== 'stopped') { c.state = 'stopped'; this.gfxReset(this.childMembers(c)); this.sysChanged(c); } }
      this.procRelease(p); this.procGone(p);
    }
    procFault(p, msg) {
      if (p.st === 4 || p.st === 5) return;
      p.st = 5; p.err = String(msg);
      this.log('进程 ' + p.pid + ' ' + p.name + ' 异常：' + p.err);
      if (p.sys != null) { this.childError(this.children[p.sys], p.err); }
      this.procRelease(p); this.procGone(p);
    }
    procKill(p, why) {
      if (!p || p.st === 4 || p.st === 5) return false;
      if (p.sys != null) { this.childStop(this.children[p.sys]); return true; }
      if (p.kind === 'svc') return false;
      p.st = 4; p.exit = -1; p.err = why || '已结束';
      this.procRelease(p); this.procGone(p);
      return true;
    }
    suspend(p) {
      if (!p || p.st === 3 || p.st === 4 || p.st === 5 || p.st === 7) return false;
      if (p.sys != null) return this.childCtl(this.children[p.sys], 'pause');
      p.prev = p.st; p.st = 3;
      return true;
    }
    resume(p) {
      if (!p) return false;
      if (p.sys != null) return this.childCtl(this.children[p.sys], 'resume');
      if (p.st !== 3) return false;
      if (p.kind !== 'vm') { if (p.jobs.length) this.ready(p); else p.st = 1; return true; }
      if (p.prev === 1) { if (p.inbox.length) { NVM.ret(p.ctx, p.inbox.shift()); this.ready(p); } else p.st = 1; }
      else if (p.prev === 2) p.st = 2;
      else this.ready(p);
      return true;
    }
    prune() {
      let dead = this.procs.filter(p => p.st === 4 || p.st === 5).length;
      for (let i = 0; dead > 14 && i < this.procs.length;) {
        const p = this.procs[i];
        if ((p.st === 4 || p.st === 5) && (p.sys == null || !this.children[p.sys] || this.children[p.sys].pid !== p.pid)) { this.pmap.delete(p.pid); this.procs.splice(i, 1); dead--; } else i++;
      }
    }

    // ----- 调度（与预置 kernel.nx 相同的时间片轮转） -----
    schedule(limit) {
      const rq = this.rq;
      let i = 0;
      while (i < rq.length) {
        const left = limit - this.stepUsed;
        if (left <= 0) break;
        const p = rq[i];
        if (p.st !== 0) { rq.splice(i, 1); p.inq = false; continue; }
        let q = Math.min(p.slice, left);
        if (p.quota > 0) { const ql = p.quota - p.stepUsed; if (ql <= 0) { i++; continue; } if (q > ql) q = ql; }
        let used = 0;
        if (p.kind === 'vm') {
          const r = NVM.run(p.ctx, q);
          used = r[1];
          this.account(p, used);
          if (r[0] === 1) this.dispatch(p, r[2], r[3]);
          else if (r[0] === 2) this.procExit(p, r[2]);
          else if (r[0] === 3) this.procFault(p, r[2]);
          else if (r[0] === 4) p.st = 1;
        } else {
          // 应用服务：按进度付费
          while (q > 0 && p.jobs.length && p.st === 0) {
            const j = p.jobs[0], pay = Math.min(q, j.cost - j.paid);
            j.paid += pay; q -= pay; used += pay;
            if (j.paid >= j.cost) { p.jobs.shift(); p.work += j.cost; try { j.commit && j.commit(); } catch (e) { console.error(e); p.err = String(e && e.message || e); } }
          }
          this.account(p, used);
          if (!p.jobs.length && p.st === 0) p.st = 1;
        }
        if (p.st === 0 && p.slice <= 0 && rq[i] === p) { rq.splice(i, 1); rq.push(p); p.slice = Math.floor(this.cfg.budget * this.cfg.sliceSteps); }
      }
    }
    account(p, used) { p.used += used; p.stepUsed += used; p.slice -= used; this.stepUsed += used; }
    dispatch(p, name, a) {
      const cost = 12 + NVM.sizeUnits(a);
      this.stepUsed += cost; this.kstep += cost;
      const h = this.sc[name];
      if (!h) { NVM.ret(p.ctx, err('未知的系统调用 ' + name)); return; }
      let v;
      try { v = h(p, a); } catch (e) { console.error('syscall ' + name, e); v = err('系统调用失败：' + (e && e.message || e)); }
      if (v !== BLOCK) NVM.ret(p.ctx, v === undefined ? null : v);
    }

    makeSyscalls() {
      const fs = this.fs, K = this;
      const P = (pid) => K.pmap.get(pid);
      const sc = {
        time: () => K.clock,
        sleep: (p, a) => { p.st = 2; p.wake = K.clock + (typeof a[0] === 'number' && a[0] > 0 ? a[0] : 0); return BLOCK; },
        pid: (p) => p.pid,
        args: (p) => p.args,
        spawn: (p, a) => { const q = K.exec(a[0], NVM.fromGuest(a[1]), p.pid, a[2] === true); return isErr(q) ? q : q.pid; },
        kill: (p, a) => { const q = P(a[0]); if (!q || q.st === 4 || q.st === 5) return false; K.procKill(q, '被进程 ' + p.pid + ' 结束'); return q === p ? BLOCK : true; },
        exit: (p, a) => { K.procExit(p, typeof a[0] === 'number' ? a[0] : 0); return BLOCK; },
        fail: (p, a) => { K.procFault(p, NVM.toStr(a[0])); return BLOCK; },
        print: (p, a) => { p.out.push(NVM.toStr(a[0])); if (p.out.length > 200) p.out.shift(); if (K.host.procOutput) K.host.procOutput(p); return true; },
        send: (p, a) => { const q = P(a[0]); if (q === undefined && a[0] === -1 && K.host.wmMessage) { return K.host.wmMessage(p, NVM.fromGuest(a[1])); } return q ? K.deliver(q, { from: p.pid, body: NVM.fromGuest(a[1]) }) : false; },
        recv: (p, a) => { if (p.inbox.length) return p.inbox.shift(); p.st = 1; p.wake = typeof a[0] === 'number' ? K.clock + a[0] : 0; return BLOCK; },
        poll: (p) => p.inbox.length ? p.inbox.shift() : null,
        read: (p, a) => fs.read(fs.norm(a[0])),
        write: (p, a) => fs.write(fs.norm(a[0]), a[1]),
        list: (p, a) => fs.list(fs.norm(a[0])),
        mkdir: (p, a) => { const d = fs.norm(a[0]); if (fs.exists(d)) return err('已存在：' + d); return fs.mkdirs(d) ? true : err('无法创建 ' + d); },
        delete: (p, a) => fs.delete(fs.norm(a[0])),
        rename: (p, a) => fs.rename(fs.norm(a[0]), fs.norm(a[1])),
        copy: (p, a) => fs.copy(fs.norm(a[0]), fs.norm(a[1])),
        stat: (p, a) => fs.stat(fs.norm(a[0])),
        rand: () => { K.rng = (K.rng * 1103515245 + 12345) % 2147483648; return K.rng / 2147483648; },
        ps: () => K.procs.map(q => K.procInfo(q)),
        pstate: (p, a) => { const q = P(a[0]); return q ? q.st : -1; },
        plog: (p, a) => { const q = P(a[0]); return q ? { out: q.out, err: q.err, st: q.st, exit: q.exit, name: q.name } : null; },
        suspend: (p, a) => { const q = P(a[0]); if (q === p) { p.prev = 0; p.st = 3; NVM.ret(p.ctx, true); return BLOCK; } return K.suspend(q); },
        resume: (p, a) => K.resume(P(a[0])),
        setquota: (p, a) => { const q = P(a[0]); if (!q) return false; q.quota = Math.max(0, Math.floor(+a[1] || 0)); return true; },
        kinfo: () => K.kinfo(),
        app: (p, a) => { p.app = NVM.toStr(a[0]); return true; },
        dev_write: (p, a) => { const n = NVM.toStr(a[0]); const d = K.dev[n] || (K.dev[n] = { v: null, t: 0, n: 0, q: [] }); d.v = NVM.fromGuest(a[1]); d.t = K.clock; d.n++; if (a[2] === true) { d.q.push({ v: d.v, t: K.clock }); if (d.q.length > 512) d.q.shift(); } return K.clock; },
        dev_read: (p, a) => { const d = K.dev[NVM.toStr(a[0])]; return d ? { v: d.v, t: d.t, n: d.n } : null; },
        dev_take: (p, a) => { const d = K.dev[NVM.toStr(a[0])]; if (!d) return []; const q = d.q; d.q = []; return q; },
        dev_free: (p, a) => { delete K.dev[NVM.toStr(a[0])]; return true; },
        surface: (p) => { const sid = ++K.sidSeq; K.surf.set(sid, { pid: p.pid }); return sid; },
        draw: (p, a) => { const s = K.surf.get(a[0]); if (!s || s.pid !== p.pid) return err('无效的显示面'); K.gfx('outer', 'draw', a[0], a[1]); return true; },
        surface_free: (p, a) => { const s = K.surf.get(a[0]); if (!s || s.pid !== p.pid) return false; K.surf.delete(a[0]); K.gfx('outer', 'free', a[0]); return true; },
        scene_open: (p, a) => { if (typeof a[0] !== 'string') return err('场景资源必须是文本'); const h = ++K.scSeq; const r = K.gfx('outer', 'scene_open', h, a[0]); if (isErr(r)) return r; K.scenes.set(h, { pid: p.pid }); return h; },
        scene_layer: (p, a) => { if (!K.scenes.has(a[0])) return err('无效的场景'); K.gfx('outer', 'scene_layer', a[0], a[1], [a[2], a[3]]); return true; },
        scene_present: (p, a) => { if (!K.scenes.has(a[0])) return err('无效的场景'); K.gfx('outer', 'scene_present', a[0], a[1]); return true; },
        scene_close: (p, a) => { const s = K.scenes.get(a[0]); if (!s || s.pid !== p.pid) return false; K.scenes.delete(a[0]); K.gfx('outer', 'scene_close', a[0]); return true; },
        wm: () => -1,
        rebuild_compiler: (p) => { const cp = K.rebuildCompiler((ok, msg) => K.kmsg(p.pid, { t: 'child_exit', pid: cp ? cp.pid : 0, code: ok ? 0 : 1, err: ok ? '' : msg })); return cp ? cp.pid : err('缺少编译器'); },
        // --- 承载进程（子系统内核）的调用 ---
        boot: (p) => { const c = K.children[p.sys]; if (!c) return err('无权调用'); const b = c.boot || { disk: {}, children: [] }; c.boot = null;
          return { id: c.id, name: c.name, depth: 2, path: ['outer'], disk: b.disk, children: b.children, w: c.w, h: c.h, budget: c.grant.budget, mem: c.grant.mem, storage: c.grant.storage, seed: Math.floor(sc.rand() * 1e6) }; },
        tick: (p) => { if (p.sys == null) return err('无权调用'); p.st = 6; p.forced = false; return BLOCK; },
        gfx: (p, a) => { if (p.sys == null) return err('无权调用'); return K.gfx(a[0], a[1], a[2], a[3], a[4]); },
        bus: (p, a) => { if (p.sys == null) return false; return K.route(NVM.fromGuest(a[0])); },
        bus_send: (p, a) => { const m = NVM.fromGuest(a[0]); if (!m || typeof m.to !== 'string') return false; m.from = 'outer'; m.fpid = p.pid; return K.route(m); },
        sysid: (p, a) => K.allocIds(a[0]),
        sysid_used: (p, a) => { const all = new Set(K.allIds()); return (a[0] || []).filter(id => all.has(id)); },
        sysinfo: (p, a) => { const c = K.children[p.sys]; if (!c) return false; const info = NVM.fromGuest(a[0]); K.cstor += info.stor - c.stor; c.stor = info.stor; c.info = info; K.treeDirty = true; return true; },
        tree: () => K.treeNode()
      };
      return sc;
    }
    procInfo(q) {
      const o = { pid: q.pid, name: q.name, path: q.path, kind: q.kind, st: q.st, used: q.used, last: q.last, quota: q.quota, inbox: q.inbox.length, err: q.err, owner: q.owner, sys: q.sys, app: q.app, mem: 0, pending: 0, own: 0, exit: q.exit, lag: 0 };
      if (q.ctx && q.st !== 4 && q.st !== 5) { const s = NVM.stat(q.ctx); o.mem = s.mem; o.pending = s.pending; o.own = s.own; o.line = s.line; }
      if (q.kind !== 'vm') { o.pending = q.jobs.reduce((n, j) => n + j.cost - j.paid, 0); o.inbox = q.jobs.length; o.mem = q.mem || 0; }
      if (q.sys != null && this.children[q.sys]) { const c = this.children[q.sys]; o.lag = c.pdt; o.inbox = c.inq.length; }
      return o;
    }
    kinfo() {
      return { id: 'outer', name: this.host.systemName ? this.host.systemName() : '根系统', depth: 1, path: [], clock: this.clock, step: this.stepN, budget: this.cfg.budget, grant: this.cfg.budget, eff: this.cfg.budget,
        used: this.lastStepUsed || 0, kown: this.kownLast, mem: this.sysMem, memQuota: this.cfg.mem, memCfg: this.cfg.mem, memGrant: this.cfg.mem,
        stor: this.fs.used + this.cstor, storQuota: this.cfg.storage, storCfg: this.cfg.storage, storGrant: this.cfg.storage, slice: this.cfg.sliceSteps, procMem: this.cfg.procMem, stepMs: STEP_MS };
    }
    gfx(origin, op, a, b, c) { return this.host.gfx ? this.host.gfx(origin, op, a, b, c) : true; }
    gfxReset(ids) { for (const id of ids) this.gfx(id, 'reset'); }

    // ----- 系统标识 -----
    allocIds(n) { const out = []; n = Math.max(1, Math.min(64, n | 0)); for (let i = 0; i < n; i++) out.push('inner-' + (++this.sysSeq)); return out; }
    allIds() { const out = ['outer']; const walk = (kids) => { for (const k of kids) { out.push(k.id); walk(k.kids || []); } }; walk(this.treeNode().kids); return out; }
    treeNode() {
      const kids = Object.values(this.children).map(c => ({ id: c.id, name: c.name, state: c.state, paused: c.paused, rate: c.rate, err: c.err, epoch: c.epoch, stor: c.stor,
        kids: (c.info && (c.state === 'running' || c.state === 'paused')) ? c.info.kids : [] }));
      return { id: 'outer', name: '根系统', stor: this.fs.used + this.cstor, kids };
    }
    // 展平：[{id,parentId,name,state,depth,effPaused}]
    flatTree() {
      const out = [{ id: 'outer', parentId: null, name: this.host.systemName ? this.host.systemName() : '根系统', state: 'running', depth: 1, effPaused: false, epoch: 0 }];
      const walk = (kids, parent, depth, ancPaused, ancDown) => {
        for (const k of kids) {
          const st = ancDown ? 'stopped' : k.state;
          out.push({ id: k.id, parentId: parent, name: k.name, state: st, depth, effPaused: ancPaused || k.state === 'paused', paused: !!k.paused, rate: k.rate, err: k.err, epoch: k.epoch });
          walk(k.kids || [], k.id, depth + 1, ancPaused || k.state === 'paused', ancDown || (k.state !== 'running' && k.state !== 'paused'));
        }
      };
      walk(this.treeNode().kids, 'outer', 2, false, false);
      return out;
    }

    // ----- 跨系统消息 -----
    childFor(id) {
      const has = (node) => node.id === id || (node.kids || []).some(has);
      for (const c of Object.values(this.children)) { if (c.id === id) return c; if (c.info && has({ id: c.id, kids: c.info.kids })) return c; }
      return null;
    }
    route(m) {
      if (!m || typeof m.to !== 'string') return false;
      this.kstep += 8 + NVM.sizeUnits(m); this.stepUsed += 8;
      if (m.to === 'outer') { this.busHandle(m); return true; }
      const c = this.childFor(m.to);
      if (!c || (c.state !== 'running' && c.state !== 'paused')) return false;
      c.inq.push({ k: 'bus', m });
      return true;
    }
    busHandle(m) {
      if (m.k === 'xfer_req') {
        const files = [];
        const collect = (path, rel) => {
          if (!this.fs.exists(path) || path === '/') return;
          const name = this.fs.base(path);
          if (this.fs.isFile(path)) { files.push({ name: rel + name, data: this.fs.read(path) }); return; }
          files.push({ name: rel + name, dir: true });
          for (const e of this.fs.list(path)) collect(e.path, rel + name + '/');
        };
        for (const p of m.paths || []) collect(this.fs.norm(p), '');
        const size = files.reduce((n, f) => n + (f.data ? f.data.length : 0), 0);
        this.work(this.svc, 16 + size / 16, '文件传出', () => this.route({ to: m.dst, from: 'outer', k: 'xfer_data', pid: m.dpid, sess: m.sess, dir: m.dir, files }));
        return;
      }
      if (m.pid > 0 && !m.svc) { this.kmsg(m.pid, m); return; }
      if (this.host.bus) this.host.bus(m);
    }

    // ----- 直属子系统 -----
    imageFor() {
      const img = {};
      for (const [p, e] of this.fs.nodes) {
        let take = false;
        if (p === '/System' || p.startsWith('/System/')) take = !(p === '/System/kernels' || p.startsWith('/System/kernels/'));
        else if (p.startsWith('/Apps') || p.startsWith('/Programs') || p.startsWith('/Demo')) take = true;
        else if (p === '/Documents' || p === '/Documents/操作说明.md' || p === '/Flights') take = true;
        if (take && !(p.endsWith('.sheet'))) img[p] = e.k === 'f' ? { k: 'f', d: e.d, m: 0, h: e.h } : { k: 'd', m: 0 };
      }
      return img;
    }
    childNew(id, name) {
      const c = { id, name, state: 'booting', err: '', paused: false, rate: 1, pdt: 0, steps: 0, force: false, boot: null, pid: 0, ctx: null, kpath: '/System/kernels/' + id + '.nx',
        inq: [], info: null, stor: 0, epoch: 0, saved: null, w: 640, h: 400, memUsed: 0,
        grant: { budget: Math.floor(this.cfg.budget * this.cfg.childShare), mem: Math.floor(this.cfg.mem * 0.4), storage: Math.floor(this.cfg.storage * 0.4) } };
      this.children[id] = c; this.treeDirty = true;
      return c;
    }
    sysChanged(c) { this.treeDirty = true; if (this.host.sysEvent) this.host.sysEvent('state', c); }
    createSystem(name) {
      if (!this.fs.isFile('/System/kernel.nx')) return err('缺少内核模板 /System/kernel.nx');
      const id = this.allocIds(1)[0];
      const c = this.childNew(id, name || '子系统 ' + id);
      const r = this.fs.write(c.kpath, this.fs.read('/System/kernel.nx'));
      if (isErr(r)) { delete this.children[id]; return r; }
      if (this.host.sysEvent) this.host.sysEvent('new', c);
      this.childStart(c, { disk: this.imageFor(), children: [] });
      return c;
    }
    sysProc(c) { const p = this.addProc({ name: '系统 ' + c.id, path: c.kpath, kind: 'vm', st: 7, sys: c.id, quota: c.grant.budget, app: 'system' }); c.pid = p.pid; return p; }
    childStart(c, boot) {
      c.state = 'booting'; c.err = ''; c.info = null; c.pdt = 0; c.inq = []; c.steps = 0; c.force = false; c.epoch++;
      if (!this.fs.isFile(c.kpath)) { this.childError(c, '找不到内核源文件 ' + c.kpath); return; }
      const p = this.sysProc(c);
      c.boot = boot;
      const cache = this.cachePath(c.kpath);
      const go = () => {
        if (p.st !== 7) return;
        let x;
        try { x = NVM.create(this.fs.read(cache), null); } catch (e) { p.st = 5; p.err = e.message; this.childError(c, e.message); return; }
        p.ctx = x; c.ctx = x; c.state = c.paused ? 'paused' : 'running'; x.limit = Math.floor(c.grant.mem * 1.25);
        this.ready(p); this.sysChanged(c);
      };
      if (this.cacheValid(cache)) go();
      else this.compileFor(c.kpath, cache, (ok, msg) => { if (p.st !== 7) return; if (ok) go(); else { p.st = 5; p.err = '编译失败：' + msg; this.childError(c, p.err); } });
      this.sysChanged(c);
    }
    childMembers(c) { const out = [c.id]; const walk = (kids) => { for (const k of kids) { out.push(k.id); walk(k.kids || []); } }; if (c.info) walk(c.info.kids); return out; }
    childError(c, msg) {
      if (!c) return;
      c.state = 'error'; c.err = String(msg);
      this.gfxReset(this.childMembers(c)); this.log('子系统 ' + c.id + ' 内核错误：' + c.err);
      this.sysChanged(c);
    }
    harvestCtx(ctx) {
      const disk = NVM.peek(ctx, 'DISK'), kids = NVM.peek(ctx, 'CHILDREN'), out = [];
      if (NVM.isMap(kids)) for (const id in kids) {
        const k = kids[id];
        let saved = k.boot != null ? NVM.fromGuest(k.boot) : (k.ctx instanceof NVM.CtxRef ? this.harvestCtx(k.ctx.ctx) : NVM.fromGuest(k.saved));
        out.push({ id: k.id, name: k.name, kpath: k.kpath, rate: k.rate, paused: k.paused, grant: NVM.fromGuest(k.grant), saved });
      }
      const d = {};
      if (NVM.isMap(disk)) for (const p in disk) { const e = disk[p]; d[p] = e.k === 'f' ? { k: 'f', d: e.d, m: e.m, h: e.h } : { k: 'd', m: e.m }; }
      return { disk: d, children: out };
    }
    harvest(c) { if (c.boot) return c.boot; if (!c.ctx) return c.saved; try { return this.harvestCtx(c.ctx); } catch (e) { console.error(e); return c.saved; } }
    childStop(c) {
      if (!c) return false;
      const p = this.pmap.get(c.pid);
      const hv = this.harvest(c); if (hv) c.saved = hv;
      c.boot = null;
      if (c.ctx) NVM.kill(c.ctx);
      this.gfxReset(this.childMembers(c));
      c.ctx = null; c.state = 'stopped'; c.info = null; c.inq = []; c.pdt = 0;
      this.cstor -= c.stor; c.stor = 0;
      if (p && p.st !== 4 && p.st !== 5) { p.st = 4; p.exit = -1; p.ctx = null; this.procRelease(p); }
      this.sysChanged(c);
      return true;
    }
    childRestart(c) {
      this.childStop(c);
      const boot = c.saved || { disk: this.imageFor(), children: [] }; c.saved = null;
      this.childStart(c, boot);
      return true;
    }
    snapMeta(text) {
      const i = text.indexOf('\n'); if (i < 0) return null;
      let m; try { m = JSON.parse(text.slice(0, i)); } catch (e) { return null; }
      if (!m || m.nsnap !== 1) return null;
      m.at = i + 1; return m;
    }
    childSnapshot(c, path, done) {
      if (!c || !c.ctx || (c.state !== 'running' && c.state !== 'paused')) return err('该子系统没有在运行');
      // 状态在此刻取定；复制与写入是根系统的工作，付清后才落盘
      const blob = NVM.save(c.ctx);
      const meta = { nsnap: 1, id: c.id, name: c.name, rate: c.rate, paused: c.paused, members: this.childMembers(c), pdt: c.pdt, w: c.w, h: c.h, kernel: this.fs.read(c.kpath), clock: this.clock };
      const text = JSON.stringify(meta) + '\n' + blob;
      this.work(this.svc, text.length / 8, '保存快照 ' + c.id, () => { const r = this.fs.write(path, text); if (done) done(isErr(r) ? r : { path, size: text.length }); });
      return true;
    }
    attachLoaded(c, p, x, meta) {
      p.ctx = x; c.ctx = x; c.pid = p.pid; c.info = null;
      c.rate = meta.rate; c.paused = !!meta.paused; c.pdt = meta.pdt || 0; c.steps = 0;
      c.state = c.paused ? 'paused' : 'running'; c.err = ''; c.epoch++; c.saved = null; c.boot = null;
      x.limit = Math.floor(c.grant.mem * 1.25);
      p.err = ''; p.exit = null; p.inbox = []; p.prev = 0;
      if (x.state === NVM.ST.SYS) p.st = 6; else if (c.paused) p.st = 3; else { p.st = 3; this.ready(p); }
      c.force = true;
    }
    allocRemap(members, firstId) {
      const remap = {}; let i = 0;
      if (firstId != null) { remap[members[0]] = firstId; i = 1; }
      if (members.length - i > 0) { const ids = this.allocIds(members.length - i); for (let j = 0; i < members.length; i++, j++) remap[members[i]] = ids[j]; }
      return remap;
    }
    childRestore(c, path) {
      if (!this.fs.isFile(path)) return err('找不到快照 ' + path);
      const text = this.fs.read(path), meta = this.snapMeta(text);
      if (!meta) return err('不是有效的快照文件');
      let x; try { x = NVM.load(text.slice(meta.at), null); } catch (e) { return err('快照无效：' + e.message); }
      const old = this.childMembers(c);
      let p = this.pmap.get(c.pid);
      if (p && p.st !== 4 && p.st !== 5) { if (p.ctx) NVM.kill(p.ctx); } else p = this.sysProc(c);
      this.gfxReset(old);
      this.cstor -= c.stor; c.stor = 0;
      const all = new Set(this.allIds());
      let clash = meta.id !== c.id;
      for (const id of meta.members) if (all.has(id) && !old.includes(id)) clash = true;
      this.attachLoaded(c, p, x, meta);
      const remap = clash ? this.allocRemap(meta.members, c.id) : null;
      c.inq = [{ k: 'restored', remap, scope: remap ? meta.members.map(id => remap[id]) : meta.members, path: ['outer'], w: c.w, h: c.h }];
      this.work(this.svc, text.length / 8, '恢复快照 ' + c.id, null);
      this.sysChanged(c);
      return true;
    }
    childFork(path, name) {
      if (!this.fs.isFile(path)) return err('找不到快照 ' + path);
      const text = this.fs.read(path), meta = this.snapMeta(text);
      if (!meta) return err('不是有效的快照文件');
      let x; try { x = NVM.load(text.slice(meta.at), null); } catch (e) { return err('快照无效：' + e.message); }
      const remap = this.allocRemap(meta.members, null), id = remap[meta.id];
      const c = this.childNew(id, name || meta.name + ' 分叉');
      const r = this.fs.write(c.kpath, meta.kernel);
      if (isErr(r)) { delete this.children[id]; return r; }
      c.w = meta.w || c.w; c.h = meta.h || c.h;
      const p = this.sysProc(c);
      this.attachLoaded(c, p, x, meta);
      c.inq = [{ k: 'restored', remap, scope: meta.members.map(m => remap[m]), path: ['outer'], w: c.w, h: c.h }];
      this.work(this.svc, text.length / 8, '分叉快照 ' + id, null);
      if (this.host.sysEvent) this.host.sysEvent('new', c);
      this.sysChanged(c);
      return c;
    }
    childCtl(c, act, arg) {
      if (!c) return err('没有这个子系统');
      const p = this.pmap.get(c.pid);
      if (act === 'pause') { if (c.state !== 'running') return false; c.paused = true; c.state = 'paused'; if (p && p.st === 0) { p.st = 3; p.prev = 0; } }
      else if (act === 'resume') { if (c.state !== 'paused') return false; c.paused = false; c.state = 'running'; c.steps = 0; if (p && p.st === 3) this.ready(p); }
      else if (act === 'step') { if (c.state !== 'paused') return false; c.steps++; }
      else if (act === 'rate') { if (typeof arg !== 'number' || !(arg > 0) || arg > 64) return false; c.rate = arg; }
      else if (act === 'restart') return this.childRestart(c);
      else if (act === 'stop') return this.childStop(c);
      else if (act === 'start') { if (c.state !== 'stopped' && c.state !== 'error') return false; return this.childRestart(c); }
      else if (act === 'remove') { this.childStop(c); if (this.host.sysEvent) this.host.sysEvent('gone', c); const dp = this.pmap.get(c.pid); if (dp) { this.pmap.delete(dp.pid); const i = this.procs.indexOf(dp); if (i >= 0) this.procs.splice(i, 1); } delete this.children[c.id]; this.treeDirty = true; return true; }
      else if (act === 'rename') c.name = String(arg);
      else if (act === 'grant') {
        if (typeof arg.budget === 'number') { c.grant.budget = Math.max(0, Math.floor(arg.budget)); if (p) p.quota = c.grant.budget; }
        if (typeof arg.mem === 'number') { c.grant.mem = Math.max(0, Math.floor(arg.mem)); if (c.ctx) c.ctx.limit = Math.floor(c.grant.mem * 1.25); }
        if (typeof arg.storage === 'number') c.grant.storage = Math.max(0, Math.floor(arg.storage));
      } else return err('未知操作 ' + act);
      this.sysChanged(c);
      return true;
    }
    childInput(id, ev) {
      const c = this.children[id]; if (!c || c.inq.length > 2000) return false;
      // 连续的移动事件只保留最新的一个
      const last = c.inq[c.inq.length - 1];
      if (last && last.k === 'in' && last.e.t === ev.t && ((ev.t === 'ptr' && ev.k === 'move' && last.e.k === 'move') || (ev.t === 'drag' && ev.k === 'over' && last.e.k === 'over'))) { last.e = ev; return true; }
      c.inq.push({ k: 'in', e: ev }); return true;
    }
    childSize(id, w, h) { const c = this.children[id]; if (c) { c.w = w; c.h = h; } }
    feedChildren(dt) {
      for (const c of Object.values(this.children)) {
        if (c.state !== 'running' && c.state !== 'paused') continue;
        const p = this.pmap.get(c.pid); if (!p) continue;
        if (c.paused && p.st === 0 && !p.forced) { p.st = 3; p.prev = 0; }
        if (!c.paused) c.pdt += dt * c.rate;
        if (c.paused && c.steps > 0 && p.st === 3) { c.steps--; this.ready(p); continue; }
        if (p.st !== 6) continue;
        let go = false, d = 0, frozen = false;
        if (!c.paused) { go = true; d = c.pdt; c.pdt = 0; }
        else if (c.steps > 0) { c.steps--; go = true; d = STEP_MS * c.rate; }
        else if (c.force) { go = true; frozen = true; }
        if (go) {
          c.force = false;
          const ev = c.inq; c.inq = [];
          const ml = Math.min(c.grant.mem, this.cfg.mem - (this.sysMem - c.memUsed));
          const sl = Math.min(c.grant.storage, this.cfg.storage - (this.fs.used + this.cstor - c.stor));
          this.kstep += 10 + NVM.sizeUnits(ev);
          NVM.ret(p.ctx, { dt: d, budget: c.grant.budget, mem: ml, storage: sl, ev, frozen, w: c.w, h: c.h });
          p.forced = frozen;
          this.ready(p);
        }
      }
    }
    memCheck() {
      let total = this.hostMem || 0, big = null, bm = 0;
      for (const p of this.procs) {
        if (!p.ctx || p.st === 4 || p.st === 5) continue;
        const m = NVM.stat(p.ctx).mem; total += m;
        if (p.sys != null) { const c = this.children[p.sys]; if (c) c.memUsed = m; }
        else if (m > bm) { bm = m; big = p; }
      }
      this.sysMem = total;
      if (total > this.cfg.mem && big) this.procFault(big, '系统内存配额不足，占用最多的进程被结束');
    }

    // ----- 一个逻辑步 -----
    step() {
      this.clock += STEP_MS; this.stepN++;
      NVM.tickMeasure();
      this.stepUsed = 0; this.kstep = 0;
      for (const p of this.procs) {
        p.last = p.stepUsed; p.stepUsed = 0;
        if (p.st === 2 && p.wake <= this.clock) this.wake(p, this.clock);
        else if (p.st === 1 && p.kind === 'vm' && p.wake > 0 && p.wake <= this.clock) { p.wake = 0; this.wake(p, null); }
      }
      this.feedChildren(STEP_MS);
      this.stepUsed += this.kstep;
      if (this.stepN % 30 === 1) this.memCheck();
      this.schedule(this.cfg.budget);
      this.kownLast = this.kstep; this.kown += this.kstep; this.lastStepUsed = this.stepUsed;
      if (this.treeDirty) { this.treeDirty = false; if (this.host.tree) this.host.tree(this.flatTree()); }
    }
  }

  return { RootKernel, RootFS, STEP_MS, BLOCK, err, isErr };
});
