// 宿主默认系统调用实现：内核程序未定义对应处理函数时使用
// 内核程序可通过定义 h_<名称> 覆盖任意系统调用的行为
export const defaultHandlers = {
  time: (s) => s.vtime,
  self: (s, p) => p.pid,
  sleep: () => 0,
  send: (s, p, a) => { const ok = s.pushMessage(a[0], JSON.parse(JSON.stringify(a[1]))); return { ok, to: a[0] }; },
  recv: (s, p) => s.popMessage(p.pid),
  poll: (s, p) => s.popMessage(p.pid),
  kill: (s, p, a) => { const t = s.getProc(a[0]); if (!t) return false; t.status = 'ended'; t.blocked = null; t._queue = []; return true; },
  procs: (s) => [...s.procs.values()].map(x => ({ pid: x.pid, name: x.name, kind: x.kind, status: x.status, quota: x.quota, used: x.used, err: x.err, blocked: x.blocked })),
  spawn: (s, p, a) => {
    const src = s.vfs.read(a[0]);
    if (src === null) return { error: '程序文件不存在: ' + a[0] };
    const c = s.host.compile(src, s);
    if (c.error) return { error: c.error };
    const np = s.spawnProc({ name: a[1] || a[0], kind: 'app', code: c.code, quota: a[2] || 0 });
    return np.pid;
  },
  read_file: (s, p, a) => { const v = s.vfs.read(a[0]); s.charge(p, 4 + (v ? v.length / 32 : 0)); return v === null ? { error: '文件不存在: ' + a[0] } : v; },
  write_file: (s, p, a) => { const e = s.vfs.write(a[0], a[1]); s.charge(p, 6 + String(a[1]).length / 16); return e ? { error: e } : { ok: true }; },
  list_dir: (s, p, a) => { const l = s.vfs.list(a[0]); s.charge(p, 4 + (l ? l.length : 0)); return l === null ? { error: '目录不存在: ' + a[0] } : l; },
  delete_file: (s, p, a) => { const e = s.vfs.remove(a[0]); return e ? { error: e } : { ok: true }; },
  exists: (s, p, a) => s.vfs.exists(a[0]),
  mkdir: (s, p, a) => { const e = s.vfs.mkdir(a[0]); return e ? { error: e } : { ok: true }; },
  move_file: (s, p, a) => { const e = s.vfs.move(a[0], a[1]); return e ? { error: e } : { ok: true }; },
  copy_file: (s, p, a) => { const e = s.vfs.copy(a[0], a[1]); s.charge(p, 8 + (s.vfs.read(a[0]) || '').length / 24); return e ? { error: e } : { ok: true }; },
  file_size: (s, p, a) => { const v = s.vfs.read(a[0]); return v === null ? { error: '文件不存在' } : v.length; },
  submit_window: (s, p, a) => {
    const winId = a[0], content = a[1];
    s.winContent = s.winContent || {};
    s.winContent[winId] = content;
    s.charge(p, 6 + (content ? content.length : 0));
    return { ok: true };
  },
  get_window_content: (s, p, a) => (s.winContent && s.winContent[a[0]]) || null,
  submit_display: (s, p, a) => {
    const f = a[0];
    const prims = f && f.wins ? f.wins.reduce((n, w) => n + (w.content ? w.content.length : 0), 0) : 0;
    s.charge(p, 8 + prims);
    s.frame2d = f;
    s.host.onFrame(s);
    return { ok: true };
  },
  submit3d: (s, p, a) => {
    const v = s.views3d[a[0]] || (s.views3d[a[0]] = { resource: null, state: null });
    if (a[1]) v.resource = JSON.parse(JSON.stringify(a[1]));
    v.state = JSON.parse(JSON.stringify(a[2]));
    s.charge(p, 20 + (v.state.parts ? v.state.parts.length * 4 : 0) + (v.state.particles ? v.state.particles.length * 3 : 0));
    s.host.onFrame(s);
    return { ok: true };
  },
  get3d: (s, p, a) => { const v = s.views3d[a[0]]; return v ? { resource: v.resource, state: v.state } : null; },
  project: (s, p, a) => s.host.project({ target: a[0], winId: a[1], kind: a[2] || '2d', title: a[3] || '投送', appId: p.pid }, s.id),
  projection_input: (s, p, a) => s.host.projectionInput(a[0], a[1]),
  get_projection: (s, p, a) => { const pr = s.host.projections.get(a[0]); return pr ? { id: pr.id, kind: pr.kind, payload: pr.payload, active: pr.active } : null; },
  sensors: (s) => s.flight.state,
  controls: (s) => s.flight.ctrl,
  flight_update: (s, p, a) => { s.flight.state = JSON.parse(JSON.stringify(a[0])); return { ok: true }; },
  write_controls: (s, p, a) => { s.flight.ctrl = JSON.parse(JSON.stringify(a[0])); return { ok: true }; },
  rnd: (s) => {
    s.rndSeed = (s.rndSeed === undefined ? 123456789 : s.rndSeed);
    s.rndSeed = (s.rndSeed * 1103515245 + 12345) & 0x7fffffff;
    return s.rndSeed / 0x7fffffff;
  },
  print: (s, p, a) => {
    const text = a[0] === null || a[0] === undefined ? '' : (typeof a[0] === 'object' ? JSON.stringify(a[0]) : String(a[0]));
    p.out.push(text); if (p.out.length > 200) p.out.shift();
    s.console.push({ t: s.vtime, pid: p.pid, name: p.name, text });
    return null;
  },
  connect_data: (s, p, a) => s.host.subscribeData(s.id, { workbook: a[0], range: a[1], labelCol: a[2], valueCols: a[3] || ['D'] }),
  disconnect_data: (s, p, a) => s.host.unsubscribeData(a[0]),
  data_state: (s, p, a) => { const sub = s.host.dataSubs.get(a[0]); return sub ? { subId: sub.id, workbook: sub.workbook, range: sub.range, version: sub.version } : null; },
  transfer_file: (s, p, a) => s.host.transferFile(s.id, a[0], a[1], a[2]),
  transfer_from: (s, p, a) => s.host.transferFile(a[0], a[1], s.id, a[2]),
  receive_file: () => null,
  drag_begin: (s, p, a) => { s.host.beginDrag(s.id, a[0]); return { ok: true }; },
  drag_end: (s, p, a) => { s.host.endDrag(); return { ok: true }; },
  console_tail: (s, p, a) => { const pid = a[0]; const out = []; for (const e of s.console) if (!pid || e.pid === pid) out.push((pid ? '' : '[' + e.name + '] ') + e.text); return out.slice(-(a[1] || 20)); },
  save_snapshot: (s, p, a) => s.host.saveSnapshotTo(s, a[1], a[0]),
  load_snapshot: (s, p, a) => s.host.restoreSnapshot(s, a[0], false),
  fork_snapshot: (s, p, a) => s.host.restoreSnapshot(s, a[0], true),
  step_child: (s, p, a) => s.host.singleStep(a[0]),
  systems: (s) => [...s.procs.values()].filter(p => p.kind === 'carrier').map(p => {
    const ch = s.host.systems.get(p.childSystemId);
    return ch ? { id: ch.id, name: ch.name, rate: ch.rate, paused: ch.ownPaused, vtime: ch.vtime, alive: ch.alive, depth: ch.depth, carrierPid: p.pid, kernelPath: ch.kernelSourcePath } : null;
  }).filter(x => x),
  set_rate: (s, p, a) => { s.rate = Math.max(0.1, Math.min(20, a[0] || 1)); return s.rate; },
  sys_info: (s) => ({ id: s.id, name: s.name, kind: s.kind, vtime: s.vtime, rate: s.rate, paused: s.ownPaused, depth: s.depth, config: s.config, procs: s.procs.size, files: s.vfs.countFiles(), storage: s.vfs.size() })
};
