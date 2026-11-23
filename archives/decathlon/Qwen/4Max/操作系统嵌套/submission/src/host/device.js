'use strict';
// 显示设备门面：管理各系统进程的二维提交、三维场景与日志，驱动视图绘制。
const device3d = require('./device3d.js');
const d2 = require('./device2d.js');

class Device {
  constructor(os) {
    this.os = os;
    this.subs = new Map();      // sysId:pid -> {content, base, overlay, logs, version}
    this.scenes = new Map();    // sysId -> Map(handle -> ownerPid)
    this.views = new Set();
    this.blinkOn = true;
    this.frame = 0;
    setInterval(() => { this.blinkOn = !this.blinkOn; }, 530);
  }
  key(sys, pid) { return sys.id + ':' + pid; }
  getSub(sys, pid) {
    const k = this.key(sys, pid);
    if (!this.subs.has(k)) this.subs.set(k, { content: null, base: null, overlay: null, logs: [], version: 0, sysId: sys.id, pid });
    return this.subs.get(k);
  }
  peekSub(sysId, pid) { return this.subs.get(sysId + ':' + pid) || null; }
  submit2d(sys, pid, list, layer) {
    const s = this.getSub(sys, pid);
    if (layer === 'base') s.base = list;
    else if (layer === 'overlay') s.overlay = list;
    else s.content = list;
    s.version++;
    this.os.dirty = true;
  }
  loadScene(sys, pid, res) {
    try {
      const data = typeof res === 'string' ? JSON.parse(res) : res;
      if (!data || data.format !== 'nestedos-scene') return { ok: false, error: '场景格式错误（需要 nestedos-scene）' };
      const handle = device3d.load(data);
      if (!this.scenes.has(sys.id)) this.scenes.set(sys.id, new Map());
      this.scenes.get(sys.id).set(handle, pid);
      return { ok: true, handle };
    } catch (e) { return { ok: false, error: '场景载入失败: ' + (e.message || e) }; }
  }
  sceneState(sys, pid, handle, state) {
    device3d.setState(handle, state);
    this.os.dirty = true;
  }
  closeScene(sys, pid, handle) {
    device3d.close(handle);
    const m = this.scenes.get(sys.id);
    if (m) m.delete(handle);
  }
  appendLog(sys, pid, text) {
    const s = this.getSub(sys, pid);
    s.logs.push(String(text));
    if (s.logs.length > 500) s.logs.shift();
    s.version++;
    this.os.dirty = true;
  }
  dropOwner(sys, pid) {
    this.subs.delete(this.key(sys, pid));
    const m = this.scenes.get(sys.id);
    if (m) {
      for (const [h, owner] of Array.from(m.entries())) {
        if (owner === pid) { device3d.close(h); m.delete(h); }
      }
    }
  }
  dropInstance(sys) {
    for (const k of Array.from(this.subs.keys())) if (k.startsWith(sys.id + ':')) this.subs.delete(k);
    const m = this.scenes.get(sys.id);
    if (m) { for (const h of m.keys()) device3d.close(h); this.scenes.delete(sys.id); }
  }
  instanceMem(sys) {
    let t = 0;
    for (const [k, s] of this.subs.entries()) {
      if (!k.startsWith(sys.id + ':')) continue;
      if (s.content) t += JSON.stringify(s.content).length;
      if (s.base) t += JSON.stringify(s.base).length;
      if (s.overlay) t += JSON.stringify(s.overlay).length;
    }
    const m = this.scenes.get(sys.id);
    if (m) for (const h of m.keys()) {
      const st = device3d.getState(h);
      if (st) for (const k of Object.keys(st)) if (st[k]) t += JSON.stringify(st[k]).length;
    }
    return t;
  }
  snapshotInstance(sys) {
    const subs = [];
    for (const [k, s] of this.subs.entries()) {
      if (!k.startsWith(sys.id + ':')) continue;
      subs.push({ pid: s.pid, content: s.content, base: s.base, overlay: s.overlay, logs: s.logs.slice(-100) });
    }
    const scenes = [];
    const m = this.scenes.get(sys.id);
    if (m) {
      const all = device3d.snapshotHandles();
      for (const rec of all) {
        if (m.has(rec.handle)) scenes.push({ handle: rec.handle, owner: m.get(rec.handle), res: rec.res, parts: rec.parts });
      }
    }
    return { subs, scenes };
  }
  restoreInstance(sys, data) {
    for (const s of data.subs || []) {
      const sub = this.getSub(sys, s.pid);
      sub.content = s.content; sub.base = s.base; sub.overlay = s.overlay; sub.logs = s.logs || [];
      sub.version++;
    }
    if (!this.scenes.has(sys.id)) this.scenes.set(sys.id, new Map());
    for (const sc of data.scenes || []) {
      device3d.restoreHandle(sc.handle, sc.res, sc.parts);
      this.scenes.get(sys.id).set(sc.handle, sc.owner);
    }
  }
  registerView(v) { this.views.add(v); }
  unregisterView(v) { this.views.delete(v); }
  renderAll() {
    this.frame++;
    for (const v of this.views) {
      try { v.render(this); } catch (e) { console.error('view render error', e); }
    }
  }
  render3dOp(it, ctx) {
    device3d.renderTo(it.handle, ctx, it.x, it.y, it.w, it.h);
  }
  pick(sysId, handle, nx, ny, w, h) { return device3d.pick(handle, nx, ny, w, h); }
  frameTime(handle) { return device3d.frameTime(handle); }
}

module.exports = { Device, device3d, d2 };
