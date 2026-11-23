/* 根系统小组件：时钟日历、倒计时秒表、便笺、剪贴板历史、通知中心、快捷设置 */
'use strict';
window.NOS = window.NOS || {};

class Widgets {
  constructor() {
    this.timerEnd = null;
    this.timerRemain = 0;
    this.timerRunning = false;
    this.notes = '';
    this.dnd = false;
  }
  open() {
    this.win = NOS.desktop.openWindow('widgets', '小组件', { w: 720, h: 560, model: this });
    this.render();
    this.tick = setInterval(() => { if (this.win && !this.win.min && document.body.contains(this.win.el)) this.timerTick(); }, 200);
  }
  unmount() { clearInterval(this.tick); clearInterval(this.notifBus); }
  timerTick() {
    if (!this.timerRunning) return;
    this.timerRemain -= 200;
    if (this.timerRemain <= 0) {
      this.timerRunning = false; this.timerRemain = 0; this.timerEnd = null;
      NOS.rootVM.notify({ title: '倒计时', body: '倒计时时间到！' });
      this.flashTaskbar();
    }
    const out = this.win.contentEl.querySelector('[data-widget="timer-out"]');
    if (out) out.textContent = fmt(this.timerRemain);
  }
  flashTaskbar() {}

  togglePanel() {
    let panel = document.getElementById('widget-panel');
    if (panel) { panel.remove(); return; }
    panel = NOS.h('div', { id: 'widget-panel', class: 'widget-panel', dataTestid: 'widgets' });
    this.renderPanel(panel);
    document.getElementById('nos-root').appendChild(panel);
  }
  renderPanel(panel) {
    panel.innerHTML = '';
    panel.appendChild(this.clockCard());
    panel.appendChild(this.timerCard());
    panel.appendChild(this.noteCard());
    panel.appendChild(this.clipboardCard());
  }
  toggleNotifications() {
    let p = document.getElementById('notif-panel');
    if (p) { p.remove(); return; }
    p = NOS.h('div', { id: 'notif-panel', class: 'notif-panel', dataTestid: 'widget-notifications' });
    this.renderNotif(p);
    document.getElementById('nos-root').appendChild(p);
    setTimeout(() => {
      const closer = (e) => { if (!p.contains(e.target) && !e.target.closest('#notifications-toggle')) { p.remove(); document.removeEventListener('pointerdown', closer); } };
      document.addEventListener('pointerdown', closer);
    }, 0);
  }
  renderNotif(p) {
    p.innerHTML = '<div class="np-title">通知中心</div>';
    const dnd = NOS.h('label', { class: 'dnd' }, '');
    const cb = NOS.h('input', { type: 'checkbox' });
    cb.checked = this.dnd;
    cb.addEventListener('change', () => this.dnd = cb.checked);
    dnd.append(cb, ' 免打扰');
    p.appendChild(dnd);
    const list = NOS.h('div', { class: 'np-list', dataTestid: 'widget-notifications' });
    const notifs = NOS.rootVM._notifications.slice().reverse();
    if (!notifs.length) list.innerHTML = '<div class="empty">暂无通知</div>';
    notifs.forEach(n => list.appendChild(NOS.h('div', { class: 'np-item' }, `<b>${n.title}</b><div>${n.body}</div>`)));
    p.appendChild(list);
  }

  render() {
    const c = this.win.contentEl;
    c.innerHTML = '';
    c.classList.add('widgets-app');
    const grid = NOS.h('div', { class: 'widget-grid' });
    grid.append(this.clockCard(), this.timerCard(), this.noteCard(), this.clipboardCard(), this.quickSettings());
    c.appendChild(grid);
  }

  clockCard() {
    const card = NOS.h('div', { class: 'widget-card' });
    card.innerHTML = '<h4>时钟与日历</h4>';
    const now = new Date();
    const clock = NOS.h('div', { class: 'clock-big' }, now.toLocaleTimeString('zh-CN', { hour12: false }));
    const cal = NOS.h('div', { class: 'cal' });
    let y = now.getFullYear(), m = now.getMonth();
    const drawCal = () => {
      cal.innerHTML = '';
      const head = NOS.h('div', { class: 'cal-head' });
      const title = NOS.h('span', {}, `${y} 年 ${m + 1} 月`);
      const prev = NOS.h('button', { class: 'btn small' }, '‹');
      const next = NOS.h('button', { class: 'btn small' }, '›');
      prev.addEventListener('click', () => { m--; if (m < 0) { m = 11; y--; } drawCal(); });
      next.addEventListener('click', () => { m++; if (m > 11) { m = 0; y++; } drawCal(); });
      head.append(prev, title, next);
      const grid = NOS.h('div', { class: 'cal-grid' });
      '日一二三四五六'.split('').forEach(x => grid.appendChild(NOS.h('div', { class: 'cal-dow' }, x)));
      const first = new Date(y, m, 1).getDay();
      const days = new Date(y, m + 1, 0).getDate();
      for (let i = 0; i < first; i++) grid.appendChild(NOS.h('div', {}));
      for (let d = 1; d <= days; d++) {
        const cell = NOS.h('div', { class: 'cal-day' + (d === now.getDate() && m === now.getMonth() && y === now.getFullYear() ? ' today' : '') }, String(d));
        grid.appendChild(cell);
      }
      cal.append(head, grid);
    };
    drawCal();
    card.append(clock, cal);
    setInterval(() => { clock.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false }); }, 1000);
    return card;
  }

  timerCard() {
    const card = NOS.h('div', { class: 'widget-card' });
    card.innerHTML = '<h4>倒计时 / 秒表</h4>';
    const input = NOS.h('input', { class: 'input', type: 'number', value: '5', min: '1', dataTestid: 'widget-timer-input' });
    const out = NOS.h('div', { class: 'timer-out', dataWidget: 'timer-out' }, '0.0s');
    const start = NOS.h('button', { class: 'btn', dataTestid: 'widget-timer-start' }, '开始倒计时');
    const pause = NOS.h('button', { class: 'btn', dataTestid: 'widget-timer-pause' }, '暂停');
    const reset = NOS.h('button', { class: 'btn', dataTestid: 'widget-timer-reset' }, '重置');
    start.addEventListener('click', () => {
      if (this.timerRunning) return;
      if (this.timerRemain <= 0) this.timerRemain = (Number(input.value) || 5) * 1000;
      this.timerRunning = true;
    });
    pause.addEventListener('click', () => { this.timerRunning = false; });
    reset.addEventListener('click', () => { this.timerRunning = false; this.timerRemain = 0; out.textContent = '0.0s'; });
    card.append(input, out, NOS.h('div', { class: 'btn-row' }, start, pause, reset));
    return card;
  }

  noteCard() {
    const card = NOS.h('div', { class: 'widget-card' });
    card.innerHTML = '<h4>便笺</h4>';
    const ta = NOS.h('textarea', { class: 'note-area', dataTestid: 'widget-note-text' });
    ta.value = this.notes;
    const save = NOS.h('button', { class: 'btn small', dataTestid: 'widget-note-save' }, '保存');
    save.addEventListener('click', () => { this.notes = ta.value; NOS.persist && NOS.persist(); });
    ta.addEventListener('input', () => this.notes = ta.value);
    card.append(ta, save);
    return card;
  }

  clipboardCard() {
    const card = NOS.h('div', { class: 'widget-card' });
    card.innerHTML = '<h4>剪贴板历史</h4>';
    const list = NOS.h('div', { class: 'clip-list', dataTestid: 'widget-clipboard-list' });
    const draw = () => {
      list.innerHTML = '';
      NOS.rootVM.clipboard.slice().reverse().slice(0, 12).forEach(c => {
        const t = typeof c.data === 'string' ? c.data : (c.data && c.data.tsv) || JSON.stringify(c.data).slice(0, 80);
        const it = NOS.h('div', { class: 'clip-item', title: t }, `[${c.source}] ${String(t).slice(0, 60)}`);
        it.addEventListener('click', () => navigator.clipboard && navigator.clipboard.writeText(t));
        list.appendChild(it);
      });
      if (!NOS.rootVM.clipboard.length) list.innerHTML = '<div class="empty">还没有复制内容</div>';
    };
    NOS.rootVM.eventTarget.on('clipboard', draw);
    draw();
    card.appendChild(list);
    return card;
  }

  quickSettings() {
    const card = NOS.h('div', { class: 'widget-card' });
    card.innerHTML = '<h4>快捷设置（与系统设置同一状态）</h4>';
    const ac = NOS.h('div', { class: 'accent-row' });
    ['#7c3aed', '#2563eb', '#059669', '#dc2626', '#d97706'].forEach(col => {
      const b = NOS.h('button', { class: 'swatch' });
      b.style.background = col;
      b.addEventListener('click', () => { NOS.desktop.settings.accent = col; NOS.desktop.applySettings(); });
      ac.appendChild(b);
    });
    card.appendChild(ac);
    return card;
  }
}
function fmt(ms) { return (Math.max(0, ms) / 1000).toFixed(1) + 's'; }
NOS.Widgets = Widgets;
