// ===========================================================================
//  hub.js —— 跨层服务：窗口投送、实时数据连接、图表数据发布
// ===========================================================================
(function () {
  const U = window.U, I = window.Icons;

  // =========================================================================
  //  实时数据连接（根系统电子表格 → 子系统图表工作台）
  // =========================================================================
  const ChartHub = {
    docs: {},          // path -> SheetDoc
    subs: [],          // {instId, pid, path, range, labelCol, series, key}
    version: 0,
    registerDoc(path, doc) { this.docs[path] = doc; },
    openDocs() { return Object.keys(this.docs); },
    docByName(name) {
      for (const p in this.docs) if (p === name || p.endsWith('/' + name)) return { path: p, doc: this.docs[p] };
      return null;
    },
    ensureSample() {
      if (this.openDocs().length) return;
      const fs = window.Store.fs;
      for (const p of ['/Demo/sample.sheet', '/Demo/示例工作簿.sheet']) {
        const n = fs[p];
        if (n) { this.docs[p] = window.SheetDoc.load(n.d); return; }
      }
    },
    parseRange(r) {
      const m = /^([A-Z]+\d+):([A-Z]+\d+)$/.exec(String(r).trim().toUpperCase());
      if (!m) return null;
      const A = window.sheetEngine.parseAddr(m[1]), B = window.sheetEngine.parseAddr(m[2]);
      return { c1: Math.min(A.c, B.c), c2: Math.max(A.c, B.c), r1: Math.min(A.r, B.r), r2: Math.max(A.r, B.r) };
    },
    compute(sub) {
      const d = this.docByName(sub.path);
      if (!d) return null;
      const rg = this.parseRange(sub.range);
      if (!rg) return null;
      const labels = [], series = [];
      const labelC = window.sheetEngine.colIndex(sub.labelCol);
      const seriesCols = sub.series.split(',').map((s) => window.sheetEngine.colIndex(s.trim())).filter((x) => x > 0);
      for (let r = rg.r1 + 1; r <= rg.r2; r++) labels.push(String(d.doc.value(window.sheetEngine.addr(labelC, r))));
      for (const sc of seriesCols) {
        const arr = [];
        for (let r = rg.r1 + 1; r <= rg.r2; r++) { const v = d.doc.value(window.sheetEngine.addr(sc, r)); arr.push(typeof v === 'number' ? v : 0); }
        series.push(arr);
      }
      return { type: 'chart_data', labels, series, version: ++this.version, sourceTitle: d.path.split('/').pop(), range: sub.range };
    },
    publish(path, doc) {
      if (path) this.docs[path] = doc;
      for (const sub of this.subs) {
        if (path && sub.path !== path && !sub.path.endsWith('/' + path.split('/').pop())) continue;
        const inst = window.NSL_RUNTIME.getInstance(sub.instId);
        if (!inst) continue;
        const data = this.compute(sub);
        if (data) inst.pendingChart.push(data);
      }
    },
    connect(inst, args) {
      this.ensureSample();
      const name = args.workbook || 'sample.sheet';
      const d = this.docByName(name);
      if (!d) return { ok: false, error: '工作簿未打开：' + name };
      const key = inst.id + '|' + name + '|' + args.range;
      this.subs = this.subs.filter((s) => s.key !== key);
      const sub = { instId: inst.id, pid: args.pid || 0, path: d.path, range: args.range || 'A1:D4', labelCol: args.labelCol || 'A', series: args.series || 'D', key };
      this.subs.push(sub);
      const data = this.compute(sub);
      if (data) inst.pendingChart.push(data);
      return { ok: true, version: this.version, source: d.path };
    },
    disconnect(inst) { this.subs = this.subs.filter((s) => s.instId !== inst.id); return { ok: true }; },
    closeDoc(path) {
      for (const sub of this.subs) {
        if (sub.path === path) {
          const inst = window.NSL_RUNTIME.getInstance(sub.instId);
          if (inst) inst.pendingChart.push({ type: 'closed' });
        }
      }
      delete this.docs[path];
    }
  };

  // =========================================================================
  //  跨层窗口投送
  // =========================================================================
  const ProjectionHub = {
    list: [],
    create(sourceInst, args) {
      const desk = window.DESKTOP;
      const source = args.source || 'player';
      // 每个源窗口至多一个投送窗口
      const exist = this.list.find((p) => p.instId === sourceInst.id && p.source === source);
      if (exist && exist.win && desk.win.get(exist.win.id)) { desk.win.focus(exist.win.id); return { ok: true, target: 'outer' }; }
      const w = desk.win.create({ appId: 'projection', title: (sourceInst.name || '') + ' · ' + (source === 'player' ? '场景播放器' : '图表工作台') + '（投送）', width: source === 'player' ? 900 : 760, height: source === 'player' ? 620 : 520 });
      w.el.dataset.sourceSystemId = sourceInst.id;
      w.el.dataset.sourceWindowId = args.windowId || '';
      w.el.dataset.sourceAppId = source;
      const bar = U.el('div', { class: 'sys-toolbar' });
      bar.appendChild(U.el('span', { class: 'sys-badge', text: '投送 · 来源 ' + (sourceInst.name || sourceInst.id) }));
      const src = U.el('span', { class: 'sys-badge', text: source === 'player' ? '场景播放器' : '图表工作台' });
      bar.appendChild(src);
      const close = U.el('button', { class: 'btn sm', text: '取消投送' });
      close.addEventListener('click', () => { desk.win.close(w.id); });
      bar.appendChild(close);
      const wrap = U.el('div', { class: 'sys-canvas-wrap' });
      const cv = document.createElement('canvas');
      wrap.appendChild(cv);
      w.canvas = cv;
      w.projection = { instId: sourceInst.id, source, buf: args.buf || 'main', title: args.title || '' };
      w.body.append(bar, wrap);
      w.onResize = () => desk.paintProjection(w);
      // 输入转发到源系统
      wrap.addEventListener('mousedown', (e) => forward(e, 'down'));
      wrap.addEventListener('mousemove', (e) => forward(e, 'move'));
      wrap.addEventListener('mouseup', (e) => forward(e, 'up'));
      wrap.addEventListener('wheel', (e) => { e.preventDefault(); forward(e, 'wheel'); }, { passive: false });
      wrap.addEventListener('dblclick', (e) => forward(e, 'dblclick'));
      wrap.tabIndex = 0;
      wrap.addEventListener('keydown', (e) => {
        const inst = window.NSL_RUNTIME.getInstance(sourceInst.id);
        if (!inst || inst.paused) return;
        inst.input.push({ kind: 'key', key: e.key, shift: e.shiftKey, ctrl: e.ctrlKey });
      });
      const rec = { instId: sourceInst.id, source, win: w };
      this.list.push(rec);
      desk.win.focus(w.id);
      return { ok: true, target: 'outer', windowId: w.id };
    },
    removeBySource(instId) {
      this.list = this.list.filter((p) => {
        if (p.instId !== instId) return true;
        if (p.win && window.DESKTOP.win.get(p.win.id)) window.DESKTOP.win.close(p.win.id);
        return false;
      });
    }
  };

  function forward(e, kind) {
    const w = e.target.closest('.app-window');
    if (!w) return;
    const pid = w.dataset.windowId;
    const win = window.DESKTOP.win.get(pid);
    if (!win || !win.projection) return;
    const inst = window.NSL_RUNTIME.getInstance(win.projection.instId);
    if (!inst) return;
    if (inst.paused || inst.state === 'error') { window.DESKTOP.toast('源系统已暂停，投送内容冻结', 'err'); return; }
    const wrap = e.target.closest('.sys-canvas-wrap');
    const r = wrap.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const rect = findAppRect(inst, win.projection.buf);
    if (!rect) return;
    // 反算到源应用坐标
    const b = inst.display.buffers[Object.keys(inst.display.buffers).find((k) => k.endsWith(':' + win.projection.buf))];
    const sw = (b && b.w) || rect.w, sh = (b && b.h) || rect.h;
    const scale = Math.min(r.width / sw, r.height / sh);
    const ox = (r.width - sw * scale) / 2, oy = (r.height - sh * scale) / 2;
    const ax = (x - ox) / scale, ay = (y - oy) / scale;
    if (ax < 0 || ay < 0 || ax > sw || ay > sh) return;
    const dx = rect.x + ax * (rect.w / sw), dy = rect.y + ay * (rect.h / sh);
    const ev = { kind, x: dx, y: dy };
    if (kind === 'wheel') ev.dy = e.deltaY;
    if (kind === 'dblclick') ev.kind = 'dblclick';
    inst.input.push(ev);
  }
  function findAppRect(inst, bufName) {
    const desk = inst.display.buffers[Object.keys(inst.display.buffers).find((k) => k.endsWith(':desktop'))];
    if (!desk || !desk.list) return null;
    for (const op of desk.list) {
      if (op.op === 'blit' && String(op.buf).endsWith(':' + bufName)) return { x: op.x, y: op.y, w: op.w, h: op.h };
    }
    return null;
  }

  window.ChartHub = ChartHub;
  window.ProjectionHub = ProjectionHub;
  window.findAppRect = findAppRect;
})();
