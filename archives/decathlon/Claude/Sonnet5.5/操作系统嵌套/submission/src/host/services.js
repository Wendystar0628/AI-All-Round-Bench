// 宿主服务：这些是“硬件/外设”一侧的设备调用（显示缩放、剪贴板、本机导入导出、投送存活查询、拖放、数据连接、原生应用）。
import { newMap, hdl } from './vm.js';
import { installNatives } from './natives.js';
import { installData } from './data.js';

export function installServices(machine, display, env) {
  const D = machine.devs; const E = (m) => newMap({ err: m });
  const svc = machine.services = { clip: [], reset() { this.clip.length = 0; }, browserInfo: () => [] };

  D.display = {
    scale(osys, [c, s]) { if (osys.id !== 'outer') return E('只有根系统可以调整界面缩放'); machine.setScale && machine.setScale(Number(s) || 1); return true; },
    info(osys) { return newMap({ scale: machine.scale || 1, w: machine.root.screen.w, h: machine.root.screen.h }); },
  };

  D.proj = {
    alive(osys, [ref, target]) {
      const c = ref && machine.vm.ctxs.get(ref.id);
      if (!c || c.state === 'done' || c.state === 'error' || c.state === 'dead') return newMap({ alive: false });
      const sys = machine.sysOfCtx(ref.id); let paused = false; let r = sys;
      while (r && (!target || r.id !== target.id)) { if (r.state === 'paused' || r.state === 'error' || r.state === 'stopped') paused = true; r = r.parentId ? machine.systems.get(r.parentId) : null; }
      return newMap({ alive: true, paused, sys: sys ? sys.id : null });
    },
  };

  D.clip = {
    push(osys, [c, text, kind]) {
      if (typeof text !== 'string' || !text) return false;
      svc.clip.unshift({ text, kind: kind || 'text', t: machine.clock, sys: osys.id });
      if (svc.clip.length > 40) svc.clip.length = 40; return true;
    },
    list() { return svc.clip.map((x) => newMap(x)); },
    clear() { svc.clip.length = 0; return true; },
  };
  document.addEventListener('copy', () => {
    const a = document.activeElement; let t = '';
    try { if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) t = a.value.substring(a.selectionStart, a.selectionEnd); else t = String(window.getSelection()); } catch (e) { }
    if (t) { svc.clip.unshift({ text: t, kind: 'text', t: machine.clock, sys: 'outer' }); if (svc.clip.length > 40) svc.clip.length = 40; }
  });

  D.drag = {
    begin(osys, [c, payload]) { display.startDrag(payload); return true; },
    hover(osys, [c, info]) { display.dragHover(info); return true; },
    take(osys) {
      const d = display.drag; if (!d || !d.payload) return E('没有正在进行的拖放');
      const p = JSON.parse(JSON.stringify(d.payload)); const m = newMap(); m.items = p.items.map((x) => newMap(x)); m.from = p.from; m.label = p.label;
      display.endDrag(); return m;
    },
    end() { display.endDrag(); return true; },
  };
  // 导出/导入涉及异步 IPC：结果先登记，调用方稍后用 pending 取回
  const jobs = new Map(); let jobSeq = 1;
  D.fsx = {
    export(osys, [c, name, text]) {
      const id = jobSeq++; const rec = { done: false };
      jobs.set(id, rec);
      env.api.exportFile(String(name), String(text)).then((p) => { rec.done = true; rec.path = p; }).catch((e) => { rec.done = true; rec.err = String(e.message); });
      return newMap({ job: id });
    },
    list(osys) { const id = jobSeq++; const rec = { done: false }; jobs.set(id, rec); env.api.importList().then((l) => { rec.done = true; rec.list = l; }); return newMap({ job: id }); },
    import(osys, [c, name]) { const id = jobSeq++; const rec = { done: false }; jobs.set(id, rec); env.api.importFile(String(name)).then((r) => { rec.done = true; Object.assign(rec, r); }); return newMap({ job: id }); },
    poll(osys, [c, id]) {
      const r = jobs.get(id); if (!r) return E('任务不存在');
      if (!r.done) return newMap({ done: false });
      jobs.delete(id); const m = newMap({ done: true }); for (const k in r) if (k !== 'done') m[k] = r[k]; return m;
    },
  };

  installNatives(machine, display, env);
  installData(machine, display, env);
}
