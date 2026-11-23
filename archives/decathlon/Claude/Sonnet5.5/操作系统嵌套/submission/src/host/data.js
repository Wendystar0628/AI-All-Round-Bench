// 数据连接：根系统电子表格 → 子系统图表的实时订阅。
// 连接按“工作簿文档身份 + 选区”建立；数据以副本沿事件通道逐级传入子系统（每次提交并完成重算后发布完整选区的新版本）。
// 暂停的子树不会取走事件：更新在子树边界外按序暂存，恢复后交给子系统按序处理。
import { newMap, hdl } from './vm.js';
import { parseAddr } from './sheet.js';

export function installData(machine, display, env) {
  const D = machine.devs; const svc = machine.services; const E = (m) => newMap({ err: m });
  const subs = new Map(); let seq = 1;
  const sheets = () => [...display.natives.values()].filter((i) => i.kind === 'sheet');
  const docOf = (id) => { const s = sheets().find((x) => x.docId === id); return s ? s.wb : null; };
  const parseRange = (r) => {
    const m = /^([A-Z]\d+)(?::([A-Z]\d+))?$/.exec(String(r).trim().toUpperCase()); if (!m) return null;
    const a = parseAddr(m[1]), b = parseAddr(m[2] || m[1]); if (!a || !b) return null;
    return { c1: Math.min(a.c, b.c), r1: Math.min(a.r, b.r), c2: Math.max(a.c, b.c), r2: Math.max(a.r, b.r) };
  };
  const payload = (sub, wb) => { const g = sub.range; return wb.rangeValues(g.c1, g.r1, g.c2, g.r2); };

  svc.data = {
    subs,
    // 一次提交并完成重算后发布：作为一项按规模付费的工作，付清后才交付结果
    publish(wb, cost) {
      const targets = [...subs.values()].filter((s) => s.docId === wb.id && s.state === 'live');
      if (!targets.length) return;
      const version = wb.version;
      machine.addJob(Math.max(20, (cost || 40) + targets.length * 10), () => {
        for (const s of targets) {
          if (s.state !== 'live') continue;
          s.version++; s.docVersion = version;
          machine.postEvent(s.sysId, { k: 'data', kind: 'update', sub: hdl('sub', s.id), version: s.version, docVersion: version, values: payload(s, wb), title: wb.title, dirty: wb.dirty });
        }
      });
    },
    sourceClosed(docId) {
      for (const s of subs.values()) if (s.docId === docId && s.state === 'live') {
        s.state = 'source-closed';
        machine.postEvent(s.sysId, { k: 'data', kind: 'source_closed', sub: hdl('sub', s.id), version: s.version });
      }
    },
  };

  D.data = {
    books() { return sheets().map((i) => newMap({ doc: i.docId, title: i.wb.title, path: i.wb.path, dirty: i.wb.dirty, version: i.wb.version, wid: i.wid })); },
    open(osys, [c, spec]) {
      const wb = docOf(spec && spec.doc); if (!wb) return E('该工作簿没有在根系统打开');
      const range = parseRange(spec.range); if (!range) return E('区域无效：' + spec.range);
      const id = 'sub-' + seq++;
      const s = { id, sysId: osys.id, docId: wb.id, range, state: 'live', version: 1, docVersion: wb.version };
      subs.set(id, s);
      return newMap({ sub: hdl('sub', id), version: 1, values: payload(s, wb), title: wb.title, path: wb.path, dirty: wb.dirty, docVersion: wb.version });
    },
    close(osys, [c, sub]) { const s = sub && subs.get(sub.id); if (s) { s.state = 'closed'; subs.delete(sub.id); } return true; },
    info(osys, [c, sub]) {
      const s = sub && subs.get(sub.id); if (!s) return newMap({ state: 'closed' });
      const wb = docOf(s.docId);
      return newMap({ state: s.state, version: s.version, open: !!wb, title: wb ? wb.title : '' });
    },
  };

  // 释放：关闭系统或停止子树时释放对应订阅
  machine.killHooks.push((ctx) => {
    if (!ctx.kernel) return;
    const sid = ctx.sysId; if (!sid) return;
    for (const [id, s] of subs) if (s.sysId === sid) subs.delete(id);
  });

  // 快照 / 分叉：订阅记录随快照保存，恢复后处于“已恢复，待重新连接”，用户重新连接时建立新连接
  let subMap = null;
  machine.snapHooks.push({
    name: 'data',
    save(cidSet, sysSet) { const out = []; for (const s of subs.values()) if (sysSet.has(s.sysId)) out.push({ ...s }); return out; },
    prepare(data, isFork) {
      subMap = new Map();
      if (isFork) for (const s of data || []) subMap.set(s.id, 'sub-' + seq++);
    },
    restore(data, mapCid, mapSys, isFork) {
      for (const s of data || []) {
        const nid = isFork ? subMap.get(s.id) : s.id;
        subs.set(nid, { ...s, id: nid, sysId: isFork ? (mapSys(s.sysId) || s.sysId) : s.sysId, state: 'restored' });
      }
    },
  });
  machine.handleRemappers.push((m) => { if (m.$h === 'sub' && subMap && subMap.has(m.id)) m.id = subMap.get(m.id); });
}
