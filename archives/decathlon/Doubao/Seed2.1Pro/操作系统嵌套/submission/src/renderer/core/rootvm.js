/* 根系统虚拟机（宿主直接实现，题面允许根系统由宿主实现）。
 * 负责：主 tick 调度、根文件系统、直属子系统承载、浏览器/电子表格等根应用、
 * 实时数据桥、投送注册表、持久化。 */
'use strict';
window.NOS = window.NOS || {};

const ROOT_TICK_MS = 1000 / 30;

class RootVM {
  constructor() {
    this.children = [];          // 直属 Instance
    this.instances = new Map();  // id -> Instance（全局注册表）
    this.childSeq = 0;
    this.time = 0;
    this.state = 'running';
    this.projSeq = 0;
    this.projections = [];      // {id, sourceInst, sourcePid, appId, targetId, win:{...}}
    this.clipboard = [];        // 剪贴板历史
    this.dataSources = new Map(); // workbook title -> {model, subscribers}
    this.connections = [];
    this.connSeq = 0;
    this.eventTarget = new EventTargetLike();
    this.rate = 1;
    this._notifications = [];
    this.blobStore = null;
  }

  init(blobStore) {
    this.blobStore = blobStore;
  }

  allocChildId() { this.childSeq++; return 'inner-' + this.childSeq; }
  setChildSeq(n) { this.childSeq = n; }

  registerInstance(inst) {
    this.instances.set(inst.id, inst);
    if (inst.parent === null || inst.parent === this._rootInstanceMarker) {
      if (!this.children.includes(inst)) this.children.push(inst);
    }
    this.eventTarget.emit('systems');
  }
  unregisterInstance(id) { this.instances.delete(id); this.children = this.children.filter(c => c.id !== id); this.eventTarget.emit('systems'); }
  replaceInstance(oldId, inst) {
    this.instances.delete(oldId);
    this.instances.set(inst.id, inst);
    const idx = this.children.findIndex(c => c.id === oldId);
    if (idx >= 0) this.children[idx] = inst;
    this.eventTarget.emit('systems');
  }

  createRootChild(opts) {
    const id = opts.id || this.allocChildId();
    const inst = new NOS.Instance({
      id, name: opts.name || id, parent: null, parentVfs: this.vfs, depth: 1, store: this.blobStore,
      totalBudget: opts.totalBudget || 60000
    });
    inst.parent = null;
    // 让 instance 能注册到根
    inst.initFreshFiles();
    inst.start();
    this.children.push(inst);
    this.registerInstance(inst);
    return inst;
  }

  findInstance(id) { return this.instances.get(id) || null; }

  /* 主循环 */
  tick(dtReal) {
    if (this.state === 'paused') return;
    const dt = dtReal * this.rate;
    this.time += dt;
    // 直属子系统（根的“承载进程”）
    for (const ch of this.children) {
      if (ch.state === 'paused' || ch.state === 'stopped' || ch.state === 'closed') continue;
      ch.grantToMe = ch._rootGrant !== undefined ? ch._rootGrant : 42000;
      ch.advance(dt);
    }
    // 清理已关闭投送
    this.checkProjections();
    // 根应用更新（由各自模块自驱动，这里只发时钟事件）
    this.eventTarget.emit('tick', this.time);
  }

  checkProjections() {
    for (const p of this.projections.slice()) {
      const inst = this.instances.get(p.sourceInstanceId || (p.sourceInst && p.sourceInst.id));
      if (!inst || inst.state === 'closed') {
        this.unregisterProjection(p.id, true);
      }
    }
  }

  /* ---------- 实时数据 ---------- */
  registerWorkbook(title, model) {
    let ds = this.dataSources.get(title);
    if (!ds) { ds = { model, subscribers: [], version: 0 }; this.dataSources.set(title, ds); }
    ds.model = model;
    return ds;
  }
  publishWorkbook(title, model) {
    const ds = this.registerWorkbook(title, model);
    ds.version++;
    const version = this.extractRange(model, ds.lastSpec || { range: 'A1:D4', labelCol: 0, seriesCols: [3] });
    version.version = ds.version;
    for (const sub of ds.subscribers) sub.callback(version);
    this.eventTarget.emit('data', title);
  }
  extractRange(model, spec) {
    const rows = model.rangeMatrix(spec.range);
    return {
      title: model.filename, range: spec.range, version: 0,
      labelCol: spec.labelCol, seriesCols: spec.seriesCols,
      rows: rows.map(r => r.map(c => ({ raw: c.raw, value: c.value, err: c.err })))
    };
  }

  connectChart(inst, pid, spec, callback) {
    const title = spec.sourceTitle || 'sample.sheet';
    const ds = this.dataSources.get(title) || this.registerWorkbook(title, this._fallbackSheet());
    ds.lastSpec = spec;
    const id = ++this.connSeq;
    const sub = { id, instId: inst.id, pid, callback, spec };
    ds.subscribers.push(sub);
    this.connections.push({ id, ds, sub });
    const initial = this.extractRange(ds.model, spec);
    initial.version = ds.version;
    return { connectionId: id, initial };
  }
  disconnectChart(id) {
    const c = this.connections.find(x => x.id === id);
    if (!c) return;
    c.ds.subscribers = c.ds.subscribers.filter(s => s.id !== id);
    this.connections = this.connections.filter(x => x.id !== id);
  }

  _fallbackSheet() {
    if (!this.__fallback) {
      this.__fallback = NOS.SheetModel.deserialize(NOS.SheetModel.sampleWorkbook());
      this.__fallback.filename = 'sample.sheet';
    }
    return this.__fallback;
  }

  /* ---------- 投送 ---------- */
  registerProjection(sourceInst, p) {
    p.sourceInstanceId = sourceInst.id;
    p.sourceInst = sourceInst;
    p.win = p.win || { x: 120 + this.projections.length * 26, y: 80, w: 760, h: 500, state: 'normal', min: false };
    this.projections.push(p);
    this.eventTarget.emit('projections');
  }
  unregisterProjection(id, gone) {
    const p = this.projections.find(x => x.id === id);
    this.projections = this.projections.filter(x => x.id !== id);
    this.eventTarget.emit('projections', { id, gone: !!gone });
  }
  focusProjection(id) { this.eventTarget.emit('projection-focus', id); }

  pushClipboard(item, sourceId) {
    this.clipboard.push({ time: this.time, source: sourceId || 'outer', text: typeof item === 'string' ? item : JSON.stringify(item), data: item });
    if (this.clipboard.length > 100) this.clipboard.shift();
    this.eventTarget.emit('clipboard');
  }

  notify(n) {
    this._nseq = (this._nseq || 0) + 1;
    this._notifications.push(Object.assign({ id: this._nseq, time: this.time, read: false }, n));
    if (this._notifications.length > 100) this._notifications.shift();
    this.eventTarget.emit('notify');
  }

  /* ---------- 持久化 ---------- */
  persistData() {
    return {
      childSeq: this.childSeq,
      time: this.time,
      vfs: this.vfs ? this.vfs.serialize() : null,
      children: this.children.map(c => c.serializeTree())
    };
  }
}

class EventTargetLike {
  constructor() { this.h = {}; }
  on(t, fn) { (this.h[t] = this.h[t] || []).push(fn); }
  emit(t, arg) { (this.h[t] || []).forEach(fn => { try { fn(arg); } catch (e) {} }); }
}

NOS.RootVM = RootVM;
