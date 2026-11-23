/* 根系统电子表格 */
'use strict';
window.NOS = window.NOS || {};

class SheetApp {
  constructor() {
    this.model = new NOS.SheetModel({});
    this.filename = '未命名.sheet';
    this.sel = { r0: 0, c0: 0, r1: 0, c1: 0 };
    this.active = { r: 0, c: 0 };
    this.undoStack = [];
    this.redoStack = [];
  }

  open() {
    const d = NOS.desktop;
    this.win = d.openWindow('spreadsheet', '电子表格 - ' + this.filename, { w: 900, h: 580, model: this });
    this.render();
  }
  openFile(path) {
    let text;
    try { text = NOS.rootVM.vfs.read(path); } catch (e) { return alert(e.message); }
    try {
      const data = JSON.parse(text);
      this.model = NOS.SheetModel.deserialize(data);
      this.filename = path;
      this.model.filename = NOS.VFS.baseName(path);
    } catch (e) { return alert('工作簿格式错误: ' + e.message); }
    if (!this.win) this.open();
    else { this.win.titleEl = this.win.el.querySelector('.win-title'); this.win.titleEl.textContent = '电子表格 - ' + this.filename; this.render(); }
    this.registerSource();
  }
  newFile() {
    if (this.model.dirty && !confirmDiscard()) return;
    this.model = new NOS.SheetModel({});
    this.filename = '未命名.sheet';
    this.undoStack = []; this.redoStack = [];
    if (this.win) { this.win.el.querySelector('.win-title').textContent = '电子表格 - ' + this.filename; this.render(); }
  }
  unmount() {}
  beforeClose() {
    if (this.model.dirty) {
      const r = confirm('工作簿有未保存修改。确定关闭吗？（确定=放弃，取消=继续编辑）');
      return r;
    }
  }

  registerSource() {
    NOS.rootVM.registerWorkbook(NOS.VFS.baseName(this.filename), this.model);
  }

  save(path) {
    path = path || this.filename;
    if (!path || path === '未命名.sheet') {
      path = prompt('保存到（路径）', '/Demo/未命名.sheet');
      if (!path) return;
    }
    NOS.rootVM.vfs.write(path, JSON.stringify(this.model.serialize()));
    this.filename = path;
    this.model.dirty = false;
    this.win.el.querySelector('.win-title').textContent = '电子表格 - ' + path;
    this.publish();
    NOS.rootVM.notify({ title: '电子表格', body: '已保存 ' + path });
  }

  publish() {
    this.registerSource();
    // 对所有订阅区域发布完整选区新版本
    const ds = NOS.rootVM.dataSources.get(NOS.VFS.baseName(this.filename));
    if (ds) NOS.rootVM.publishWorkbook(NOS.VFS.baseName(this.filename), this.model);
  }

  edit(addr, raw) {
    this.undoStack.push(JSON.stringify(this.model.cells));
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    this.model.setRaw(addr, raw);
    this.render();
    this.publish();
  }
  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(JSON.stringify(this.model.cells));
    this.model.cells = JSON.parse(this.undoStack.pop());
    this.model.dirty = true; this.model.version++;
    this.model._recomputeAll();
    this.render(); this.publish();
  }
  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(JSON.stringify(this.model.cells));
    this.model.cells = JSON.parse(this.redoStack.pop());
    this.model.dirty = true; this.model.version++;
    this.model._recomputeAll();
    this.render(); this.publish();
  }

  selectedAddrs() {
    const { r0, r1, c0, c1 } = norm(this.sel);
    const out = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push(NOS.sheetUtil.addrOf(r, c));
    return out;
  }
  copySelection() {
    const { r0, r1, c0, c1 } = norm(this.sel);
    const lines = [];
    for (let r = r0; r <= r1; r++) {
      const row = [];
      for (let c = c0; c <= c1; c++) {
        const addr = NOS.sheetUtil.addrOf(r, c);
        const cell = this.model.cells[addr];
        row.push(cell ? (cell.f || '') : '');
      }
      lines.push(row.join('\t'));
    }
    const text = lines.join('\n');
    NOS.rootVM.pushClipboard({ kind: 'sheet-range', range: this.selectedAddrs(), tsv: text }, 'outer');
    if (navigator.clipboard) try { navigator.clipboard.writeText(text); } catch (e) {}
    NOS.rootVM.notify({ title: '电子表格', body: '已复制选区' });
  }
  paste(text) {
    if (text == null) return;
    const lines = String(text).split('\n').filter((_, i, a) => i < a.length - 1 || _ !== undefined);
    const rows = String(text).replace(/\n$/, '').split('\n');
    this.undoStack.push(JSON.stringify(this.model.cells));
    rows.forEach((line, ri) => {
      line.split('\t').forEach((val, ci) => {
        const addr = NOS.sheetUtil.addrOf(this.active.r + ri, this.active.c + ci);
        this.model.setRaw(addr, val);
      });
    });
    this.model.version++;
    this.render(); this.publish();
  }

  render() {
    const c = this.win.contentEl;
    c.innerHTML = '';
    c.classList.add('sheet-app');
    const bar = NOS.h('div', { class: 'tb' });
    const fx = NOS.h('input', { class: 'fx-input', dataTestid: 'sheet-formula', value: this.model.getRaw(NOS.sheetUtil.addrOf(this.active.r, this.active.c)) || '' });
    fx.addEventListener('change', () => {
      this.edit(NOS.sheetUtil.addrOf(this.active.r, this.active.c), fx.value);
      this.render();
    });
    fx.addEventListener('keydown', e => e.stopPropagation());
    fx.addEventListener('pointerdown', e => e.stopPropagation());
    const save = NOS.h('button', { class: 'btn', dataTestid: 'sheet-save' }, '保存');
    save.addEventListener('click', () => this.save());
    const fn = NOS.h('span', { class: 'fn-name', dataTestid: 'sheet-filename' }, this.filename + (this.model.dirty ? ' *' : ''));
    bar.append(fn, NOS.h('span', { class: 'fx-label' }, 'fx'), fx, save,
      btn2('撤销', () => this.undo()), btn2('重做', () => this.redo()));
    c.appendChild(bar);

    const grid = NOS.h('div', { class: 'sheet-grid', dataTestid: 'sheet-grid' });
    const tbl = document.createElement('table');
    tbl.className = 'sheet-table';
    // 表头
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    hr.appendChild(th(''));
    for (let ci = 0; ci < this.model.cols; ci++) hr.appendChild(th(NOS.sheetUtil.colName(ci)));
    thead.appendChild(hr); tbl.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (let ri = 0; ri < this.model.rows; ri++) {
      const tr = document.createElement('tr');
      const rh = document.createElement('th');
      rh.textContent = ri + 1; tr.appendChild(rh);
      for (let ci = 0; ci < this.model.cols; ci++) {
        const td = document.createElement('td');
        const addr = NOS.sheetUtil.addrOf(ri, ci);
        td.dataset.testid = 'sheet-cell';
        td.dataset.cellAddress = addr;
        const cell = this.model.cells[addr];
        td.textContent = this.model.display(addr);
        if (cell && cell.err) td.classList.add('cell-err');
        if (ri === this.active.r && ci === this.active.c) td.classList.add('active');
        if (inSel(ri, ci, this.sel)) td.classList.add('selected');
        td.addEventListener('pointerdown', (e) => {
          if (e.shiftKey) this.sel.r1 = ri, this.sel.c1 = ci;
          else this.sel = { r0: ri, c0: ci, r1: ri, c1: ci };
          this.active = { r: ri, c: ci };
          this.render();
        });
        td.addEventListener('dblclick', () => this.startEdit(td, addr));
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    grid.appendChild(tbl);
    c.appendChild(grid);

    grid.addEventListener('paste', (e) => { e.preventDefault(); this.paste(e.clipboardData.getData('text')); });
    grid.tabIndex = 0;
    grid.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'c') { this.copySelection(); return; }
      if (e.ctrlKey && e.key === 'v') return;
      if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) { this.undo(); return; }
      if (e.ctrlKey && (e.key === 'y' || e.key === 'Z')) { this.redo(); return; }
      if (e.key === 'Enter' || e.key === 'F2') { const td = tbl.querySelector(`[data-cell-address="${NOS.sheetUtil.addrOf(this.active.r, this.active.c)}"]`); this.startEdit(td, NOS.sheetUtil.addrOf(this.active.r, this.active.c)); e.preventDefault(); return; }
      if (e.key.startsWith('Arrow')) {
        const a = this.active;
        if (e.key === 'ArrowUp') a.r = Math.max(0, a.r - 1);
        if (e.key === 'ArrowDown') a.r = Math.min(this.model.rows - 1, a.r + 1);
        if (e.key === 'ArrowLeft') a.c = Math.max(0, a.c - 1);
        if (e.key === 'ArrowRight') a.c = Math.min(this.model.cols - 1, a.c + 1);
        this.sel = { r0: a.r, c0: a.c, r1: a.r, c1: a.c };
        this.render();
      } else if (e.key.length === 1 || e.key === '=' || e.key === '-' || e.key === '.') {
        const td = tbl.querySelector(`[data-cell-address="${NOS.sheetUtil.addrOf(this.active.r, this.active.c)}"]`);
        this.startEdit(td, NOS.sheetUtil.addrOf(this.active.r, this.active.c), e.key);
      }
    });
    setTimeout(() => grid.focus(), 0);
  }

  startEdit(td, addr, initial) {
    if (!td) return;
    const raw = this.model.getRaw(addr) || '';
    const input = document.createElement('input');
    input.className = 'cell-edit';
    input.value = initial !== undefined ? initial : raw;
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    if (initial !== undefined) input.setSelectionRange(1, 1);
    const commit = (commitVal) => {
      this.edit(addr, commitVal !== undefined ? commitVal : input.value);
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { commit(); this.active.r = Math.min(this.model.rows - 1, this.active.r + 1); this.render(); }
      if (e.key === 'Escape') this.render();
      if (e.key === 'Tab') { commit(); e.preventDefault(); this.active.c = Math.min(this.model.cols - 1, this.active.c + 1); this.render(); }
    });
    input.addEventListener('blur', () => commit());
  }
}
function btn2(label, fn) { const b = NOS.h('button', { class: 'btn' }, label); b.addEventListener('click', fn); return b; }
function th(t) { const x = document.createElement('th'); x.textContent = t; return x; }
function norm(s) { return { r0: Math.min(s.r0, s.r1), r1: Math.max(s.r0, s.r1), c0: Math.min(s.c0, s.c1), c1: Math.max(s.c0, s.c1) }; }
function inSel(r, c, s) { const n = norm(s); return r >= n.r0 && r <= n.r1 && c >= n.c0 && c <= n.c1; }
function confirmDiscard() { return confirm('放弃未保存修改？'); }

NOS.SheetApp = SheetApp;
