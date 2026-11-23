// Root Widgets Panel & Notification Center ('widgets')
// Contains: Clock & Calendar (with Next/Prev Month), Countdown Timer (real notification on finish!) & Stopwatch,
// Sticky Notes (persisted), Clipboard History (records real copy from Spreadsheet/Editor),
// Notification Center (with Do-Not-Disturb), & Quick Settings (shared state with Settings app!).

export function renderWidgetsContent(os, containerEl, winId = 'widgets-panel') {
  const wState = os.widgetsState;
  const now = new Date();
  const calYear = wState.calYear ?? now.getFullYear();
  const calMonth = wState.calMonth ?? now.getMonth();

  const buildCalendarGrid = (year, month) => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayY = now.getFullYear();
    const todayM = now.getMonth();
    const todayD = now.getDate();
    let cells = ['日', '一', '二', '三', '四', '五', '六'].map((d) => `<span class="cal-hd">${d}</span>`).join('');
    for (let i = 0; i < firstDay; i++) cells += `<span class="cal-empty"></span>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = year === todayY && month === todayM && d === todayD;
      cells += `<span class="cal-day${isToday ? ' today' : ''}">${d}</span>`;
    }
    return cells;
  };

  const fmtTimer = (sec) => {
    const s = Math.max(0, Math.ceil(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  };

  const fmtSw = (ms) => {
    const totalS = Math.floor(ms / 1000);
    const m = Math.floor(totalS / 60);
    const s = totalS % 60;
    const cs = Math.floor((ms % 1000) / 10);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };

  // Preserve active input focus if already mounted
  let shell = containerEl.querySelector(':scope > .widgets-grid');
  if (!shell) {
    containerEl.innerHTML = `
      <div class="widgets-grid">
        <!-- 1. 时钟与日历 -->
        <div class="w-card">
          <div class="w-card-hd">
            <span>时钟与日历</span>
            <div class="w-cal-nav">
              <button class="btn-xxs" data-wact="cal_prev" aria-label="上月">‹ 上月</button>
              <span class="w-cal-title"></span>
              <button class="btn-xxs" data-wact="cal_next" aria-label="下月">下月 ›</button>
            </div>
          </div>
          <div class="w-clock-now"></div>
          <div class="w-cal-grid"></div>
        </div>

        <!-- 2. 倒计时与秒表 -->
        <div class="w-card">
          <div class="w-card-hd"><span>倒计时与秒表</span></div>
          <div class="w-timer-row">
            <span class="w-timer-display">00:00</span>
            <input type="number" min="1" max="3600" class="nos-input-xs" data-testid="widget-timer-input" data-system-id="outer" data-window-id="${winId}" aria-label="倒计时秒数"/>
            <button class="btn-xs btn-accent" data-testid="widget-timer-start" data-system-id="outer" data-window-id="${winId}" data-wact="timer_start" aria-label="开始倒计时">开始</button>
            <button class="btn-xs" data-testid="widget-timer-pause" data-system-id="outer" data-window-id="${winId}" data-wact="timer_pause" aria-label="暂停倒计时">暂停</button>
            <button class="btn-xs" data-testid="widget-timer-reset" data-system-id="outer" data-window-id="${winId}" data-wact="timer_reset" aria-label="重置倒计时">重置</button>
          </div>
          <div class="w-sw-row">
            <span class="w-sw-lbl">秒表</span>
            <span class="w-sw-display">00:00.00</span>
            <button class="btn-xxs" data-wact="sw_toggle">启停</button>
            <button class="btn-xxs" data-wact="sw_reset">归零</button>
          </div>
        </div>

        <!-- 3. 便笺 -->
        <div class="w-card">
          <div class="w-card-hd">
            <span>便笺</span>
            <button class="btn-xs btn-accent" data-testid="widget-note-save" data-system-id="outer" data-window-id="${winId}" data-wact="note_save" aria-label="保存便笺">保存</button>
          </div>
          <textarea class="w-note-ta" placeholder="输入随时记录的便笺文字..." data-testid="widget-note-text" data-system-id="outer" data-window-id="${winId}" aria-label="便笺内容"></textarea>
        </div>

        <!-- 4. 剪贴板历史 -->
        <div class="w-card">
          <div class="w-card-hd">
            <span>剪贴板历史</span>
            <button class="btn-xxs" data-wact="clip_clear">清空</button>
          </div>
          <div class="w-clip-list" data-testid="widget-clipboard-list" data-system-id="outer" data-window-id="${winId}"></div>
        </div>

        <!-- 5. 通知中心与快捷设置（与系统设置共享同一份状态） -->
        <div class="w-card w-card-wide">
          <div class="w-card-hd">
            <span>通知中心 &amp; 快捷设置</span>
            <div class="w-quick-bar">
              <button class="btn-xxs w-dnd-btn" data-wact="toggle_dnd">免打扰</button>
              <button class="btn-xxs" data-wact="quick_accent" title="切换强调色">换强调色</button>
              <button class="btn-xxs" data-wact="quick_scale" title="切换界面缩放">缩放</button>
              <button class="btn-xxs" data-wact="open_settings">系统设置</button>
              <button class="btn-xxs" data-wact="notif_clear">清除通知</button>
            </div>
          </div>
          <div class="w-notif-list" data-testid="widget-notifications" data-system-id="outer" data-window-id="${winId}"></div>
        </div>
      </div>
    `;
    shell = containerEl.querySelector(':scope > .widgets-grid');

    const timerIn = shell.querySelector('[data-testid="widget-timer-input"]');
    timerIn.value = String(wState.timerInputSec || 5);
    timerIn.addEventListener('input', () => {
      const sec = Math.max(1, Number(timerIn.value) || 5);
      wState.timerInputSec = sec;
      if (!wState.timerRunning) {
        wState.timerRemaining = sec;
        shell.querySelector('.w-timer-display').textContent = fmtTimer(wState.timerRemaining);
      }
    });

    const noteTa = shell.querySelector('[data-testid="widget-note-text"]');
    noteTa.value = wState.noteText || '';
    noteTa.addEventListener('input', () => {
      wState.noteText = noteTa.value;
    });

    shell.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-wact]');
      if (!btn) return;
      const act = btn.dataset.wact;
      if (act === 'cal_prev') {
        let m = (wState.calMonth ?? now.getMonth()) - 1;
        let y = wState.calYear ?? now.getFullYear();
        if (m < 0) { m = 11; y -= 1; }
        wState.calMonth = m; wState.calYear = y;
      } else if (act === 'cal_next') {
        let m = (wState.calMonth ?? now.getMonth()) + 1;
        let y = wState.calYear ?? now.getFullYear();
        if (m > 11) { m = 0; y += 1; }
        wState.calMonth = m; wState.calYear = y;
      } else if (act === 'timer_start') {
        const sec = Math.max(1, Number(timerIn.value) || wState.timerInputSec || 5);
        wState.timerInputSec = sec;
        if (!wState.timerRunning) {
          if (wState.timerRemaining <= 0.05) wState.timerRemaining = sec;
          wState.timerRunning = true;
          wState.timerLastTick = performance.now();
        }
      } else if (act === 'timer_pause') {
        wState.timerRunning = false;
      } else if (act === 'timer_reset') {
        wState.timerRunning = false;
        wState.timerRemaining = Math.max(1, Number(timerIn.value) || 10);
      } else if (act === 'sw_toggle') {
        wState.swRunning = !wState.swRunning;
        wState.swLastTick = performance.now();
      } else if (act === 'sw_reset') {
        wState.swRunning = false;
        wState.swElapsedMs = 0;
      } else if (act === 'note_save') {
        wState.noteText = noteTa.value;
        os.saveSettingsAndWidgets();
        os.notify('便笺已保存', wState.noteText.slice(0, 32) || '(空便笺)');
      } else if (act === 'clip_clear') {
        os.clipboardHistory.length = 0;
      } else if (act === 'toggle_dnd') {
        os.updateSettings({ dnd: !os.settings.dnd });
      } else if (act === 'quick_accent') {
        const colors = ['#38bdf8', '#a855f7', '#f59e0b', '#10b981', '#f43f5e'];
        const next = colors[(colors.indexOf(os.settings.accent) + 1) % colors.length];
        os.updateSettings({ accent: next });
      } else if (act === 'quick_scale') {
        const scales = [1, 1.15, 1.25, 0.9];
        const next = scales[(scales.indexOf(Number(os.settings.scale)) + 1) % scales.length];
        os.updateSettings({ scale: next });
      } else if (act === 'open_settings') {
        os.openApp('settings');
      } else if (act === 'notif_clear') {
        os.notifications.length = 0;
      }
      renderWidgetsContent(os, containerEl, winId);
    });
  }

  // Update dynamic sections
  shell.querySelector('.w-clock-now').textContent = now.toLocaleTimeString('zh-CN', { hour12: false }) + ' · ' + now.toLocaleDateString('zh-CN');
  shell.querySelector('.w-cal-title').textContent = `${calYear}年${calMonth + 1}月`;
  shell.querySelector('.w-cal-grid').innerHTML = buildCalendarGrid(calYear, calMonth);
  shell.querySelector('.w-timer-display').textContent = fmtTimer(wState.timerRemaining);
  shell.querySelector('.w-sw-display').textContent = fmtSw(wState.swElapsedMs);

  const noteTa = shell.querySelector('[data-testid="widget-note-text"]');
  if (document.activeElement !== noteTa && noteTa.value !== (wState.noteText || '')) {
    noteTa.value = wState.noteText || '';
  }

  const dndBtn = shell.querySelector('.w-dnd-btn');
  if (dndBtn) {
    dndBtn.classList.toggle('active', Boolean(os.settings.dnd));
    dndBtn.textContent = os.settings.dnd ? '免打扰：开' : '免打扰：关';
  }

  const clipList = shell.querySelector('[data-testid="widget-clipboard-list"]');
  if (os.clipboardHistory.length === 0) {
    clipList.innerHTML = `<div class="w-empty">暂无剪贴板记录（在电子表格或编辑器复制后显示）</div>`;
  } else {
    clipList.innerHTML = os.clipboardHistory.slice(0, 8).map((c) => `
      <div class="w-clip-item" title="${c.text}">
        <span class="wc-txt">${c.text.slice(0, 48).replace(/</g, '&lt;')}</span>
        <span class="wc-src">${c.source}</span>
      </div>
    `).join('');
  }

  const notifList = shell.querySelector('[data-testid="widget-notifications"]');
  if (os.notifications.length === 0) {
    notifList.innerHTML = `<div class="w-empty">暂无通知</div>`;
  } else {
    notifList.innerHTML = os.notifications.slice(0, 12).map((n) => `
      <div class="w-notif-item">
        <div class="wn-top"><strong>${n.title}</strong><span>${n.timeStr}</span></div>
        <div class="wn-body">${n.body}</div>
      </div>
    `).join('');
  }
}
