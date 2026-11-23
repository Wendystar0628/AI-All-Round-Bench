/* 远程桌面应用 UI 渲染器：把应用进程提交的可复制数据画成控件，
 * 控件操作经 inst.postHostEvent 回到内核 -> 消息 -> 应用进程。 */
'use strict';
window.NOS = window.NOS || {};
const RDH = NOS.RD_APP;

function send(inst, part, value, extra) {
  inst.postHostEvent({ type: 'app-event', target: 'app', part, value: value === undefined ? null : value, ...(extra || {}) });
}
// 内核 wm 转发的应用消息：直接放入应用进程邮箱更直接
function sendApp(inst, pid, part, value, extra) {
  const msg = { kind: 'ui-event', part, value: value === undefined ? null : value, ...(extra || {}) };
  NOS.hostsvcs['msg-send'](inst, [2, pid, msg]);
}
function btn(inst, pid, label, part, value, testid, extra) {
  const b = NOS.h('button', { class: 'rd-btn', dataPart: part, dataTestid: testid || '' }, label);
  if (value !== undefined) b.dataset.value = String(value);
  b.addEventListener('click', (e) => { e.stopPropagation(); sendApp(inst, pid, part, value !== undefined ? value : b.dataset.value, extra); });
  return b;
}
function input(inst, pid, value, part, testid, type, opts) {
  const i = NOS.h('input', { class: 'rd-input', dataPart: part, dataTestid: testid || '', value: value == null ? '' : value });
  if (type) i.type = type;
  i.addEventListener('change', () => sendApp(inst, pid, part, coerce(i.value, opts)));
  i.addEventListener('keydown', (e) => e.stopPropagation());
  i.addEventListener('pointerdown', e => e.stopPropagation());
  return i;
}
function coerce(v, opts) {
  if (opts === 'num') return Number(v);
  return v;
}

/* ---------------- 文件管理器 ---------------- */
RDH.files = (el, ui, inst) => {
  el.classList.add('rd-files');
  const bar = NOS.h('div', { class: 'rd-toolbar' });
  const path = NOS.h('div', { class: 'rd-path', dataTestid: 'files-path' }, ui.path);
  bar.append(
    btn(inst, 3, '新建文件', 'new-file', null, 'files-new-file'),
    btn(inst, 3, '新建文件夹', 'new-folder', null, 'files-new-folder'),
    btn(inst, 3, '复制', 'copy', null, 'files-copy'),
    btn(inst, 3, '粘贴', 'paste', null, 'files-paste'),
    btn(inst, 3, '删除', 'delete', null),
    btn(inst, 3, '↑', 'nav', 'up', 'files-nav')
  );
  el.append(path, bar);

  const list = NOS.h('div', { class: 'rd-filelist', dataTestid: 'files-list' });
  const items = ui.trash ? [] : (ui.items || []);
  // 快捷目录
  if (!ui.trash) {
    for (const d of ['/Documents', '/Downloads', '/Programs', '/Apps', '/System', '/Demo', '/Snapshots']) {
      const r = NOS.h('div', { class: 'rd-file dir', dataPart: 'nav', dataId: d, dataTestid: 'files-nav', dataFilePath: d }, `📂 ${d}`);
      r.addEventListener('click', () => sendApp(inst, 3, 'nav', d));
      r.addEventListener('dblclick', () => sendApp(inst, 3, 'nav', d));
      list.appendChild(r);
    }
  }
  items.forEach(it => {
    const row = NOS.h('div', { class: 'rd-file' + (it.dir ? ' dir' : ''), dataFilePath: it.path, dataPart: 'select', dataId: it.name });
    row.innerHTML = `<span class="rf-name">${it.dir ? '📂' : iconFor(it.name)} ${it.name}</span><span class="rf-size">${it.dir ? '' : it.size}</span>`;
    row.addEventListener('click', (e) => { list.querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); row.classList.add('sel'); sendApp(inst, 3, 'select', it.name, { mods: e.ctrlKey ? 'ctrl' : '' }); });
    row.addEventListener('dblclick', () => sendApp(inst, 3, 'open', it.name));
    row.draggable = true;
    row.addEventListener('dragstart', () => { NOS.dragPayload = { kind: 'file', sourceSystem: inst.id, path: it.path, name: it.name, dir: it.dir }; });
    list.appendChild(row);
  });
  if (ui.trash) {
    const trash = NOS.hostsvcs['fs-trash'](inst);
    (trash || []).forEach((t, i) => {
      const row = NOS.h('div', { class: 'rd-file' }, `🗑 ${t.path}`);
      row.appendChild(btn(inst, 3, '恢复', 'trash-restore', i));
      list.appendChild(row);
    });
    if (!trash.length) list.innerHTML = '<div class="rd-empty">回收站为空</div>';
  }
  el.appendChild(list);
  const status = NOS.h('div', { class: 'rd-status' });
  if (ui.quota) status.textContent = `存储 ${formatSize(ui.quota.used)} / ${formatSize(ui.quota.quota)}`;
  if (ui.msg) status.textContent += '  ' + ui.msg;
  el.appendChild(status);
  // 打开请求（场景->播放器开窗）
  if (ui.openRequest) {
    NOS.rootVM.eventTarget;
    setTimeout(() => {
      inst.postHostEvent({ type: 'wm-command', cmd: ui.openRequest.app === 'player' ? 'launch-player' : 'launch-editor' });
      if (ui.openRequest.app === 'player') {
        setTimeout(() => sendApp(inst, 6, 'open', ui.openRequest.path), 120);
      } else {
        setTimeout(() => sendApp(inst, 4, 'open', ui.openRequest.path), 120);
      }
    }, 0);
  }
};

/* ---------------- 编辑器 ---------------- */
RDH.editor = (el, ui, inst) => {
  el.classList.add('rd-editor');
  const head = NOS.h('div', { class: 'rd-toolbar' });
  head.append(
    NOS.h('span', { class: 'rd-filename', dataTestid: 'editor-filename' }, ui.path || '未命名'),
    btn(inst, 4, '新建', 'new'),
    btn(inst, 4, '保存', 'save', ui.path, 'editor-save'),
    btn(inst, 4, '语法检查', 'compile-check'),
    btn(inst, 4, '运行程序', 'run', null),
  );
  el.appendChild(head);
  const ta = NOS.h('textarea', { class: 'rd-code', dataTestid: 'editor-text', spellcheck: 'false' });
  ta.value = ui.text || '';
  ta.addEventListener('input', () => sendApp(inst, 4, 'edit', ta.value));
  ta.addEventListener('pointerdown', e => e.stopPropagation());
  ta.addEventListener('keydown', e => e.stopPropagation());
  el.appendChild(ta);
  el.appendChild(NOS.h('div', { class: 'rd-status' }, (ui.dirty ? '● 未保存  ' : '') + (ui.msg || '')));
};

/* ---------------- 进程管理器 ---------------- */
RDH.tasks = (el, ui, inst) => {
  el.classList.add('rd-tasks');
  const b = ui.budget || {};
  const head = NOS.h('div', { class: 'rd-tasks-head' });
  head.innerHTML = `<div>总预算/步: <b data-testid="tasks-budget">${b.total}</b> 指令 · 实际拨付: ${b.granted || 0}</div>
    <div>内存: ${formatSize((ui.mem || {}).used || 0)} / ${formatSize(b.memQuota)} · 存储: ${formatSize(b.storageUsed || 0)} / ${formatSize(b.storageQuota)}</div>`;
  el.appendChild(head);
  const controls = NOS.h('div', { class: 'rd-toolbar' });
  const budI = NOS.h('input', { class: 'rd-input small', type: 'number', value: b.total });
  budI.addEventListener('change', () => NOS.hostsvcs['budget-set'](inst, ['total', Number(budI.value)]));
  budI.addEventListener('pointerdown', e => e.stopPropagation());
  controls.append(NOS.h('label', {}, '总预算 '), budI);
  const capI = NOS.h('input', { class: 'rd-input small', type: 'number', step: '0.05', value: b.childGrantCap });
  capI.addEventListener('change', () => NOS.hostsvcs['budget-set'](inst, ['childCap', Number(capI.value)]));
  capI.addEventListener('pointerdown', e => e.stopPropagation());
  controls.append(NOS.h('label', {}, '子系统拨付上限 '), capI);
  el.appendChild(controls);

  const table = NOS.h('table', { class: 'rd-table' });
  table.innerHTML = '<tr><th>PID</th><th>进程</th><th>状态</th><th>已用指令</th><th>邮箱</th><th>错误</th><th></th></tr>';
  (ui.procs || []).forEach(p => {
    const tr = NOS.h('tr', {});
    tr.innerHTML = `<td>${p.pid}</td><td>${p.name}</td><td><span class="st st-${p.state}">${p.state}</span>${p.waiting ? ' (' + p.waiting + ')' : ''}</td><td>${p.usedTotal}</td><td>${p.inbox}</td><td class="err">${p.error || ''}</td>`;
    const td = NOS.h('td', { class: 'row-actions' });
    if (p.pid !== 1) {
      td.append(btn(inst, 5, p.state === 'suspended' ? '继续' : '挂起', p.state === 'suspended' ? 'resume' : 'suspend', p.pid),
        btn(inst, 5, '结束', 'kill', p.pid));
    } else td.textContent = '内核';
    tr.appendChild(td);
    table.appendChild(tr);
  });
  el.appendChild(table);

  if ((ui.children || []).length) {
    const ct = NOS.h('div', { class: 'rd-section-title' }, '直属子系统承载进程');
    el.appendChild(ct);
    const ct2 = NOS.h('table', { class: 'rd-table' });
    ct2.innerHTML = '<tr><th>实例</th><th>状态</th><th>内核指令</th><th>拨付</th><th>速率</th><th>操作</th></tr>';
    ui.children.forEach(c => {
      const tr = NOS.h('tr', {});
      tr.innerHTML = `<td>${c.id}</td><td>${c.state}${c.error ? ' <span class="err">' + c.error + '</span>' : ''}</td><td>${c.usedKernel}</td><td data-testid="tasks-grant">${c.grant}</td><td>${c.rate}x</td>`;
      const td = NOS.h('td', {});
      const gi = NOS.h('input', { type: 'number', class: 'rd-input small', value: c.grant, dataTestid: 'tasks-grant-input' });
      gi.addEventListener('change', () => NOS.hostsvcs['child-control'](inst, [c.id, 'grant', Number(gi.value)]));
      gi.addEventListener('pointerdown', e => e.stopPropagation());
      td.append(gi, btn(inst, 5, '暂停', 'x', c.id));
      tr.appendChild(td);
      ct2.appendChild(tr);
    });
    el.appendChild(ct2);
  }
};

/* ---------------- 子系统管理 ---------------- */
RDH.sysmgr = (el, ui, inst) => {
  el.classList.add('rd-sysmgr');
  const bar = NOS.h('div', { class: 'rd-toolbar' });
  const nameI = NOS.h('input', { class: 'rd-input', placeholder: '名称（可空，自动 inner-N）' });
  nameI.addEventListener('pointerdown', e => e.stopPropagation());
  const newBtn = btn(inst, 8, '新建直属子系统', 'new', null, 'system-new');
  newBtn.addEventListener('click', () => {});
  nameI.addEventListener('change', () => newBtn.dataset.value = nameI.value);
  bar.append(nameI, newBtn);
  el.appendChild(bar);
  const list = NOS.h('div', { class: 'rd-childlist' });
  if (!(ui.children || []).length) list.innerHTML = '<div class="rd-empty">还没有子系统。点击“新建直属子系统”开始嵌套。</div>';
  (ui.children || []).forEach(c => {
    const card = NOS.h('div', { class: 'rd-child-card', dataTargetSystemId: c.id });
    const head = NOS.h('div', { class: 'rc-head' });
    head.innerHTML = `<b>${c.id}</b> <span class="st st-${c.state}">${c.state}</span> <span class="muted">${c.rate}x · t=${Math.round(c.time)}ms</span>`;
    card.appendChild(head);
    const row1 = NOS.h('div', { class: 'rc-row' });
    const mk = (label, part, val, testid) => {
      const b = btn(inst, 8, label, part, c.id, testid);
      b.dataset.targetSystemId = c.id;
      return b;
    };
    row1.append(
      mk('暂停', 'pause', c.id, 'system-pause'),
      mk('继续', 'resume', c.id, 'system-resume'),
      mk('单步', 'step', c.id),
      mk('重启', 'restart', c.id, 'system-restart'),
      mk('关闭', 'close', c.id),
      mk('快照', 'snapshot', c.id),
      mk('打开内核', 'kernel-open', c.id, 'kernel-open'));
    card.appendChild(row1);
    const row2 = NOS.h('div', { class: 'rc-row' });
    const rateI = NOS.h('input', { type: 'number', step: '0.25', value: c.rate, class: 'rd-input small' });
    rateI.addEventListener('change', () => NOS.hostsvcs['child-control'](inst, [c.id, 'rate', Number(rateI.value)]));
    rateI.addEventListener('pointerdown', e => e.stopPropagation());
    const forkI = NOS.h('input', { class: 'rd-input small', placeholder: '快照路径', value: '/Snapshots/' + c.id + '.snap' });
    forkI.addEventListener('pointerdown', e => e.stopPropagation());
    row2.append(NOS.h('label', {}, '速率 '), rateI,
      mk('恢复', 'restore', c.id), mk('分叉', 'fork', c.id), forkI);
    card.appendChild(row2);
    card.__snapPath = forkI;
    list.appendChild(card);
  });
  el.appendChild(list);
  el.appendChild(NOS.h('div', { class: 'rd-status' }, ui.msg || ''));
};

/* ---------------- 播放器 ---------------- */
RDH.player = (el, ui, inst) => {
  el.classList.add('rd-player');
  const viewport = NOS.h('div', { class: 'rd-viewport', dataTestid: 'player-view' });
  el.appendChild(viewport);

  if (ui.loaded) {
    const view = NOS.remoteRegistry.ensurePlayerView(inst, 6, viewport, ui.path);
    view.state = ui.state || view.state;
    view.camera = { mode: ui.camera || 'cine', t: (ui.time || 0) / 100 };
  } else {
    viewport.innerHTML = '<div class="rd-vp-empty">未装载场景。点击“打开”选择 .scene 文件。</div>';
  }

  const ctrl = NOS.h('div', { class: 'rd-player-ctrl' });
  ctrl.append(
    btn(inst, 6, '打开…', 'open-dialog'),
    btn(inst, 6, ui.playing ? '❚❚' : '▶', ui.playing ? 'pause' : 'play', null, ui.playing ? 'player-pause' : 'player-play'),
    btn(inst, 6, '■', 'stop', null, 'player-stop'),
    btn(inst, 6, '⏭', 'step', null, 'player-step'));
  const seek = NOS.h('input', { type: 'range', min: 0, max: ui.duration || 1500, value: ui.time || 0, dataTestid: 'player-seek' });
  seek.addEventListener('input', () => sendApp(inst, 6, 'seek', Number(seek.value) / 100));
  seek.addEventListener('pointerdown', e => e.stopPropagation());
  const time = NOS.h('span', { class: 'rd-time', dataTestid: 'player-time' }, `${(ui.time / 100 || 0).toFixed(2)} / ${(ui.duration / 100 || 15).toFixed(2)}s`);
  ctrl.append(seek, time);
  const rate = NOS.h('select', { class: 'rd-select', dataTestid: 'player-rate' });
  [0.5, 1, 2, 4].forEach(r => { const o = NOS.h('option', { value: r }, r + 'x'); if (r === ui.rate) o.selected = true; rate.appendChild(o); });
  rate.addEventListener('change', () => sendApp(inst, 6, 'rate', Number(rate.value)));
  rate.addEventListener('pointerdown', e => e.stopPropagation());
  ctrl.append(NOS.h('label', {}, '速率 '), rate);
  const cam = NOS.h('select', { class: 'rd-select', dataTestid: 'player-camera' });
  [['cine', '演出镜头'], ['follow', '跟随镜头'], ['free', '自由环绕']].forEach(([v, l]) => { const o = NOS.h('option', { value: v }, l); if (v === ui.camera) o.selected = true; cam.appendChild(o); });
  cam.addEventListener('change', () => sendApp(inst, 6, 'camera', cam.value));
  cam.addEventListener('pointerdown', e => e.stopPropagation());
  ctrl.append(NOS.h('label', {}, '镜头 '), cam);
  el.appendChild(ctrl);

  const row2 = NOS.h('div', { class: 'rd-player-ctrl' });
  row2.append(
    btn(inst, 6, ui.loop ? '循环:开' : '循环:关', 'loop', !ui.loop, 'player-loop'),
    btn(inst, 6, '开始排演', 'rehearse', {}, 'rehearsal-start'),
    btn(inst, 6, '触发故障', 'fault', null, 'rehearsal-fault'),
    btn(inst, 6, '保存记录', 'save-record', '/Demo/排演.record'),
    btn(inst, 6, '投送到…', 'project-dialog'));
  const wind = NOS.h('input', { type: 'number', step: '1', value: 0, class: 'rd-input small', dataTestid: 'rehearsal-wind' });
  wind.addEventListener('change', () => sendApp(inst, 6, 'wind', [Number(wind.value), 0]));
  wind.addEventListener('pointerdown', e => e.stopPropagation());
  const headI = NOS.h('input', { type: 'number', step: '10', value: 0, class: 'rd-input small', dataTestid: 'rehearsal-heading' });
  headI.addEventListener('change', () => sendApp(inst, 6, 'heading', Number(headI.value)));
  headI.addEventListener('pointerdown', e => e.stopPropagation());
  row2.append(NOS.h('label', {}, '风 '), wind, NOS.h('label', {}, '目标航向 '), headI);
  el.appendChild(row2);

  const projRow = NOS.h('div', { class: 'rd-project-row' });
  projRow.appendChild(NOS.h('span', {}, '投送到祖先桌面：'));
  const anc = [inst].concat(ancestors(inst));
  anc.forEach(a => {
    const b = btn(inst, 6, a.id, 'project', a.id, 'project-target');
    b.dataset.targetSystemId = a.id;
    projRow.appendChild(b);
  });
  el.appendChild(projRow);

  const info = NOS.h('div', { class: 'rd-status', dataTestid: 'player-selection' }, ui.stateLine || '');
  if (ui.selection) info.textContent += '   点选: ' + JSON.stringify(ui.selection);
  if (ui.error) info.textContent += '  错误: ' + ui.error;
  el.appendChild(info);

  // 打开场景对话框
  el.querySelectorAll('[data-part="open-dialog"]').forEach(b => b.addEventListener('click', () => this && openSceneDialog(inst, 6)));
  el.querySelectorAll('[data-part="project-dialog"]').forEach(b => b.addEventListener('click', () => {}));
};

function ancestors(inst) {
  const out = []; let p = inst.parent;
  while (p) { out.push(p); p = p.parent; }
  return out;
}

function openSceneDialog(inst, pid) {
  const items = NOS.hostsvcs['fs-list'](inst, ['/Demo']).items || [];
  const dlg = NOS.modal('打开场景', (body) => {
    items.filter(i => i.name.endsWith('.scene') || i.name.includes('场景')).forEach(i => {
      const b = NOS.h('button', { class: 'rd-btn' }, i.name);
      b.addEventListener('click', () => { sendApp(inst, pid, 'open', i.path); body._close(); });
      body.appendChild(b);
    });
  });
}

/* ---------------- 图表 ---------------- */
RDH.charts = (el, ui, inst) => {
  el.classList.add('rd-charts');
  const form = NOS.h('div', { class: 'rd-form' });
  const src = NOS.h('input', { class: 'rd-input', value: ui.source || 'sample.sheet', dataTestid: 'chart-source' });
  const rng = NOS.h('input', { class: 'rd-input', value: ui.range || 'A1:D4', dataTestid: 'chart-range' });
  const lbl = NOS.h('input', { class: 'rd-input small', type: 'number', value: ui.labelCol || 0, dataTestid: 'chart-label-column' });
  [src, rng, lbl].forEach(i => { i.addEventListener('pointerdown', e => e.stopPropagation()); });
  src.addEventListener('change', () => sendApp(inst, 7, 'source', src.value));
  rng.addEventListener('change', () => sendApp(inst, 7, 'range', rng.value));
  lbl.addEventListener('change', () => sendApp(inst, 7, 'label-col', Number(lbl.value)));
  form.append(NOS.h('label', {}, '工作簿'), src, NOS.h('label', {}, '区域'), rng, NOS.h('label', {}, '标签列'), lbl);
  const seriesSel = NOS.h('div', { class: 'rd-series', dataTestid: 'chart-series' }, '数值列：');
  [1, 2, 3].forEach(ci => {
    const cb = NOS.h('input', { type: 'checkbox' });
    cb.checked = (ui.seriesCols || []).includes(ci);
    cb.addEventListener('change', () => {
      const cols = [1, 2, 3].filter(x => seriesSel.querySelectorAll('input')[x - 1].checked);
      sendApp(inst, 7, 'series', cols);
    });
    cb.addEventListener('pointerdown', e => e.stopPropagation());
    seriesSel.append(cb, NOS.h('span', {}, ' ' + 'ABCD'[ci] + ' '));
  });
  form.appendChild(seriesSel);
  const btns = NOS.h('div', { class: 'rd-toolbar' });
  btns.append(
    btn(inst, 7, ui.state === 'connected' ? '已连接' : '连接', 'connect', null, 'chart-connect'),
    btn(inst, 7, '断开', 'disconnect', null, 'chart-disconnect'));
  const type = NOS.h('select', { dataTestid: 'chart-type' });
  [['bar', '柱状图'], ['line', '折线图']].forEach(([v, l]) => { const o = NOS.h('option', { value: v }, l); if (v === ui.type) o.selected = true; type.appendChild(o); });
  type.addEventListener('change', () => sendApp(inst, 7, 'type', type.value));
  type.addEventListener('pointerdown', e => e.stopPropagation());
  btns.append(NOS.h('label', {}, '图表类型 '), type);
  form.appendChild(btns);
  el.appendChild(form);

  const canvasWrap = NOS.h('div', { class: 'rd-chart-wrap' });
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 340;
  canvasWrap.appendChild(canvas);
  el.appendChild(canvasWrap);
  if (ui.data) NOS.chartRender(canvas, ui.data, ui.type, ui.version);
  else { const c2 = canvas.getContext('2d'); c2.fillStyle = '#aaa'; c2.fillText('尚未连接数据源', 20, 30); }

  const proj = NOS.h('div', { class: 'rd-project-row' }, '投送到祖先：');
  [inst].concat(ancestors(inst)).forEach(a => {
    const b = btn(inst, 7, a.id, 'project', a.id, 'project-target');
    b.dataset.targetSystemId = a.id;
    proj.appendChild(b);
  });
  el.appendChild(proj);
  el.appendChild(NOS.h('div', { class: 'rd-status' }, `状态: ${stateCN(ui.state)}  版本: ${ui.version}  ${ui.msg || ''}`));
};
function stateCN(s) { return ({ idle: '未连接', connected: '已连接', connecting: '连接中', disconnected: '已断开', restored: '已恢复，待重新连接' }[s] || s); }

function iconFor(name) {
  if (name.endsWith('.osl')) return '{}';
  if (name.endsWith('.scene')) return '✈';
  if (name.endsWith('.sheet')) return '▦';
  return '📄';
}
function formatSize(n) {
  if (n > 1048576) return (n / 1048576).toFixed(1) + 'MB';
  if (n > 1024) return (n / 1024).toFixed(1) + 'KB';
  return n + 'B';
}

/* ---------- 图表 2D 绘制 ---------- */
NOS.chartRender = function (canvas, data, type, animVersion) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1d1932'; ctx.fillRect(0, 0, W, H);
  const rows = data.rows || [];
  if (rows.length < 2) { ctx.fillStyle = '#aaa'; ctx.fillText('数据不足', 20, 30); return; }
  const labelCol = data.labelCol || 0;
  const seriesCols = (data.seriesCols && data.seriesCols.length) ? data.seriesCols : [rows[0].length - 1];
  const labels = rows.slice(1).map(r => String(r[labelCol] ? r[labelCol].value : ''));
  const series = seriesCols.map(ci => ({ ci, name: '列 ' + 'ABCD'[ci], values: rows.slice(1).map(r => Number(r[ci] && r[ci].value) || 0) }));
  const maxV = Math.max(1, ...series.flatMap(s => s.values)) * 1.15;
  const padL = 56, padB = 48, padT = 30, padR = 20;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  ctx.strokeStyle = '#4a4366'; ctx.lineWidth = 1; ctx.fillStyle = '#c9c2e0'; ctx.font = '12px sans-serif';
  // 网格与坐标
  for (let i = 0; i <= 5; i++) {
    const y = padT + plotH * i / 5;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillText(String(Math.round(maxV * (5 - i) / 5)), 8, y + 4);
  }
  const colors = ['#facc15', '#a78bfa', '#34d399', '#60a5fa'];
  const n = labels.length;
  if (type === 'bar') {
    const groupW = plotW / n;
    series.forEach((s, si) => {
      ctx.fillStyle = colors[si % colors.length];
      s.values.forEach((v, i) => {
        const bw = groupW / (series.length + 1);
        const x = padL + i * groupW + groupW * 0.15 + si * bw;
        const h = (v / maxV) * plotH;
        ctx.fillRect(x, padT + plotH - h, bw - 3, h);
        ctx.fillStyle = '#eee'; ctx.fillText(String(v), x, padT + plotH - h - 4); ctx.fillStyle = colors[si % colors.length];
      });
    });
  } else {
    series.forEach((s, si) => {
      ctx.strokeStyle = colors[si % colors.length]; ctx.lineWidth = 2.5;
      ctx.beginPath();
      s.values.forEach((v, i) => {
        const x = padL + (n === 1 ? plotW / 2 : i * plotW / (n - 1));
        const y = padT + plotH - (v / maxV) * plotH;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
      ctx.fillStyle = colors[si % colors.length];
      s.values.forEach((v, i) => {
        const x = padL + (n === 1 ? plotW / 2 : i * plotW / (n - 1));
        const y = padT + plotH - (v / maxV) * plotH;
        ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill();
      });
    });
  }
  ctx.fillStyle = '#c9c2e0';
  labels.forEach((l, i) => {
    const x = type === 'bar' ? padL + i * (plotW / n) + (plotW / n) / 2 : padL + i * plotW / Math.max(1, n - 1);
    ctx.textAlign = 'center'; ctx.fillText(l, x, H - 26);
  });
  ctx.textAlign = 'left';
  // 图例与标题
  ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif';
  ctx.fillText((data.title || '工作簿数据') + '  ' + (data.range || ''), padL, 18);
  series.forEach((s, i) => {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(W - padR - 130 + i * 70, 14, 10, 10);
    ctx.fillStyle = '#c9c2e0'; ctx.font = '11px sans-serif';
    ctx.fillText(s.name, W - padR - 116 + i * 70, 23);
  });
};

/* ---------- 3D 视口注册（全局一张 WebGL 画布） ---------- */
NOS.remoteRegistry = {
  playerViews: new Map(),
  ensurePlayerView(inst, pid, container, scenePath) {
    const key = inst.id + ':' + pid;
    let view = this.playerViews.get(key);
    if (!view) {
      view = { key, inst, pid, container, state: null, camera: { mode: 'cine' }, scenePath, sceneKey: null, el: container };
      this.playerViews.set(key, view);
      this.attachScene(inst, view, scenePath);
    }
    view.container = container;
    view.el = container;
    if (scenePath && scenePath !== view.scenePath) { view.scenePath = scenePath; this.attachScene(inst, view, scenePath); }
    return view;
  },
  attachScene(inst, view, path) {
    let sceneJson;
    try { sceneJson = JSON.parse(inst.vfs.read(path)); } catch (e) { return; }
    if (!NOS.device3D) return;
    const sceneKey = 'scene:' + path + ':' + NOS.util.hash(inst.vfs.read(path));
    view.sceneKey = sceneKey;
    NOS.device3D.loadScene(sceneKey, sceneJson);
    NOS.device3D.addView(sceneKey, view);
    view.key3d = sceneKey + ':' + view.key;
    // 输入（镜头拖动/点选）
    this.bindViewInput(view);
  },
  bindViewInput(view) {
    const el = view.container;
    let dragging = false, lx = 0, ly = 0;
    const ndc = (e) => {
      const r = el.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1];
    };
    el.onpointerdown = (e) => {
      dragging = true; lx = e.clientX; ly = e.clientY;
      if (view.camera.mode === 'free') el.setPointerCapture && e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId);
    };
    el.onpointermove = (e) => {
      if (!dragging || view.camera.mode !== 'free') return;
      const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
      view.camera.pos = view.camera.pos || [30, 18, 30];
      view.camera.pos[0] += dx * 0.05; view.camera.pos[1] = Math.max(2, view.camera.pos[1] - dy * 0.05);
    };
    el.onpointerup = (e) => {
      if (dragging && Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly) < 4) {
        // 点选
        const hit = NOS.device3D.raycast(view, ndc(e));
        NOS.hostsvcs['msg-send'](view.inst, [2, 6, { kind: 'ui-event', part: 'pick', ndc: ndc(e) }]);
        if (hit) view.inst._lastPick = hit;
      }
      dragging = false;
    };
    el.onwheel = (e) => {
      if (view.camera.mode !== 'free') return;
      e.preventDefault();
      view.camera.pos = view.camera.pos || [30, 18, 30];
      const s = 1 + Math.sign(e.deltaY) * 0.08;
      view.camera.pos = view.camera.pos.map(x => x * s);
    };
  }
};
