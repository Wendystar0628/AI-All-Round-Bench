/* 内核通过 (sys "host-sys" name args...) 使用的宿主服务。
 * 这些服务实现机制性能力（VM 调度、消息队列、设备、持久化），
 * 策略（谁先运行、消息规则）写在 kernel.osl 中，可被改写。 */
'use strict';
window.NOS = window.NOS || {};
NOS.hostsvcs = {};

const S = NOS.hostsvcs;

/* 进程管理 */
S['proc-spawn'] = (inst, a) => {
  const [path, entry, argsArr, opts] = a;
  let prog;
  try { prog = inst.loadProgram(path); } catch (e) { return { __error: e.message }; }
  const pid = inst.nextPid++;
  const proc = new NOS.Proc(pid, NOS.VFS.baseName(path), prog, entry || 'main', argsArr || [],
    opts && opts.priority || 0, opts && opts.quota || 0);
  proc.vm = new NOS.VM(prog, null, {});
  try {
    proc.vm.start(proc.entry, proc.args);
  } catch (e) { return { __error: '启动失败: ' + e.message }; }
  proc.state = 'ready';
  inst.procs.push(proc);
  return { pid };
};

S['proc-kill'] = (inst, a) => {
  const p = inst.procs.find(x => x.pid === a[0]);
  if (!p) return { __error: '进程不存在' };
  p.state = 'done'; p.vm = null;
  return true;
};

S['proc-suspend'] = (inst, a) => {
  const p = inst.procs.find(x => x.pid === a[0]);
  if (!p) return { __error: '进程不存在' };
  if (p.pid === 1) return { __error: '不能挂起内核' };
  p.state = 'suspended';
  return true;
};

S['proc-resume'] = (inst, a) => {
  const p = inst.procs.find(x => x.pid === a[0]);
  if (!p) return { __error: '进程不存在' };
  if (p.state === 'suspended') p.state = 'ready';
  return true;
};

S['proc-list'] = (inst) => {
  return inst.procs.map(p => ({
    pid: p.pid, name: p.name, path: p.prog && p.prog.path,
    state: p.state, usedTotal: p.usedTotal, usedStep: p.usedStep,
    inbox: p.inbox.length, error: p.error, mem: estimateProcMem(p),
    waiting: p.vm && p.vm.wait ? p.vm.wait.ctx.type : null,
    quota: p.quota
  }));
};

function estimateProcMem(p) {
  let m = 0;
  if (p.vm) {
    try { m = JSON.stringify(p.vm.frames).length * 2 + JSON.stringify(p.vm.globalScope).length * 2; } catch (e) {}
    m += p.inbox.length * 64;
  }
  return m;
}

/* 运行一个用户进程（预算内）。内核决定调用谁、给多少。 */
S['proc-run'] = (inst, a) => {
  const [pid, budget] = a;
  const p = inst.procs.find(x => x.pid === pid);
  if (!p) return { __error: '进程不存在' };
  if (p.state === 'suspended' || p.state === 'done' || p.state === 'error') {
    return { state: p.state };
  }
  if (!p.vm) return { state: 'done' };
  // 先检查等待条件（时间/消息）
  if (p.vm.state === 'waiting') {
    const w = p.vm.wait;
    const ctx = w.ctx;
    if (ctx.type === 'time') {
      if ((ctx._left === undefined ? ctx.ms : ctx._left) <= 0) p.vm.resume(null);
      else return { state: 'waiting', wait: 'time', left: Math.max(0, ctx._left) };
    } else if (ctx.type === 'yield') {
      p.vm.resume(null);
    } else if (ctx.type === 'msg') {
      if (p.inbox.length) {
        const m = p.inbox.shift();
        p.vm.resume(m);
      } else {
        if (ctx._left !== undefined && ctx._left <= 0) p.vm.resume(null);
        else return { state: 'waiting', wait: 'msg', inbox: p.inbox.length };
      }
    } else if (ctx.type === 'syscall') {
      // 立即尝试服务
      const r = inst._kernelHostSys(ctx.name, ctx.args);
      if (r && r.__error) p.vm.resumeError(r.__error); else p.vm.resume(r === undefined ? null : r);
    }
  }
  const before = p.vm.totalUsed;
  let st;
  try { st = p.vm.runStep(Math.max(1, budget | 0)); }
  catch (e) { p.state = 'error'; p.error = e.message; return { state: 'error', error: e.message }; }
  const consumed = p.vm.totalUsed - before;
  p.usedStep = consumed; p.usedTotal += consumed;
  if (st === 'done') { p.state = 'done'; }
  else if (st === 'error') { p.state = 'error'; p.error = p.vm.error; }
  else if (st === 'waiting') {
    p.state = 'waiting';
    const w = p.vm.wait.ctx;
    // 立即尝试服务系统调用（异步完成后下轮 resume）
    if (w.type === 'syscall') {
      const r = inst._kernelHostSys(w.name, w.args);
      // 系统服务中需要向内核记账的操作在这里处理；对用户进程直接返回结果
      p._pendingSysResult = r;
    }
  } else { p.state = 'ready'; }
  return { state: p.state, consumed, wait: st === 'waiting' ? p.vm.wait.ctx.type : null };
};

/* 用户进程系统调用结果提交（内核轮询） */
S['proc-sys-result'] = (inst, a) => {
  const [pid] = a;
  const p = inst.procs.find(x => x.pid === pid);
  if (!p || !p.vm) return { __error: '进程不存在' };
  if (p.vm.state === 'waiting' && p.vm.wait.ctx.type === 'syscall') {
    const ctx = p.vm.wait.ctx;
    const r = inst._kernelHostSys(ctx.name, ctx.args);
    if (r && r.__defer) return { ready: false };
    if (r && r.__error) p.vm.resumeError(r.__error); else p.vm.resume(r === undefined ? null : r);
    return { ready: true };
  }
  return { ready: false };
};

/* 时间等待到期：内核每步推进等待计时 */
S['proc-tick-waits'] = (inst, a) => {
  const dt = a[0];
  const ready = [];
  for (const p of inst.procs) {
    if (p.vm && p.vm.state === 'waiting') {
      const ctx = p.vm.wait.ctx;
      if (ctx.type === 'time') {
        ctx._left = (ctx._left === undefined ? ctx.ms : ctx._left) - dt;
        if (ctx._left <= 0) ready.push(p.pid);
      } else if (ctx.type === 'msg' && ctx.timeout != null) {
        ctx._left = (ctx._left === undefined ? ctx.timeout : ctx._left) - dt;
        if (ctx._left <= 0 && !p.inbox.length) ready.push(p.pid);
      }
    }
  }
  return ready;
};

S['proc-wake'] = (inst, a) => {
  const p = inst.procs.find(x => x.pid === a[0]);
  if (!p) return { __error: '进程不存在' };
  if (p.vm && p.vm.state === 'waiting') { p.vm.resume(a[1] === undefined ? null : a[1]); p.state = 'ready'; }
  return true;
};

/* 消息 */
S['msg-send'] = (inst, a) => {
  const [from, to, value] = a;
  const p = inst.procs.find(x => x.pid === to);
  if (!p || p.state === 'done' || p.state === 'error') return { __error: '目标进程不存在或已结束' };
  const msg = { from, to, value: JSON.parse(JSON.stringify(value)), time: inst.time, seq: ++inst._msgSeq };
  p.inbox.push(msg);
  return { ok: true, seq: msg.seq };
};
S['msg-pending'] = (inst, a) => {
  const p = inst.procs.find(x => x.pid === a[0]);
  return p ? p.inbox.length : 0;
};

/* 时间 */
S['time-now'] = (inst) => inst.time;
S['time-step-ms'] = () => 1000 / 30;

/* 文件服务（按规模计费：每 64 字符 = 1 指令工作） */
S['fs-read'] = (inst, a) => {
  const p = a[1] || '/';
  const v = inst.vfs.read(p);
  if (v === null || v === undefined) return { __error: '文件不存在: ' + p };
  return { content: v, work: Math.ceil(v.length / 64) };
};
S['fs-write'] = (inst, a) => {
  const [p, content] = a;
  try { inst.vfs.write(p, content); } catch (e) { return { __error: e.message }; }
  return { ok: true, work: Math.ceil(String(content).length / 64) };
};
S['fs-list'] = (inst, a) => {
  const r = inst.vfs.list(a[0] || '/');
  return r === null ? { __error: '不是目录' } : { items: r };
};
S['fs-mkdir'] = (inst, a) => { try { inst.vfs.mkdir(a[0]); return true; } catch (e) { return { __error: e.message }; } };
S['fs-exists'] = (inst, a) => inst.vfs.exists(a[0]);
S['fs-delete'] = (inst, a) => { try { inst.vfs.remove(a[0]); return true; } catch (e) { return { __error: e.message }; } };
S['fs-rename'] = (inst, a) => { try { inst.vfs.rename(a[0], a[1]); return true; } catch (e) { return { __error: e.message }; } };
S['fs-copy'] = (inst, a) => { try { inst.vfs.copy(a[0], a[1], a[2]); return true; } catch (e) { return { __error: e.message }; } };
S['fs-move'] = (inst, a) => { try { inst.vfs.move(a[0], a[1]); return true; } catch (e) { return { __error: e.message }; } };
S['fs-stat'] = (inst, a) => inst.vfs.stat(a[0]);
S['fs-size'] = (inst) => inst.vfs.used();
S['fs-quota'] = (inst) => ({ used: inst.vfs.used(), quota: inst.storageQuota });
S['fs-trash'] = (inst) => inst.vfs.listTrash();
S['fs-restore'] = (inst, a) => { try { return inst.vfs.restore(a[0] | 0); } catch (e) { return { __error: e.message }; } };

/* wm 辅助：请求打开直属子系统桌面窗口（由 sysmgr 应用调用） */
S['wm-open-child'] = (inst, a) => {
  const [childId] = a;
  inst.wmEvents = inst.wmEvents || [];
  inst.wmEvents.push({ type: 'wm-command', cmd: 'open-child-window', arg: { id: childId, title: childId } });
  return true;
};

/* UI 提交（显示设备二维 UI） */
S['ui-submit'] = (inst, a) => {
  const [pid, tree] = a;
  tree.pid = pid;
  // 应用窗口的 UI 由窗口管理器组装；这里存各进程提交，桌面 UI 由 pid=1 提交整树
  if (pid === 1 || tree.desktop) {
    inst.ui = tree;
    inst.uiVersion++;
  } else {
    inst.appUis = inst.appUis || {};
    inst.appUis[pid] = tree;
  }
  return { ok: true, work: JSON.stringify(tree).length / 128 };
};
S['ui-pull-apps'] = (inst) => inst.appUis || {};

/* 宿主事件（输入）拉取 */
S['event-poll'] = (inst) => {
  const evs = inst.hostEvents;
  if (!evs.length) return null;
  return evs.shift();
};
S['event-pending'] = (inst) => inst.hostEvents.length;

/* 通知 */
S['notify'] = (inst, a) => {
  inst._notifSeq = (inst._notifSeq || 0) + 1;
  inst.notifications.push({ title: a[0], body: a[1] || '', time: inst.time, id: inst._notifSeq });
  return true;
};

/* 配置 */
S['config-get'] = (inst, a) => a[0] ? inst.config[a[0]] : inst.config;
S['config-set'] = (inst, a) => { inst.config[a[0]] = a[1]; return true; };
S['budget-get'] = (inst) => ({
  total: inst.totalBudget, granted: inst.grantToMe,
  memQuota: inst.memQuota, memUsed: estimateInstMem(inst),
  storageQuota: inst.storageQuota, storageUsed: inst.vfs.used(),
  childGrantCap: inst.childGrantCap, rate: inst.rate
});
S['budget-set'] = (inst, a) => {
  const [k, v] = a;
  if (k === 'total') inst.totalBudget = Math.max(500, v | 0);
  else if (k === 'mem') inst.memQuota = Math.max(1024, v | 0);
  else if (k === 'storage') inst.storageQuota = Math.max(1024, v | 0), inst.vfs.quota = inst.storageQuota;
  else if (k === 'childCap') inst.childGrantCap = Math.min(1, Math.max(0, v));
  return true;
};
S['rate-set'] = (inst, a) => { inst.rate = Math.max(0, Math.min(8, Number(a[0]))); return true; };

function estimateInstMem(inst) {
  let m = 0;
  for (const p of inst.procs) m += estimateProcMem(p);
  return m;
}

/* 随机状态 */
S['rng-state'] = (inst) => {
  const k = inst.kernelProc;
  return k && k.vm ? k.vm.rngState : inst.rngSeed;
};

/* 子系统 */
S['child-create'] = (inst, a) => {
  const [opts] = a;
  const id = NOS.rootVM.allocChildId();
  const child = inst.createChild({ id, name: opts && opts.name || id, totalBudget: opts && opts.budget || 60000 });
  NOS.rootVM.registerInstance(child);
  return { id, state: child.state, error: child.kernelError };
};
S['child-list'] = (inst) => inst.children.map(c => ({
  id: c.id, name: c.name, state: c.state, time: c.time, rate: c.rate,
  totalBudget: c.totalBudget, grant: c.grantToMe, error: c.kernelError,
  procs: c.procs.length, usedKernel: c.kernelProc ? c.kernelProc.usedTotal : 0
}));
S['child-control'] = (inst, a) => {
  const [id, action, arg] = a;
  const c = inst.findChild(id);
  if (!c) return { __error: '子系统不存在: ' + id };
  switch (action) {
    case 'pause': c.pauseTree(); break;
    case 'resume': c.resumeTree(); break;
    case 'stop': c.stopTree(); break;
    case 'close': c.closeTree(); inst.children = inst.children.filter(x => x !== c); break;
    case 'restart': NOS.rootVM && NOS.rootApps && NOS.rootApps.sysmgr && NOS.rootApps.sysmgr.restart(c);
      if (!NOS.rootApps) restartInstance(c); break;
    case 'rate': c.rate = Math.max(0, Math.min(8, Number(arg))); break;
    case 'grant': inst.childrenBudget[id] = Math.max(0, arg | 0); break;
    case 'budget': c.totalBudget = Math.max(500, arg | 0); break;
  }
  return { state: c.state };
};
function restartInstance(c) {
  const files = c.vfs.serialize();
  c.procs = []; c.children = []; c.kernelError = null;
  c.vfs = NOS.VFS.deserialize(files, c.store);
  c.time = 0; c.state = 'created';
  c.start();
}
S['kernel-open-request'] = (inst, a) => {
  // 请求在父系统编辑器打开内核源文件：通过宿主事件
  inst.kernelOpenRequest = inst.kernelOpenRequest || [];
  inst.kernelOpenRequest.push(a[0]);
  return true;
};
S['child-advance'] = (inst, a) => {
  const [id, dt, grant] = a;
  const c = inst.findChild(id);
  if (!c) return { __error: '子系统不存在' };
  c.grantToMe = grant | 0;
  if (c.state === 'paused') return { state: 'paused' };
  c._drivenThisTick = true;
  c._advanceTree(dt, false);
  return { state: c.state, time: c.time, error: c.kernelError };
};
S['child-step'] = (inst, a) => {
  const [id, grant] = a;
  const c = inst.findChild(id);
  if (!c) return { __error: '子系统不存在' };
  if (c.state !== 'paused') return { __error: '仅暂停实例可单步' };
  c.grantToMe = grant | 0;
  c._advanceTree(NOS.Instance.STEP_MS, true);
  return { state: c.state, time: c.time };
};

/* 读取子系统桌面 UI（远程桌面显示） */
S['child-ui'] = (inst, a) => {
  const c = inst.findChild(a[0]);
  if (!c) return { __error: '子系统不存在' };
  return { ui: c.ui, version: c.uiVersion, state: c.state, error: c.kernelError,
           scenes: collectScenes(c), time: c.time, name: c.name, rate: c.rate,
           projections: c.projections, charts: chartSummaries(c), appUis: c.appUis || {},
           notifications: c.notifications.length };
};

function collectScenes(inst) {
  const out = [];
  for (const pid in inst.scenes) {
    const s = inst.scenes[pid];
    if (s && s.scene) out.push({ pid: pid | 0, key: s.key, state: s.state, camera: s.camera, scene: s.scene });
  }
  for (const ch of inst.children) out.push(...collectScenes(ch));
  return out;
}
function chartSummaries(inst) {
  const out = [];
  for (const pid in inst.charts) {
    const c = inst.charts[pid];
    out.push({ pid: pid | 0, ...c.summary });
  }
  return out;
}

/* 向子系统投递输入事件 */
S['child-event'] = (inst, a) => {
  const [id, ev] = a;
  const c = inst.findChild(id);
  if (!c) return { __error: '子系统不存在' };
  c.postHostEvent(ev);
  return true;
};

/* 转发给本系统窗口管理器进程（wm pid=2）的事件 */
S['wm-event'] = (inst, a) => {
  inst.postHostEvent(a[0]);
  return true;
};

/* 窗口管理器事件队列（与内核队列分离） */
S['wm-poll'] = (inst) => {
  inst.wmEvents = inst.wmEvents || [];
  return inst.wmEvents.length ? inst.wmEvents.shift() : null;
};
S['wm-pending'] = (inst) => (inst.wmEvents || []).length;

/* 快照：父系统工作，按规模收费 */
S['child-snapshot'] = (inst, a) => {
  const [id, savePath] = a;
  const c = inst.findChild(id);
  if (!c) return { __error: '子系统不存在' };
  const json = c.saveSnapshot();
  if (savePath) {
    try { inst.vfs.write(savePath, json); } catch (e) { return { __error: e.message }; }
  }
  return { work: Math.ceil(json.length / 256), bytes: json.length };
};
S['child-restore'] = (inst, a) => {
  const [id, path, mode] = a;
  const c = inst.findChild(id);
  if (!c) return { __error: '子系统不存在' };
  let json;
  try { json = inst.vfs.read(path); } catch (e) { return { __error: e.message }; }
  let data;
  try { data = JSON.parse(json); } catch (e) { return { __error: '快照损坏' }; }
  const restored = NOS.Instance.restore(data, inst, inst.vfs, inst.store, c.depth);
  if (mode === 'fork') {
    restored.id = NOS.rootVM.allocChildId();
    restored.name = restored.id;
    inst.children.push(restored);
    NOS.rootVM.registerInstance(restored);
    restored.state = 'running';
    restored.startedFromSnapshot = true;
  } else {
    const idx = inst.children.indexOf(c);
    inst.children[idx] = restored;
    NOS.rootVM.replaceInstance(c.id, restored);
    restored.state = 'running';
  }
  return { id: restored.id };
};

/* 场景（3D）服务：scene-load 返回资源数据（按规模计费），scene-submit 提交场景状态 */
S['scene-load'] = (inst, a) => {
  const path = a[0];
  let text;
  try { text = inst.vfs.read(path); } catch (e) { return { __error: e.message }; }
  let data;
  try { data = JSON.parse(text); } catch (e) { return { __error: '场景格式错误: ' + e.message }; }
  inst._sceneCache = inst._sceneCache || {};
  inst._sceneCache[path] = data;
  return { work: Math.ceil(text.length / 128), size: text.length };
};
S['scene-submit'] = (inst, a) => {
  const [pid, key, payload] = a;
  inst.scenes[pid] = inst.scenes[pid] || {};
  inst.scenes[pid][key] = payload;
  inst.scenes[pid].key = key;
  inst.scenes[pid].state = payload.state;
  inst.scenes[pid].camera = payload.camera;
  inst.scenes[pid].scene = payload.scenePath || inst.scenes[pid].scene;
  inst.scenes[pid].pid = pid;
  inst.scenes[pid].version = (inst.scenes[pid].version || 0) + 1;
  return { work: Math.ceil(JSON.stringify(payload.state).length / 200) };
};
S['scene-get'] = (inst, a) => inst._sceneCache && inst._sceneCache[a[0]] ? { ok: true } : { __error: '未装载' };
S['scene-resource'] = (inst, a) => {
  const path = a[0];
  return (inst._sceneCache && inst._sceneCache[path]) || { __error: '未装载场景' };
};

/* 图表实时数据（由 rootvm 桥接根工作簿） */
S['chart-open'] = (inst, a) => {
  const [pid, spec] = a;
  inst.charts[pid] = {
    summary: { pid, sourceTitle: spec.sourceTitle || 'sample.sheet', range: spec.range, chartType: spec.type || 'bar', connectionState: 'idle' },
    data: null, versions: [], spec
  };
  return true;
};
S['chart-connect'] = (inst, a) => {
  const [pid, spec] = a;
  const ch = inst.charts[pid];
  if (!ch) return { __error: '图表未初始化' };
  Object.assign(ch.spec, spec || {});
  Object.assign(ch.summary, { range: ch.spec.range, sourceTitle: ch.spec.sourceTitle, connectionState: 'connecting' });
  const res = NOS.rootVM.connectChart(inst, pid, ch.spec, (version) => {
    // 更新回调（在数据层排队，由进程拉取）
    ch._incoming = ch._incoming || [];
    ch._incoming.push(version);
  });
  ch.connectionId = res.connectionId;
  ch.summary.connectionState = 'connected';
  return { connectionId: res.connectionId, initial: res.initial };
};
S['chart-poll'] = (inst, a) => {
  const ch = inst.charts[a[0]];
  if (!ch || !ch._incoming || !ch._incoming.length) return null;
  const v = ch._incoming.shift();
  ch.data = v; ch.summary.connectionState = 'connected';
  return v;
};
S['chart-disconnect'] = (inst, a) => {
  const ch = inst.charts[a[0]];
  if (ch && ch.connectionId) { NOS.rootVM.disconnectChart(ch.connectionId); ch.connectionId = null; }
  if (ch) ch.summary.connectionState = 'disconnected';
  return true;
};
S['chart-set-type'] = (inst, a) => {
  const ch = inst.charts[a[0]];
  if (ch) ch.summary.chartType = a[1];
  return true;
};

/* 投送到祖先桌面 */
S['project-open'] = (inst, a) => {
  const [pid, appId, targetId] = a;
  // 每个源窗口至多一个投送
  const existing = inst.projections.find(p => p.sourcePid === pid);
  if (existing) { NOS.rootVM.focusProjection(existing.id); return { id: existing.id, refocus: true }; }
  const id = 'proj-' + (++NOS.rootVM.projSeq);
  const proj = { id, sourcePid: pid, sourceInstanceId: inst.id, appId, targetId, state: 'normal' };
  inst.projections.push(proj);
  NOS.rootVM.registerProjection(inst, proj);
  return { id };
};
S['project-close'] = (inst, a) => {
  const id = a[0];
  const idx = inst.projections.findIndex(p => p.id === id);
  if (idx >= 0) inst.projections.splice(idx, 1);
  NOS.rootVM.unregisterProjection(id);
  return true;
};

/* 编译服务：调用本系统 /System/compiler.osl（编译器是系统内程序）。
   引导期或编译器自身故障时回退宿主解析，并报告。 */
S['compile'] = (inst, a) => {
  const [text, sourcePath] = a;
  // 编译器是 /System/compiler.osl；宿主提供解析原语 compile-raw，
  // 编译器程序可在其之上定义宏/折叠等可改写规则。
  try {
    const result = compileWithSystemCompiler(inst, text);
    return result;
  } catch (e) { return { __error: '编译错误: ' + e.message }; }
};
S['compile-raw'] = (inst, a) => {
  // 词法/语法解析原语：文本 -> 嵌套数组（AST）
  try { return NOS.osl.parse(a[0]); } catch (e) { return { __error: e.message }; }
};

function compileWithSystemCompiler(inst, text) {
  // 1) 宿主解析原语
  const ast = NOS.osl.parse(text);
  // 2) 尝试读取系统编译器定义的宏规则（若 compiler.osl 被改坏则回退直接编译）
  let outAst = ast;
  try {
    const ctext = inst.vfs.read('/System/compiler.osl');
    if (ctext != null) outAst = applyMacros(ast, ctext);
  } catch (e) { /* 回退 */ }
  const compiled = NOS.osl.compileAST(outAst);
  return { ast: outAst, defs: compiled.defs, work: Math.ceil(text.length / 40), compiler: '/System/compiler.osl' };
}

/* 与 compiler.osl 中 fold-one 规则保持一致的宿主侧展开（twice/forever）。
   修改 compiler.osl 后这里作为它的执行原语：实际 OSL 编译器程序可通过
   compile-raw 自定义更复杂规则。内置两个宏便于无运行时开销的编译期展开。 */
function applyMacros(ast, compilerText) {
  const hasTwice = /\btwice\b/.test(compilerText);
  const hasForever = /\bforever\b/.test(compilerText);
  if (!hasTwice && !hasForever) return ast;
  const walk = (node) => {
    if (!Array.isArray(node)) return node;
    let n = node.map(walk);
    const h = n[0] && n[0].sym;
    if (hasTwice && h === 'twice') return [{ sym: 'begin' }, n[1], n[1]];
    if (hasForever && h === 'forever') return [{ sym: 'while' }, true, n[1]];
    return n;
  };
  return ast.map(walk);
}

/* 程序读（编译后缓存） */
S['prog-info'] = (inst, a) => {
  try { const p = inst.loadProgram(a[0]); return { ok: true, defs: Object.keys(p.compiled.defs) }; }
  catch (e) { return { __error: e.message }; }
};

S['mem-info'] = (inst) => ({ used: estimateInstMem(inst), quota: inst.memQuota });
S['self-id'] = (inst) => inst.id;
S['log-msg'] = (inst, a) => { (inst.logs = inst.logs || []).push({ t: inst.time, m: String(a[0]) }); if (inst.logs.length > 200) inst.logs.shift(); return true; };

/* ============== 飞行 / 场景状态服务（被控对象） ============== */
function flightFor(inst, pid) {
  inst._flights = inst._flights || {};
  if (!inst._flights[pid]) inst._flights[pid] = { models: new Map(), active: null, activePath: null, records: new Map() };
  return inst._flights[pid];
}
function loadSceneJson(inst, path) {
  inst._sceneCache = inst._sceneCache || {};
  if (!inst._sceneCache[path]) inst._sceneCache[path] = JSON.parse(inst.vfs.read(path));
  return inst._sceneCache[path];
}

S['flight-init'] = (inst, a) => {
  const [path, opts] = a;
  const scene = loadSceneJson(inst, path);
  const m = new NOS.FlightModel(scene);
  if (opts) {
    if (opts.wind) m.wind = [opts.wind[0] || 0, 0, opts.wind[1] || 0];
    if (opts.target) m.target = opts.target;
  }
  const F = flightFor(inst, 6);
  const fm = new NOS.FlightModel(scene);
  F.models.set(path, fm);
  F.active = fm; F.activePath = path;
  return fm.sensors(0);
};

S['flight-show-state'] = (inst, a) => {
  // 演出：从场景资源的关键帧记录求值（结局不随预算变化）
  const [path, t] = a;
  const scene = loadSceneJson(inst, path);
  const keys = scene.performance.keys;
  let k0 = keys[0], k1 = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) if (t >= keys[i].t && t <= keys[i + 1].t) { k0 = keys[i]; k1 = keys[i + 1]; break; }
  const u = k1.t === k0.t ? 0 : (t - k0.t) / (k1.t - k0.t);
  const lerpKeys = ['pos', 'vel', 'rot', 'rotorMain', 'rotorTail', 'collective', 'pitch', 'yaw', 'roll'];
  const st = { pos: [0, 0, 0], vel: [0, 0, 0], rot: [0, 0, 0], damage: {}, controls: {}, wind: [0, 0, 0] };
  for (const k of lerpKeys) {
    const A = k0[k], B = k1[k];
    if (Array.isArray(A)) st[k] = A.map((x, i) => x + (B[i] - x) * u);
    else st[k] = (A || 0) + ((B || 0) - (A || 0)) * u;
  }
  // 撞击时刻取后一帧损坏；撞击瞬间附加碎片
  st.damage = Object.assign({}, k0.damage, u > 0.55 ? k1.damage : {});
  st.fault = u > 0.55 ? k1.fault : k0.fault;
  st.phase = u > 0.5 ? k1.phase : k0.phase;
  st.impact = t >= k0.t && k1.impact && t >= k1.t - 0.05 ? k1.impact : null;
  st.wind = k1.wind;
  st.flying = t > 1.4 && !st.impact;
  st.crashed = !!st.impact || (k1.fault === 'crashed' && u > 0.55);
  st.smoke = st.crashed ? (scene.effects.impact.smoke * (1 - Math.max(0, t - 11.2) * 0.2)) : 0;
  st.fire = st.crashed ? (scene.effects.impact.fire * (1 - Math.max(0, t - 11.2) * 0.12)) : 0;
  st.showMode = true;
  return st;
};

S['flight-physics'] = (inst, a) => {
  const [dt, t, recordPath] = a;
  const F = flightFor(inst, 6);
  const m = F.active;
  if (!m) return { __error: '未初始化飞行' };
  m.step(dt);
  if (recordPath) {
    // 记录追加（实际输入与控制时序）
    F.records.set(recordPath, F.records.get(recordPath) || []);
    const rec = F.records.get(recordPath);
    if (!rec.length || rec[rec.length - 1].t !== m.time) {
      rec.push({ t: m.time, state: m.serialize(), controls: Object.assign({}, m.controls), inputs: { wind: m.wind.slice(), target: m.target ? m.target.slice() : null } });
    }
  }
  return m.sensors(m.time / 1000);
};

S['flight-sensors'] = (inst, a) => {
  const F = flightFor(inst, a[0] === undefined ? 6 : 6);
  const m = F.active;
  if (!m) return { flying: false, pos: [0, 1.05, 0], vel: [0, 0, 0], rot: [0, 0, 0], rotorMain: 0, rotorTail: 0, fault: null, wind: [0, 0, 0], target: [90, -60], heading: 0, t: inst.time / 1000 };
  return m.sensors(inst.time / 1000);
};

S['flight-control'] = (inst, a) => {
  const c = a[0];
  const F = flightFor(inst, 6);
  if (F.active) F.active.writeControl(c, inst.time);
  return true;
};

S['flight-input'] = (inst, a) => {
  const inp = a[0];
  const F = flightFor(inst, 6);
  if (!F.active) return false;
  if (inp.wind) F.active.wind = [inp.wind[0] || 0, 0, inp.wind[1] !== undefined ? inp.wind[1] : (inp.wind[2] || 0)];
  if (inp.target) F.active.target = inp.target.slice();
  if (inp.heading !== undefined && inp.heading !== null) F.active.headingCmd = inp.heading;
  if (inp.fault) F.active.triggerFault('tail-loss');
  return true;
};

S['flight-save-record'] = (inst, a) => {
  const path = a[0];
  const F = flightFor(inst, 6);
  const rec = F.records.get(path) || [];
  const scene = F.active ? F.active.scene : null;
  const payload = { kind: 'nestedos-record', v: 1, scenePath: F.activePath, events: rec.map(r => ({ t: r.t, state: r.state, controls: r.controls, inputs: r.inputs })) };
  try { inst.vfs.write(path, JSON.stringify(payload)); return { ok: true }; } catch (e) { return { __error: e.message }; }
};

S['flight-state-at'] = (inst, a) => {
  const [path, tSec, recordPath] = a;
  if (recordPath) {
    try {
      const rec = JSON.parse(inst.vfs.read(recordPath));
      const tms = tSec * 1000;
      let e0 = rec.events[0], e1 = rec.events[rec.events.length - 1];
      for (let i = 0; i < rec.events.length - 1; i++) if (tms >= rec.events[i].t && tms <= rec.events[i + 1].t) { e0 = rec.events[i]; e1 = rec.events[i + 1]; break; }
      const st = JSON.parse(JSON.stringify(e1.state));
      st.replayMode = true;
      return st;
    } catch (e) { return { __error: '记录读取失败: ' + e.message }; }
  }
  return S['flight-show-state'](inst, [path, tSec]);
};

S['scene-pick'] = (inst, a) => {
  // 由 rootvm 渲染层在每帧 raycast 后回传结果（视图 key 与设备对应）
  const [key, ndc] = a;
  inst._pickQueue = inst._pickQueue || [];
  inst._pickSeq = (inst._pickSeq || 0) + 1;
  const id = inst._pickSeq;
  inst._pickQueue.push({ id, key, ndc });
  return { queued: id };
};

S['clipboard-push'] = (inst, a) => { NOS.rootVM.pushClipboard(a[0], inst.id); return true; };
S['clipboard-list'] = (inst, a) => NOS.rootVM.clipboard.slice(-30).reverse();
