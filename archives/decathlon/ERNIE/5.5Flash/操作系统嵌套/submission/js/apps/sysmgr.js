// 系统管理器：递归系统树、生命周期、内核、快照与分叉
import { h, clear, icon, iconSvg, fmtBytes, fmtInt } from '../util.js';
import { basename as kbasename, joinPath } from '../kernel.js';

export class SysMgrApp {
  constructor(win, os, state = {}) {
    this.win = win; this.os = os; this.sys = win.sys;
    this.selectedId = state.selectedId || this.sys.id;
    this.timer = null;
  }
  mount(body) {
    const wrap = h('div', { class: 'sysmgr-wrap' });
    const side = h('div', { class: 'sysmgr-side' });
    side.append(h('div', { class: 'sm-title' }, '系统树'));
    this.treeEl = h('div', {});
    side.append(this.treeEl);
    const main = h('div', { class: 'sysmgr-main' });
    this.mainEl = main;
    wrap.append(side, main);
    body.append(wrap);
    this.render();
    this.timer = setInterval(() => this.render(), 800);
  }
  allSystems() { return this.os.allSystems(this.os.root); }
  selected() { return this.os.systems.get(this.selectedId) || this.sys; }
  render() {
    this.renderTree();
    this.renderMain();
  }
  renderTree() {
    clear(this.treeEl);
    const roots = this.sys.isRoot ? [this.os.root] : this.sys.children;
    const walk = (s, depth) => {
      const node = h('div', { class: 'sys-node' + (s.id === this.selectedId ? ' active' : ''), style: { paddingLeft: (6 + depth * 14) + 'px' }, 'data-testid': 'sys-node', 'data-system-id': s.id });
      const dot = h('span', { class: 'sn-dot ' + (s.state === 'paused' ? 'paused' : s.state === 'stopped' ? 'stopped' : s.state === 'error' ? 'error' : '') });
      node.append(dot, h('span', { class: 'sn-name' }, `${s.name}${s.isRoot ? '（根）' : ''}`), h('span', { class: 'sn-id' }, s.id));
      node.addEventListener('click', () => { this.selectedId = s.id; this.render(); });
      this.treeEl.append(node);
      for (const c of s.children) walk(c, depth + 1);
    };
    for (const r of roots) walk(r, 0);
    const add = h('button', { class: 'btn primary', style: { marginTop: '10px', width: '100%' }, 'data-testid': 'system-new' }, iconSvg('plus'), '新建直属子系统');
    add.addEventListener('click', () => this.createChild());
    this.treeEl.append(add);
  }
  renderMain() {
    const sys = this.selected();
    clear(this.mainEl);
    const head = h('div', { class: 'sm-head' });
    head.append(h('h3', {}, sys.name), h('span', { class: 'sm-sub' }, `${sys.id} · 父系统 ${sys.parentId || '—'} · 第 ${sys.depth + 1} 层`));
    const statePill = h('span', { class: 'pill ' + (sys.state === 'running' ? 'ok' : sys.state === 'paused' ? 'warn' : sys.state === 'error' ? 'err' : '') }, sys.state === 'running' ? '运行中' : sys.state === 'paused' ? '已暂停' : sys.state === 'error' ? '内核错误' : '已停止');
    head.append(statePill);
    this.mainEl.append(head);
    const grid = h('div', { class: 'sm-grid' });
    const card = (l, v) => h('div', { class: 'sm-card' }, h('div', { class: 'sml' }, l), h('div', { class: 'smv' }, v));
    grid.append(
      card('虚拟时钟', (sys.clock / 1000).toFixed(1) + ' s'),
      card('时间速率', sys.speed + '×'),
      card('总预算 / 步', fmtInt(sys.isRoot ? sys.budget : (sys.lastGrant || 0))),
      card('实际用量 / 步', fmtInt(sys.lastStepUsed || 0)),
      card('进程数', String(sys.processes.length)),
      card('存储', fmtBytes(sys.storageUsed || 0))
    );
    this.mainEl.append(grid);
    const actions = h('div', { class: 'sm-actions' });
    const mk = (testid, label, fn, cls = 'btn', target = sys.id) => {
      const b = h('button', { class: cls, 'data-testid': testid, 'data-target-system-id': target }, label);
      b.addEventListener('click', fn);
      actions.append(b); return b;
    };
    if (!sys.isRoot) {
      mk('system-pause', '暂停', () => this.os.pauseSystem(sys), sys.state === 'running' ? 'btn' : 'btn');
      mk('system-resume', '继续', () => this.os.resumeSystem(sys), 'btn');
      mk('system-step', '单步 20ms', () => this.os.stepSystem(sys), 'btn');
      mk('system-start', '启动', () => { sys.state = 'running'; this.os.bootSystem(sys); this.os.notify(sys, '已启动', sys.id, 'ok', true); }, 'btn');
      mk('system-restart', '重启并载入内核', () => this.os.restartSystem(sys), 'btn');
      mk('system-stop', '停止子树', () => this.os.stopSystem(sys, false), 'btn danger');
      mk('system-close', '关闭窗口', () => this.os.closeSystem(sys), 'btn ghost');
      mk('snapshot-save', '创建快照', () => this.snapshot(sys), 'btn primary');
      mk('kernel-open', '打开内核源文件', () => this.openKernel(sys), 'btn');
    } else {
      mk('snapshot-save', '为选中子系统创建快照', () => { const s = this.selected(); if (s.isRoot) this.os.toast(this.sys, '快照', '请选择子系统', 'warn'); else this.snapshot(s); });
      mk('system-new', '新建子系统', () => this.createChild(), 'btn primary');
    }
    this.mainEl.append(actions);
    // 速度
    const speedRow = h('div', { class: 'sm-row' }, h('span', { class: 'smr-label' }, '时间速率（不影响预算）'));
    const seg = h('div', { class: 'seg' });
    for (const v of [0.25, 0.5, 1, 2, 4]) {
      const b = h('button', { class: sys.speed === v ? 'on' : '' }, v + '×');
      b.addEventListener('click', () => { this.os.setSpeed(sys, v); this.renderMain(); });
      seg.append(b);
    }
    speedRow.append(seg);
    this.mainEl.append(speedRow);
    // 拨付
    if (!sys.isRoot) {
      const gr = h('div', { class: 'sm-row' }, h('span', { class: 'smr-label' }, `父系统拨付比例（当前 ${(sys.grantRatio * 100).toFixed(0)}%）`));
      const slider = h('input', { type: 'range', min: '5', max: '80', value: String(Math.round(sys.grantRatio * 100)), style: { width: '180px', accentColor: 'var(--accent)' } });
      slider.addEventListener('input', () => { this.os.setGrant(sys, Number(slider.value) / 100); });
      gr.append(slider);
      this.mainEl.append(gr);
    }
    // 内核
    this.mainEl.append(h('div', { class: 'sm-section' }, '内核'));
    if (!sys.isRoot && sys.kernelSourcePath) {
      const src = sys.parent?.fs.read(sys.kernelSourcePath) || sys.kernelSource || '';
      const pre = h('div', { class: 'kernel-view' }, src.split('\n').slice(0, 14).join('\n') + (src.split('\n').length > 14 ? '\n…' : ''));
      this.mainEl.append(pre);
      const row = h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } });
      const open = h('button', { class: 'btn small', 'data-testid': 'kernel-open', 'data-target-system-id': sys.id }, '在父系统编辑器中打开');
      open.addEventListener('click', () => this.openKernel(sys));
      const restart = h('button', { class: 'btn small primary', 'data-testid': 'system-restart', 'data-target-system-id': sys.id }, '重新载入内核');
      restart.addEventListener('click', () => this.os.restartSystem(sys));
      row.append(open, restart);
      this.mainEl.append(row);
      if (sys.state === 'error') {
        this.mainEl.append(h('div', { class: 'kernel-error', 'data-testid': 'kernel-error' }, '内核错误：' + (sys.kernelError || sys.errorLog?.slice(-1)[0]?.msg || '内核程序异常')));
      }
    } else {
      this.mainEl.append(h('div', { class: 'empty' }, '根系统由宿主直接实现，不需要内核程序。'));
    }
    // 快照
    this.mainEl.append(h('div', { class: 'sm-section' }, '快照与分叉'));
    if (!sys.isRoot && sys.parent) {
      const snaps = this.os.listSnapshots(sys.parent);
      const list = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '5px' } });
      if (!snaps.length) list.append(h('div', { class: 'empty' }, '暂无快照'));
      for (const f of snaps) {
        const row = h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', fontSize: '11px' } });
        row.append(h('span', { style: { flex: 1 } }, kbasename(f.path)), h('span', { class: 'faint' }, fmtBytes(f.size)));
        const restore = h('button', { class: 'btn small' }, '恢复到本实例');
        restore.addEventListener('click', () => this.restoreSnapshot(sys.parent, f.path, false));
        const fork = h('button', { class: 'btn small' }, '分叉');
        fork.addEventListener('click', () => this.restoreSnapshot(sys.parent, f.path, true));
        row.append(restore, fork);
        list.append(row);
      }
      this.mainEl.append(list);
    } else {
      this.mainEl.append(h('div', { class: 'empty' }, '请选择一个子系统以管理快照。'));
    }
    // 操作说明
    this.mainEl.append(h('div', { class: 'sm-section' }, '操作'));
    const help = h('div', { class: 'kernel-view', style: { maxHeight: '120px' } },
      `暂停：停止整棵子树的时钟与进程推进，祖先与兄弟系统继续运行。\n单步：让暂停的直属子系统推进一个 20 ms 逻辑步。\n重启：结束子树进程，重新载入父系统中的内核源文件，保留文件。\n快照：保存选定子树在逻辑时点的全部状态；分叉生成独立的新实例。\n关闭：停止全部程序，快照仍可在父系统中恢复。`);
    this.mainEl.append(help);
  }
  createChild() {
    const parent = this.selected();
    if (parent.state === 'error' || parent.state === 'stopped') { this.os.toast(parent, '无法创建', '父系统不可用', 'err'); return; }
    const child = this.os.createChild(parent, { grantRatio: 0.5 });
    if (child) { this.selectedId = child.id; this.os.notify(parent, '子系统已创建', `${child.id} · 可继续嵌套`, 'ok', true); this.render(); }
  }
  snapshot(sys) {
    if (sys.isRoot || !sys.parent) return;
    this.os.snapshotSubtree(sys, '');
    this.render();
  }
  restoreSnapshot(parent, path, fork) {
    const f = parent.fs.read(path);
    if (!f) { this.os.toast(this.sys, '快照读取失败', path, 'err'); return; }
    let snap;
    try { snap = JSON.parse(f); } catch (e) { this.os.toast(this.sys, '快照格式错误', e.message, 'err'); return; }
    const target = this.os.systems.get(snap.rootId);
    const targetParent = target?.parent || parent;
    if (!target) { this.os.toast(this.sys, '快照实例不存在', snap.rootId, 'warn'); return; }
    this.os.dialog(targetParent, {
      title: fork ? '从快照分叉' : '恢复快照',
      text: `${fork ? '将创建独立的新子树' : `将替换 ${snap.rootId}`}，保存于 ${new Date(snap.createdAt).toLocaleString('zh-CN')}。范围外的系统不受影响。`,
      actions: [{ id: 'ok', text: fork ? '分叉' : '恢复', primary: true }, { id: 'cancel', text: '取消' }]
    }).then(r => {
      if (r !== 'ok') return;
      const built = this.os.restoreSnapshot(target, snap, { fork });
      if (built) { this.selectedId = built.id; this.render(); }
    });
  }
  openKernel(sys) {
    if (sys.isRoot || !sys.kernelSourcePath) return;
    const parent = sys.parent;
    const f = parent.fs.get(sys.kernelSourcePath);
    if (!f) { this.os.toast(this.sys, '打开失败', sys.kernelSourcePath, 'err'); return; }
    this.os.openApp(parent, 'editor', { state: { path: sys.kernelSourcePath } });
  }
  serialize() { return { selectedId: this.selectedId }; }
  restore(st) { if (st?.selectedId) this.selectedId = st.selectedId; this.render(); }
  beforeClose() { return true; }
  tick() {}
  renderApp() { this.render(); }
  dispose() { clearInterval(this.timer); }
}