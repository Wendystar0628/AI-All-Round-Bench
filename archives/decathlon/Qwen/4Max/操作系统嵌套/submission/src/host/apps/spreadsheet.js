'use strict';
// 根系统电子表格：公式、依赖重算、撤销重做、保存、实时发布。
const { el, iconEl } = require('../desktop.js');

const COLS = 26, ROWS = 60;
function colName(i) { return String.fromCharCode(65 + i); }
function addr(c, r) { return colName(c) + (r + 1); }
function parseAddr(a) {
  const m = /^([A-Z]+)([0-9]+)$/.exec(a);
  if (!m) return null;
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { c: c - 1, r: parseInt(m[2], 10) - 1 };
}
function parseRange(rg) {
  const parts = rg.split(':');
  const a = parseAddr(parts[0].trim().toUpperCase());
  const b = parts[1] ? parseAddr(parts[1].trim().toUpperCase()) : a;
  if (!a || !b) return null;
  return { c1: Math.min(a.c, b.c), r1: Math.min(a.r, b.r), c2: Math.max(a.c, b.c), r2: Math.max(a.r, b.r) };
}

// ---------- 公式引擎 ----------
function tokenizeFormula(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++;
      toks.push({ t: 'num', v: parseFloat(src.slice(i, j)) }); i = j; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i; while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      const w = src.slice(i, j).toUpperCase();
      const am = /^([A-Z]+)([0-9]+)$/.exec(w);
      if (am && src[j] === ':') {
        let k = j + 1; while (k < src.length && /[A-Za-z0-9]/.test(src[k])) k++;
        toks.push({ t: 'range', v: w + ':' + src.slice(j + 1, k).toUpperCase() }); i = k; continue;
      }
      if (am) { toks.push({ t: 'cell', v: w }); i = j; continue; }
      toks.push({ t: 'fn', v: w }); i = j; continue;
    }
    if ('+-*/(),'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    throw new Error('#NAME?');
  }
  return toks;
}
function parseFormula(src) {
  const toks = tokenizeFormula(src);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  function expr() {
    let left = term();
    while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = next().v;
      left = { type: 'bin', op, left, right: term() };
    }
    return left;
  }
  function term() {
    let left = factor();
    while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) {
      const op = next().v;
      left = { type: 'bin', op, left, right: factor() };
    }
    return left;
  }
  function factor() {
    const k = peek();
    if (!k) throw new Error('#NAME?');
    if (k.t === 'op' && k.v === '-') { next(); return { type: 'neg', arg: factor() }; }
    if (k.t === 'op' && k.v === '(') { next(); const e = expr(); if (!peek() || peek().v !== ')') throw new Error('#NAME?'); next(); return e; }
    if (k.t === 'num') { next(); return { type: 'num', v: k.v }; }
    if (k.t === 'cell') { next(); return { type: 'cell', v: k.v }; }
    if (k.t === 'range') { next(); return { type: 'range', v: k.v }; }
    if (k.t === 'fn') {
      next();
      if (!peek() || peek().v !== '(') throw new Error('#NAME?');
      next();
      const args = [];
      if (peek() && peek().v !== ')') {
        args.push(expr());
        while (peek() && peek().v === ',') { next(); args.push(expr()); }
      }
      if (!peek() || peek().v !== ')') throw new Error('#NAME?');
      next();
      return { type: 'call', name: k.v, args };
    }
    throw new Error('#NAME?');
  }
  const ast = expr();
  if (p < toks.length) throw new Error('#NAME?');
  return ast;
}
function collectRefs(ast, out) {
  if (!ast) return;
  if (ast.type === 'cell') out.cells.add(ast.v);
  else if (ast.type === 'range') {
    const rg = parseRange(ast.v);
    if (rg) for (let r = rg.r1; r <= rg.r2; r++) for (let c = rg.c1; c <= rg.c2; c++) out.cells.add(addr(c, r));
  } else if (ast.type === 'bin') { collectRefs(ast.left, out); collectRefs(ast.right, out); }
  else if (ast.type === 'neg') collectRefs(ast.arg, out);
  else if (ast.type === 'call') for (const a of ast.args) collectRefs(a, out);
}

class Workbook {
  constructor(id, path, title, data) {
    this.id = id; this.path = path; this.title = title;
    this.cells = (data && data.cells) || {};
    this.computed = {};
    this.errors = {};
    this.dirty = false;
    this.undoStack = [];
    this.redoStack = [];
    this.recalc();
  }
  snapshot() { return JSON.stringify(this.cells); }
  pushUndo() { this.undoStack.push(this.snapshot()); if (this.undoStack.length > 60) this.undoStack.shift(); this.redoStack = []; }
  undo() { if (!this.undoStack.length) return false; this.redoStack.push(this.snapshot()); this.cells = JSON.parse(this.undoStack.pop()); this.recalc(); this.dirty = true; return true; }
  redo() { if (!this.redoStack.length) return false; this.undoStack.push(this.snapshot()); this.cells = JSON.parse(this.redoStack.pop()); this.recalc(); this.dirty = true; return true; }
  recalc() {
    this.computed = {}; this.errors = {};
    const deps = {};
    const formulas = {};
    for (const a of Object.keys(this.cells)) {
      const cell = this.cells[a];
      if (cell.f) {
        try {
          const ast = parseFormula(cell.f.slice(1));
          formulas[a] = ast;
          const refs = { cells: new Set() };
          collectRefs(ast, refs);
          deps[a] = refs.cells;
        } catch (e) { this.errors[a] = '#NAME?'; this.computed[a] = '#NAME?'; }
      }
    }
    // 拓扑排序（Kahn），检测循环
    const indeg = {};
    const dependents = {};
    const nodes = Object.keys(formulas);
    for (const a of nodes) {
      indeg[a] = 0;
      for (const ref of deps[a]) {
        if (formulas[ref]) {
          indeg[a]++;
          (dependents[ref] = dependents[ref] || []).push(a);
        }
      }
    }
    const queue = nodes.filter(a => indeg[a] === 0);
    const order = [];
    while (queue.length) {
      const a = queue.shift();
      order.push(a);
      for (const d of dependents[a] || []) { if (--indeg[d] === 0) queue.push(d); }
    }
    for (const a of nodes) if (!order.includes(a)) { this.errors[a] = '#CYCLE!'; this.computed[a] = '#CYCLE!'; }
    const getVal = (a) => {
      if (this.errors[a]) return this.errors[a];
      if (a in this.computed) return this.computed[a];
      const cell = this.cells[a];
      if (!cell) return 0;
      if (cell.f) return this.errors[a] || 0;
      return typeof cell.v === 'number' ? cell.v : (parseFloat(cell.v) || (cell.v === undefined ? 0 : cell.v));
    };
    const evalAst = (ast) => {
      switch (ast.type) {
        case 'num': return ast.v;
        case 'cell': {
          const p = parseAddr(ast.v);
          if (!p || p.c >= COLS || p.r >= ROWS) return '#REF!';
          const v = getVal(ast.v);
          return v;
        }
        case 'range': {
          const rg = parseRange(ast.v);
          if (!rg) return '#REF!';
          const arr = [];
          for (let r = rg.r1; r <= rg.r2; r++) for (let c = rg.c1; c <= rg.c2; c++) {
            if (c >= COLS || r >= ROWS) return '#REF!';
            arr.push(getVal(addr(c, r)));
          }
          return arr;
        }
        case 'neg': { const v = evalAst(ast.arg); return typeof v === 'number' ? -v : '#VALUE!'; }
        case 'bin': {
          const l = evalAst(ast.left), r = evalAst(ast.right);
          if (typeof l === 'string' && l.startsWith('#')) return l;
          if (typeof r === 'string' && r.startsWith('#')) return r;
          const ln = typeof l === 'number' ? l : parseFloat(l) || 0;
          const rn = typeof r === 'number' ? r : parseFloat(r) || 0;
          switch (ast.op) {
            case '+': return ln + rn;
            case '-': return ln - rn;
            case '*': return ln * rn;
            case '/': if (rn === 0) return '#DIV/0!'; return ln / rn;
          }
          return '#VALUE!';
        }
        case 'call': {
          if (ast.name === 'SUM') {
            let total = 0;
            for (const arg of ast.args) {
              const v = evalAst(arg);
              if (typeof v === 'string' && v.startsWith('#')) return v;
              if (Array.isArray(v)) { for (const x of v) { if (typeof x === 'string' && x.startsWith('#')) return x; total += typeof x === 'number' ? x : parseFloat(x) || 0; } }
              else total += typeof v === 'number' ? v : parseFloat(v) || 0;
            }
            return total;
          }
          if (ast.name === 'AVG' || ast.name === 'AVERAGE') {
            let total = 0, n = 0;
            for (const arg of ast.args) {
              const v = evalAst(arg);
              const xs = Array.isArray(v) ? v : [v];
              for (const x of xs) { if (typeof x === 'string' && x.startsWith('#')) return x; total += typeof x === 'number' ? x : parseFloat(x) || 0; n++; }
            }
            return n ? total / n : '#DIV/0!';
          }
          if (ast.name === 'MIN' || ast.name === 'MAX') {
            let vals = [];
            for (const arg of ast.args) { const v = evalAst(arg); vals = vals.concat(Array.isArray(v) ? v : [v]); }
            const nums = vals.filter(x => typeof x === 'number');
            if (!nums.length) return 0;
            return ast.name === 'MIN' ? Math.min(...nums) : Math.max(...nums);
          }
          return '#NAME?';
        }
      }
      return '#VALUE!';
    };
    for (const a of order) {
      try {
        const v = evalAst(formulas[a]);
        if (typeof v === 'string' && v.startsWith('#')) { this.errors[a] = v; this.computed[a] = v; }
        else this.computed[a] = v;
      } catch (e) { this.errors[a] = '#ERROR!'; this.computed[a] = '#ERROR!'; }
    }
    // 非公式单元格
    for (const a of Object.keys(this.cells)) {
      if (!this.cells[a].f && !(a in this.computed)) {
        const v = this.cells[a].v;
        this.computed[a] = v === undefined ? '' : v;
      }
    }
  }
  display(a) {
    const v = this.computed[a];
    if (v === undefined || v === '') return '';
    if (typeof v === 'number') return Math.round(v * 100000) / 100000;
    return v;
  }
  setCell(a, raw) {
    this.pushUndo();
    if (raw === '') delete this.cells[a];
    else if (raw.startsWith('=')) this.cells[a] = { f: raw };
    else {
      const n = parseFloat(raw);
      this.cells[a] = { v: (raw.trim() !== '' && !isNaN(n) && /^-?[0-9.]+$/.test(raw.trim())) ? n : raw };
    }
    this.recalc();
    this.dirty = true;
  }
  extractRange(rangeStr, labelCol, seriesCols) {
    const rg = parseRange(rangeStr);
    if (!rg) return null;
    const lc = parseAddr(labelCol + '1');
    const labels = [];
    const rows = [];
    for (let r = rg.r1; r <= rg.r2; r++) rows.push(r);
    // 首行若为文本表头则作为列名
    let headerRow = null;
    const firstRowVals = [];
    for (let c = rg.c1; c <= rg.c2; c++) firstRowVals.push(this.computed[addr(c, rg.r1)]);
    const allText = firstRowVals.every(v => typeof v === 'string' && v !== '' && isNaN(parseFloat(v)));
    if (allText && rows.length > 1) headerRow = rg.r1;
    const dataRows = rows.filter(r => r !== headerRow);
    for (const r of dataRows) {
      const la = lc ? addr(lc.c, r) : addr(rg.c1, r);
      labels.push(String(this.computed[la] === undefined ? '' : this.computed[la]));
    }
    const series = [];
    for (const colLetter of seriesCols) {
      const cp = parseAddr(colLetter.trim().toUpperCase() + '1');
      if (!cp) continue;
      const name = headerRow !== null ? String(this.computed[addr(cp.c, headerRow)] || colLetter) : colLetter;
      const values = dataRows.map(r => {
        const v = this.computed[addr(cp.c, r)];
        return typeof v === 'number' ? v : (parseFloat(v) || 0);
      });
      series.push({ col: colLetter.trim().toUpperCase(), name, values });
    }
    return { labels, series, headerRow: headerRow !== null };
  }
}

class SpreadsheetApp {
  constructor(os) {
    this.os = os;
    this.workbooks = new Map();
    this.wbCounter = 0;
    this.windows = new Map(); // wbId -> win
    this.sel = { c: 0, r: 0 };
    this.range = null;
    this.editing = null;
    os.sheetService = {
      list: () => ({ ok: true, workbooks: Array.from(this.workbooks.values()).map(w => ({ id: w.id, title: w.title, path: w.path })) }),
      subscribe: (args, target) => {
        const wb = this.workbooks.get(args.workbookId);
        if (!wb) return { ok: false, error: '工作簿未打开' };
        const data = wb.extractRange(args.range, args.labelCol, args.seriesCols);
        if (!data) return { ok: false, error: '区域格式错误' };
        return { ok: true, data };
      }
    };
  }
  publish(wb) {
    this.os.publishSheet(wb.id, s => wb.extractRange(s.range, s.labelCol, s.seriesCols));
  }
  newWorkbook() {
    const id = 'wb' + (++this.wbCounter);
    const wb = new Workbook(id, '', '工作簿 ' + this.wbCounter, { cells: {} });
    this.workbooks.set(id, wb);
    this.openWindow(wb);
    return wb;
  }
  openFile(path) {
    for (const wb of this.workbooks.values()) if (wb.path === path) { this.focusWb(wb); return; }
    const f = this.os.rootFS[path];
    if (!f) { this.os.notifyRoot('打开失败', '文件不存在: ' + path); return; }
    let data;
    try { data = JSON.parse(f.content); } catch (e) { this.os.notifyRoot('打开失败', '工作簿格式错误'); return; }
    const id = 'wb' + (++this.wbCounter);
    const wb = new Workbook(id, path, data.title || this.os.baseName(path), data);
    this.workbooks.set(id, wb);
    this.openWindow(wb);
  }
  focusWb(wb) {
    const w = this.windows.get(wb.id);
    if (w) this.os.desktop.focusWin(w.id);
  }
  save(wb) {
    if (!wb.path) {
      wb.path = '/Documents/' + wb.title + '.sheet';
    }
    const data = { format: 'nestedos-sheet', version: 1, title: wb.title, cells: wb.cells };
    this.os.rootFS[wb.path] = { dir: false, content: JSON.stringify(data) };
    this.os.onRootFSChanged();
    wb.dirty = false;
    this.os.notifyRoot('文件操作', '已保存 ' + wb.path);
    this.renderAll(wb);
  }
  openWindow(wb) {
    const desktop = this.os.desktop;
    const w = desktop.createWindow({ appId: 'spreadsheet', title: wb.title + (wb.dirty ? ' ●' : ''), w: 720, h: 500, onClose: () => this.tryClose(wb) });
    this.windows.set(wb.id, w);
    const body = el('div', 'app-body');
    const toolbar = el('div', 'app-toolbar');
    const mkBtn = (label, testid, fn, primary) => {
      const b = el('button', 'btn small' + (primary ? ' primary' : ''));
      b.textContent = label;
      if (testid) b.dataset.testid = testid;
      b.onclick = fn;
      toolbar.appendChild(b);
      return b;
    };
    mkBtn('新建', null, () => this.newWorkbook());
    mkBtn('打开', null, () => this.openDialog());
    mkBtn('保存', 'sheet-save', () => this.save(wb), true);
    mkBtn('撤销', null, () => { if (wb.undo()) { this.publish(wb); this.renderAll(wb); } });
    mkBtn('重做', null, () => { if (wb.redo()) { this.publish(wb); this.renderAll(wb); } });
    const fname = el('span', 'lbl');
    fname.dataset.testid = 'sheet-filename';
    fname.style.marginLeft = 'auto';
    fname.textContent = wb.path || '未保存';
    toolbar.appendChild(fname);
    const wrap = el('div', 'sheet-wrap');
    const fbar = el('div', 'sheet-formulabar');
    const cellref = el('input', 'field cellref');
    cellref.readOnly = true;
    const fxLabel = el('span', 'lbl'); fxLabel.textContent = 'fx';
    const fx = el('input', 'field fx');
    fx.dataset.testid = 'sheet-formula';
    fbar.append(cellref, fxLabel, fx);
    const gridwrap = el('div', 'sheet-gridwrap');
    gridwrap.dataset.testid = 'sheet-grid';
    const status = el('div', 'sheet-status');
    wrap.append(fbar, gridwrap, status);
    body.append(toolbar, wrap);
    w.contentEl.appendChild(body);
    w._wb = { wb, gridwrap, cellref, fx, status, fname };
    this.buildGrid(wb);
    fx.addEventListener('keydown', e => {
      if (e.key === 'Enter') { this.commitEdit(wb, fx.value); e.preventDefault(); }
      e.stopPropagation();
    });
    this.renderAll(wb);
    w.onClose = () => this.tryClose(wb);
    // 重写关闭逻辑
    const origClose = w.el.querySelector('[data-testid="window-close"]');
    origClose.onclick = e => { e.stopPropagation(); this.tryClose(wb); };
  }
  tryClose(wb) {
    const w = this.windows.get(wb.id);
    const doClose = () => {
      this.os.closeWorkbookSubscriptions(wb.id);
      this.workbooks.delete(wb.id);
      this.windows.delete(wb.id);
      if (w) this.os.desktop.removeWin(w);
    };
    if (wb.dirty) {
      const mask = el('div', 'dialog-mask');
      const dlg = el('div', 'dialog');
      dlg.innerHTML = '<h3>未保存的修改</h3><p>“' + wb.title + '”有未保存的修改。保存后关闭？</p>';
      const btns = el('div', 'dlg-btns');
      const cancel = el('button', 'btn'); cancel.textContent = '取消';
      const discard = el('button', 'btn'); discard.textContent = '放弃';
      const save = el('button', 'btn primary'); save.textContent = '保存';
      cancel.onclick = () => mask.remove();
      discard.onclick = () => { mask.remove(); doClose(); };
      save.onclick = () => { this.save(wb); mask.remove(); doClose(); };
      btns.append(cancel, discard, save);
      dlg.appendChild(btns);
      mask.appendChild(dlg);
      this.os.desktop.overlaysEl.appendChild(mask);
    } else doClose();
  }
  openDialog() {
    const mask = el('div', 'dialog-mask');
    const dlg = el('div', 'dialog');
    dlg.innerHTML = '<h3>打开工作簿</h3>';
    const list = el('div');
    list.style.cssText = 'max-height:240px;overflow:auto;margin-bottom:14px;';
    const sheets = Object.keys(this.os.rootFS).filter(p => p.endsWith('.sheet'));
    if (!sheets.length) list.innerHTML = '<p>文件系统中没有 .sheet 文件</p>';
    for (const p of sheets) {
      const b = el('button', 'ctx-item');
      b.textContent = p;
      b.onclick = () => { mask.remove(); this.openFile(p); };
      list.appendChild(b);
    }
    const btns = el('div', 'dlg-btns');
    const cancel = el('button', 'btn'); cancel.textContent = '取消';
    cancel.onclick = () => mask.remove();
    btns.appendChild(cancel);
    dlg.append(list, btns);
    mask.appendChild(dlg);
    this.os.desktop.overlaysEl.appendChild(mask);
  }
  buildGrid(wb) {
    const { gridwrap } = this.windows.get(wb.id)._wb;
    gridwrap.innerHTML = '';
    const table = el('table', 'sheet-grid');
    const thead = el('thead');
    const hr = el('tr');
    hr.appendChild(el('th', 'corner'));
    for (let c = 0; c < COLS; c++) {
      const th = el('th', 'colhead');
      th.textContent = colName(c);
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = el('tbody');
    for (let r = 0; r < ROWS; r++) {
      const tr = el('tr');
      const rh = el('th', 'rowhead');
      rh.textContent = r + 1;
      tr.appendChild(rh);
      for (let c = 0; c < COLS; c++) {
        const td = el('td');
        const a = addr(c, r);
        td.dataset.testid = 'sheet-cell';
        td.dataset.cellAddress = a;
        const cv = el('div', 'cv');
        td.appendChild(cv);
        td.addEventListener('pointerdown', e => {
          e.preventDefault();
          if (this.editing) this.commitEdit(wb, this.editing.input.value);
          if (e.shiftKey) { this.range = { c1: Math.min(this.sel.c, c), r1: Math.min(this.sel.r, r), c2: Math.max(this.sel.c, c), r2: Math.max(this.sel.r, r) }; }
          else { this.sel = { c, r }; this.range = null; this._dragAnchor = { c, r }; }
          this.renderAll(wb);
          const move = ev => {
            const t = document.elementFromPoint(ev.clientX, ev.clientY);
            const cell = t && t.closest ? t.closest('td[data-cell-address]') : null;
            if (cell) {
              const p = parseAddr(cell.dataset.cellAddress);
              this.range = { c1: Math.min(this._dragAnchor.c, p.c), r1: Math.min(this._dragAnchor.r, p.r), c2: Math.max(this._dragAnchor.c, p.c), r2: Math.max(this._dragAnchor.r, p.r) };
              this.renderAll(wb);
            }
          };
          const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        });
        td.addEventListener('dblclick', () => this.startEdit(wb, c, r));
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    gridwrap.appendChild(table);
    gridwrap.addEventListener('keydown', e => this.onKey(wb, e));
    gridwrap.tabIndex = 0;
  }
  startEdit(wb, c, r, initial) {
    const a = addr(c, r);
    const { gridwrap } = this.windows.get(wb.id)._wb;
    const td = gridwrap.querySelector('td[data-cell-address="' + a + '"]');
    if (!td) return;
    this.sel = { c, r };
    td.classList.add('editing');
    td.innerHTML = '';
    const inp = el('input', 'celledit');
    const cell = wb.cells[a];
    inp.value = initial !== undefined ? initial : (cell ? (cell.f || String(cell.v === undefined ? '' : cell.v)) : '');
    td.appendChild(inp);
    inp.focus();
    inp.setSelectionRange(inp.value.length, inp.value.length);
    this.editing = { a, input: inp, td };
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { this.commitEdit(wb, inp.value); this.moveSel(wb, 0, 1); }
      else if (e.key === 'Escape') { this.cancelEdit(wb); }
      else if (e.key === 'Tab') { this.commitEdit(wb, inp.value); this.moveSel(wb, 1, 0); e.preventDefault(); }
    });
    inp.addEventListener('blur', () => { if (this.editing && this.editing.input === inp) this.commitEdit(wb, inp.value); });
    this.renderFormulaBar(wb);
  }
  commitEdit(wb, value) {
    if (!this.editing) return;
    const { a, td } = this.editing;
    this.editing = null;
    wb.setCell(a, value);
    td.classList.remove('editing');
    td.innerHTML = '<div class="cv"></div>';
    this.publish(wb);
    this.renderAll(wb);
  }
  cancelEdit(wb) {
    if (!this.editing) return;
    const { td } = this.editing;
    this.editing = null;
    td.classList.remove('editing');
    td.innerHTML = '<div class="cv"></div>';
    this.renderAll(wb);
  }
  moveSel(wb, dc, dr) {
    this.sel = { c: Math.max(0, Math.min(COLS - 1, this.sel.c + dc)), r: Math.max(0, Math.min(ROWS - 1, this.sel.r + dr)) };
    this.range = null;
    this.renderAll(wb);
  }
  onKey(wb, e) {
    if (this.editing) return;
    const k = e.key;
    if (e.ctrl && k === 'c') { this.copySel(wb); e.preventDefault(); return; }
    if (e.ctrl && k === 'v') { this.paste(wb); e.preventDefault(); return; }
    if (e.ctrl && k === 'z') { if (wb.undo()) { this.publish(wb); this.renderAll(wb); } e.preventDefault(); return; }
    if (e.ctrl && k === 'y') { if (wb.redo()) { this.publish(wb); this.renderAll(wb); } e.preventDefault(); return; }
    if (e.ctrl && k === 's') { this.save(wb); e.preventDefault(); return; }
    if (k === 'ArrowLeft') { this.moveSel(wb, -1, 0); e.preventDefault(); return; }
    if (k === 'ArrowRight') { this.moveSel(wb, 1, 0); e.preventDefault(); return; }
    if (k === 'ArrowUp') { this.moveSel(wb, 0, -1); e.preventDefault(); return; }
    if (k === 'ArrowDown') { this.moveSel(wb, 0, 1); e.preventDefault(); return; }
    if (k === 'Enter') { this.startEdit(wb, this.sel.c, this.sel.r); e.preventDefault(); return; }
    if (k === 'Delete' || k === 'Backspace') {
      const targets = this.range ? this.rangeCells() : [addr(this.sel.c, this.sel.r)];
      wb.pushUndo();
      for (const a of targets) delete wb.cells[a];
      wb.recalc(); wb.dirty = true;
      this.publish(wb); this.renderAll(wb);
      e.preventDefault(); return;
    }
    if (k.length === 1 && !e.ctrl && !e.alt && !e.meta) {
      this.startEdit(wb, this.sel.c, this.sel.r, k);
      e.preventDefault();
    }
  }
  rangeCells() {
    const out = [];
    if (!this.range) return out;
    for (let r = this.range.r1; r <= this.range.r2; r++) for (let c = this.range.c1; c <= this.range.c2; c++) out.push(addr(c, r));
    return out;
  }
  copySel(wb) {
    const cells = this.range ? this.rangeCells() : [addr(this.sel.c, this.sel.r)];
    const data = {};
    const lines = [];
    const byRow = {};
    for (const a of cells) {
      const cell = wb.cells[a];
      data[a] = cell ? Object.assign({}, cell) : null;
      const p = parseAddr(a);
      (byRow[p.r] = byRow[p.r] || []).push({ c: p.c, v: wb.display(a) });
    }
    for (const r of Object.keys(byRow).sort((a, b) => a - b)) {
      lines.push(byRow[r].sort((a, b) => a.c - b.c).map(x => x.v).join('\t'));
    }
    this._clip = { data, anchor: this.range ? { c: this.range.c1, r: this.range.r1 } : this.sel };
    const text = lines.join('\n');
    this.os.clipboardText = text;
    this.os.clipboardHistory.unshift({ text, time: Date.now(), kind: '表格选区' });
    if (this.os.clipboardHistory.length > 30) this.os.clipboardHistory.pop();
    try { navigator.clipboard.writeText(text); } catch (e) { }
    this.os.notifyRoot('剪贴板', '已复制 ' + cells.length + ' 个单元格');
  }
  paste(wb) {
    let clip = this._clip;
    if (!clip && this.os.clipboardText) {
      const lines = this.os.clipboardText.split('\n');
      const data = {};
      lines.forEach((line, r) => line.split('\t').forEach((v, c) => { data[addr(this.sel.c + c, this.sel.r + r)] = { v: isNaN(parseFloat(v)) || v.trim() === '' ? v : parseFloat(v) }; }));
      clip = { data, anchor: this.sel };
    }
    if (!clip) return;
    wb.pushUndo();
    const dc = this.sel.c - clip.anchor.c, dr = this.sel.r - clip.anchor.r;
    for (const a of Object.keys(clip.data)) {
      const p = parseAddr(a);
      const nc = p.c + dc, nr = p.r + dr;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      const na = addr(nc, nr);
      if (clip.data[a]) wb.cells[na] = JSON.parse(JSON.stringify(clip.data[a]));
      else delete wb.cells[na];
    }
    wb.recalc(); wb.dirty = true;
    this.publish(wb); this.renderAll(wb);
  }
  renderFormulaBar(wb) {
    const w = this.windows.get(wb.id);
    if (!w) return;
    const { cellref, fx } = w._wb;
    const a = addr(this.sel.c, this.sel.r);
    cellref.value = a;
    const cell = wb.cells[a];
    if (document.activeElement !== fx) fx.value = cell ? (cell.f || String(cell.v === undefined ? '' : cell.v)) : '';
  }
  renderAll(wb) {
    const w = this.windows.get(wb.id);
    if (!w) return;
    const { gridwrap, status, fname } = w._wb;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const a = addr(c, r);
      const td = gridwrap.querySelector('td[data-cell-address="' + a + '"]');
      if (!td || td.classList.contains('editing')) continue;
      const cv = td.querySelector('.cv');
      const v = wb.display(a);
      cv.textContent = v;
      td.classList.toggle('num', typeof wb.computed[a] === 'number');
      td.classList.toggle('err', !!wb.errors[a]);
      const isSel = this.sel.c === c && this.sel.r === r;
      const inRange = this.range && c >= this.range.c1 && c <= this.range.c2 && r >= this.range.r1 && r <= this.range.r2;
      td.classList.toggle('selected', isSel);
      td.classList.toggle('inrange', !!inRange && !isSel);
    }
    this.renderFormulaBar(wb);
    const selCount = this.range ? (this.range.c2 - this.range.c1 + 1) * (this.range.r2 - this.range.r1 + 1) : 1;
    status.textContent = '就绪 · 选中 ' + selCount + ' 格 · ' + (wb.dirty ? '有未保存修改 ●' : '已保存') + ' · 公式: + - * / ( ) SUM AVG MIN MAX';
    fname.textContent = (wb.path || '未保存') + (wb.dirty ? ' ●' : '');
    this.os.desktop.setTitle(w, wb.title + (wb.dirty ? ' ●' : ''));
  }
}

module.exports = { SpreadsheetApp, Workbook, parseRange, parseAddr, addr };
