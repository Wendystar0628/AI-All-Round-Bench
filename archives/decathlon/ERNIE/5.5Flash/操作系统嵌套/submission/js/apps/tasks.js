// 任务与进程管理器
import { h, clear, icon, iconSvg, fmtBytes, fmtInt, clamp } from '../util.js';

export class TasksApp {
  constructor(win, os, state = {}) {
    this.win = win; this.os = os; this.sys = win.sys;
    this.selectedPid = null;
    this.timer = null;
  }
  mount(body) {
    const wrap = h('div', { class: 'tasks-wrap' });
    const sum = h('div', { class: 'tasks-summary' });
    this.sumEl = sum;
    const tableWrap = h('div', { class: 'tasks-table' });
    const head = h('div', { class: 'tt-head' },
      h('span', {}, '名称'), h('span', {}, 'PID'), h('span', {}, '类型'), h('span', {}, '状态'),
      h('span', {}, '累计工作'), h('span', {}, '步内 / 额度'), h('span', {}, '内存'), h('span', {}, '操作'));
    const rows = h('div', {});
    this.rowsEl = rows;
    tableWrap.append(head, rows);
    const foot = h('div', { class: 'tasks-foot' });
    this.footEl = foot;
    wrap.append(sum, tableWrap, foot);
    body.append(wrap);
    this.render();
    this.timer = setInterval(() => this.render(), 600);
  }
  render() {
    this.renderSummary();
    this.renderRows();
    this.renderFoot();
  }
  renderSummary() {
    const sys = this.sys;
    const grant = sys.isRoot ? sys.budget : (sys.lastGrant || sys.budget);
    const used = sys.lastStepUsed || 0;
    const mem = sys.totalMem || 0;
    const st = sys.storageUsed || 0;
    const cards = [
      ['本系统总预算', `${fmtInt(grant)}`, `工作单位 / 逻辑步 · 本步已用 ${fmtInt(used)}`],
      ['实际拨付', sys.isRoot ? '—' : fmtInt(sys.grant || sys.lastGrant || 0), sys.isRoot ? '根系统直接拥有预算' : `占父系统 ${(sys.grantRatio * 100).toFixed(0)}%`],
      ['内存占用', fmtBytes(mem), `上限 ${fmtBytes(sys.memoryLimit)}`],
      ['存储占用', fmtBytes(st), `上限 ${fmtBytes(sys.storageLimit)}`]
    ];
    clear(this.sumEl);
    for (const [label, val, sub] of cards) {
      const c = h('div', { class: 'ts-card' }, h('div', { class: 'tsc-label' }, label), h('div', { class: 'tsc-val' }, val), h('div', { class: 'tsc-sub' }, sub));
      if (label === '内存占用') {
        const bar = h('div', { class: 'bar' + (mem / sys.memoryLimit > 0.85 ? ' err' : '') });
        const i = h('i', { style: { width: Math.min(100, mem / sys.memoryLimit * 100) + '%' } });
        bar.append(i); c.append(bar);
      }
      this.sumEl.append(c);
    }
  }
  processes() {
    const sys = this.sys;
    const out = [];
    for (const p of sys.processes) {
      out.push({
        id: p.id, name: p.name, type: p.type === 'kernel' ? '内核' : p.type === 'service' ? '系统服务' : '程序',
        state: p.state, used: p.usedTotal || 0, step: p.usedStep || 0, quota: p.quota,
        mem: p.mem || 0, msgs: p.inbox?.length || 0, error: p.error, proc: p,
        appId: p.meta?.appId
      });
    }
    for (const w of this.os.windows.values()) {
      if (w.systemId !== sys.id) continue;
      if (w.appId === 'system' || w.appId === 'projection') continue;
      out.push({
        id: 'app-' + w.id, name: w.title, type: '应用', state: w.minimized ? '最小化' : '运行',
        used: 0, step: 0, quota: 0, mem: w.app?.memory || 0, msgs: 0, appId: w.appId, win: w
      });
      if (w.appId === 'browser' && w.app?.inspect) {
        for (const t of w.app.inspect(w)) {
          out.push({
            id: 'web-' + w.id + '-' + t.tabId, name: '网页 · ' + (t.url || t.tabId), type: '网页视图',
            state: t.loadState, used: null, step: null, quota: null, mem: null, msgs: 0, web: t, win: w
          });
        }
      }
    }
    for (const c of sys.children) {
      out.push({
        id: 'carrier-' + c.id, name: c.id, type: '子系统承载', state: c.state,
        used: c.totalUsed || 0, step: c.lastStepUsed || 0, quota: 0, mem: c.totalMem || 0,
        msgs: 0, child: c
      });
    }
    return out;
  }
  renderRows() {
    clear(this.rowsEl);
    const rows = this.processes();
    for (const r of rows) {
      const row = h('div', { class: 'tt-row' + (String(this.selectedPid) === String(r.id) ? ' selected' : ''), 'data-testid': 'tasks-row' });
      const color = r.state === 'error' ? 'var(--danger)' : r.state === 'running' || r.state === 'ready' ? 'var(--ok)' : r.state === 'waiting' ? 'var(--warn)' : 'var(--faint)';
      row.append(
        h('div', { class: 'tt-name' }, h('span', { class: 'dot', style: { background: color } }), h('span', {}, r.name)),
        h('span', {}, String(r.id)),
        h('span', {}, r.type),
        h('span', {}, r.state),
        h('span', {}, r.used == null ? '—' : fmtInt(r.used)),
        h('span', {}, r.quota ? `${fmtInt(r.step)} / ${fmtInt(r.quota)} · 余 ${fmtInt(Math.max(0, r.quota - r.step))}` : '—'),
        h('span', {}, r.mem == null ? '—' : fmtBytes(r.mem)),
        h('div', { class: 'tt-actions' }, this.actionsFor(r))
      );
      row.addEventListener('click', () => { this.selectedPid = r.id; this.renderRows(); this.renderDetail(r); });
      this.rowsEl.append(row);
    }
    if (!rows.length) this.rowsEl.append(h('div', { class: 'empty' }, '没有进程'));
    if (rows.length && !rows.find(r => String(r.id) === String(this.selectedPid))) this.selectedPid = rows[0].id;
    const sel = rows.find(r => String(r.id) === String(this.selectedPid));
    this.renderDetail(sel);
  }
  actionsFor(r) {
    const wrap = h('div', { style: { display: 'flex' } });
    if (r.web) return wrap;
    if (r.proc) {
      if (r.proc.state === 'suspended') {
        const b = h('button', { class: 'btn small', 'data-testid': 'tasks-resume' }, '继续');
        b.addEventListener('click', e => { e.stopPropagation(); r.proc.state = r.proc._prevState || 'ready'; });
        wrap.append(b);
      } else if (r.proc.state !== 'finished' && r.proc.state !== 'error' && r.type !== '内核') {
        const b = h('button', { class: 'btn small', 'data-testid': 'tasks-suspend' }, '挂起');
        b.addEventListener('click', e => { e.stopPropagation(); r.proc._prevState = r.proc.state; r.proc.state = 'suspended'; });
        wrap.append(b);
      }
      if (r.type !== '内核' && r.proc.state !== 'finished') {
        const b = h('button', { class: 'btn small danger', 'data-testid': 'tasks-kill' }, '结束');
        b.addEventListener('click', e => { e.stopPropagation(); r.proc.state = 'finished'; this.os.notify(this.sys, '进程已结束', `${r.proc.name} (${r.proc.id})`, 'warn', true); });
        wrap.append(b);
      }
    } else if (r.child) {
      const b = h('button', { class: 'btn small', 'data-testid': 'tasks-open-system' }, '桌面');
      b.addEventListener('click', e => { e.stopPropagation(); this.os.openApp(this.sys, 'system', { systemId: r.child.id }); });
      wrap.append(b);
    } else if (r.win) {
      const b = h('button', { class: 'btn small', 'data-testid': 'tasks-close-app' }, '关闭');
      b.addEventListener('click', e => { e.stopPropagation(); this.os.closeWindow(r.win); });
      wrap.append(b);
    }
    return wrap;
  }
  renderDetail(r) {
    let d = this.win.bodyEl.querySelector('.tasks-detail');
    if (!d) {
      d = h('div', { class: 'tasks-detail', style: { borderTop: '1px solid rgba(255,255,255,.08)', padding: '8px 12px', fontSize: '11px', color: 'var(--muted)', maxHeight: '90px', overflow: 'auto' } });
      this.win.bodyEl.querySelector('.tasks-wrap').append(d);
    }
    clear(d);
    if (!r) { d.textContent = '选择进程查看详情'; return; }
    d.append(h('div', { style: { color: 'var(--text)', marginBottom: '3px' } }, `${r.name} · ${r.type} · ${r.state}`));
    if (r.proc) {
      d.append(h('div', {}, `累计工作 ${fmtInt(r.used)} · 本步 ${fmtInt(r.step)} / 额度 ${fmtInt(r.quota)} · 内存 ${fmtBytes(r.mem)} · 消息 ${r.msgs}`));
      if (r.error) d.append(h('div', { style: { color: '#ff9aa3' } }, '错误：' + r.error));
      if (r.proc.output?.length) d.append(h('div', { style: { marginTop: '3px', whiteSpace: 'pre-wrap' } }, r.proc.output.slice(-3).join('\n')));
      const q = h('input', { class: 'input', type: 'number', value: String(r.quota), style: { width: '80px' } });
      const b = h('button', { class: 'btn small', style: { marginLeft: '6px' } }, '设置步内额度');
      b.addEventListener('click', () => { r.proc.quota = Math.max(1, Number(q.value) || 1200); this.os.toast(this.sys, '额度已调整', `${r.proc.name} → ${r.proc.quota}`, 'ok'); });
      const row = h('div', { style: { marginTop: '5px', display: 'flex', alignItems: 'center', gap: '6px' } }, '进程额度', q, b);
      d.append(row);
    } else if (r.web) {
      d.append(h('div', {}, '网页视图：' + (r.web.url || r.web.tabId)));
      d.append(h('div', {}, '加载状态：' + r.web.loadState));
      d.append(h('div', {}, '网页由 Chromium 执行，不计入自定义指令读数与逻辑预算。'));
    } else if (r.child) {
      const c = r.child;
      d.append(h('div', {}, `父系统 ${c.parentId} · 深度 ${c.depth} · 虚拟时钟 ${(c.clock / 1000).toFixed(1)}s · 时间速率 ${c.speed}×`));
      d.append(h('div', {}, `内核自身 ${fmtInt(c.kernel?.usedTotal || 0)} · 子树总工作 ${fmtInt(c.totalUsed || 0)} · 内存 ${fmtBytes(c.totalMem || 0)}`));
      const grant = h('input', { class: 'input', type: 'number', min: '1', value: String(c.grantRatio * 100), style: { width: '70px' }, 'data-testid': 'tasks-grant', 'data-target-system-id': c.id });
      const b = h('button', { class: 'btn small', style: { marginLeft: '6px' } }, '拨付 %');
      b.addEventListener('click', () => this.os.setGrant(c, Math.max(1, Number(grant.value)) / 100));
      d.append(h('div', { style: { marginTop: '5px', display: 'flex', alignItems: 'center', gap: '6px' } }, '父系统拨付', grant, b));
    } else if (r.win) {
      d.append(h('div', {}, `窗口 ${r.win.id} · 应用 ${r.appId} · 标题 ${r.win.title}`));
    }
  }
  renderFoot() {
    const sys = this.sys;
    clear(this.footEl);
    const item = (label, control, sub) => {
      const d = h('div', { class: 'tfoot-item' });
      d.append(h('div', { class: 'tf-head' }, h('span', {}, label), sub ? h('span', {}, sub) : null));
      d.append(control);
      this.footEl.append(d);
    };
    if (sys.isRoot) {
      const b = h('input', { class: 'input', type: 'number', value: String(sys.budget), style: { width: '100%' }, 'data-testid': 'tasks-budget', 'data-system-id': sys.id });
      b.addEventListener('change', () => { sys.budget = Math.max(1000, Number(b.value) || 60000); this.os.toast(sys, '预算已调整', `根系统总预算 ${sys.budget} / 步`, 'ok'); });
      item('总执行预算（工作/步）', b, `本步已用 ${fmtInt(sys.lastStepUsed || 0)}`);
    } else {
      item('本系统预算（父系统拨付）', h('div', { class: 'mono' }, `${fmtInt(sys.lastGrant || 0)} / 步`), `拨付比例 ${(sys.grantRatio * 100).toFixed(0)}%`);
    }
    const mem = h('input', { class: 'input', type: 'number', value: String(Math.round(sys.memoryLimit / 1048576)), style: { width: '100%' }, 'data-testid': 'tasks-memory', 'data-system-id': sys.id });
    mem.addEventListener('change', () => { sys.memoryLimit = Math.max(16, Number(mem.value) || 512) * 1048576; });
    item('内存配额 (MB)', mem, fmtBytes(sys.totalMem || 0));
    const st = h('input', { class: 'input', type: 'number', value: String(Math.round(sys.storageLimit / 1048576)), style: { width: '100%' }, 'data-testid': 'tasks-storage', 'data-system-id': sys.id });
    st.addEventListener('change', () => { sys.storageLimit = Math.max(1, Number(st.value) || 256) * 1048576; });
    item('存储配额 (MB)', st, fmtBytes(sys.storageUsed || 0));
    const pl = h('input', { class: 'input', type: 'number', value: String(sys.processLimit || 64), style: { width: '100%' }, 'data-testid': 'tasks-process-limit', 'data-system-id': sys.id });
    pl.addEventListener('change', () => { sys.processLimit = Math.max(1, Number(pl.value) || 64); this.os.toast(sys, '进程额度已调整', String(sys.processLimit), 'ok'); });
    const plItem = h('div', { class: 'tfoot-item' });
    plItem.append(h('div', { class: 'tf-head' }, h('span', {}, '进程额度'), h('span', {}, String(sys.processes.length) + ' / ' + (sys.processLimit || 64))), pl);
    this.footEl.append(plItem);
    for (const c of sys.children) {
      const row = h('div', { style: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10.5px', color: 'var(--muted)' } });
      const slider = h('input', { type: 'range', min: '5', max: '80', value: String(Math.round((c.grantRatio || 0.5) * 100)), style: { flex: '1', accentColor: 'var(--accent)' }, 'data-testid': 'tasks-grant', 'data-target-system-id': c.id });
      slider.addEventListener('input', () => this.os.setGrant(c, Number(slider.value) / 100));
      row.append(h('span', { style: { minWidth: '70px' } }, c.id + ' 拨付'), slider, h('span', { style: { minWidth: '38px', textAlign: 'right' } }, Math.round((c.grantRatio || 0.5) * 100) + '%'));
      this.footEl.append(row);
    }
  }
  serialize() { return {}; }
  restore() { this.render(); }
  beforeClose() { return true; }
  tick() {}
  renderApp() { this.render(); }
  dispose() { clearInterval(this.timer); }
}