// 机器层：系统注册表、磁盘设备、设备调用（mi_dev）与根内核的逐步推进。
// 宿主只提供：时钟步进、磁盘、显示、原始输入和少量服务；其余全部由 ns/System 下的程序运行。
import { VM, NATIVES, newMap, hdl, tostr, sizeOf, deepCopy } from './vm.js';
import './snapshot.js';

export const DT = 1 / 60; // 逻辑步长（秒）：一个逻辑步 = 1/60 秒虚拟时间

export function sigOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return text.length + ':' + (h >>> 0).toString(36);
}

// ---------------------------------------------------------------- 磁盘设备
// 每个系统一块盘：只读系统映像（base，所有系统共享）+ 本系统的覆盖层（overlay）。
export class Disk {
  constructor(machine, sysId, base) {
    this.machine = machine; this.sysId = sysId; this.base = base;
    this.overlay = new Map(); this.deleted = new Set(); this.used = base.bytes; this.dirty = false;
  }
  entry(key) {
    if (this.overlay.has(key)) return this.overlay.get(key);
    if (this.deleted.has(key)) return null;
    return this.base.files.get(key) || null;
  }
  size(e) { return e && !e.dir ? (e.data ? e.data.length : 0) : 0; }
  get(key) { return this.entry(key); }
  put(key, data, dir, mtime) {
    const old = this.entry(key);
    const delta = (dir ? 0 : data.length) - this.size(old);
    const e = dir ? { dir: true, mtime: mtime || 0, size: 0, sig: '' } : { data, dir: false, mtime: mtime || 0, size: data.length, sig: sigOf(data) };
    this.overlay.set(key, e); this.deleted.delete(key); this.used += delta; this.dirty = true;
    return e;
  }
  del(key) {
    const old = this.entry(key); if (!old) return false;
    this.used -= this.size(old);
    this.overlay.delete(key);
    if (this.base.files.has(key)) this.deleted.add(key);
    this.dirty = true; return true;
  }
  list(dir) {
    const prefix = dir === '/' ? '/' : dir + '/';
    const out = new Map();
    const scan = (m, isBase) => {
      for (const [k, e] of m) {
        if (!k.startsWith(prefix) || k === dir || k.length === prefix.length) continue;
        const rest = k.slice(prefix.length);
        if (rest.includes('/')) continue;
        if (isBase && (this.deleted.has(k) || this.overlay.has(k))) continue;
        out.set(k, e);
      }
    };
    scan(this.base.files, true); scan(this.overlay, false);
    return [...out].map(([k, e]) => ({ key: k, name: k.slice(prefix.length), dir: !!e.dir, size: e.size || 0, mtime: e.mtime || 0 }));
  }
  clone(newSysId) {
    const d = new Disk(this.machine, newSysId, this.base);
    for (const [k, e] of this.overlay) d.overlay.set(k, { ...e });
    d.deleted = new Set(this.deleted); d.used = this.used; return d;
  }
  serialize() { return { overlay: [...this.overlay], deleted: [...this.deleted] }; }
  load(o) { this.overlay = new Map(o.overlay); this.deleted = new Set(o.deleted); this.used = this.base.bytes; for (const [k, e] of this.overlay) { const b = this.base.files.get(k); this.used += this.size(e) - this.size(b); } for (const k of this.deleted) this.used -= this.size(this.base.files.get(k)); }
}

export function buildBase(files /* Map path->text */) {
  const m = new Map(); let bytes = 0;
  const addDir = (d) => { if (d && d !== '/' && !m.has(d)) { m.set(d, { dir: true, mtime: 0, size: 0, sig: '' }); addDir(d.slice(0, d.lastIndexOf('/')) || '/'); } };
  for (const [p, text] of files) {
    addDir(p.slice(0, p.lastIndexOf('/')) || '/');
    m.set(p, { data: text, dir: false, mtime: 0, size: text.length, sig: sigOf(text) }); bytes += text.length;
  }
  return { files: m, bytes };
}

// ---------------------------------------------------------------- 系统注册表
class SysRec {
  constructor(id, index, name, parentId, depth) {
    this.id = id; this.index = index; this.name = name; this.parentId = parentId; this.depth = depth;
    this.children = []; this.state = 'booting'; this.kcid = null; this.disk = null;
    this.cfg = { mem: 0, storage: 0 }; this.created = 0; this.screen = { w: 1280, h: 720 };
  }
}

export class Machine {
  constructor(opts) {
    this.vm = new VM(); this.vm.machine = this; this.snapHooks = []; this.handleRemappers = []; this.systems = new Map(); this.kctx = new Map(); // kcid -> sysId
    this.base = opts.base; this.image = opts.image; this.display = opts.display || null; this.persist = opts.persist || null;
    this.nextIndex = 1; this.clock = 0; this.stepNo = 0; this.events = []; this.jobs = [];
    this.budget = 150000; this.used = 0; this.granted = 0; this.svcUsed = 0; this.idle = false; this.fatal = null;
    this.wall0 = Date.now() - new Date().getTimezoneOffset() * 60000; this.devs = Object.create(null); this.hostLog = [];
    this.root = null; this.k0 = null; this.services = new Map();
    this.registerDevices();
    this.vm.onKill = (c) => { if (this.display) this.display.dropCtx(c.cid); this.kctx.delete(c.cid); for (const fn of this.killHooks || []) fn(c); };
    this.killHooks = [];
  }

  // 重置：只保留磁盘上的根系统覆盖层（由 persist 管理）
  boot(rootOverlay) {
    for (const c of [...this.vm.ctxs.keys()]) this.vm.kill(c);
    this.systems.clear(); this.kctx.clear(); this.events.length = 0; this.nextIndex = 1; this.clock = 0; this.stepNo = 0; this.fatal = null;
    this.vm.nextCid = 1;
    if (this.display) this.display.reset();
    const root = new SysRec('outer', 0, '根系统', null, 0);
    root.disk = new Disk(this, 'outer', this.base); if (rootOverlay) root.disk.load(rootOverlay);
    root.state = 'running'; this.root = root; this.systems.set('outer', root);
    root.cfg = { mem: 0, storage: 0 };
    const r = this.readDisk(root, '/System/kernel.nsx');
    if (!r) { this.fatal = '缺少 /System/kernel.nsx（请先运行 tools/build.mjs 生成）'; return; }
    const k0 = this.vm.spawn(r.data, { owner: 0, priv: true, kernel: true, name: 'kernel@outer', args: newMap({ depth: 0 }) });
    k0.sysId = 'outer'; root.kcid = k0.cid; this.kctx.set(k0.cid, 'outer'); this.k0 = k0;
    this.postEvent('outer', { k: 'screen', w: root.screen.w, h: root.screen.h });
  }
  addJob(cost, done) { this.jobs.push({ left: Math.max(1, Math.floor(cost)), total: cost, done }); }
  readDisk(rec, path) { return rec.disk.get(path); }
  newDisk(id) { return new Disk(this, id, this.base); }

  sysOfCtx(cid) { // 返回上下文所属系统（沿 owner 链找到第一个内核上下文）
    let c = this.vm.ctxs.get(cid);
    while (c) { const s = this.kctx.get(c.cid); if (s) return this.systems.get(s); c = this.vm.ctxs.get(c.owner); }
    return null;
  }
  ancestors(rec) { const out = []; let r = rec; while (r) { out.push(r); r = r.parentId ? this.systems.get(r.parentId) : null; } return out; }
  pathTo(sysId) { // 从根的直属子系统到目标的句柄路径
    const chain = []; let r = this.systems.get(sysId);
    while (r && r.parentId) { chain.unshift(hdl('sys', r.id)); r = this.systems.get(r.parentId); }
    return chain;
  }
  postEvent(sysId, ev) {
    ev.path = this.pathTo(sysId);
    this.events.push(ev);
  }
  treeStorage(rec) { let n = rec.disk.used; for (const c of rec.children) { const r = this.systems.get(c); if (r) n += this.treeStorage(r); } return n; }

  // ------------------------------------------------------------ 逻辑步
  step() {
    if (this.fatal || !this.k0) return;
    this.stepNo++; this.clock += DT;
    this.vm.tick = this.stepNo;
    let budget = this.budget;
    // 宿主承载的应用服务（表格重算、数据发布等）按规模付费：先从本步预算里扣，付清后才提交结果
    let svcBudget = Math.floor(budget * 0.25); let svc = 0;
    while (this.jobs.length && svcBudget > 0) {
      const j = this.jobs[0]; const pay = Math.min(j.left, svcBudget); j.left -= pay; svcBudget -= pay; svc += pay;
      if (j.left <= 0) { this.jobs.shift(); try { j.done && j.done(); } catch (e) { console.error(e); } }
    }
    budget -= svc; this.svcUsed = svc;
    this.granted = budget; this.used = 0; this.idle = false;
    let fuel = budget; const k0 = this.k0;
    let guard = 0;
    while (fuel > 0 && !this.idle && guard++ < 4000) {
      const r = this.vm.run(k0, fuel);
      fuel -= r.used; this.used += r.used;
      if (r.status === 'trap') { fuel -= this.handleTrap(k0); }
      else if (r.status === 'error') { this.fatal = '根内核错误：' + (k0.err && k0.err.msg) + ' @' + (k0.err && k0.err.fn) + ':' + (k0.err && k0.err.line); this.hostLog.push(this.fatal); return; }
      else if (r.status === 'done') { this.fatal = '根内核已退出'; return; }
      else break;
    }
  }

  handleTrap(ctx) {
    const t = ctx.trap; const a = t.args; let cost = 6;
    let v = null;
    if (t.name === 'mi_poll') {
      const m = newMap();
      m.t = this.clock; m.step = this.stepNo; m.evs = this.events.splice(0, 64);
      m.budget = this.budget; m.granted = this.granted; m.used = this.used; m.svc = this.svcUsed;
      v = m;
    } else if (t.name === 'mi_idle') { this.idle = true; v = null; }
    else if (t.name === 'mi_dev') {
      try { const r = this.dev(ctx, a); v = r === undefined ? null : r; cost += sizeOf(v) >> 4; } catch (e) { v = newMap({ err: '设备错误：' + e.message }); this.hostLog.push(String(e && e.stack || e)); }
    } else v = newMap({ err: '未知机器调用 ' + t.name });
    this.vm.ret(ctx, v);
    return cost;
  }

  // mi_dev(origin, device, op, ...args)
  dev(ctx, a) {
    const [origin, device, op] = a;
    let osys;
    if (origin == null) osys = this.systems.get(this.kctx.get(ctx.cid));
    else { if (!this.vm.inTree(ctx.cid, origin.id) && origin.id !== ctx.cid) return newMap({ err: '来源无效' }); osys = this.sysOfCtx(origin.id); }
    if (!osys) return newMap({ err: '来源系统不存在' });
    const d = this.devs[device];
    if (!d || !d[op]) return newMap({ err: `未知设备调用 ${device}.${op}` });
    return d[op].call(this, osys, a.slice(3), ctx);
  }

  checkSub(osys, h) { // 目标系统必须是 osys 的直属子系统
    const r = h && this.systems.get(h.id);
    return r && r.parentId === osys.id ? r : null;
  }

  registerDevices() {
    const E = (m) => newMap({ err: m });
    const D = this.devs;
    D.disk = {
      get(osys, [key]) { const e = osys.disk.get(key); if (!e) return null; return newMap({ data: e.data == null ? null : e.data, dir: e.dir, mtime: e.mtime, sig: e.sig, size: e.size }); },
      stat(osys, [key]) { const e = osys.disk.get(key); if (!e) return null; return newMap({ dir: e.dir, mtime: e.mtime, sig: e.sig, size: e.size }); },
      put(osys, [key, data, dir, mtime]) {
        const old = osys.disk.get(key); const delta = (dir ? 0 : String(data).length) - (old && !old.dir ? old.size : 0);
        if (delta > 0) {
          for (const r of this.ancestors(osys)) {
            const q = r.cfg.storage; if (q > 0 && this.treeStorage(r) + delta > q) return E('存储配额不足（' + r.id + '）');
          }
        }
        const e = osys.disk.put(key, dir ? null : String(data), !!dir, mtime);
        if (osys.id === 'outer' && this.persist) this.persist();
        return newMap({ ok: true, sig: e.sig, size: e.size });
      },
      del(osys, [key]) { const ok = osys.disk.del(key); if (osys.id === 'outer' && this.persist) this.persist(); return ok; },
      list(osys, [dir]) { return osys.disk.list(dir).map((e) => newMap(e)); },
      usage(osys) { return newMap({ used: osys.disk.used, tree: this.treeStorage(osys), quota: osys.cfg.storage }); },
    };
    D.sys = {
      self(osys) { return hdl('sys', osys.id); },
      info(osys, [h]) {
        const r = h ? this.systems.get(h.id) : osys; if (!r) return null;
        return newMap({ id: r.id, name: r.name, parent: r.parentId, depth: r.depth, state: r.state, index: r.index, kcid: r.kcid, children: r.children.slice(), mem: r.cfg.mem, storage: r.cfg.storage, used: r.disk.used, tree: this.treeStorage(r) });
      },
      create(osys, [name]) {
        const idx = this.nextIndex++; const id = 'inner-' + idx;
        const r = new SysRec(id, idx, name || id, osys.id, osys.depth + 1);
        r.disk = new Disk(this, id, this.base); r.created = this.clock;
        this.systems.set(id, r); osys.children.push(id);
        return newMap({ h: hdl('sys', id), id, index: idx, depth: r.depth });
      },
      bind(osys, [h, kref]) {
        const r = this.checkSub(osys, h); if (!r) return E('不是直属子系统');
        if (!kref || !this.vm.ctxs.has(kref.id)) return E('内核进程无效');
        r.kcid = kref.id; this.kctx.set(kref.id, r.id); const c = this.vm.ctxs.get(kref.id); c.sysId = r.id; return true;
      },
      state(osys, [h, s]) { const r = this.checkSub(osys, h); if (!r) return E('不是直属子系统'); r.state = String(s); return true; },
      rename(osys, [h, n]) { const r = h ? this.checkSub(osys, h) : osys; if (!r) return E('不是直属子系统'); r.name = String(n); return true; },
      remove(osys, [h]) { const r = this.checkSub(osys, h); if (!r) return E('不是直属子系统'); this.removeSys(r); return true; },
      children(osys, [h]) {
        const r = h ? this.checkSub(osys, h) : osys; if (!r) return [];
        return r.children.map((c) => { const s = this.systems.get(c); return newMap({ h: hdl('sys', c), id: c, name: s.name, state: s.state, index: s.index }); });
      },
      setcfg(osys, [h, cfg]) {
        const r = this.checkSub(osys, h); if (!r) return E('不是直属子系统');
        if (cfg && typeof cfg.mem === 'number') r.cfg.mem = cfg.mem;
        if (cfg && typeof cfg.storage === 'number') r.cfg.storage = cfg.storage;
        if (r.kcid && this.vm.ctxs.has(r.kcid)) this.vm.ctxs.get(r.kcid).memLimit = r.cfg.mem;
        return true;
      },
      setself(osys, [cfg]) { return D.sys.setroot.call(this, osys, [cfg]); },
      ancestors(osys) { return this.ancestors(osys).slice(1).map((r) => newMap({ h: hdl('sys', r.id), id: r.id, depth: r.depth, name: r.name })); },
      setroot(osys, [cfg]) { // 根系统自身配额（仅根）
        if (osys.id !== 'outer') return E('仅根系统可调整');
        if (typeof cfg.budget === 'number') this.budget = Math.max(2000, Math.min(2000000, cfg.budget));
        if (typeof cfg.mem === 'number') osys.cfg.mem = cfg.mem;
        if (typeof cfg.storage === 'number') osys.cfg.storage = cfg.storage;
        return true;
      },
      budget(osys) { return newMap({ total: this.budget, granted: this.granted, used: this.used, svc: this.svcUsed, step: this.stepNo, mem: osys.cfg.mem, storage: osys.cfg.storage }); },
      memory(osys, [h]) { const r = h ? this.checkSub(osys, h) : osys; if (!r || !r.kcid) return 0; return this.vm.treeMem(r.kcid); },
      depth(osys) { return osys.depth; },
      wall() { return this.wall0; },
    };
    D.gfx = {
      screen(osys) { return newMap({ c: hdl('ctx', osys.kcid), v: 0 }); },
      submit(osys, [cref, v, cmds]) {
        if (!cref || !this.vm.inTree(osys.kcid, cref.id)) return E('显示来源无效');
        if (this.display) this.display.submit(cref.id, v, cmds, osys.id);
        return true;
      },
      free(osys, [cref, v]) { if (cref && this.display) this.display.free(cref.id, v); return true; },
      size(osys, [cref, v, w, h]) { return true; },
    };
    D.scene = {
      load(osys, [cref, sc, scene]) {
        if (!cref || !this.vm.inTree(osys.kcid, cref.id)) return E('场景来源无效');
        const sz = sizeOf(scene) * 16; const c = this.vm.ctxs.get(cref.id);
        const lim = this.memLimitOf(osys);
        if (lim > 0 && this.vm.treeMem(osys.kcid) + sz > lim) return E('内存配额不足，无法载入场景');
        if (this.display) this.display.sceneLoad(cref.id, sc, scene);
        if (c) c.devMem = (c.devMem || 0) + sz;
        return newMap({ ok: true, size: sz });
      },
      state(osys, [cref, sc, st]) { if (this.display) this.display.sceneState(cref.id, sc, st); return true; },
      free(osys, [cref, sc]) { if (this.display) this.display.sceneFree(cref.id, sc); return true; },
      pick(osys, [cref, sc, cam, x, y, w, h]) { return this.display ? this.display.scenePick(cref.id, sc, cam, x, y, w, h) : null; },
    };
    D.input = {
      get(osys, [cref, v, id]) { return this.display ? this.display.inputValue(cref.id, v, id) : null; },
      set(osys, [cref, v, id, text]) { if (this.display) this.display.inputSet(cref.id, v, id, text); return true; },
    };
  }
  memLimitOf(osys) { let lim = 0; for (const r of this.ancestors(osys)) { if (r.cfg.mem > 0) lim = lim ? Math.min(lim, r.cfg.mem) : r.cfg.mem; } return lim; }

  removeSys(r) {
    for (const c of [...r.children]) { const s = this.systems.get(c); if (s) this.removeSys(s); }
    const p = r.parentId && this.systems.get(r.parentId); if (p) p.children = p.children.filter((x) => x !== r.id);
    if (r.kcid) this.kctx.delete(r.kcid);
    this.systems.delete(r.id);
  }

  // 供 inspect 使用
  systemList() {
    return [...this.systems.values()].map((r) => ({ id: r.id, parentId: r.parentId, name: r.name, state: r.state, depth: r.depth }));
  }
}
