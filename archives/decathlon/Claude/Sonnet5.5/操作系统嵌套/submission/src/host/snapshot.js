// 子树快照 / 恢复 / 分叉：保存选定内核上下文及其全部后代的执行状态、系统注册表、磁盘与显示提交。
import { NATIVES, newMap, hdl, loadProgram, Ctx, NSError, SUSPEND } from './vm.js';

function def(name, fn, est) { NATIVES[name] = { name, fn, est }; }

// ---- 值序列化（保留共享引用与环） ----
function serValues(roots) {
  const counts = new Map();
  const count = (v) => {
    if (v === null || typeof v !== 'object') return;
    const c = counts.get(v); if (c) { counts.set(v, c + 1); return; }
    counts.set(v, 1);
    if (Array.isArray(v)) for (let i = 0; i < v.length; i++) count(v[i]); else for (const k in v) count(v[k]);
  };
  for (const r of roots) count(r);
  const ids = new Map(); let nextId = 1; const done = new Set();
  const ser = (v) => {
    if (v === null || v === undefined) return null;
    const t = typeof v;
    if (t === 'number') return Number.isFinite(v) ? v : { '~n': String(v) };
    if (t !== 'object') return v;
    const shared = counts.get(v) > 1;
    if (shared) {
      if (done.has(v)) return { '~r': ids.get(v) };
      ids.set(v, nextId++); done.add(v);
    }
    if (Array.isArray(v)) {
      const arr = new Array(v.length); for (let i = 0; i < v.length; i++) arr[i] = ser(v[i]);
      return shared ? { '~a': ids.get(v), v: arr } : arr;
    }
    const o = {}; for (const k in v) o[k] = ser(v[k]);
    return shared ? { '~m': o, '~i': ids.get(v) } : { '~m': o };
  };
  return roots.map(ser);
}

function makeDeserializer(remap) {
  const refs = new Map();
  const de = (x) => {
    if (x === null || typeof x !== 'object') return x === undefined ? null : x;
    if (Array.isArray(x)) { const a = new Array(x.length); for (let i = 0; i < x.length; i++) a[i] = de(x[i]); return a; }
    if ('~r' in x) return refs.get(x['~r']);
    if ('~n' in x) return Number(x['~n']);
    if ('~a' in x) { const a = []; refs.set(x['~a'], a); for (const y of x.v) a.push(de(y)); return a; }
    const m = Object.create(null);
    if ('~i' in x) refs.set(x['~i'], m);
    const o = x['~m'];
    for (const k in o) m[k] = de(o[k]);
    if (remap && m.$h !== undefined) remap(m);
    return m;
  };
  return de;
}

// 遍历值，对其中的句柄调用 fn（用于显示指令等宿主侧数据）
export function remapTree(v, remap, depth = 0) {
  if (v === null || typeof v !== 'object' || depth > 60) return v;
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) remapTree(v[i], remap, depth + 1); return v; }
  if (v.$h !== undefined) remap(v);
  for (const k in v) remapTree(v[k], remap, depth + 1);
  return v;
}

function subtreeCtxs(vm, rootCid) {
  const out = []; const walk = (cid) => { const c = vm.ctxs.get(cid); if (!c) return; out.push(c); for (const k of c.children) walk(k); };
  walk(rootCid); return out;
}
function subtreeSystems(M, rootSysId) {
  const out = []; const walk = (id) => { const r = M.systems.get(id); if (!r) return; out.push(r); for (const k of r.children) walk(k); };
  walk(rootSysId); return out;
}

function packCtx(c, progIdx) {
  const vals = serValues([c.stack, c.globals, c.args, c.trap ? c.trap.args : null, c.result, c.pendingRun]);
  return {
    cid: c.cid, owner: c.owner, name: c.name, priv: c.priv, kernel: c.kernel, prog: progIdx, f: c.f, pc: c.pc, base: c.base,
    frames: c.frames, state: c.state, trapName: c.trap ? c.trap.name : null, err: c.err, own: c.own, inner: c.inner, debt: c.debt, pay: c.pay,
    rng: c.rng, memLimit: c.memLimit, devMem: c.devMem, sysId: c.sysId, created: c.created, vals,
  };
}

export function snapshotSubtree(M, kcid) {
  const vm = M.vm; const root = vm.ctxs.get(kcid); if (!root) throw new NSError('子系统未运行');
  const ctxs = subtreeCtxs(vm, kcid);
  const progs = []; const progIdx = new Map();
  const packed = ctxs.map((c) => {
    let i = progIdx.get(c.prog);
    if (i === undefined) { i = progs.length; progs.push(c.prog); progIdx.set(c.prog, i); }
    return packCtx(c, i);
  });
  const sysRoot = M.kctx.get(kcid);
  const systems = subtreeSystems(M, sysRoot).map((r) => ({
    id: r.id, index: r.index, name: r.name, parentId: r.parentId, depth: r.depth, children: r.children, state: r.state, kcid: r.kcid,
    cfg: r.cfg, screen: r.screen, disk: r.disk.serialize(),
  }));
  const cidSet = new Set(ctxs.map((c) => c.cid));
  const disp = M.display ? M.display.snapshotCtxs(cidSet) : null;
  const hooks = {};
  for (const h of M.snapHooks || []) hooks[h.name] = h.save(cidSet, new Set(systems.map((s) => s.id)));
  return { v: 1, root: kcid, rootSys: sysRoot, progs, ctxs: packed, systems, display: disp, hooks, clock: M.clock };
}

function sizeEstimate(c, h) { const t = h && c.vm.ctxs.get(h.id); return Math.max(300, Math.floor(((t && t.treeCache && t.treeCache.v) || 40000) / 48)); }

def('vm_snapshot', (c, [h]) => {
  if (!c.priv || !h || h.$h !== 'ctx') throw new NSError('权限不足');
  const t = c.vm.ctxs.get(h.id); if (!t || t.owner !== c.cid) throw new NSError('不能快照不属于本内核的进程');
  const M = c.vm.machine;
  const snap = snapshotSubtree(M, h.id);
  return JSON.stringify(snap);
}, ([h], c) => sizeEstimate(c, h));

function loadCtxs(M, snap, mapCid, mapSys, ownerOverride) {
  const vm = M.vm;
  const remap = (m) => {
    if (m.$h === 'ctx') { const n = mapCid(m.id); if (n !== undefined) m.id = n; }
    else if (m.$h === 'sys') { const n = mapSys(m.id); if (n !== undefined) m.id = n; }
    else for (const hk of M.handleRemappers || []) hk(m, mapCid, mapSys);
  };
  const de = makeDeserializer(remap);
  const progs = snap.progs.map((p) => loadProgram(p));
  const created = [];
  for (const s of snap.ctxs) {
    const cid = mapCid(s.cid);
    const prog = progs[s.prog];
    const owner = s.cid === snap.root ? ownerOverride : mapCid(s.owner);
    const ctx = new Ctx(vm, cid, prog, { owner, priv: s.priv, kernel: s.kernel, name: s.name, sysId: s.sysId });
    if (cid >= vm.nextCid) vm.nextCid = cid + 1;
    const [stack, globals, args, trapArgs, result, pending] = s.vals.map(de);
    ctx.stack = stack; ctx.globals = globals; ctx.args = args; ctx.result = result;
    ctx.f = s.f; ctx.pc = s.pc; ctx.base = s.base; ctx.frames = s.frames; ctx.state = s.state;
    ctx.trap = s.trapName ? { name: s.trapName, args: trapArgs || [] } : null; ctx.err = s.err;
    ctx.own = s.own; ctx.inner = s.inner; ctx.debt = s.debt; ctx.pay = s.pay; ctx.rng = s.rng; ctx.memLimit = s.memLimit; ctx.devMem = s.devMem;
    if (pending) { pending.cid = mapCid(pending.cid) ?? pending.cid; ctx.pendingRun = { cid: pending.cid, left: pending.left, used: pending.used }; }
    ctx.sysId = s.sysId ? (mapSys(s.sysId) ?? s.sysId) : null;
    vm.ctxs.set(cid, ctx); created.push(ctx);
  }
  for (const ctx of created) { const o = vm.ctxs.get(ctx.owner); if (o) o.children.add(ctx.cid); }
  return { created, remap };
}

// 恢复到原实例：整棵子树回到保存时刻（cid / 系统 id 保持不变）
def('vm_restore', (c, [h, blob]) => {
  if (!c.priv || !h || h.$h !== 'ctx') throw new NSError('权限不足');
  const t = c.vm.ctxs.get(h.id); if (!t || t.owner !== c.cid) throw new NSError('不能恢复不属于本内核的进程');
  const M = c.vm.machine; const vm = c.vm;
  let snap; try { snap = JSON.parse(blob); } catch (e) { return newMap({ err: '快照数据损坏' }); }
  if (snap.root !== h.id) return newMap({ err: '快照来自另一个实例（请使用“分叉/打开”创建新实例）' });
  const rootSysId = M.kctx.get(h.id);
  // 结束现有子树（保留根内核的 owner 与 cid）
  const oldOwner = t.owner;
  for (const ch of [...t.children]) vm.kill(ch);
  vm.ctxs.delete(h.id); const o = vm.ctxs.get(oldOwner); if (o) o.children.delete(h.id);
  if (M.display) M.display.dropCtx(h.id);
  // 系统注册表：子树内的记录整体替换
  const parentRec = M.systems.get(M.systems.get(rootSysId).parentId);
  const oldSys = subtreeSystems(M, rootSysId);
  for (const r of oldSys) { if (r.id !== rootSysId) M.systems.delete(r.id); }
  for (const r of oldSys) { if (r.kcid) M.kctx.delete(r.kcid); }
  for (const s of snap.systems) {
    let r = M.systems.get(s.id);
    if (!r) { r = Object.create(Object.getPrototypeOf(M.systems.get(rootSysId))); M.systems.set(s.id, r); }
    Object.assign(r, { id: s.id, index: s.index, name: s.name, parentId: s.id === rootSysId ? parentRec.id : s.parentId, depth: s.depth, children: s.children.slice(), state: s.state, kcid: s.kcid, cfg: { ...s.cfg }, screen: { ...s.screen } });
    if (!r.disk) r.disk = M.newDisk(s.id);
    r.disk.load(s.disk);
    if (s.kcid) M.kctx.set(s.kcid, s.id);
  }
  for (const hk of M.snapHooks || []) hk.prepare && hk.prepare(snap.hooks[hk.name], false);
  const { created } = loadCtxs(M, snap, (x) => x, (x) => x, oldOwner);
  if (M.display) M.display.restoreCtxs(snap.display, (x) => x, (m) => m);
  for (const hk of M.snapHooks || []) hk.restore(snap.hooks[hk.name], (x) => x, (x) => x, false);
  M.vm.ctxs.get(h.id).memLimit = M.systems.get(rootSysId).cfg.mem;
  return newMap({ ok: true, ctxs: created.length });
}, ([h, blob]) => Math.max(300, ((blob && blob.length) || 0) >> 7));

// 分叉：从快照在调用者名下创建一棵全新的子树（新的 cid 与系统 id，内部关系指向分叉内的对应节点）
def('vm_fork', (c, [blob, name]) => {
  if (!c.priv) throw new NSError('权限不足');
  const M = c.vm.machine; const vm = c.vm;
  let snap; try { snap = JSON.parse(blob); } catch (e) { return newMap({ err: '快照数据损坏' }); }
  const callerSys = M.systems.get(M.kctx.get(c.cid)); if (!callerSys) return newMap({ err: '调用者不是内核' });
  const cidMap = new Map(); for (const s of snap.ctxs) cidMap.set(s.cid, vm.nextCid++);
  const sysMap = new Map();
  for (const s of [...snap.systems].sort((a, b) => a.index - b.index)) sysMap.set(s.id, 'inner-' + M.nextIndex++);
  const mapCid = (x) => cidMap.get(x); const mapSys = (x) => sysMap.get(x);
  const SysRec = Object.getPrototypeOf(callerSys).constructor;
  for (const s of snap.systems) {
    const nid = sysMap.get(s.id);
    const r = new SysRec(nid, Number(nid.slice(6)), s.id === snap.rootSys ? (name || s.name) : s.name, s.id === snap.rootSys ? callerSys.id : sysMap.get(s.parentId), 0);
    r.depth = s.id === snap.rootSys ? callerSys.depth + 1 : 0; // 深度稍后统一计算
    r.children = s.children.map((x) => sysMap.get(x)); r.state = s.state; r.cfg = { ...s.cfg }; r.screen = { ...s.screen }; r.created = M.clock;
    r.kcid = s.kcid ? cidMap.get(s.kcid) : null;
    r.disk = M.newDisk(nid); r.disk.load(s.disk);
    M.systems.set(nid, r);
  }
  const fixDepth = (id, d) => { const r = M.systems.get(id); r.depth = d; for (const k of r.children) fixDepth(k, d + 1); };
  const newRootSys = sysMap.get(snap.rootSys); fixDepth(newRootSys, callerSys.depth + 1);
  callerSys.children.push(newRootSys);
  for (const r of subtreeSystems(M, newRootSys)) if (r.kcid) M.kctx.set(r.kcid, r.id);
  for (const hk of M.snapHooks || []) hk.prepare && hk.prepare(snap.hooks[hk.name], true);
  const { created } = loadCtxs(M, snap, mapCid, mapSys, c.cid);
  for (const k of created) if (k.sysId == null && M.kctx.has(k.cid)) k.sysId = M.kctx.get(k.cid);
  if (M.display) M.display.restoreCtxs(snap.display, mapCid, (m) => { if (m.$h === 'ctx') { const n = mapCid(m.id); if (n !== undefined) m.id = n; } });
  for (const hk of M.snapHooks || []) hk.restore(snap.hooks[hk.name], mapCid, mapSys, true);
  const rk = cidMap.get(snap.root);
  const out = newMap({ kernel: hdl('ctx', rk), sys: hdl('sys', newRootSys), n: created.length });
  return out;
}, ([blob]) => Math.max(300, ((blob && blob.length) || 0) >> 7));
