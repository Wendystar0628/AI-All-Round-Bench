/*
 * 根系统应用（宿主直接实现）：文件管理器、电子表格、小组件、编辑器、
 * 任务管理器、设置、浏览器、系统管理。
 */
const NOS = (globalThis.NOS = globalThis.NOS || {});
const escapeHtml = NOS.escapeHtml;
const renderWidgets = NOS.renderWidgets;

class RootApps {
  constructor(host) {
    this.host = host;
    this.rt = host.rt;
    this.sheet = null;
    this.windows = new Map();   // appId -> win
    this.notes = [];
    this.clipboard = [];
    this.countdown = { total: 0, left: 0, running: false, ts: 0 };
    this.stopwatch = { running: false, acc: 0, ts: 0 };
    this.quick = { wifi: true, bluetooth: false, night: false, dnd: false };
    this.clip = null;
    this.unsub = null;
  }
  init(root) {
    this.root = root;
    this.sheet = new Sheet(this, root);
  }
  /* 通用：打开应用窗口 */
  open(appId, title, w, h, builder) {
    const desk = this.host.desktops.get(this.root.id);
    let win = this.windows.get(appId);
    if (win && win.el && win.el.isConnected) {
      win.state = 'normal'; desk.syncWindows(); desk.focus(win); return win;
    }
    const body = document.createElement('div');
    body.className = 'app-body app-' + appId;
    body.setAttribute('data-app-id', appId);
    win = desk.open({ appId, title, w: w || 780, h: h || 520, content: body });
    this.windows.set(appId, win);
    builder(body, win);
    return win;
  }
  launch(sys, appId) {
    if (appId === 'files') this.openFiles(sys);
    else if (appId === 'spreadsheet') this.openSheet(sys, '/Demo/sample.sheet');
    else if (appId === 'widgets') this.openWidgets(sys);
    else if (appId === 'editor') this.openEditor(sys, '/System/apps/player.nsl');
    else if (appId === 'tasks') this.openTasks(sys);
    else if (appId === 'settings') this.openSettings(sys);
    else if (appId === 'browser') this.openBrowser(sys);
    else if (appId === 'systems') this.openSystems(sys);
  }

  /* ================= 文件管理器 ================= */
  openFiles(sys, path) {
    const self = this;
    const win = this.open('files', '文件管理器 · ' + sys.id, 820, 540, (body) => {
      body.innerHTML =
        '<div class="fm-toolbar">' +
        '<button data-testid="files-nav" data-file-path="/">根</button>' +
        '<button data-testid="files-nav" data-file-path="/Documents">文档</button>' +
        '<button data-testid="files-nav" data-file-path="/Downloads">下载</button>' +
        '<button data-testid="files-nav" data-file-path="/RecycleBin">回收站</button>' +
        '<button data-testid="files-nav" data-file-path="/Demo">演示</button>' +
        '<button data-testid="files-nav" data-file-path="/System">系统</button>' +
        '<span class="spacer"></span>' +
        '<button data-testid="files-new-file">新建文件</button>' +
        '<button data-testid="files-new-folder">新建文件夹</button>' +
        '<button data-testid="files-copy">复制</button>' +
        '<button data-testid="files-paste">粘贴</button>' +
        '<button data-testid="files-open">打开</button>' +
        '<button data-testid="files-delete">删除</button>' +
        '<button data-testid="files-restore">还原</button>' +
        '</div>' +
        '<div class="fm-path"><span class="dim">路径</span><input data-testid="files-path" value="/Documents"></div>' +
        '<div class="fm-list" data-testid="files-list"></div>' +
        '<div class="fm-status"></div>';
      const pathInput = body.querySelector('[data-testid="files-path"]');
      const listEl = body.querySelector('[data-testid="files-list"]');
      const statusEl = body.querySelector('.fm-status');
      let current = path || '/Documents';
      let selected = null;
      const refresh = () => {
        pathInput.value = current;
        listEl.innerHTML = '';
        const res = sys.fs.list(current);
        if (!res.ok) { listEl.innerHTML = '<div class="fm-empty">' + escapeHtml(res.error) + '</div>'; return; }
        if (!res.entries.length) listEl.innerHTML = '<div class="fm-empty">（空）</div>';
        for (const e of res.entries) {
          const row = document.createElement('div');
          row.className = 'fm-row';
          row.setAttribute('data-testid', 'files-item');
          row.setAttribute('data-file-path', e.path);
          row.setAttribute('data-file-type', e.type);
          row.innerHTML = NOS.icon(e.type === 'dir' ? 'folder' : (/\.nsl$/.test(e.path) ? 'editor' : 'doc')) +
            '<span class="nm">' + escapeHtml(e.name) + '</span><span class="dim">' + (e.type === 'dir' ? '文件夹' : e.size + ' 字节') + '</span>';
          row.addEventListener('click', (ev) => {
            listEl.querySelectorAll('.fm-row.selected').forEach((x) => x.classList.remove('selected'));
            row.classList.add('selected');
            selected = e.path;
            ev.stopPropagation();
          });
          row.addEventListener('dblclick', () => {
            if (e.type === 'dir') { current = e.path; refresh(); }
            else self.host.openFileIn(sys, e.path);
          });
          row.addEventListener('dragstart', (ev) => {
            ev.dataTransfer.setData('text/nested-os-file', JSON.stringify({ systemId: sys.id, path: e.path }));
            ev.dataTransfer.setData('text/plain', e.path);
          });
          listEl.appendChild(row);
        }
      };
      body.querySelectorAll('[data-testid="files-nav"]').forEach((b) => b.addEventListener('click', () => { current = b.getAttribute('data-file-path'); refresh(); }));
      pathInput.addEventListener('change', () => { current = pathInput.value; refresh(); });
      body.querySelector('[data-testid="files-new-file"]').addEventListener('click', () => self.newFile(sys, current));
      body.querySelector('[data-testid="files-new-folder"]').addEventListener('click', () => self.newFolder(sys, current));
      body.querySelector('[data-testid="files-copy"]').addEventListener('click', () => { self.clip = selected ? { systemId: sys.id, path: selected } : null; statusEl.textContent = self.clip ? '已复制 ' + selected : '请先选择文件'; });
      body.querySelector('[data-testid="files-paste"]').addEventListener('click', () => {
        if (!self.clip) { statusEl.textContent = '剪贴板为空'; return; }
        const srcSys = self.rt.sys(self.clip.systemId);
        const name = self.clip.path.split('/').pop();
        const dst = current.replace(/\/$/, '') + '/' + name;
        const r = srcSys.fs.copy(self.clip.path, dst);
        statusEl.textContent = r.ok ? ('已复制到 ' + dst) : ('复制失败：' + r.error);
        refresh();
      });
      body.querySelector('[data-testid="files-open"]').addEventListener('click', () => { if (selected) self.host.openFileIn(sys, selected); });
      body.querySelector('[data-testid="files-delete"]').addEventListener('click', () => {
        if (!selected) return;
        const r = sys.fs.remove(selected, true);
        statusEl.textContent = r.ok ? '已移入回收站' : ('删除失败：' + r.error);
        refresh();
      });
      body.querySelector('[data-testid="files-restore"]').addEventListener('click', () => {
        const bins = sys.fs.binList();
        if (!bins.length) { statusEl.textContent = '回收站为空'; return; }
        const r = sys.fs.restore(0);
        statusEl.textContent = r.ok ? ('已还原 ' + r.path) : '还原失败';
        refresh();
      });
      // 跨系统拖放投放
      body.addEventListener('dragover', (e) => { e.preventDefault(); body.classList.add('drop'); });
      body.addEventListener('dragleave', () => body.classList.remove('drop'));
      body.addEventListener('drop', (e) => {
        e.preventDefault(); body.classList.remove('drop');
        let info = null;
        try { info = JSON.parse(e.dataTransfer.getData('text/nested-os-file')); } catch (err) { info = null; }
        if (!info) { statusEl.textContent = '不支持的文件来源'; return; }
        const srcSys = self.rt.sys(info.systemId);
        const name = info.path.split('/').pop();
        const dst = current.replace(/\/$/, '') + '/' + name;
        if (srcSys.id === sys.id) {
          const r = sys.fs.copy(info.path, dst);
          statusEl.textContent = r.ok ? ('已复制到 ' + dst) : ('复制失败：' + r.error);
        } else {
          const src = srcSys.fs.read(info.path);
          if (!src.ok) { statusEl.textContent = '无法读取源文件'; return; }
          const r = sys.fs.write(dst, src.content);
          statusEl.textContent = r.ok ? ('已从 ' + srcSys.id + ' 传入 ' + dst) : ('传输失败：' + r.error);
          self.host.notify(sys, '文件已传入', name + ' ← ' + srcSys.id);
        }
        refresh();
      });
      refresh();
      win.refresh = refresh;
    });
    return win;
  }
  newFile(sys, dir) {
    const name = prompt('新建文件名', '新建文件.txt');
    if (!name) return;
    sys.fs.write(dir.replace(/\/$/, '') + '/' + name, '');
    if (this.windows.get('files') && this.windows.get('files').refresh) this.windows.get('files').refresh();
  }
  newFolder(sys, dir) {
    const name = prompt('新建文件夹名', '新建文件夹');
    if (!name) return;
    sys.fs.mkdir(dir.replace(/\/$/, '') + '/' + name);
    if (this.windows.get('files') && this.windows.get('files').refresh) this.windows.get('files').refresh();
  }

  /* ================= 电子表格 ================= */
  openSheet(sys, path) {
    const self = this;
    const sheet = this.sheet;
    sheet.load(sys, path);
    const win = this.open('spreadsheet', '电子表格 · ' + (path || '未命名'), 860, 560, (body) => {
      body.innerHTML =
        '<div class="sheet-toolbar">' +
        '<span class="sheet-name"><input data-testid="sheet-filename" value="' + escapeHtml(path || '未命名.sheet') + '"></span>' +
        '<button data-testid="sheet-save">保存</button>' +
        '<button data-testid="sheet-undo">撤销</button>' +
        '<button data-testid="sheet-redo">重做</button>' +
        '<span class="dim" data-testid="sheet-status"></span>' +
        '</div>' +
        '<div class="sheet-formula"><span class="addr" data-testid="sheet-address">A1</span><input data-testid="sheet-formula" placeholder="值或公式，如 =SUM(D2:D4)"></div>' +
        '<div class="sheet-grid" data-testid="sheet-grid"></div>';
      const grid = body.querySelector('[data-testid="sheet-grid"]');
      const formula = body.querySelector('[data-testid="sheet-formula"]');
      const addrEl = body.querySelector('[data-testid="sheet-address"]');
      const statusEl = body.querySelector('[data-testid="sheet-status"]');
      const draw = () => {
        grid.innerHTML = '';
        const rows = 18, cols = 9;
        const head = document.createElement('div');
        head.className = 'sheet-row sheet-head';
        head.appendChild(Object.assign(document.createElement('div'), { className: 'sheet-cell corner' }));
        for (let c = 0; c < cols; c++) {
          const h = document.createElement('div');
          h.className = 'sheet-cell sheet-colhead';
          h.textContent = sheet.colName(c);
          head.appendChild(h);
        }
        grid.appendChild(head);
        for (let r = 0; r < rows; r++) {
          const row = document.createElement('div');
          row.className = 'sheet-row';
          const rh = document.createElement('div');
          rh.className = 'sheet-cell sheet-rowhead';
          rh.textContent = String(r + 1);
          row.appendChild(rh);
          for (let c = 0; c < cols; c++) {
            const addr = sheet.addr(r, c);
            const cell = document.createElement('div');
            cell.className = 'sheet-cell';
            cell.setAttribute('data-testid', 'sheet-cell');
            cell.setAttribute('data-cell-address', addr);
            const v = sheet.get(r, c);
            cell.textContent = v.display;
            if (v.error) cell.classList.add('err');
            if (sheet.selection === addr) cell.classList.add('sel');
            cell.addEventListener('click', () => { sheet.selection = addr; formula.value = v.formula || ''; addrEl.textContent = addr; draw(); });
            cell.addEventListener('dblclick', () => {
              const input = document.createElement('input');
              input.className = 'cell-input';
              input.value = v.formula === undefined ? '' : v.formula;
              cell.textContent = '';
              cell.appendChild(input);
              input.focus(); input.select();
              const commit = () => {
                sheet.set(addr, input.value);
                draw();
                statusEl.textContent = sheet.lastMessage || '';
              };
              input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
              input.addEventListener('blur', commit);
            });
            row.appendChild(cell);
          }
          grid.appendChild(row);
        }
      };
      formula.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { sheet.set(sheet.selection, formula.value); draw(); statusEl.textContent = sheet.lastMessage || ''; }
      });
      body.querySelector('[data-testid="sheet-save"]').addEventListener('click', () => {
        const p = sheet.save(sys);
        statusEl.textContent = p.ok ? ('已保存 ' + p.path) : ('保存失败：' + p.error);
      });
      body.querySelector('[data-testid="sheet-undo"]').addEventListener('click', () => { sheet.undo(); draw(); });
      body.querySelector('[data-testid="sheet-redo"]').addEventListener('click', () => { sheet.redo(); draw(); });
      draw();
      win.redraw = draw;
    });
    return win;
  }

  /* ================= 小组件 ================= */
  openWidgets(sys) {
    const self = this;
    const win = this.open('widgets', '小组件 · ' + sys.id, 420, 560, (body) => {
      body.innerHTML =
        '<div class="wg"><div class="wg-block"><div class="wg-title">时钟与日历</div>' +
        '<div class="wg-clock" data-testid="widget-clock"></div><div class="wg-cal" data-testid="widget-calendar"></div>' +
        '<button data-testid="widget-cal-next">下月</button><button data-testid="widget-cal-prev">上月</button></div>' +
        '<div class="wg-block"><div class="wg-title">倒计时</div>' +
        '<input data-testid="widget-timer-input" type="number" value="5" min="1"><span class="dim">秒</span> ' +
        '<button data-testid="widget-timer-start">开始</button><button data-testid="widget-timer-pause">暂停</button>' +
        '<button data-testid="widget-timer-reset">重置</button><div class="wg-timer" data-testid="widget-timer"></div></div>' +
        '<div class="wg-block"><div class="wg-title">秒表</div><button data-testid="widget-stopwatch">开始/停止</button><span class="wg-timer" data-testid="widget-stopwatch"></span></div>' +
        '<div class="wg-block"><div class="wg-title">便笺</div>' +
        '<textarea data-testid="widget-note-text" rows="3" placeholder="写点什么…"></textarea>' +
        '<button data-testid="widget-note-save">保存便笺</button><div class="wg-notes" data-testid="widget-notes"></div></div>' +
        '<div class="wg-block"><div class="wg-title">剪贴板历史</div><div data-testid="widget-clipboard-list" class="wg-clip"></div></div>' +
        '<div class="wg-block"><div class="wg-title">快捷设置</div>' +
        '<label><input type="checkbox" data-testid="quick-wifi">无线网络</label> ' +
        '<label><input type="checkbox" data-testid="quick-bt">蓝牙</label> ' +
        '<label><input type="checkbox" data-testid="quick-night">夜间模式</label> ' +
        '<label><input type="checkbox" data-testid="quick-dnd">免打扰</label>' +
        '</div>' +
        '<div class="wg-block"><div class="wg-title">通知中心</div><div data-testid="widget-notifications" class="wg-notif"></div></div>';
      const clockEl = body.querySelector('[data-testid="widget-clock"]');
      const calEl = body.querySelector('[data-testid="widget-calendar"]');
      const timerEl = body.querySelector('[data-testid="widget-timer"]');
      const swEl = body.querySelector('[data-testid="widget-stopwatch"]');
      let calOffset = 0;
      const drawCal = () => {
        const now = new Date();
        const d = new Date(now.getFullYear(), now.getMonth() + calOffset, 1);
        const days = ['日', '一', '二', '三', '四', '五', '六'];
        let html = '<div class="cal-title">' + d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月</div><div class="cal-grid">';
        for (const w of days) html += '<span class="cal-wd">' + w + '</span>';
        const first = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
        for (let i = 0; i < first; i++) html += '<span></span>';
        const total = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        for (let i = 1; i <= total; i++) {
          const isToday = calOffset === 0 && i === now.getDate();
          html += '<span class="cal-d' + (isToday ? ' today' : '') + '">' + i + '</span>';
        }
        html += '</div>';
        calEl.innerHTML = html;
      };
      const drawNotif = () => {
        const el = body.querySelector('[data-testid="widget-notifications"]');
        el.innerHTML = sys.notifications.map((n) => '<div class="notif"><b>' + escapeHtml(n.title) + '</b><div>' + escapeHtml(n.text) + '</div></div>').join('') || '<div class="dim">（暂无通知）</div>';
      };
      const drawClip = () => {
        const el = body.querySelector('[data-testid="widget-clipboard-list"]');
        el.innerHTML = self.clipboard.map((c, i) => '<div class="clip-item" data-index="' + i + '">' + escapeHtml(c.text) + '</div>').join('') || '<div class="dim">（空）</div>';
      };
      const drawNotes = () => {
        const el = body.querySelector('[data-testid="widget-notes"]');
        el.innerHTML = self.notes.map((n, i) => '<div class="note">' + escapeHtml(n.text) + ' <button data-note-del="' + i + '">删</button></div>').join('');
      };
      body.querySelector('[data-testid="widget-cal-next"]').addEventListener('click', () => { calOffset++; drawCal(); });
      body.querySelector('[data-testid="widget-cal-prev"]').addEventListener('click', () => { calOffset--; drawCal(); });
      body.querySelector('[data-testid="widget-timer-start"]').addEventListener('click', () => {
        const v = parseFloat(body.querySelector('[data-testid="widget-timer-input"]').value) || 5;
        self.countdown = { total: v, left: v, running: true, ts: Date.now() };
      });
      body.querySelector('[data-testid="widget-timer-pause"]').addEventListener('click', () => { self.countdown.running = false; });
      body.querySelector('[data-testid="widget-timer-reset"]').addEventListener('click', () => { self.countdown = { total: 0, left: 0, running: false, ts: 0 }; });
      body.querySelector('[data-testid="widget-stopwatch"]').addEventListener('click', () => {
        if (self.stopwatch.running) { self.stopwatch.acc += (Date.now() - self.stopwatch.ts) / 1000; self.stopwatch.running = false; }
        else { self.stopwatch.running = true; self.stopwatch.ts = Date.now(); }
      });
      body.querySelector('[data-testid="widget-note-save"]').addEventListener('click', () => {
        const t = body.querySelector('[data-testid="widget-note-text"]').value;
        if (t) { self.notes.unshift({ text: t }); self.notes = self.notes.slice(0, 20); drawNotes(); }
      });
      body.querySelectorAll('[data-note-del]').forEach((b) => b.addEventListener('click', () => { self.notes.splice(parseInt(b.getAttribute('data-note-del'), 10), 1); drawNotes(); }));
      body.querySelectorAll('.wg input[type=checkbox]').forEach((c) => c.addEventListener('change', () => {
        if (c.getAttribute('data-testid') === 'quick-wifi') self.quick.wifi = c.checked;
        if (c.getAttribute('data-testid') === 'quick-bt') self.quick.bluetooth = c.checked;
        if (c.getAttribute('data-testid') === 'quick-night') self.quick.night = c.checked;
        if (c.getAttribute('data-testid') === 'quick-dnd') self.quick.dnd = c.checked;
        sys.accent = c.checked && c.getAttribute('data-testid') === 'quick-night' ? '#2a2f4a' : '#7c5cff';
      }));
      const tick = () => {
        clockEl.textContent = new Date().toLocaleString('zh-CN');
        if (self.countdown.running) {
          const left = self.countdown.left - (Date.now() - self.countdown.ts) / 1000;
          self.countdown.left = Math.max(0, left);
          self.countdown.ts = Date.now();
          if (left <= 0 && self.countdown.total > 0) {
            self.countdown.running = false;
            self.host.notify(sys, '倒计时结束', '计时 ' + self.countdown.total + ' 秒已完成');
            if (!self.quick.dnd) sys.notifications.unshift({ title: '倒计时结束', text: '计时 ' + self.countdown.total + ' 秒已完成', at: sys.time });
            drawNotif();
          }
        }
        timerEl.textContent = self.countdown.running || self.countdown.total ? (self.countdown.left.toFixed(1) + ' s') : '—';
        const sw = self.stopwatch.acc + (self.stopwatch.running ? (Date.now() - self.stopwatch.ts) / 1000 : 0);
        swEl.textContent = sw.toFixed(1) + ' s';
        drawCal(); drawNotif(); drawClip(); drawNotes();
      };
      tick();
      win.timer = setInterval(tick, 500);
      win.onClose = () => { clearInterval(win.timer); };
    });
    return win;
  }

  /* ================= 编辑器 ================= */
  openEditor(sys, path) {
    const self = this;
    const win = this.open('editor', '编辑器 · ' + (path || ''), 820, 560, (body) => {
      body.innerHTML =
        '<div class="ed-toolbar">' +
        '<input data-testid="editor-filename" value="' + escapeHtml(path || '') + '">' +
        '<button data-testid="editor-open">打开</button><button data-testid="editor-save">保存</button>' +
        '<button data-testid="editor-run">运行</button><button data-testid="editor-compile">编译并应用</button>' +
        '<span class="dim" data-testid="editor-status"></span></div>' +
        '<textarea data-testid="editor-text" spellcheck="false"></textarea>' +
        '<div class="ed-out" data-testid="editor-output"></div>';
      const ta = body.querySelector('[data-testid="editor-text"]');
      const status = body.querySelector('[data-testid="editor-status"]');
      const out = body.querySelector('[data-testid="editor-output"]');
      const fname = body.querySelector('[data-testid="editor-filename"]');
      let current = path;
      const load = (p) => {
        const r = sys.fs.read(p);
        if (!r.ok) { status.textContent = r.error; return; }
        ta.value = r.content; current = p; fname.value = p;
        status.textContent = '已载入 ' + p;
      };
      body.querySelector('[data-testid="editor-open"]').addEventListener('click', () => {
        const p = prompt('打开路径', current || '/Documents');
        if (p) load(p);
      });
      body.querySelector('[data-testid="editor-save"]').addEventListener('click', () => {
        const p = fname.value.trim();
        if (!p) return;
        const r = sys.fs.write(p, ta.value);
        status.textContent = r.ok ? ('已保存 ' + p) : ('保存失败：' + r.error);
        if (r.ok && /compiler\.nsl$/.test(p)) {
          try {
            const prog = self.rt.compileWithSystem(sys, ta.value);
            sys.compilerProg = prog;
            sys.compilerVersion++;
            status.textContent += '（编译器已重新装载 v' + sys.compilerVersion + '）';
          } catch (e) { status.textContent += '（编译器编译失败：' + e.message + '）'; }
        }
        if (r.ok && /kernel\.nsl$/.test(p)) status.textContent += '（重启该子系统后生效）';
      });
      body.querySelector('[data-testid="editor-compile"]').addEventListener('click', () => {
        try {
          const prog = self.rt.compileWithSystem(sys, ta.value);
          sys.compilerProg = prog; sys.compilerVersion++;
          status.textContent = '编译器已用自身重新编译并生效（v' + sys.compilerVersion + '）';
        } catch (e) { status.textContent = '编译失败：' + e.message; }
      });
      body.querySelector('[data-testid="editor-run"]').addEventListener('click', () => {
        out.textContent = '';
        try {
          const prog = self.rt.compileWithSystem(sys, ta.value);
          const logs = [];
          const r = NOS.NSL.execute(prog, { globals: {}, budget: 2000000, log: (t) => logs.push(String(t)), now: () => sys.time, rngState: 5 });
          out.textContent = logs.join('\n') + '\n[状态 ' + r.status + (r.error ? '：' + r.error : '') + ']';
        } catch (e) {
          out.textContent = '[编译错误] ' + e.message;
        }
      });
      if (current) load(current);
    });
    return win;
  }
  openText(sys, path) {
    const win = this.open('editor', '文本 · ' + path, 700, 460, (body) => {
      body.innerHTML = '<textarea data-testid="editor-text" spellcheck="false" readonly></textarea>';
      const r = sys.fs.read(path);
      body.querySelector('[data-testid="editor-text"]').value = r.ok ? r.content : (r.error || '');
    });
    return win;
  }
  openScene(sys, path) {
    const self = this;
    const win = this.open('editor', '场景 · ' + path, 760, 520, (body) => {
      body.innerHTML = '<div class="dim">场景资源为数据文件，可在编辑器中查看并修改后重新打开。</div><textarea data-testid="editor-text" spellcheck="false"></textarea>';
      const ta = body.querySelector('[data-testid="editor-text"]');
      const r = sys.fs.read(path);
      ta.value = r.ok ? r.content : (r.error || '');
    });
    return win;
  }

  /* ================= 任务管理器 ================= */
  openTasks(sys) {
    const self = this;
    const win = this.open('tasks', '任务管理器 · ' + sys.id, 760, 520, (body) => {
      body.innerHTML =
        '<div class="tm-top">' +
        '<span>总预算 <input data-testid="tasks-budget" type="number" value="' + sys.budgetTotal + '"></span>' +
        '<span>本步拨付 <b data-testid="tasks-grant-value">' + sys.budgetGrant + '</b></span>' +
        '<span>本步消耗 <b>' + sys.budgetUsed + '</b></span>' +
        '<span>内存 <input data-testid="tasks-memory" type="number" value="' + Math.round(sys.memQuota / 1024 / 1024) + '"> MB</span>' +
        '<span>存储 <input data-testid="tasks-storage" type="number" value="' + Math.round(sys.storageQuota / 1024 / 1024) + '"> MB</span>' +
        '</div>' +
        '<div class="tm-children"><div class="tm-title">直属子系统拨付</div><div data-testid="tasks-children"></div></div>' +
        '<div class="tm-procs" data-testid="tasks-list"></div>';
      const listEl = body.querySelector('[data-testid="tasks-list"]');
      const chEl = body.querySelector('[data-testid="tasks-children"]');
      const draw = () => {
        listEl.innerHTML = '';
        const head = document.createElement('div');
        head.className = 'tm-row tm-head';
        head.innerHTML = '<span>进程</span><span>状态</span><span>已用</span><span>剩余</span><span>内存</span><span>错误</span><span>操作</span>';
        listEl.appendChild(head);
        const procs = sys.parentId ? sys.processes : sys.processes;
        for (const p of procs) {
          const row = document.createElement('div');
          row.className = 'tm-row';
          row.setAttribute('data-process-name', p.name);
          row.innerHTML = '<span>' + escapeHtml(p.name) + '<small>' + (p.role || '') + '</small></span>' +
            '<span class="st st-' + p.state + '">' + p.state + '</span>' +
            '<span>' + p.consumed + '</span><span>' + (p.remaining || 0) + '</span><span>' + Math.round(p.memory / 1024) + 'K</span>' +
            '<span class="err">' + escapeHtml(p.error || '') + '</span>';
          const ops = document.createElement('span');
          const mk = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', fn); ops.appendChild(b); };
          mk('挂起', () => { p.state = 'suspended'; draw(); });
          mk('继续', () => { p.state = 'ready'; draw(); });
          mk('结束', () => { p.state = 'done'; p.saved = null; draw(); });
          row.appendChild(ops);
          listEl.appendChild(row);
        }
        // 子系统
        chEl.innerHTML = '';
        const kids = self.rt.childrenOf(sys.id);
        if (!kids.length) chEl.innerHTML = '<div class="dim">（无直属子系统）</div>';
        for (const k of kids) {
          const row = document.createElement('div');
          row.className = 'tm-row';
          row.innerHTML = '<span>' + k.id + '</span><span class="st st-' + k.state + '">' + k.state + '</span>' +
            '<span>' + k.budgetUsed + '</span><span>' + (k.budgetTotal - k.budgetUsed) + '</span>' +
            '<span>' + Math.round(k.memUsed / 1024) + 'K</span><span>' + (k.kernelProc && k.kernelProc.error ? k.kernelProc.error : '') + '</span>';
          const ops = document.createElement('span');
          const mk = (label, fn, tid) => { const b = document.createElement('button'); b.textContent = label; if (tid) b.setAttribute('data-testid', tid); b.addEventListener('click', fn); ops.appendChild(b); };
          mk('拨付', () => {
            const v = prompt('该子系统每步拨付上限（指令）', String(k.budgetTotal));
            if (v) { k.budgetTotal = parseInt(v, 10) || k.budgetTotal; draw(); }
          }, 'tasks-grant');
          mk('暂停', () => { k.state = 'paused'; draw(); });
          mk('继续', () => { k.state = 'running'; draw(); });
          mk('重启', () => { self.restartSystem(k); draw(); });
          mk('关闭', () => { self.closeSystem(k); draw(); });
          row.appendChild(ops);
          chEl.appendChild(row);
        }
      };
      body.querySelector('[data-testid="tasks-budget"]').addEventListener('change', (e) => { sys.budgetTotal = parseInt(e.target.value, 10) || sys.budgetTotal; });
      body.querySelector('[data-testid="tasks-memory"]').addEventListener('change', (e) => { sys.memQuota = (parseInt(e.target.value, 10) || 64) * 1024 * 1024; });
      body.querySelector('[data-testid="tasks-storage"]').addEventListener('change', (e) => { sys.storageQuota = (parseInt(e.target.value, 10) || 32) * 1024 * 1024; });
      draw();
      win.timer = setInterval(draw, 600);
      win.onClose = () => clearInterval(win.timer);
    });
    return win;
  }

  /* ================= 设置 ================= */
  openSettings(sys) {
    const self = this;
    const win = this.open('settings', '设置 · ' + sys.id, 520, 470, (body) => {
      body.innerHTML =
        '<div class="st-row"><span>系统名称</span><input data-testid="settings-name" value="' + escapeHtml(sys.systemName || sys.name) + '"></div>' +
        '<div class="st-row"><span>壁纸</span><input type="color" data-testid="settings-wallpaper" value="#7c5cff"></div>' +
        '<div class="st-row"><span>强调色</span><input type="color" data-testid="settings-accent" value="' + escapeHtml(sys.accent) + '"></div>' +
        '<div class="st-row"><span>界面缩放</span><input type="range" min="0.6" max="1.6" step="0.05" data-testid="settings-scale" value="' + sys.scale + '"><b data-testid="settings-scale-value">' + sys.scale + '</b></div>' +
        '<div class="st-row"><span>时间速率</span><input type="range" min="0.1" max="4" step="0.1" data-testid="settings-rate" value="' + sys.rate + '"><b>' + sys.rate + '</b></div>' +
        '<div class="st-note">壁纸选择：<button data-testid="settings-wallpaper-default">默认风景</button> <button data-testid="settings-wallpaper-alt">暮色</button></div>';
      body.querySelector('[data-testid="settings-name"]').addEventListener('change', (e) => { sys.systemName = e.target.value; });
      const wall = body.querySelector('[data-testid="settings-wallpaper"]');
      wall.addEventListener('input', () => {
        const c = document.createElement('canvas'); c.width = 64; c.height = 64;
        const g = c.getContext('2d'); g.fillStyle = wall.value; g.fillRect(0, 0, 64, 64);
        sys.wallpaper = c.toDataURL();
        const desk = self.host.desktops.get(sys.id);
        if (desk) desk.el.querySelector('.wallpaper').style.backgroundImage = 'url(' + sys.wallpaper + ')';
      });
      body.querySelector('[data-testid="settings-accent"]').addEventListener('input', (e) => {
        sys.accent = e.target.value;
        const desk = self.host.desktops.get(sys.id);
        if (desk) desk.el.style.setProperty('--accent', sys.accent);
      });
      const sc = body.querySelector('[data-testid="settings-scale"]');
      sc.addEventListener('input', () => {
        sys.scale = parseFloat(sc.value);
        body.querySelector('[data-testid="settings-scale-value"]').textContent = sys.scale;
        const desk = self.host.desktops.get(sys.id);
        if (desk) desk.el.style.zoom = String(sys.scale);
      });
      const rt = body.querySelector('[data-testid="settings-rate"]');
      rt.addEventListener('input', () => { sys.rate = parseFloat(rt.value); rt.nextElementSibling.textContent = sys.rate; });
      body.querySelector('[data-testid="settings-wallpaper-default"]').addEventListener('click', () => {
        sys.wallpaper = self.host.fixtures.wallpaper;
        const desk = self.host.desktops.get(sys.id);
        if (desk) desk.el.querySelector('.wallpaper').style.backgroundImage = 'url(' + sys.wallpaper + ')';
      });
      body.querySelector('[data-testid="settings-wallpaper-alt"]').addEventListener('click', () => {
        const c = document.createElement('canvas'); c.width = 32; c.height = 32;
        const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 32, 32);
        gr.addColorStop(0, '#3a1f5e'); gr.addColorStop(1, '#c76a4a');
        g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
        sys.wallpaper = c.toDataURL();
        const desk = self.host.desktops.get(sys.id);
        if (desk) desk.el.querySelector('.wallpaper').style.backgroundImage = 'url(' + sys.wallpaper + ')';
      });
    });
    return win;
  }

  /* ================= 浏览器 ================= */
  openBrowser(sys) {
    const self = this;
    const win = this.open('browser', '浏览器', 1000, 640, (body) => {
      body.innerHTML =
        '<div class="br-bar">' +
        '<button data-testid="browser-back">←</button><button data-testid="browser-forward">→</button>' +
        '<button data-testid="browser-reload">⟳</button><button data-testid="browser-stop">■</button>' +
        '<input data-testid="browser-address" value="https://www.bilibili.com">' +
        '<button data-testid="browser-go">前往</button><button data-testid="browser-new-tab">新标签</button></div>' +
        '<div class="br-tabs" data-testid="browser-tabs"></div>' +
        '<div class="br-view"></div>';
      const tabsEl = body.querySelector('[data-testid="browser-tabs"]');
      const viewEl = body.querySelector('.br-view');
      const addrEl = body.querySelector('[data-testid="browser-address"]');
      let tabs = [];
      let active = 0;
      const makeTab = () => {
        const tab = { id: 't' + Math.random().toString(36).slice(2, 7), url: 'about:blank', title: '新标签页', el: null, state: 'idle' };
        tabs.push(tab);
        return tab;
      };
      const drawTabs = () => {
        tabsEl.innerHTML = '';
        tabs.forEach((t, i) => {
          const el = document.createElement('div');
          el.className = 'br-tab' + (i === active ? ' active' : '');
          el.setAttribute('data-testid', 'browser-tab');
          el.setAttribute('data-tab-id', t.id);
          el.innerHTML = '<span>' + escapeHtml(t.title) + '</span><button data-testid="browser-close-tab">✕</button>';
          el.addEventListener('click', (e) => { if (e.target.tagName !== 'BUTTON') { active = i; drawTabs(); showTab(); } });
          el.querySelector('button').addEventListener('click', (e) => {
            e.stopPropagation();
            if (tabs.length > 1) {
              if (t.el) { t.el.remove(); t.el = null; }
              tabs.splice(i, 1);
              if (active >= tabs.length) active = tabs.length - 1;
              drawTabs(); showTab();
            }
          });
          tabsEl.appendChild(el);
        });
      };
      const showTab = () => {
        tabs.forEach((t, i) => {
          if (!t.el) return;
          t.el.style.display = i === active ? 'block' : 'none';
        });
        const t = tabs[active];
        if (!t) return;
        if (!t.el) {
          const wv = document.createElement('webview');
          wv.setAttribute('src', t.url === 'about:blank' ? 'about:blank' : t.url);
          wv.setAttribute('data-testid', 'browser-webview');
          wv.setAttribute('allowpopups', 'true');
          wv.addEventListener('did-navigate', (e) => { t.url = e.url; t.state = 'loading'; });
          wv.addEventListener('did-navigate-in-page', (e) => { t.url = e.url; });
          wv.addEventListener('page-title-updated', (e) => { t.title = e.title; drawTabs(); });
          wv.addEventListener('did-stop-loading', () => { t.state = 'complete'; });
          wv.addEventListener('did-fail-load', (e) => { t.state = 'error'; t.error = e.errorDescription; });
          viewEl.appendChild(wv);
          t.el = wv;
        }
        t.el.style.display = 'block';
        addrEl.value = t.url;
      };
      const nav = (url) => {
        const t = tabs[active];
        if (!t) return;
        t.url = url; t.state = 'loading';
        if (t.el) t.el.setAttribute('src', url);
        drawTabs();
      };
      body.querySelector('[data-testid="browser-go"]').addEventListener('click', () => nav(addrEl.value));
      addrEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') nav(addrEl.value); });
      body.querySelector('[data-testid="browser-new-tab"]').addEventListener('click', () => { makeTab(); active = tabs.length - 1; drawTabs(); showTab(); });
      body.querySelector('[data-testid="browser-reload"]').addEventListener('click', () => { const t = tabs[active]; if (t && t.el) { t.el.reload(); t.state = 'loading'; } });
      body.querySelector('[data-testid="browser-stop"]').addEventListener('click', () => { const t = tabs[active]; if (t && t.el) t.el.stop(); });
      body.querySelector('[data-testid="browser-back"]').addEventListener('click', () => { const t = tabs[active]; if (t && t.el) t.el.goBack(); });
      body.querySelector('[data-testid="browser-forward"]').addEventListener('click', () => { const t = tabs[active]; if (t && t.el) t.el.goForward(); });
      makeTab();
      drawTabs();
      showTab();
      win.onClose = () => {
        tabs.forEach((t) => { if (t.el) { t.el.remove(); t.el = null; } });
      };
      win.tabs = tabs;
    });
    return win;
  }

  /* ================= 系统管理 ================= */
  openSystems(sys) {
    const self = this;
    const win = this.open('systems', '系统 · ' + sys.id, 720, 520, (body) => {
      body.innerHTML = '<div class="sys-tree" data-testid="systems-tree"></div>';
      const tree = body.querySelector('[data-testid="systems-tree"]');
      const draw = () => {
        tree.innerHTML = '';
        const render = (s, depth) => {
          const row = document.createElement('div');
          row.className = 'sys-row';
          row.setAttribute('data-system-id', s.id);
          row.style.paddingLeft = (depth * 18 + 6) + 'px';
          row.innerHTML = '<span class="sname">' + s.id + '</span><span class="dim">' + (s.systemName || '') + '</span>' +
            '<span class="st st-' + s.state + '">' + s.state + '</span>' +
            '<span class="dim">时间 ' + Math.round(s.time) + 'ms · 速率 ' + s.rate + '</span>' +
            '<span class="dim">预算 ' + s.budgetUsed + '/' + s.budgetTotal + '</span>';
          const ops = document.createElement('span');
          const mk = (label, fn, tid, target) => {
            const b = document.createElement('button');
            b.textContent = label;
            if (tid) { b.setAttribute('data-testid', tid); b.setAttribute('data-target-system-id', target || s.id); }
            b.addEventListener('click', (e) => { e.stopPropagation(); fn(); draw(); });
            ops.appendChild(b);
          };
          if (depth === 0) {
            mk('新建子系统', () => { const c = self.host.createSystem(sys.id); if (c) self.host.openSystemWindow(c); }, 'system-new');
          } else {
            mk('打开', () => self.host.openSystemWindow(s));
            mk('暂停', () => { s.state = 'paused'; }, 'system-pause');
            mk('继续', () => { s.state = 'running'; }, 'system-resume');
            mk('单步', () => self.stepSystem(s));
            mk('重启', () => self.restartSystem(s));
            mk('关闭', () => self.closeSystem(s));
            mk('快照', () => self.snapshotSystem(s));
            mk('恢复', () => self.restoreSystem(s));
            mk('分叉', () => self.forkSystem(s));
            mk('内核源码', () => self.openKernel(s));
          }
          row.appendChild(ops);
          tree.appendChild(row);
          for (const c of self.rt.childrenOf(s.id)) render(c, depth + 1);
        };
        render(self.rt.root, 0);
      };
      draw();
      win.timer = setInterval(draw, 700);
      win.onClose = () => clearInterval(win.timer);
    });
    return win;
  }
  openKernel(sys) {
    const parent = this.rt.sys(sys.parentId);
    this.openEditor(parent, '/System/kernel.nsl');
  }
  stepSystem(sys) {
    // 固定一个逻辑步的单步执行
    const saved = sys.state;
    sys.state = 'running';
    this.rt.step();
    sys.state = saved === 'paused' ? 'paused' : saved;
    this.notify(sys.parentId ? this.rt.sys(sys.parentId) : sys, '单步执行', sys.id + ' 已执行一个逻辑步');
  }
  restartSystem(sys) {
    const parent = this.rt.sys(sys.parentId);
    if (!parent) return;
    for (const p of sys.processes.slice()) { p.state = 'done'; p.saved = null; }
    sys.processes = [];
    sys.windows = [];
    sys.state = 'running';
    const src = parent.fs.read('/System/kernel.nsl');
    if (!src.ok) { this.notify(parent, '内核错误', '缺少内核源文件'); return; }
    try {
      const prog = this.rt.compileWithSystem(parent, src.content);
      const kp = new NOS.Proc(sys, 'kernel', 'kernel', prog, '/System/kernel.nsl');
      parent.processes.push(kp);
      sys.kernelProc = kp;
      this.notify(parent, '子系统已重启', sys.id);
    } catch (e) {
      sys.state = 'error';
      this.notify(parent, '内核错误', e.message);
    }
  }
  closeSystem(sys) {
    for (const p of sys.processes.slice()) { p.state = 'done'; p.saved = null; }
    sys.processes = [];
    sys.state = 'stopped';
    const desk = this.host.desktops.get(sys.id);
    if (desk) {
      for (const w of desk.windows.slice()) { if (w.el) w.el.remove(); }
      desk.windows = [];
    }
    const parent = this.rt.sys(sys.parentId);
    if (parent) {
      parent.processes = parent.processes.filter((p) => p.sys !== sys);
      this.notify(parent, '子系统已关闭', sys.id);
    }
  }
  snapshotSystem(sys) {
    const snap = this.rt.snapshot(sys);
    const parent = this.rt.sys(sys.parentId);
    const p = '/Documents/snapshot-' + sys.id + '-' + Date.now() + '.snap.json';
    if (parent) {
      parent.fs.write(p, JSON.stringify(snap));
      this.notify(parent, '快照已保存', p);
    }
    return p;
  }
  restoreSystem(sys) {
    const parent = this.rt.sys(sys.parentId);
    if (!parent) return;
    const bins = parent.fs.list('/Documents');
    const snaps = (bins.ok ? bins.entries : []).filter((e) => /\.snap\.json$/.test(e.path));
    if (!snaps.length) { this.notify(parent, '恢复', '没有可用快照'); return; }
    const r = parent.fs.read(snaps[snaps.length - 1].path);
    if (!r.ok) return;
    try { this.rt.restore(sys, JSON.parse(r.content)); this.notify(parent, '已恢复快照', snaps[snaps.length - 1].path); }
    catch (e) { this.notify(parent, '恢复失败', e.message); }
  }
  forkSystem(sys) {
    const parent = this.rt.sys(sys.parentId);
    if (!parent) return;
    const snap = this.rt.snapshot(sys);
    try {
      const child = this.rt.fork(sys, snap);
      if (child) { this.host.openSystemWindow(child); this.notify(parent, '已分叉', child.id); }
    } catch (e) { this.notify(parent, '分叉失败', e.message); }
  }
}

/* ================= 电子表格模型 ================= */
class Sheet {
  constructor(host, sys) {
    this.host = host;
    this.sys = sys;
    this.cells = {};
    this.selection = 'A1';
    this.undoStack = [];
    this.redoStack = [];
    this.version = 0;
    this.dirty = false;
    this.path = '/Demo/sample.sheet';
    this.lastMessage = '';
    this.load(sys, this.path);
  }
  colName(c) {
    let s = '', n = c;
    do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return s;
  }
  addr(r, c) { return this.colName(c) + (r + 1); }
  parseAddr(a) {
    const m = /^([A-Z]+)(\d+)$/.exec(String(a).toUpperCase());
    if (!m) return null;
    let c = 0;
    for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
    return { r: parseInt(m[2], 10) - 1, c: c - 1 };
  }
  load(sys, path) {
    this.sys = sys;
    this.path = path;
    const r = sys.fs.read(path);
    this.cells = {};
    if (r.ok) {
      try {
        const doc = JSON.parse(r.content);
        for (const a of Object.keys(doc.cells || {})) this.cells[a] = { formula: doc.cells[a] };
      } catch (e) { /* 非工作簿格式则按纯文本载入 */ }
    }
    this.recalc();
    this.dirty = false;
  }
  save(sys) {
    const doc = { format: 'nsheet-1', cells: {} };
    for (const a of Object.keys(this.cells)) doc.cells[a] = this.cells[a].formula;
    const p = this.path || '/Documents/未命名.sheet';
    const r = (sys || this.sys).fs.write(p, JSON.stringify(doc, null, 1));
    if (r.ok) { this.dirty = false; this.publish(); }
    return r.ok ? { ok: true, path: p } : r;
  }
  get(r, c) {
    const a = this.addr(r, c);
    const cell = this.cells[a];
    if (!cell) return { display: '', value: null };
    if (cell.display !== undefined) return cell;
    return { display: cell.value === null || cell.value === undefined ? '' : String(cell.value), value: cell.value, formula: cell.formula, error: cell.error };
  }
  set(addr, text) {
    const t = String(text === undefined || text === null ? '' : text);
    this.undoStack.push(JSON.stringify(this.cells));
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
    if (t === '') delete this.cells[addr];
    else this.cells[addr] = { formula: t };
    this.dirty = true;
    this.recalc();
    this.publish();
  }
  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(JSON.stringify(this.cells));
    this.cells = JSON.parse(this.undoStack.pop());
    this.recalc(); this.publish();
  }
  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(JSON.stringify(this.cells));
    this.cells = JSON.parse(this.redoStack.pop());
    this.recalc(); this.publish();
  }
  /* 依赖重算：公式 -> 值 */
  recalc() {
    const resolving = new Set();
    const evalCell = (addr) => {
      const cell = this.cells[addr];
      if (!cell) return null;
      if (cell.value !== undefined && cell.formula === undefined) return cell.value;
      const f = cell.formula;
      if (f === undefined || f === null) return null;
      if (typeof f !== 'string') { cell.value = f; cell.display = String(f); return f; }
      if (f.charAt(0) !== '=') {
        const num = parseFloat(f);
        const v = isNaN(num) ? f : num;
        cell.value = v; cell.display = String(v); delete cell.error;
        return v;
      }
      if (resolving.has(addr)) { cell.error = '循环依赖'; cell.value = null; cell.display = '#循环'; return null; }
      resolving.add(addr);
      let out;
      try {
        out = this.evalFormula(f.slice(1), addr);
        cell.value = out.value;
        cell.display = out.display === undefined ? (out.value === null ? '' : String(out.value)) : out.display;
        if (out.error) { cell.error = out.error; cell.display = '#' + out.error; cell.value = null; }
        else delete cell.error;
      } catch (e) {
        cell.error = e.message; cell.display = '#' + e.message; cell.value = null;
      }
      resolving.delete(addr);
      return cell.value;
    };
    for (const addr of Object.keys(this.cells)) evalCell(addr);
  }
  evalFormula(expr, addr) {
    const sumRe = /^SUM\(([A-Z]+\d+):([A-Z]+\d+)\)$/i.exec(expr.trim());
    if (sumRe) {
      const a = this.parseAddr(sumRe[1]), b = this.parseAddr(sumRe[2]);
      if (!a || !b) return { error: '无效引用' };
      let sum = 0, n = 0;
      for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r++) {
        for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++) {
          const cell = this.cells[this.addr(r, c)];
          if (!cell) continue;
          const v = this.valueOf(this.addr(r, c));
          if (typeof v === 'number') { sum += v; n++; }
          else if (v !== null && v !== undefined && v !== '') return { error: '区域包含非数值' };
        }
      }
      return { value: sum, display: String(sum) };
    }
    // 单元格引用替换
    let e = expr.replace(/([A-Z]+\d+)/gi, (m) => {
      const p = this.parseAddr(m);
      if (!p) return '0';
      const v = this.valueOf(m);
      if (v === null || v === undefined) return '0';
      if (typeof v === 'number') return String(v);
      return '0';
    });
    e = e.replace(/\^/g, '**');
    try {
      if (!/^[0-9+\-*/().,\s%<>=!&|]+$/.test(e)) {
        if (!/^[0-9+\-*/().,\s%<>=!&|]+$/.test(e.replace(/\*\*/g, '^'))) return { error: '无效公式' };
      }
      const v = Function('"use strict";return (' + e.replace(/\*\*/g, '^') + ')')();
      if (typeof v !== 'number' || !isFinite(v)) return { error: '无效结果' };
      return { value: v, display: String(Math.round(v * 1e10) / 1e10) };
    } catch (e) {
      return { error: '公式错误' };
    }
  }
  valueOf(addr) {
    const cell = this.cells[addr];
    if (!cell) return null;
    if (cell.formula !== undefined && cell.value === undefined) return null;
    return cell.value;
  }
  /* 发布：把当前选区/整表版本通知给订阅者 */
  publish() {
    this.version++;
    const payload = this.snapshot();
    if (this.host && this.host.sheetBus) this.host.sheetBus(this.version, payload);
  }
  snapshot() {
    const cells = {};
    for (const a of Object.keys(this.cells)) {
      const c = this.cells[a];
      cells[a] = { v: c.value === undefined ? null : c.value, f: c.formula === undefined ? null : c.formula };
    }
    return { version: this.version, cells };
  }
  rangeValues(range) {
    const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i.exec(String(range || '').trim());
    if (!m) return null;
    const a = this.parseAddr(m[1] + m[2]);
    const b = m[3] ? this.parseAddr(m[3] + m[4]) : a;
    if (!a || !b) return null;
    const out = [];
    for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r++) {
      const row = [];
      for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++) {
        row.push(this.valueOf(this.addr(r, c)));
      }
      out.push(row);
    }
    return out;
  }
}

NOS.RootApps = RootApps;
NOS.Sheet = Sheet;
