'use strict';
/* 根系统：直属子系统的系统窗口、子系统管理应用，以及根桌面上的投送窗口。 */
(function () {
  const OS = window.OS, h = (...a) => OS.h(...a);
  const K = () => OS.kernel;
  const isErr = RootKernelLib.isErr;
  const S = OS.systems = { wins: {}, proj: [], snapSeq: 0 };
  const STATE_TEXT = { running: '运行中', paused: '已暂停', error: '内核错误', booting: '启动中', stopped: '已关闭' };
  const fmtSize = OS.fmtSize = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  const fmtNum = OS.fmtNum = (n) => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));

  S.create = function (name) {
    const c = K().createSystem(name);
    if (isErr(c)) { OS.notify('无法新建子系统', c.error, 'error'); return null; }
    OS.notify('新建子系统', c.id + ' 正在启动');
    return c;
  };
  S.snapshot = function (id, done) {
    const c = K().children[id]; if (!c) return;
    const path = '/Snapshots/' + id + '-' + String(++S.snapSeq).padStart(2, '0') + '-' + Math.floor(K().clock) + '.snap';
    const r = K().childSnapshot(c, path, (res) => {
      if (isErr(res)) OS.notify('快照失败', res.error, 'error'); else OS.notify('快照已保存', path + '（' + fmtSize(res.size) + '）');
      if (done) done(res);
    });
    if (isErr(r)) OS.notify('快照失败', r.error, 'error');
    return path;
  };
  S.restore = function (id, path) {
    const r = K().childRestore(K().children[id], path);
    if (isErr(r)) OS.notify('恢复失败', r.error, 'error'); else OS.notify('已恢复快照', id + ' ← ' + path);
    return r;
  };
  S.fork = function (path) {
    const r = K().childFork(path);
    if (isErr(r)) OS.notify('分叉失败', r.error, 'error'); else OS.notify('已从快照分叉', '新实例 ' + r.id);
    return r;
  };
  S.openKernel = (id) => { const c = K().children[id]; if (c) OS.wm.launch('editor', { file: c.kpath }); };
  S.ctl = function (id, act, arg) {
    const c = K().children[id]; if (!c) return false;
    const r = K().childCtl(c, act, arg);
    if (isErr(r)) OS.notify('操作失败', r.error, 'error');
    else if (act === 'restart') OS.notify('重启子系统', id + ' 正在按内核源文件重新启动');
    return r;
  };

  // ---------- 系统窗口 ----------
  function sysWindow(c) {
    const tid = { 'data-target-system-id': c.id };
    const mk = (testid, text, title, fn) => h('button', Object.assign({ class: 'btn', 'data-testid': testid, title, 'aria-label': title, onclick: fn }, tid), text);
    const state = h('span', Object.assign({ class: 'state', 'data-testid': 'system-state' }, tid), h('i'), h('b'));
    const bPause = mk('system-pause', '暂停', '暂停整棵子树', () => S.ctl(c.id, 'pause'));
    const bResume = mk('system-resume', '继续', '继续运行', () => S.ctl(c.id, 'resume'));
    const bStep = mk('system-step', '单步', '执行一个固定逻辑时间步（1/60 秒 × 速率）', () => S.ctl(c.id, 'step'));
    const rate = h('span', Object.assign({ class: 'rate', 'data-testid': 'system-rate' }, tid));
    const bar = h('div', { class: 'sysbar' }, state, bPause, bResume, bStep,
      mk('system-rate-down', '−', '放慢时间', () => S.ctl(c.id, 'rate', Math.max(0.125, c.rate / 2))), rate,
      mk('system-rate-up', '+', '加快时间', () => S.ctl(c.id, 'rate', Math.min(16, c.rate * 2))),
      mk('system-restart', '重启', '重新载入内核源文件并重启', () => S.ctl(c.id, 'restart')),
      mk('system-snapshot', '快照', '保存整棵子树的快照', () => S.snapshot(c.id)),
      mk('kernel-open', '内核', '在编辑器中打开内核源文件', () => S.openKernel(c.id)),
      h('span', { class: 'who', text: c.id + ' · 第 2 层' }));
    const surf = h('div', { class: 'sys-surface', 'data-system-id': c.id, 'data-desktop-of': c.id });
    const ov = h('div', { class: 'sys-overlay' });
    surf.appendChild(ov);
    const W = Math.round(Math.min(OS.wm.deskW - 40, Math.max(760, OS.wm.deskW * 0.7))), H = Math.round(Math.min(OS.wm.areaH() - 16, Math.max(520, OS.wm.areaH() * 0.86)));
    const n = Object.keys(S.wins).length;
    const w = OS.wm.create({
      app: 'system', kind: 'system', sys: c.id, title: c.name + ' — ' + c.id, icon: 'systems', w: W, h: H, minW: 420, minH: 300,
      x: Math.max(8, OS.wm.deskW - W - 24 - n * 36), y: 12 + n * 30,
      onResize: () => { K().childSize(c.id, Math.max(1, surf.clientWidth), Math.max(1, surf.clientHeight)); },
      onFocus: (on) => K().childInput(c.id, { t: 'focus', on }),
      onClose: async () => {
        if (c.state === 'stopped') return true;
        const ok = await OS.wm.confirm('关闭子系统', '关闭 ' + c.id + ' 会停止它和它的整个子树里的全部程序（已保存的文件与快照保留）。确定关闭吗？', '停止并关闭', true);
        if (ok) K().childCtl(c, 'stop');
        return false;
      }
    });
    w.body.append(bar, surf);
    OS.device.mount(c.id, surf);
    surf.appendChild(ov);
    const rec = S.wins[c.id] = { w, surf, ov, state, bPause, bResume, bStep, rate, c };
    K().childSize(c.id, Math.max(1, surf.clientWidth), Math.max(1, surf.clientHeight));
    K().childInput(c.id, { t: 'focus', on: OS.wm.focused === w });
    update(c);
    return rec;
  }
  function update(c) {
    let rec = S.wins[c.id];
    if (c.state === 'stopped') { if (rec) { delete S.wins[c.id]; OS.wm.destroy(rec.w); } return; }
    if (!rec) rec = sysWindow(c);
    rec.state.className = 'state ' + c.state; rec.state.lastChild.textContent = STATE_TEXT[c.state] || c.state; rec.state.dataset.state = c.state;
    rec.bPause.disabled = c.state !== 'running'; rec.bResume.disabled = c.state !== 'paused'; rec.bStep.disabled = c.state !== 'paused';
    rec.rate.textContent = c.rate + '×';
    rec.w.setTitle(c.name + ' — ' + c.id);
    const ov = rec.ov; ov.className = 'sys-overlay'; ov.textContent = '';
    if (c.state === 'paused') { ov.classList.add('paused'); ov.appendChild(h('div', { class: 'tag', text: '已暂停 · 整棵子树的时钟、内核与程序停止' })); }
    else if (c.state === 'error') {
      ov.classList.add('error');
      ov.append(h('h3', null, h('span', { html: OS.svgIcon('warn'), style: { display: 'flex' } }), '内核错误 — 这个子系统已停止'),
        h('pre', { 'data-testid': 'kernel-error', 'data-system-id': 'outer', 'data-target-system-id': c.id, text: c.err }),
        h('p', { class: 'muted', text: '根系统和其他子系统不受影响。打开内核源文件修正后重启即可。' }),
        h('div', { style: { display: 'flex', gap: '8px' } },
          h('button', { class: 'btn primary', text: '打开内核源文件', onclick: () => S.openKernel(c.id) }),
          h('button', { class: 'btn', text: '重启', onclick: () => S.ctl(c.id, 'restart') })));
    } else if (c.state === 'booting') { ov.classList.add('booting'); ov.textContent = '正在编译内核并启动 ' + c.id + ' …'; }
  }
  OS.on('sys', (type, c) => {
    if (type === 'gone') { const rec = S.wins[c.id]; if (rec) { delete S.wins[c.id]; OS.wm.destroy(rec.w); } }
    else update(c);
    OS.emit('systems');
  });

  // ---------- 根桌面上的投送窗口：外框归根系统，内容与交互结果归来源系统 ----------
  function findProj(sys, win) { return S.proj.find(p => p.src.sys === sys && p.src.win === win); }
  function projState(p) {
    const n = OS.tree.find(x => x.id === p.src.sys);
    if (!n || n.state === 'stopped' || n.state === 'error') return 'gone';
    return n.effPaused ? 'paused' : 'live';
  }
  function pathEpoch(id) { let e = 0, n = OS.tree.find(x => x.id === id); while (n && n.parentId) { e += n.epoch || 0; n = OS.tree.find(x => x.id === n.parentId); } return e; }
  function endProj(p, why) { const i = S.proj.indexOf(p); if (i >= 0) S.proj.splice(i, 1); if (!p.w.dead) OS.wm.destroy(p.w); if (why) OS.notify('投送已结束', why); OS.emit('projections'); }
  function ackSize(p) { K().route({ to: p.src.sys, from: 'outer', pid: p.src.pid, k: 'proj_size', win: p.src.win, w: Math.max(1, p.surf.clientWidth), h: Math.max(1, p.surf.clientHeight) }); }
  OS.on('bus', (m) => {
    if (m.svc !== 'wm') return;
    if (m.k === 'proj_open') {
      let p = findProj(m.from, m.win);
      if (!p) {
        const surf = h('div', { class: 'proj-surface' });
        const ov = h('div', { class: 'sys-overlay' });
        const src = { sys: m.from, win: m.win, app: m.app, pid: m.fpid, sid: m.sid };
        const w = OS.wm.create({
          app: 'projection', kind: 'projection', title: '投送 · ' + m.title, icon: 'project', w: Math.max(420, (m.w || 600) + 2), h: Math.max(300, (m.h || 400) + 34), minW: 320, minH: 220, meta: { src, frozen: false },
          onResize: () => { if (p) ackSize(p); },
          onFocus: (on) => { if (p) K().route({ to: src.sys, from: 'outer', pid: src.pid, k: 'proj_input', win: src.win, e: { t: 'focus', on } }); },
          onClose: () => { K().route({ to: src.sys, from: 'outer', pid: src.pid, k: 'proj_closed', win: src.win }); if (p) { const i = S.proj.indexOf(p); if (i >= 0) S.proj.splice(i, 1); } OS.emit('projections'); return true; }
        });
        w.el.setAttribute('data-source-system-id', src.sys); w.el.setAttribute('data-source-window-id', src.sys + '-' + src.win); w.el.setAttribute('data-source-app-id', src.app);
        w.srcEl.textContent = '来自 ' + src.sys + ' · ' + src.app;
        w.body.appendChild(surf);
        p = { w, surf, ov, src, ep: pathEpoch(src.sys), state: 'live' };
        S.proj.push(p);
        OS.notify('收到投送', m.from + ' 的 ' + m.title);
      } else { p.src.pid = m.fpid; p.src.sid = m.sid; p.w.setTitle('投送 · ' + m.title); }
      const T = OS.device.surface(p.src.sys, p.src.sid, true);
      T.ctx = { sys: 'outer', win: p.w.gid, app: 'projection' };
      if (T.el.parentNode !== p.surf) { p.surf.textContent = ''; p.surf.appendChild(T.el); p.surf.appendChild(p.ov); }
      OS.device.retag(T);
      OS.wm.focus(p.w);
      K().route({ to: m.from, from: 'outer', pid: m.fpid, k: 'proj_ack', win: m.win, w: Math.max(1, p.surf.clientWidth), h: Math.max(1, p.surf.clientHeight) });
      refreshProj(); OS.emit('projections');
    } else if (m.k === 'proj_end') { const p = findProj(m.from, m.win); if (p) endProj(p, m.from + ' 的源窗口已关闭'); }
    else if (m.k === 'proj_menu') {
      const p = findProj(m.from, m.win); if (!p) return;
      const r = p.surf.getBoundingClientRect(), dr = document.getElementById('desk').getBoundingClientRect(), s = OS.wm.scale;
      const pos = { x: (r.left - dr.left) / s + m.x, y: (r.top - dr.top) / s + m.y };
      OS.wm.showMenu(pos, (m.items || []).map(it => ({ text: it.text, icon: it.ic, disabled: !!it.dis, testid: it.tid, data: it.data, act: () => K().route({ to: m.from, from: 'outer', pid: m.fpid, t: 'menu_pick', id: it.id, tag: m.tag, data: it.data || null }) })));
    }
  });
  function refreshProj() {
    for (const p of S.proj.slice()) {
      const st = projState(p);
      if (st === 'gone') { endProj(p, '来源 ' + p.src.sys + ' 已停止，投送窗口关闭'); continue; }
      p.w.meta.frozen = st === 'paused';
      if (p.state !== st) {
        p.state = st; p.ov.className = 'sys-overlay' + (st === 'paused' ? ' paused' : ''); p.ov.textContent = '';
        if (st === 'paused') { p.ov.style.pointerEvents = 'auto'; p.ov.style.background = 'rgba(10,14,22,.45)'; p.ov.appendChild(h('div', { class: 'tag', 'data-testid': 'projection-paused', 'data-system-id': 'outer', text: '来源子树已暂停：内容冻结，控件停用' })); }
        else { p.ov.style.pointerEvents = ''; p.ov.style.background = ''; }
        p.w.el.dataset.projState = st;
      }
      const ep = pathEpoch(p.src.sys);
      if (ep !== p.ep) { p.ep = ep; K().route({ to: p.src.sys, from: 'outer', svc: 'wm', k: 'proj_probe', win: p.src.win, target: 'outer' }); }
    }
  }
  OS.on('tree', refreshProj);

  // ---------- 子系统管理应用 ----------
  function openManager(args) {
    const exist = OS.wm.wins.find(w => w.app === 'systems');
    if (exist) { OS.wm.focus(exist); if (args && args.file) exist.meta.pick(args.file); return exist; }
    const list = h('div', { class: 'sm-list' }), snaps = h('div', { class: 'sm-snaps' });
    const w = OS.wm.create({ app: 'systems', title: '子系统管理', icon: 'systems', w: 780, h: 520, minW: 560, minH: 320 });
    const head = h('div', { class: 'toolbar' },
      h('button', { class: 'btn primary', 'data-testid': 'systems-create', onclick: () => S.create() }, h('span', { html: OS.svgIcon('plus'), style: { display: 'flex' } }), '新建子系统'),
      h('span', { class: 'muted', text: '直属子系统由根系统的承载进程运行；单步 = 1/60 秒 × 速率' }), h('span', { class: 'sp' }),
      h('button', { class: 'btn', 'data-testid': 'systems-import', title: '从本机导入快照文件', onclick: () => OS.hostFiles.importInto('/Snapshots') }, '从本机导入快照'));
    const wrap = h('div', { class: 'sm-wrap' }, h('h4', { text: '直属子系统' }), list, h('h4', { text: '快照（保存在 /Snapshots）' }), snaps);
    w.body.append(head, wrap);
    let sel = null;
    function render() {
      list.textContent = '';
      const kids = Object.values(K().children);
      if (!kids.length) list.appendChild(h('div', { class: 'muted', style: { padding: '14px' }, text: '还没有子系统。点“新建子系统”创建第 2 层桌面。' }));
      for (const c of kids) {
        const tid = { 'data-target-system-id': c.id };
        const p = K().pmap.get(c.pid);
        const b = (testid, text, fn, dis, cls) => h('button', Object.assign({ class: 'btn ' + (cls || ''), 'data-testid': testid, disabled: dis, onclick: fn }, tid), text);
        const pill = h('span', { class: 'pill ' + (c.state === 'running' ? 'ok' : c.state === 'paused' ? 'warn' : c.state === 'error' ? 'err' : ''), text: STATE_TEXT[c.state] });
        const row = h('div', Object.assign({ class: 'sm-row', 'data-testid': 'systems-row' }, tid),
          h('div', { class: 'sm-id' }, h('b', { text: c.id }), h('span', { class: 'muted', text: c.name }), pill),
          h('div', { class: 'sm-meta muted', text: '父系统 outer · 速率 ' + c.rate + '× · 拨付 ' + fmtNum(c.grant.budget) + '/步 · 累计 ' + fmtNum(p ? p.used : 0) + ' · 存储 ' + fmtSize(c.stor) }),
          c.state === 'error' ? h('div', { class: 'sm-err', text: c.err }) : null,
          h('div', { class: 'sm-btns' },
            c.state === 'stopped' || c.state === 'error' ? b('system-start', '启动', () => S.ctl(c.id, 'start'), false, 'primary') : null,
            b('system-pause', '暂停', () => S.ctl(c.id, 'pause'), c.state !== 'running'),
            b('system-resume', '继续', () => S.ctl(c.id, 'resume'), c.state !== 'paused'),
            b('system-step', '单步', () => S.ctl(c.id, 'step'), c.state !== 'paused'),
            b('system-rate-down', '慢', () => S.ctl(c.id, 'rate', Math.max(0.125, c.rate / 2))),
            b('system-rate-up', '快', () => S.ctl(c.id, 'rate', Math.min(16, c.rate * 2))),
            b('system-restart', '重启', () => S.ctl(c.id, 'restart')),
            b('system-snapshot', '快照', () => S.snapshot(c.id), !(c.state === 'running' || c.state === 'paused')),
            b('kernel-open', '内核源文件', () => S.openKernel(c.id)),
            b('system-stop', '关闭', () => S.ctl(c.id, 'stop'), c.state === 'stopped'),
            b('system-remove', '移除', async () => { if (await OS.wm.confirm('移除子系统', '移除 ' + c.id + ' 会丢弃它的文件与整棵子树（已保存的快照保留）。', '移除', true)) S.ctl(c.id, 'remove'); }, false, 'danger')));
        list.appendChild(row);
      }
      snaps.textContent = '';
      const files = K().fs.list('/Snapshots');
      const arr = Array.isArray(files) ? files.filter(f => f.name.endsWith('.snap')).sort((a, b) => b.m - a.m) : [];
      if (!arr.length) snaps.appendChild(h('div', { class: 'muted', style: { padding: '14px' }, text: '还没有快照。在系统窗口工具条或上面的列表里点“快照”。' }));
      for (const f of arr) {
        const meta = K().snapMeta(K().fs.read(f.path)) || {};
        const targets = kids.filter(c => c.state !== 'booting');
        const row = h('div', { class: 'sm-row snap' + (sel === f.path ? ' sel' : ''), 'data-testid': 'snapshot-row', 'data-file-path': f.path },
          h('div', { class: 'sm-id' }, h('b', { text: f.name }), h('span', { class: 'muted', text: '来自 ' + (meta.id || '?') + ' · ' + (meta.members ? meta.members.length : 1) + ' 个实例 · ' + fmtSize(f.size) })),
          h('div', { class: 'sm-btns' },
            ...targets.map(c => h('button', { class: 'btn', 'data-testid': 'snapshot-restore', 'data-target-system-id': c.id, 'data-file-path': f.path, text: '恢复到 ' + c.id, onclick: () => S.restore(c.id, f.path) })),
            h('button', { class: 'btn primary', 'data-testid': 'snapshot-fork', 'data-file-path': f.path, text: '分叉为新实例', onclick: () => S.fork(f.path) }),
            h('button', { class: 'btn', 'data-testid': 'snapshot-export', 'data-file-path': f.path, text: '保存到本机', onclick: () => OS.hostFiles.exportFile(f.path) }),
            h('button', { class: 'btn danger', 'data-testid': 'snapshot-delete', 'data-file-path': f.path, text: '删除', onclick: () => { K().fs.delete(f.path); } })));
        snaps.appendChild(row);
      }
    }
    w.meta.pick = (file) => { sel = file; render(); };
    if (args && args.file) sel = args.file;
    const offs = [OS.on('systems', render), OS.on('second', render)];
    const lis = (p) => { if (p.startsWith('/Snapshots')) render(); };
    K().fs.listeners.add(lis);
    w.onDestroy = () => { offs.forEach(f => f()); K().fs.listeners.delete(lis); };
    render();
    return w;
  }
  OS.whenReady = OS.whenReady || [];
  OS.whenReady.push(() => {
    OS.wm.registerApp({ id: 'systems', name: '子系统管理', icon: 'systems', open: openManager, launchId: 'launch-systems', keywords: 'system 子系统 快照' });
  });
})();
