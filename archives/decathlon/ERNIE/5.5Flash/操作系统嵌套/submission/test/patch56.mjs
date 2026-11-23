import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
function rep(a, b) { if (!s.includes(a)) { console.log('MISS', a.slice(0, 70)); return; } s = s.replace(a, b); }

// active system + clipboard
rep(`  getSystem(id) { return this.systems.get(id); }`, `  getSystem(id) { return this.systems.get(id); }
  activeSystem() { return this.lastActiveSystem || this.root; }
  recordClipboard(sys, text) {
    if (!sys || !text) return;
    if (!sys.clipboard) sys.clipboard = [];
    const last = sys.clipboard[0];
    if (last && last.text === text) return;
    sys.clipboard.unshift({ text, time: sys.clock, type: 'text' });
    if (sys.clipboard.length > 30) sys.clipboard.pop();
    const d = this.desktops.get(sys.id);
    if (d?.widgetsOpen) d.renderWidgets();
    this.saveSoon();
  }`);

rep(`    document.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/x-nos-file')) e.preventDefault(); });`, `    document.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/x-nos-file')) e.preventDefault(); });
    document.addEventListener('copy', e => {
      const text = e.clipboardData?.getData('text/plain');
      if (text) this.recordClipboard(this.activeSystem(), text);
    });`);

// focus sets active system
rep(`  focusWindow(win) {
    if (!win) { this.focusWindowId = null; return; }`, `  focusWindow(win) {
    if (!win) { this.focusWindowId = null; return; }
    this.os.lastActiveSystem = this.system;`);

// stopwatch + quick settings in renderWidgets
rep(`    grid.append(nCard);
    // 剪贴板`, `    grid.append(nCard);
    // 秒表
    const sw = sys.widgets?.stopwatch || (sys.widgets.stopwatch = { running: false, elapsed: 0, startAt: 0, last: 0 });
    const swCard = h('div', { class: 'widget-card' });
    swCard.append(h('div', { class: 'wc-title' }, h('span', {}, '秒表'), h('span', {}, '分:秒')));
    const swDisp = h('div', { class: 'timer-display sw-display' }, fmtClock(sw.running ? sw.elapsed + (sys.clock - sw.startAt) / 1000 : sw.elapsed));
    const swStart = h('button', { class: 'btn primary small', 'data-testid': 'widget-stopwatch-start' }, '开始');
    const swPause = h('button', { class: 'btn small', 'data-testid': 'widget-stopwatch-pause' }, '暂停');
    const swReset = h('button', { class: 'btn ghost small', 'data-testid': 'widget-stopwatch-reset' }, '重置');
    swStart.addEventListener('click', () => { if (!sw.running) { sw.startAt = sys.clock; sw.running = true; this.renderWidgets(); } });
    swPause.addEventListener('click', () => { if (sw.running) { sw.elapsed += (sys.clock - sw.startAt) / 1000; sw.running = false; this.renderWidgets(); } });
    swReset.addEventListener('click', () => { sw.running = false; sw.elapsed = 0; sw.startAt = 0; this.renderWidgets(); });
    swCard.append(swDisp, h('div', { class: 'timer-row' }, swStart, swPause, swReset));
    grid.append(swCard);
    // 剪贴板`);
rep(`    el.append(grid);
    // 通知中心`, `    el.append(grid);
    // 快捷设置
    const qs = h('div', { class: 'widget-card', style: { marginTop: '10px' } });
    qs.append(h('div', { class: 'wc-title' }, h('span', {}, '快捷设置'), h('span', {}, '与设置同步')));
    const qsg = h('div', { class: 'qs-grid' });
    const qsTiles = [
      ['wifi', 'wifi', '无线网络', () => sys.settings.wifi, () => { sys.settings.wifi = !sys.settings.wifi; this.os.applySettings(sys); this.renderWidgets(); }],
      ['dnd', 'bell', '免打扰', () => sys.settings.dnd, () => { sys.settings.dnd = !sys.settings.dnd; this.renderWidgets(); }],
      ['brightness', 'sun', '亮度 ' + (sys.settings.brightness ?? 82) + '%', () => false, () => {}],
      ['volume', 'volume', '音量 ' + (sys.settings.volume ?? 68) + '%', () => false, () => {}]
    ];
    for (const [id, ic, label, on, fn] of qsTiles) {
      const t = h('button', { class: 'qs-tile' + (on() ? ' on' : ''), 'data-testid': 'qs-' + id });
      const sp = h('span', { style: { display: 'flex' } }); sp.innerHTML = iconSvg(ic);
      t.append(sp, h('span', {}, label));
      t.addEventListener('click', fn);
      qsg.append(t);
    }
    const vol = h('input', { type: 'range', min: '0', max: '100', value: String(sys.settings.volume ?? 68), style: { width: '100%', accentColor: 'var(--accent)', marginTop: '8px' }, 'data-testid': 'qs-volume' });
    vol.addEventListener('input', () => { sys.settings.volume = Number(vol.value); this.os.saveSoon(); });
    qs.append(qsg, vol);
    el.append(qs);
    // 通知中心`);

// live updates
rep(`    } else if (timer && timer.running && this.widgetsOpen) {
      const disp = this.widgetsEl.querySelector('.timer-display');
      if (disp) disp.textContent = fmtClock(Math.max(0, (timer.endAt - this.system.clock) / 1000));
    }`, `    } else if (timer && timer.running && this.widgetsOpen) {
      const disp = this.widgetsEl.querySelector('.timer-display');
      if (disp) disp.textContent = fmtClock(Math.max(0, (timer.endAt - this.system.clock) / 1000));
    }
    if (this.widgetsOpen) {
      const wc = this.widgetsEl.querySelector('.widget-clock');
      const now = new Date((this.system.parent?.epochBase || Date.now()) + this.system.clock);
      if (wc) wc.textContent = \`\${String(now.getHours()).padStart(2, '0')}:\${String(now.getMinutes()).padStart(2, '0')}\`;
      const sw = this.system.widgets?.stopwatch;
      if (sw) {
        const sd = this.widgetsEl.querySelector('.sw-display');
        if (sd) sd.textContent = fmtClock(sw.running ? sw.elapsed + (this.system.clock - sw.startAt) / 1000 : sw.elapsed);
      }
    }`);

fs.writeFileSync('js/shell.js', s);
console.log('done');