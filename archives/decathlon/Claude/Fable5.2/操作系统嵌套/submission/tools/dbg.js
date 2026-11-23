// 调试辅助：在页面里定义 dbg(sysId, procName, globalName)
window.dbgCtx = function (sysId) {
  let c = OS.kernel.children[sysId];
  if (c) return c.ctx;
  const find = (ctx) => { const kids = NVM.peek(ctx, 'CHILDREN'); for (const id in kids) { if (id === sysId) return kids[id].ctx.ctx; if (kids[id].ctx) { const r = find(kids[id].ctx.ctx); if (r) return r; } } return null; };
  for (const k of Object.values(OS.kernel.children)) { if (k.ctx) { const r = find(k.ctx); if (r) return r; } }
  return null;
};
window.dbgProc = function (sysId, name) { const ctx = dbgCtx(sysId); const ps = NVM.peek(ctx, 'PROCS'); return ps.find(p => p.name === name || p.app === name || p.pid === name); };
window.dbg = function (sysId, name, g) { const p = dbgProc(sysId, name); if (!p || !p.ctx) return p ? { st: p.st, err: p.err } : null; return NVM.fromGuest(NVM.peek(p.ctx.ctx, g)); };
window.dbgPs = function (sysId) { const ctx = dbgCtx(sysId); return NVM.peek(ctx, 'PROCS').map(p => [p.pid, p.name, p.st, p.used, p.err, (p.out || []).slice(-2).join('|')].join(' ')); };
