// 电子表格：公式、区域、撤销、保存与实时数据发布
import { h, clear, icon, iconSvg, fmtBytes } from '../util.js';
import { basename as kbasename, joinPath as kjoin, normalizePath } from '../kernel.js';

const COLS = 26, ROWS = 60;
const colName = i => String.fromCharCode(65 + i);
const colIndex = s => s.charCodeAt(0) - 65;
const cellAddr = (c, r) => colName(c) + (r + 1);
const parseAddr = a => {
  const m = /^([A-Z]+)(\d+)$/.exec(String(a).toUpperCase());
  if (!m) return null;
  const c = m[1].split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
  const r = parseInt(m[2], 10) - 1;
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
  return { c, r };
};

function tokenizeFormula(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (/[0-9.]/.test(c)) { let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++; toks.push({ t: 'num', v: Number(src.slice(i, j)) }); i = j; continue; }
    if (c === '"') { let j = i + 1, s = ''; while (j < src.length && src[j] !== '"') { s += src[j++]; } toks.push({ t: 'str', v: s }); i = j + 1; continue; }
    if (/[A-Za-z]/.test(c)) {
      let j = i; while (j < src.length && /[A-Za-z0-9]/.test(src[j])) j++;
      const w = src.slice(i, j).toUpperCase(); i = j;
      if (w === 'SUM' || w === 'MIN' || w === 'MAX' || w === 'AVERAGE') toks.push({ t: 'func', v: w });
      else if (/^[A-Z]+[0-9]+$/.test(w)) toks.push({ t: 'ref', v: w });
      else toks.push({ t: 'name', v: w });
      continue;
    }
    if (c === ':') { toks.push({ t: 'op', v: ':' }); i++; continue; }
    if ('+-*/()<>=,&'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    throw new Error('无法识别的字符 ' + c);
  }
  return toks;
}

export class SheetApp {
  constructor(win, os, state = {}) {
    this.win = win; this.os = os; this.sys = win.sys;
    this.doc = null;
    this.values = {};
    this.errors = {};
    this.sel = { a: { c: 0, r: 0 }, f: { c: 0, r: 0 } };
    this.anchor = { c: 0, r: 0 };
    this.dragging = false;
    this.undoStack = [];
    this.redoStack = [];
    this.editing = null;
    this.dirty = false;
    if (state.docId) {
      this.doc = (this.sys.apps.workbooks || []).find(d => d.id === state.docId) || null;
    }
    if (!this.doc) {
      if (state.path) this.doc = this.loadFromPath(state.path);
      if (!this.doc) this.doc = this.newDoc();
    }
    if (this.sys.isRoot) this.register();
    this.win.setTitle(this.doc.title + (this.sys.isRoot ? '' : ''));
  }

  newDoc(name = '未命名工作簿', path = '') {
    return { id: 'wb-' + Math.random().toString(36).slice(2, 9), path, title: name, data: { cells: {}, formats: {}, colWidths: {} }, version: 1, dirty: false };
  }
  loadFromPath(path) {
    const f = this.sys.fs.get(path);
    if (!f || f.dir) return null;
    try {
      const data = JSON.parse(f.content);
      return { id: 'wb-' + Math.random().toString(36).slice(2, 9), path, title: data.name || kbasename(path), data: { cells: data.cells || {}, formats: data.formats || {}, colWidths: data.colWidths || {} }, version: 1, dirty: false };
    } catch (e) { return null; }
  }
  register() {
    if (!this.sys.apps.workbooks) this.sys.apps.workbooks = [];
    if (!this.sys.apps.workbooks.find(d => d.id === this.doc.id)) this.sys.apps.workbooks.push(this.doc);
    this.os.registerWorkbook(this.sys, this.doc);
  }
  markDirty() {
    this.dirty = true;
    if (this.doc) this.doc.dirty = true;
    this.updateTitle();
  }
  updateTitle() {
    this.win.setTitle(`${this.doc.title}${(this.dirty || this.doc.dirty) ? ' •' : ''}`);
    const el = this.win.bodyEl.querySelector('.sheet-name');
    if (el) el.classList.toggle('dirty', this.dirty || this.doc.dirty);
    const fe = this.win.bodyEl.querySelector('[data-testid="sheet-filename"]');
    if (fe) fe.textContent = this.doc.path ? kbasename(this.doc.path) : this.doc.title;
  }

  mount(body) {
    const wrap = h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } });
    const tb = h('div', { class: 'sheet-toolbar' });
    const mk = (testid, label, fn, cls = 'btn') => {
      const b = h('button', { class: cls, 'data-testid': testid }, label);
      b.addEventListener('click', e => { e.stopPropagation(); fn(); });
      tb.append(b); return b;
    };
    const name = h('div', { class: 'sheet-name', 'data-testid': 'sheet-filename' });
    name.append(h('span', {}, this.doc.title), h('span', { class: 'dirty' }));
    this.nameEl = name;
    tb.append(name);
    mk('sheet-new', '新建', () => this.newWorkbook());
    mk('sheet-open', '打开', () => this.openPicker());
    mk('sheet-save', '保存', () => this.save(), 'btn primary');
    mk('sheet-undo', '撤销', () => this.undo(), 'btn small');
    mk('sheet-redo', '重做', () => this.redo(), 'btn small');
    mk('sheet-copy', '复制', () => this.copy(false), 'btn small');
    mk('sheet-cut', '剪切', () => this.copy(true), 'btn small');
    mk('sheet-paste', '粘贴', () => this.paste(), 'btn small');
    mk('sheet-bold', '加粗', () => this.toggleBold(), 'btn small');
    mk('sheet-clear', '清除', () => this.clearSel(), 'btn small danger');
    tb.append(h('div', { class: 'spacer' }));
    tb.append(h('span', { class: 'pill', 'data-testid': 'sheet-recalc' }, '就绪'));
    const fb = h('div', { class: 'formula-bar' });
    this.refEl = h('div', { class: 'cell-ref' }, 'A1');
    const fx = h('span', { class: 'fx' }, 'fx');
    this.formulaEl = h('input', { class: 'formula-input', 'data-testid': 'sheet-formula', spellcheck: 'false' });
    fb.append(this.refEl, fx, this.formulaEl);
    this.formulaEl.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { this.setActiveRaw(this.formulaEl.value); this.recalc(); this.formulaEl.blur(); this.win.bodyEl.focus(); }
      if (e.key === 'Escape') { this.formulaEl.value = this.activeRaw(); this.formulaEl.blur(); }
    });
    const gridWrap = h('div', { class: 'sheet-wrap' });
    this.gridWrap = gridWrap;
    const table = h('table', { class: 'sheet', 'data-testid': 'sheet-grid' });
    this.table = table;
    const thead = h('thead');
    const corner = h('th', { class: 'corner' }, '');
    thead.append(corner);
    for (let c = 0; c < COLS; c++) thead.append(h('th', { style: { width: (this.doc.data.colWidths?.[colName(c)] || 96) + 'px' } }, colName(c)));
    const tbody = h('tbody');
    this.cells = {};
    for (let r = 0; r < ROWS; r++) {
      const tr = h('tr');
      tr.append(h('td', { class: 'rowhead' }, String(r + 1)));
      for (let c = 0; c < COLS; c++) {
        const addr = cellAddr(c, r);
        const td = h('td', { 'data-testid': 'sheet-cell', 'data-cell-address': addr });
        td.dataset.cellAddress = addr;
        td.append(h('span', { class: 'cell-val' }));
        td.addEventListener('pointerdown', e => this.onCellDown(e, c, r));
        td.addEventListener('pointerenter', e => { if (this.dragging) this.onCellEnter(c, r); });
        td.addEventListener('dblclick', e => { e.stopPropagation(); this.startEdit(c, r); });
        tr.append(td);
        this.cells[addr] = td;
      }
      tbody.append(tr);
    }
    table.append(thead, tbody);
    gridWrap.append(table);
    document.addEventListener('pointerup', () => { this.dragging = false; });
    const status = h('div', { class: 'sheet-status' }, h('span', {}, '就绪'));
    this.statusEl = status;
    wrap.append(tb, fb, gridWrap, status);
    body.append(wrap);
    this.wrap = wrap;
    body.tabIndex = 0;
    this.win.bodyEl.addEventListener('keydown', e => this.onKey(e));
    this.win.bodyEl.addEventListener('paste', e => {
      const text = e.clipboardData?.getData('text/plain');
      if (text) { e.preventDefault(); this.pasteText(text); }
    });
    this.recalc();
    this.updateSelectionUI();
    this.updateTitle();
    this.tickHandle = setInterval(() => this.updateStatus(), 700);
  }

  onCellDown(e, c, r) {
    if (e.button !== 0) return;
    e.preventDefault();
    if (this.editing) this.commitEdit();
    this.dragging = true;
    if (e.shiftKey) {
      this.sel.f = { c, r };
    } else {
      this.anchor = { c, r };
      this.sel = { a: { c, r }, f: { c, r } };
    }
    this.win.bodyEl.focus();
    this.updateSelectionUI();
  }
  onCellEnter(c, r) {
    if (e_shift) return;
    this.sel.f = { c, r };
    this.updateSelectionUI();
  }
  onKey(e) {
    const k = e.key;
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 's') { e.preventDefault(); this.save(); return; }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { e.preventDefault(); this.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'y') { e.preventDefault(); this.redo(); return; }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'c') { e.preventDefault(); this.copy(false); return; }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'x') { e.preventDefault(); this.copy(true); return; }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'v') {
      e.preventDefault();
      navigator.clipboard?.readText().then(t => this.pasteText(t || '')).catch(() => this.os.toast(this.sys, '粘贴', '无法读取剪贴板', 'warn'));
      return;
    }
    if (k === 'F2') { e.preventDefault(); this.startEdit(this.sel.a.c, this.sel.a.r); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); this.clearSel(); return; }
    if (k === 'Enter') {
      e.preventDefault();
      this.startEdit(this.sel.a.c, this.sel.a.r);
      return;
    }
    if (k.startsWith('Arrow')) {
      e.preventDefault();
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (d) {
        const c = Math.max(0, Math.min(COLS - 1, this.sel.a.c + d[0]));
        const r = Math.max(0, Math.min(ROWS - 1, this.sel.a.r + d[1]));
        this.anchor = { c, r }; this.sel = { a: { c, r }, f: { c, r } };
        this.updateSelectionUI();
        this.cells[cellAddr(c, r)]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      return;
    }
    if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      this.startEdit(this.sel.a.c, this.sel.a.r, k);
    }
  }

  activeRaw() {
    const addr = cellAddr(this.sel.a.c, this.sel.a.r);
    return this.doc.data.cells[addr] ?? '';
  }
  setActiveRaw(v) {
    const addr = cellAddr(this.sel.a.c, this.sel.a.r);
    this.pushUndo();
    this.doc.data.cells[addr] = v;
    this.markDirty();
    this.recalc();
  }

  startEdit(c, r, initial) {
    if (this.editing) this.commitEdit();
    const addr = cellAddr(c, r);
    const td = this.cells[addr];
    if (!td) return;
    this.sel = { a: { c, r }, f: { c, r } }; this.anchor = { c, r };
    this.updateSelectionUI();
    const input = h('input', { class: 'cell-editor', 'data-testid': 'sheet-cell-editor', spellcheck: 'false' });
    input.value = initial != null ? initial : (this.doc.data.cells[addr] ?? '');
    td.append(input);
    this.editing = { c, r, input, addr };
    input.focus();
    if (initial == null) input.select();
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); this.commitEdit(true); }
      else if (e.key === 'Tab') { e.preventDefault(); this.commitEdit(false); }
      else if (e.key === 'Escape') { e.preventDefault(); input.remove(); this.editing = null; this.win.bodyEl.focus(); }
    });
    input.addEventListener('blur', () => { if (this.editing?.input === input) this.commitEdit(false); });
  }
  commitEdit(move) {
    const ed = this.editing;
    if (!ed) return;
    const val = ed.input.value;
    this.editing = null;
    ed.input.remove();
    if (val !== (this.doc.data.cells[ed.addr] ?? '')) {
      this.pushUndo();
      if (val === '') delete this.doc.data.cells[ed.addr];
      else this.doc.data.cells[ed.addr] = val;
      this.markDirty();
      this.recalc();
    }
    if (move) {
      const r = Math.min(ROWS - 1, ed.r + 1);
      this.anchor = { c: ed.c, r }; this.sel = { a: { c: ed.c, r }, f: { c: ed.c, r } };
      this.updateSelectionUI();
    }
    this.win.bodyEl.focus();
  }

  pushUndo() {
    this.undoStack.push(JSON.stringify(this.doc.data));
    if (this.undoStack.length > 60) this.undoStack.shift();
    this.redoStack = [];
  }
  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(JSON.stringify(this.doc.data));
    this.doc.data = JSON.parse(this.undoStack.pop());
    this.markDirty(); this.recalc();
  }
  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(JSON.stringify(this.doc.data));
    this.doc.data = JSON.parse(this.redoStack.pop());
    this.markDirty(); this.recalc();
  }

  rangeCells() {
    const a = this.sel.a, f = this.sel.f;
    const out = [];
    for (let r = Math.min(a.r, f.r); r <= Math.max(a.r, f.r); r++)
      for (let c = Math.min(a.c, f.c); c <= Math.max(a.c, f.c); c++) out.push({ c, r, addr: cellAddr(c, r) });
    return out;
  }

  evaluateAll() {
    const cells = this.doc.data.cells;
    const values = {}, errors = {};
    const visiting = new Set(), done = new Set();
    const evalCell = addr => {
      if (done.has(addr)) return values[addr];
      if (visiting.has(addr)) { errors[addr] = '#CYCLE!'; return '#CYCLE!'; }
      const raw = cells[addr];
      if (raw == null || raw === '') return '';
      visiting.add(addr);
      let val;
      if (typeof raw === 'string' && raw.startsWith('=')) {
        try { val = this.evalFormula(raw.slice(1)); } catch (e) { val = e.message.startsWith('#') ? e.message : '#VALUE!'; }
      } else if (typeof raw === 'string' && raw.trim() !== '' && !isNaN(Number(raw))) val = Number(raw);
      else val = raw;
      if (val && typeof val === 'object' && val.range) val = '#VALUE!';
      visiting.delete(addr); done.add(addr);
      if (typeof val === 'string' && val.startsWith('#')) errors[addr] = val;
      values[addr] = val;
      return val;
    };
    const cellVal = addr => {
      const p = parseAddr(addr);
      if (!p) throw new Error('#REF!');
      return evalCell(addr);
    };
    const rangeVals = (a, b) => {
      const pa = parseAddr(a), pb = parseAddr(b);
      if (!pa || !pb) throw new Error('#REF!');
      const out = [];
      for (let r = Math.min(pa.r, pb.r); r <= Math.max(pa.r, pb.r); r++)
        for (let c = Math.min(pa.c, pb.c); c <= Math.max(pa.c, pb.c); c++) out.push(cellVal(cellAddr(c, r)));
      return out;
    };
    const num = v => { if (typeof v === 'number') return v; if (v === '') return 0; throw new Error('#VALUE!'); };
    const call = (name, args) => {
      const flat = args.map(a => Array.isArray(a) ? a : (a && Array.isArray(a.range) ? a.range : [a])).flat();
      if (name === 'SUM') {
        let s = 0;
        for (const v of flat) if (typeof v === 'number') s += v;
        return s;
      }
      if (name === 'AVERAGE') {
        const arr = flat.filter(v => typeof v === 'number');
        if (!arr.length) throw new Error('#DIV/0!');
        return arr.reduce((a, b) => a + b, 0) / arr.length;
      }
      if (name === 'MIN' || name === 'MAX') {
        const arr = flat.filter(v => typeof v === 'number');
        if (!arr.length) return 0;
        return name === 'MIN' ? Math.min(...arr) : Math.max(...arr);
      }
      throw new Error('#NAME?');
    };
    this._parserCtx = { cellVal, rangeVals, num, call };
    for (const addr of Object.keys(cells)) evalCell(addr);
    this.values = values;
    this.errors = errors;
    return values;
  }

  evalFormula(src) {
    const toks = tokenizeFormula(src);
    let i = 0;
    const peek = () => toks[i];
    const eat = v => { if (toks[i] && (v == null || toks[i].v === v)) return toks[i++]; return null; };
    const primary = () => {
      const t = toks[i];
      if (!t) throw new Error('#VALUE!');
      if (t.t === 'num') { i++; return t.v; }
      if (t.t === 'str') { i++; return t.v; }
      if (t.t === 'ref') {
        i++;
        if (toks[i] && toks[i].v === ':') {
          i++; const t2 = toks[i];
          if (!t2 || t2.t !== 'ref') throw new Error('#REF!');
          i++; return { range: this._parserCtx.rangeVals(t.v, t2.v) };
        }
        return this._parserCtx.cellVal(t.v);
      }
      if (t.t === 'func') {
        i++; const name = t.v;
        if (!eat('(')) throw new Error('#VALUE!');
        const args = [];
        if (!eat(')')) {
          do {
            const save = i;
            const t2 = toks[i];
            if (t2 && t2.t === 'ref' && toks[i + 1] && toks[i + 1].v === ':') {
              i += 2; const t3 = toks[i]; if (t3?.t === 'ref') { i++; args.push({ range: this._parserCtx.rangeVals(t2.v, t3.v) }); continue; }
              i = save;
            }
            args.push(expr());
          } while (eat(','));
          if (!eat(')')) throw new Error('#VALUE!');
        }
        return this._parserCtx.call(name, args);
      }
      if (t.t === 'op' && t.v === '(') { i++; const v = expr(); if (!eat(')')) throw new Error('#VALUE!'); return v; }
      if (t.t === 'op' && (t.v === '-' || t.v === '+')) { i++; const v = primary(); return t.v === '-' ? -this._parserCtx.num(v) : this._parserCtx.num(v); }
      throw new Error('#VALUE!');
    };
    const mul = () => { let v = primary(); while (toks[i] && ['*', '/'].includes(toks[i].v)) { const op = toks[i++].v; const r = primary(); if (Array.isArray(v) || Array.isArray(r)) throw new Error('#VALUE!'); const a = this._parserCtx.num(v), b = this._parserCtx.num(r); if (op === '/' && b === 0) throw new Error('#DIV/0!'); v = op === '*' ? a * b : a / b; } return v; };
    const add = () => { let v = mul(); while (toks[i] && ['+', '-', '&'].includes(toks[i].v)) { const op = toks[i++].v; const r = mul(); if (op === '&') { v = String(v) + String(r); continue; } if (Array.isArray(v) || Array.isArray(r)) throw new Error('#VALUE!'); const a = this._parserCtx.num(v), b = this._parserCtx.num(r); v = op === '+' ? a + b : a - b; } return v; };
    const cmp = () => { let v = add(); while (toks[i] && ['=', '<', '>', '>=', '<='].includes(toks[i].v)) { const op = toks[i++].v; const r = add(); v = op === '=' ? String(v) === String(r) : op === '<' ? v < r : op === '>' ? v > r : op === '>=' ? v >= r : v <= r; } return v; };
    const expr = () => cmp();
    const v = expr();
    if (i < toks.length) throw new Error('#VALUE!');
    if (v && typeof v === 'object' && v.range) throw new Error('#VALUE!');
    return v;
  }

  displayValue(addr) {
    const v = this.values[addr];
    if (v === undefined) return { text: '', cls: '' };
    if (typeof v === 'string' && v.startsWith('#')) return { text: v, cls: 'err' };
    const fmt = this.doc.data.formats?.[addr];
    if (fmt === 'money' && typeof v === 'number') return { text: v.toFixed(2), cls: 'num' };
    if (typeof v === 'number') return { text: String(Math.round(v * 1000) / 1000), cls: 'num' };
    return { text: String(v), cls: '' };
  }

  recalc() {
    const t0 = performance.now();
    this.evaluateAll();
    const cost = Math.max(4, Math.round((performance.now() - t0) / 4) + Math.round(Object.keys(this.doc.data.cells).length / 4));
    this.os.charge(this.sys, cost);
    for (const [addr, td] of Object.entries(this.cells)) {
      const val = td.querySelector('.cell-val');
      if (!val) continue;
      const d = this.displayValue(addr);
      val.textContent = d.text;
      val.className = 'cell-val ' + d.cls;
      const raw = this.doc.data.cells[addr];
      val.classList.toggle('formula', typeof raw === 'string' && raw.startsWith('='));
      const fmt = this.doc.data.formats?.[addr];
      val.style.fontWeight = fmt === 'bold' ? '700' : '';
    }
    this.updateSelectionUI();
    this.updateStatus();
    const pill = this.win.bodyEl.querySelector('[data-testid="sheet-recalc"]');
    if (pill) { pill.textContent = '已重算 · v' + (this.doc.version || 1); pill.className = 'pill ok'; }
    if (this.sys.isRoot) {
      this.doc.version = (this.doc.version || 0) + 1;
      this.doc.dirty = this.dirty;
      if (!this.os.rootWorkbooks.has(this.doc.id)) this.os.registerWorkbook(this.sys, this.doc);
      else this.os.publishWorkbook(this.doc.id);
    }
  }

  updateSelectionUI() {
    const a = this.sel.a, f = this.sel.f;
    const c1 = Math.min(a.c, f.c), c2 = Math.max(a.c, f.c), r1 = Math.min(a.r, f.r), r2 = Math.max(a.r, f.r);
    for (const [addr, td] of Object.entries(this.cells)) {
      const p = parseAddr(addr);
      const inRange = p.c >= c1 && p.c <= c2 && p.r >= r1 && p.r <= r2;
      const active = p.c === a.c && p.r === a.r;
      td.classList.toggle('selected', active);
      td.classList.toggle('in-range', inRange && !active);
    }
    this.refEl.textContent = c1 === c2 && r1 === r2 ? cellAddr(a.c, a.r) : `${cellAddr(c1, r1)}:${cellAddr(c2, r2)}`;
    if (document.activeElement !== this.formulaEl) this.formulaEl.value = this.activeRaw();
    const n = (c2 - c1 + 1) * (r2 - r1 + 1);
    this.updateStatus(n);
  }
  updateStatus(n) {
    if (!this.statusEl) return;
    const vals = this.rangeCells().map(x => this.values[x.addr]).filter(v => typeof v === 'number');
    const sum = vals.reduce((a, b) => a + b, 0);
    const text = `就绪 · ${n || (this.sel.a.c === this.sel.f.c && this.sel.a.r === this.sel.f.r ? cellAddr(this.sel.a.c, this.sel.a.r) : '区域')} · 求和 ${Math.round(sum * 100) / 100} · 版本 ${this.doc.version || 1}${this.dirty ? ' · 未保存' : ''}`;
    this.statusEl.textContent = text;
  }

  copy(cut) {
    const cells = this.rangeCells();
    if (!cells.length) return;
    const r1 = Math.min(...cells.map(x => x.r)), r2 = Math.max(...cells.map(x => x.r));
    const c1 = Math.min(...cells.map(x => x.c)), c2 = Math.max(...cells.map(x => x.c));
    const lines = [];
    for (let r = r1; r <= r2; r++) {
      const row = [];
      for (let c = c1; c <= c2; c++) {
        const v = this.values[cellAddr(c, r)];
        row.push(v == null ? '' : String(v));
      }
      lines.push(row.join('\t'));
    }
    const text = lines.join('\n');
    this.clipboard = { r1, c1, r2, c2, cells: cells.map(x => ({ ...x, raw: this.doc.data.cells[x.addr] })) };
    navigator.clipboard?.writeText(text).catch(() => {});
    this.addClipHistory(text);
    if (cut) { this.pushUndo(); for (const x of cells) delete this.doc.data.cells[x.addr]; this.markDirty(); this.recalc(); }
    this.os.toast(this.sys, cut ? '已剪切' : '已复制', `${cells.length} 个单元格`, 'ok');
  }
  addClipHistory(text) {
    if (!this.sys.clipboard) this.sys.clipboard = [];
    this.sys.clipboard.unshift({ text, time: this.sys.clock, type: 'sheet' });
    if (this.sys.clipboard.length > 30) this.sys.clipboard.pop();
  }
  pasteText(text) {
    if (!text) return;
    this.pushUndo();
    const rows = text.replace(/\r/g, '').split('\n');
    const start = this.sel.a;
    rows.forEach((line, dr) => {
      const cols = line.split('\t');
      cols.forEach((v, dc) => {
        const c = start.c + dc, r = start.r + dr;
        if (c >= COLS || r >= ROWS) return;
        const addr = cellAddr(c, r);
        if (v === '') delete this.doc.data.cells[addr]; else this.doc.data.cells[addr] = v;
      });
    });
    this.markDirty();
    this.recalc();
    this.os.toast(this.sys, '已粘贴', `${rows.length} 行`, 'ok');
  }
  paste() {
    if (this.clipboard) {
      this.pushUndo();
      const { cells } = this.clipboard;
      const base = this.sel.a;
      const dr = base.r - Math.min(...cells.map(x => x.r));
      const dc = base.c - Math.min(...cells.map(x => x.c));
      for (const x of cells) {
        const c = x.c + dc, r = x.r + dr;
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
        const addr = cellAddr(c, r);
        if (x.raw === '' || x.raw == null) delete this.doc.data.cells[addr]; else this.doc.data.cells[addr] = x.raw;
      }
      this.markDirty(); this.recalc();
    } else {
      navigator.clipboard?.readText().then(t => this.pasteText(t || '')).catch(() => {});
    }
  }
  clearSel() {
    const cells = this.rangeCells();
    if (!cells.length) return;
    this.pushUndo();
    for (const x of cells) delete this.doc.data.cells[x.addr];
    this.markDirty(); this.recalc();
  }
  toggleBold() {
    this.pushUndo();
    const cells = this.rangeCells();
    const anyBold = cells.some(x => this.doc.data.formats?.[x.addr] === 'bold');
    for (const x of cells) {
      if (!this.doc.data.formats) this.doc.data.formats = {};
      if (anyBold) delete this.doc.data.formats[x.addr];
      else this.doc.data.formats[x.addr] = 'bold';
    }
    this.markDirty(); this.recalc();
  }

  save() {
    if (!this.doc) return;
    const path = this.doc.path || kjoin('/Documents', this.doc.title.replace(/\.sheet$/, '') + '.sheet');
    if (this.sys.fs.storageUsed() + 512 > this.sys.storageLimit) { this.os.toast(this.sys, '保存失败', '存储配额不足', 'err'); return; }
    const data = { format: 'nos-sheet', version: 1, name: this.doc.title, cells: this.doc.data.cells, formats: this.doc.data.formats || {}, colWidths: this.doc.data.colWidths || {} };
    const text = JSON.stringify(data, null, 2);
    if (!this.sys.fs.write(path, text, Date.now())) { this.os.toast(this.sys, '保存失败', '无法写入文件', 'err'); return; }
    this.doc.path = path; this.doc.data.name = this.doc.title;
    this.doc.dirty = false; this.dirty = false;
    this.sys.syncStorage();
    if (!this.sys.apps.workbooks) this.sys.apps.workbooks = [];
    if (!this.sys.apps.workbooks.find(d => d.id === this.doc.id)) this.sys.apps.workbooks.push(this.doc);
    if (this.sys.isRoot) this.os.registerWorkbook(this.sys, this.doc);
    this.updateTitle();
    this.os.notify(this.sys, '工作簿已保存', path, 'ok', true);
    this.os.saveSoon();
  }

  newWorkbook() {
    const doIt = () => {
      this.doc = this.newDoc();
      this.dirty = false; this.undoStack = []; this.redoStack = [];
      this.sel = { a: { c: 0, r: 0 }, f: { c: 0, r: 0 } }; this.anchor = { c: 0, r: 0 };
      if (this.sys.isRoot) { if (!this.sys.apps.workbooks) this.sys.apps.workbooks = []; this.sys.apps.workbooks.push(this.doc); this.os.registerWorkbook(this.sys, this.doc); }
      this.recalc(); this.updateTitle();
      this.os.toast(this.sys, '已新建工作簿', '可以开始输入数据', 'ok');
    };
    if (this.dirty) {
      this.os.dialog(this.sys, {
        title: '未保存的修改', text: '当前工作簿有未保存的修改，是否保存？',
        actions: [{ id: 'save', text: '保存', primary: true }, { id: 'discard', text: '放弃' }, { id: 'cancel', text: '取消' }]
      }).then(r => { if (r === 'save') this.save(); if (r !== 'cancel') doIt(); });
    } else doIt();
  }

  openPicker() {
    const files = (this.sys.fs.list('/Demo') || []).concat(this.sys.fs.list('/Documents') || []).filter(f => !f.dir && f.path.endsWith('.sheet'));
    const list = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '300px', overflow: 'auto' } });
    for (const f of files) {
      const b = h('button', { class: 'btn ghost', style: { justifyContent: 'flex-start' } }, iconSvg('sheet'), kbasename(f.path));
      b.addEventListener('click', () => {
        const doc = this.loadFromPath(f.path);
        if (doc) {
          this.doc = doc; this.dirty = false; this.undoStack = []; this.redoStack = [];
          if (this.sys.isRoot) { if (!this.sys.apps.workbooks) this.sys.apps.workbooks = []; if (!this.sys.apps.workbooks.find(d => d.id === doc.id)) this.sys.apps.workbooks.push(doc); this.os.registerWorkbook(this.sys, doc); }
          this.recalc(); this.updateTitle();
          layer.remove();
        }
      });
      list.append(b);
    }
    if (!files.length) list.append(h('div', { class: 'empty' }, '没有找到工作簿'));
    const layer = h('div', { class: 'modal-layer', style: { pointerEvents: 'auto' } });
    const dlg = h('div', { class: 'dialog' }, h('h3', {}, '打开工作簿'), list, h('div', { class: 'dlg-actions' }, h('button', { class: 'btn' }, '取消')));
    dlg.lastChild.lastChild.addEventListener('click', () => layer.remove());
    layer.append(dlg);
    this.win.bodyEl.appendChild(layer);
    layer.addEventListener('pointerdown', e => { if (e.target === layer) layer.remove(); });
  }

  beforeClose() {
    if (!this.dirty && !this.doc?.dirty) return true;
    let decided = null;
    const p = this.os.dialog(this.sys, {
      title: '关闭工作簿', text: '当前工作簿有未保存的修改。',
      actions: [{ id: 'save', text: '保存', primary: true }, { id: 'discard', text: '不保存' }, { id: 'cancel', text: '取消' }]
    }).then(r => { decided = r; });
    return p.then(() => {
      if (decided === 'save') { this.save(); return true; }
      return decided === 'discard';
    });
  }

  serialize() { return { docId: this.doc.id, title: this.doc.title, dirty: this.dirty, path: this.doc.path }; }
  restore(st) {
    const doc = (this.sys.apps.workbooks || []).find(d => d.id === st.docId);
    if (doc) { this.doc = doc; this.recalc(); this.updateTitle(); }
  }
  tick() {}
  render() {}
  dispose() { clearInterval(this.tickHandle); }
}

// 修正 onCellEnter 的作用域问题
let e_shift = false;