// Root Spreadsheet App ('spreadsheet')
// Features: single worksheet, cell & rectangular range selection, formula bar,
// + - * / () cell/range refs & SUM/AVG/MIN/MAX, dependency recalculation,
// explicit #DIV/0! / #REF! / #CYCLE! errors, copy/paste (integrates with Clipboard History),
// undo/redo, save/open in Root VFS with dirty confirmation, & real-time Live Data Publishing!

function colIndexToLetter(idx) {
  return String.fromCharCode(65 + idx);
}

function letterToColIndex(letter) {
  const cc = String(letter || '').toUpperCase().charCodeAt(0);
  if (cc >= 65 && cc <= 90) return cc - 65;
  return -1;
}

export function parseCellAddress(addr) {
  const m = /^([A-Z]+)(\d+)$/i.exec(String(addr || '').trim());
  if (!m) return null;
  const col = letterToColIndex(m[1]);
  const row = parseInt(m[2], 10) - 1;
  if (col < 0 || row < 0) return null;
  return { col, row };
}

export function parseRangeString(rangeStr) {
  const parts = String(rangeStr || '').trim().toUpperCase().split(':');
  const a = parseCellAddress(parts[0]);
  if (!a) return null;
  const b = parts[1] ? parseCellAddress(parts[1]) : a;
  if (!b) return null;
  return {
    r1: Math.min(a.row, b.row),
    r2: Math.max(a.row, b.row),
    c1: Math.min(a.col, b.col),
    c2: Math.max(a.col, b.col),
  };
}

export class SpreadsheetEngine {
  constructor(data) {
    this.rows = data?.rows || 24;
    this.cols = data?.cols || 10;
    this.cells = {};
    if (data?.cells) {
      for (const [k, v] of Object.entries(data.cells)) {
        this.cells[k.toUpperCase()] = {
          raw: String(v?.raw ?? ''),
          bold: Boolean(v?.bold),
          align: v?.align || 'left',
        };
      }
    }
    this.computed = {}; // addr -> { value, display, error }
    this.recalculate();
  }

  serialize(name) {
    return {
      format: 'nos-sheet-v1',
      name: name || '未命名.sheet',
      rows: this.rows,
      cols: this.cols,
      cells: JSON.parse(JSON.stringify(this.cells)),
    };
  }

  getRaw(addr) {
    return this.cells[addr]?.raw ?? '';
  }

  setRaw(addr, raw) {
    const key = addr.toUpperCase();
    const s = String(raw ?? '');
    if (s === '' && !this.cells[key]?.bold) {
      delete this.cells[key];
    } else {
      if (!this.cells[key]) this.cells[key] = { raw: s, bold: false, align: 'left' };
      else this.cells[key].raw = s;
      if (s !== '' && !s.startsWith('=') && !Number.isNaN(Number(s))) {
        this.cells[key].align = 'right';
      }
    }
  }

  recalculate() {
    this.computed = {};
    const state = {}; // 0/undef=unvisited, 1=visiting, 2=done

    const evalCell = (addr) => {
      const key = addr.toUpperCase();
      if (state[key] === 2) return this.computed[key];
      if (state[key] === 1) {
        return { value: null, display: '#CYCLE!', error: '循环依赖引用' };
      }
      const parsed = parseCellAddress(key);
      if (!parsed || parsed.row >= this.rows || parsed.col >= this.cols) {
        return { value: null, display: '#REF!', error: '单元格引用超出范围' };
      }
      state[key] = 1;
      const cell = this.cells[key];
      const raw = cell ? String(cell.raw ?? '') : '';
      let res;
      if (!raw.startsWith('=')) {
        if (raw.trim() === '') {
          res = { value: '', display: '', error: null };
        } else if (!Number.isNaN(Number(raw.trim()))) {
          const n = Number(raw.trim());
          res = { value: n, display: String(n), error: null };
        } else {
          res = { value: raw, display: raw, error: null };
        }
      } else {
        try {
          const val = this._evalFormula(raw.slice(1), evalCell);
          if (typeof val === 'number') {
            if (!Number.isFinite(val)) {
              res = { value: null, display: '#DIV/0!', error: '除数为零' };
            } else {
              const rounded = Math.round(val * 1e9) / 1e9;
              res = { value: rounded, display: String(rounded), error: null };
            }
          } else {
            res = { value: val, display: String(val), error: null };
          }
        } catch (err) {
          const code = err?.code || '#ERR!';
          res = { value: null, display: code, error: err?.message || '公式错误' };
        }
      }
      state[key] = 2;
      this.computed[key] = res;
      return res;
    };

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        evalCell(`${colIndexToLetter(c)}${r + 1}`);
      }
    }
  }

  _evalFormula(expr, evalCell) {
    // Tokenize formula
    const tokens = [];
    let i = 0;
    const s = expr.trim();
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (/[0-9.]/.test(ch)) {
        let start = i;
        while (i < s.length && /[0-9.]/.test(s[i])) i++;
        tokens.push({ t: 'NUM', v: Number(s.slice(start, i)) });
        continue;
      }
      if (/[A-Za-z]/.test(ch)) {
        let start = i;
        while (i < s.length && /[A-Za-z0-9]/.test(s[i])) i++;
        tokens.push({ t: 'ID', v: s.slice(start, i).toUpperCase() });
        continue;
      }
      if ('+-*/():,'.includes(ch)) {
        tokens.push({ t: ch, v: ch });
        i++;
        continue;
      }
      const err = new Error(`无法识别的符号 '${ch}'`);
      err.code = '#ERR!';
      throw err;
    }

    let pos = 0;
    const peek = (off = 0) => tokens[pos + off] || { t: 'EOF', v: '' };
    const next = () => tokens[pos++];

    const parseAdd = () => {
      let left = parseMul();
      while (peek().t === '+' || peek().t === '-') {
        const op = next().t;
        const right = parseMul();
        left = op === '+' ? left + right : left - right;
      }
      return left;
    };

    const parseMul = () => {
      let left = parseUnary();
      while (peek().t === '*' || peek().t === '/') {
        const op = next().t;
        const right = parseUnary();
        if (op === '/') {
          if (right === 0) {
            const err = new Error('除数为零');
            err.code = '#DIV/0!';
            throw err;
          }
          left = left / right;
        } else {
          left = left * right;
        }
      }
      return left;
    };

    const parseUnary = () => {
      if (peek().t === '-') { next(); return -parseUnary(); }
      if (peek().t === '+') { next(); return parseUnary(); }
      return parsePrimary();
    };

    const readCellNum = (addr) => {
      const p = parseCellAddress(addr);
      if (!p || p.row >= this.rows || p.col >= this.cols) {
        const err = new Error(`无效引用 ${addr}`);
        err.code = '#REF!';
        throw err;
      }
      const c = evalCell(addr);
      if (c.error) {
        const err = new Error(c.error);
        err.code = c.display;
        throw err;
      }
      if (c.value === '' || c.value === null) return 0;
      if (typeof c.value === 'number') return c.value;
      const n = Number(c.value);
      return Number.isNaN(n) ? 0 : n;
    };

    const parsePrimary = () => {
      const tk = peek();
      if (tk.t === 'NUM') { next(); return tk.v; }
      if (tk.t === '(') {
        next();
        const v = parseAdd();
        if (peek().t !== ')') {
          const err = new Error('缺少右括号');
          err.code = '#ERR!';
          throw err;
        }
        next();
        return v;
      }
      if (tk.t === 'ID') {
        next();
        // Function call: SUM(...), AVG(...), AVERAGE(...), MIN(...), MAX(...)
        if (peek().t === '(') {
          const fn = tk.v;
          next(); // '('
          const vals = [];
          if (peek().t !== ')') {
            while (true) {
              if (peek().t === 'ID' && peek(1).t === ':' && peek(2).t === 'ID') {
                const a = next().v;
                next(); // ':'
                const b = next().v;
                const rng = parseRangeString(`${a}:${b}`);
                if (!rng || rng.r2 >= this.rows || rng.c2 >= this.cols) {
                  const err = new Error(`区域引用越界 ${a}:${b}`);
                  err.code = '#REF!';
                  throw err;
                }
                for (let r = rng.r1; r <= rng.r2; r++) {
                  for (let c = rng.c1; c <= rng.c2; c++) {
                    vals.push(readCellNum(`${colIndexToLetter(c)}${r + 1}`));
                  }
                }
              } else {
                vals.push(parseAdd());
              }
              if (peek().t === ',') { next(); continue; }
              break;
            }
          }
          if (peek().t !== ')') {
            const err = new Error('函数缺少右括号');
            err.code = '#ERR!';
            throw err;
          }
          next();
          if (fn === 'SUM') return vals.reduce((acc, x) => acc + x, 0);
          if (fn === 'AVG' || fn === 'AVERAGE') return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
          if (fn === 'MIN') return vals.length ? Math.min(...vals) : 0;
          if (fn === 'MAX') return vals.length ? Math.max(...vals) : 0;
          const err = new Error(`不支持的函数 ${fn}`);
          err.code = '#ERR!';
          throw err;
        }
        // Cell reference
        if (/^[A-Z]+\d+$/.test(tk.v)) {
          return readCellNum(tk.v);
        }
        const err = new Error(`无效引用 ${tk.v}`);
        err.code = '#REF!';
        throw err;
      }
      const err = new Error('公式语法错误');
      err.code = '#ERR!';
      throw err;
    };

    const out = parseAdd();
    if (peek().t !== 'EOF') {
      const err = new Error('公式包含多余字符');
      err.code = '#ERR!';
      throw err;
    }
    return out;
  }

  extractRangeValues(rangeStr) {
    const rng = parseRangeString(rangeStr);
    if (!rng) return [];
    const rows = [];
    for (let r = rng.r1; r <= Math.min(rng.r2, this.rows - 1); r++) {
      const rowArr = [];
      for (let c = rng.c1; c <= Math.min(rng.c2, this.cols - 1); c++) {
        const addr = `${colIndexToLetter(c)}${r + 1}`;
        const comp = this.computed[addr];
        rowArr.push(comp ? (comp.error ? comp.display : comp.value) : '');
      }
      rows.push(rowArr);
    }
    return rows;
  }
}

export function mountSpreadsheetApp(os, win, bodyEl, launchArgs = {}) {
  const docId = `wb-${++os.workbookSeq}`;
  let filePath = launchArgs.openPath || '/Demo/sample.sheet';
  let fileName = filePath.split('/').pop();
  let dirty = false;
  let version = 1;
  const undoStack = [];
  const redoStack = [];

  let engine;
  const loadFromPath = (path) => {
    const rd = os.vfsRead(path);
    if (rd.ok) {
      try {
        const parsed = JSON.parse(rd.content);
        engine = new SpreadsheetEngine(parsed);
        filePath = path;
        fileName = path.split('/').pop();
        dirty = false;
        undoStack.length = 0;
        redoStack.length = 0;
        return true;
      } catch {
        engine = new SpreadsheetEngine(null);
        return false;
      }
    }
    engine = new SpreadsheetEngine(null);
    filePath = path;
    fileName = path.split('/').pop();
    dirty = false;
    return false;
  };

  if (launchArgs.newBlank) {
    engine = new SpreadsheetEngine(null);
    filePath = `/Documents/工作簿_${os.workbookSeq}.sheet`;
    fileName = filePath.split('/').pop();
  } else {
    loadFromPath(filePath);
  }

  let selStart = { r: 0, c: 0 };
  let selEnd = { r: 0, c: 0 };
  let isSelecting = false;
  let editingAddr = null;

  const docEntry = {
    docId,
    windowId: win.id,
    get title() { return fileName; },
    get path() { return filePath; },
    get version() { return version; },
    get dirty() { return dirty; },
    extractRange: (rng) => engine.extractRangeValues(rng),
  };
  os.openWorkbooks.set(docId, docEntry);

  const addrOf = (r, c) => `${colIndexToLetter(c)}${r + 1}`;
  const activeAddr = () => addrOf(selStart.r, selStart.c);

  const getSelectionBounds = () => ({
    r1: Math.min(selStart.r, selEnd.r),
    r2: Math.max(selStart.r, selEnd.r),
    c1: Math.min(selStart.c, selEnd.c),
    c2: Math.max(selStart.c, selEnd.c),
  });

  const pushUndo = () => {
    undoStack.push(JSON.stringify(engine.cells));
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
  };

  const commitChange = () => {
    engine.recalculate();
    dirty = true;
    version += 1;
    updateTitle();
    renderGridValues();
    os.publishWorkbookUpdate(docEntry);
  };

  const updateTitle = () => {
    const t = `${dirty ? '● ' : ''}${fileName} — 电子表格`;
    os.setWindowTitle(win.id, t);
    const fnEl = bodyEl.querySelector('[data-testid="sheet-filename"]');
    if (fnEl && document.activeElement !== fnEl) fnEl.value = filePath;
    const dirtyTag = bodyEl.querySelector('.sheet-dirty-tag');
    if (dirtyTag) dirtyTag.textContent = dirty ? '● 未保存' : '已保存';
  };

  bodyEl.innerHTML = `
    <div class="sheet-app">
      <div class="sheet-toolbar">
        <input class="nos-input sheet-fn-input" type="text" value="${filePath}" data-testid="sheet-filename" data-system-id="outer" data-window-id="${win.id}" aria-label="工作簿路径"/>
        <button class="btn-xs" data-act="new">新建</button>
        <button class="btn-xs" data-act="open">打开</button>
        <button class="btn-xs btn-accent" data-testid="sheet-save" data-system-id="outer" data-window-id="${win.id}" data-act="save">保存</button>
        <span class="sheet-sep"></span>
        <button class="btn-xs" data-act="undo" title="撤销 (Ctrl+Z)">撤销</button>
        <button class="btn-xs" data-act="redo" title="重做 (Ctrl+Y)">重做</button>
        <button class="btn-xs" data-act="copy" title="复制 (Ctrl+C)">复制</button>
        <button class="btn-xs" data-act="paste" title="粘贴 (Ctrl+V)">粘贴</button>
        <span class="sheet-dirty-tag">已保存</span>
      </div>
      <div class="sheet-formulabar">
        <span class="sheet-addr-box">A1</span>
        <span class="sheet-fx">fx</span>
        <input class="nos-input sheet-formula-in" type="text" data-testid="sheet-formula" data-system-id="outer" data-window-id="${win.id}" aria-label="公式编辑栏"/>
      </div>
      <div class="sheet-grid-wrap">
        <table class="sheet-table" data-testid="sheet-grid" data-system-id="outer" data-window-id="${win.id}"></table>
      </div>
      <div class="sheet-status"></div>
    </div>
  `;

  const tableEl = bodyEl.querySelector('[data-testid="sheet-grid"]');
  const formulaIn = bodyEl.querySelector('[data-testid="sheet-formula"]');
  const addrBox = bodyEl.querySelector('.sheet-addr-box');
  const statusEl = bodyEl.querySelector('.sheet-status');
  const fnInput = bodyEl.querySelector('[data-testid="sheet-filename"]');

  // Build table once
  const buildTable = () => {
    let html = '<thead><tr><th class="sh-corner"></th>';
    for (let c = 0; c < engine.cols; c++) html += `<th class="sh-col-hdr">${colIndexToLetter(c)}</th>`;
    html += '</tr></thead><tbody>';
    for (let r = 0; r < engine.rows; r++) {
      html += `<tr><th class="sh-row-hdr">${r + 1}</th>`;
      for (let c = 0; c < engine.cols; c++) {
        const addr = addrOf(r, c);
        html += `<td class="sh-cell" tabindex="0" data-testid="sheet-cell" data-system-id="outer" data-window-id="${win.id}" data-cell-address="${addr}" data-r="${r}" data-c="${c}"></td>`;
      }
      html += '</tr>';
    }
    html += '</tbody>';
    tableEl.innerHTML = html;
  };

  const renderGridValues = () => {
    const b = getSelectionBounds();
    const cells = tableEl.querySelectorAll('td.sh-cell');
    cells.forEach((td) => {
      const r = Number(td.dataset.r);
      const c = Number(td.dataset.c);
      const addr = td.dataset.cellAddress;
      const comp = engine.computed[addr] || { display: '', error: null };
      const cellDef = engine.cells[addr];
      const inSel = r >= b.r1 && r <= b.r2 && c >= b.c1 && c <= b.c2;
      const isActive = r === selStart.r && c === selStart.c;
      td.classList.toggle('in-sel', inSel);
      td.classList.toggle('is-active', isActive);
      td.classList.toggle('is-bold', Boolean(cellDef?.bold));
      td.classList.toggle('is-error', Boolean(comp.error));
      td.style.textAlign = cellDef?.align || (typeof comp.value === 'number' ? 'right' : 'left');
      td.title = comp.error ? `${comp.display}: ${comp.error}` : (cellDef?.raw || '');
      if (editingAddr !== addr) {
        td.textContent = comp.display;
      }
    });

    const a = activeAddr();
    addrBox.textContent = (b.r1 === b.r2 && b.c1 === b.c2) ? a : `${addrOf(b.r1, b.c1)}:${addrOf(b.r2, b.c2)}`;
    if (document.activeElement !== formulaIn) {
      formulaIn.value = engine.getRaw(a);
    }
    const comp = engine.computed[a];
    statusEl.textContent = comp?.error
      ? `错误 (${a}): ${comp.display} — ${comp.error}`
      : `工作簿版本 v${version} · 选区 ${addrBox.textContent} · 实时发布已就绪`;
  };

  const startInlineEdit = (addr, initialChar = null) => {
    if (editingAddr && editingAddr !== addr) finishInlineEdit(true);
    const td = tableEl.querySelector(`td[data-cell-address="${addr}"]`);
    if (!td) return;
    editingAddr = addr;
    const inp = document.createElement('input');
    inp.className = 'sh-inline-input';
    inp.value = initialChar !== null ? initialChar : engine.getRaw(addr);
    td.textContent = '';
    td.appendChild(inp);
    inp.focus();
    if (initialChar === null) inp.select();
    inp.addEventListener('input', () => { formulaIn.value = inp.value; });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finishInlineEdit(true);
        selStart.r = Math.min(engine.rows - 1, selStart.r + 1);
        selEnd = { ...selStart };
        renderGridValues();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        finishInlineEdit(true);
        selStart.c = Math.min(engine.cols - 1, selStart.c + 1);
        selEnd = { ...selStart };
        renderGridValues();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finishInlineEdit(false);
      }
    });
    inp.addEventListener('blur', () => {
      if (editingAddr === addr) finishInlineEdit(true);
    });
  };

  const finishInlineEdit = (commit) => {
    if (!editingAddr) return;
    const addr = editingAddr;
    const td = tableEl.querySelector(`td[data-cell-address="${addr}"]`);
    const inp = td?.querySelector('input.sh-inline-input');
    const newVal = inp ? inp.value : engine.getRaw(addr);
    editingAddr = null;
    if (commit && newVal !== engine.getRaw(addr)) {
      pushUndo();
      engine.setRaw(addr, newVal);
      commitChange();
    } else {
      renderGridValues();
    }
  };

  const doCopy = () => {
    const b = getSelectionBounds();
    const lines = [];
    for (let r = b.r1; r <= b.r2; r++) {
      const rowVals = [];
      for (let c = b.c1; c <= b.c2; c++) {
        const comp = engine.computed[addrOf(r, c)];
        rowVals.push(comp ? comp.display : '');
      }
      lines.push(rowVals.join('\t'));
    }
    const text = lines.join('\n');
    os.recordClipboard(text, `电子表格 ${addrBox.textContent}`);
    try { navigator.clipboard?.writeText(text); } catch {}
    statusEl.textContent = `已复制 ${addrBox.textContent} (${text.slice(0, 40)})`;
  };

  const doPaste = () => {
    const text = os.getLatestClipboard();
    if (!text) return;
    pushUndo();
    const rows = text.split(/\r?\n/);
    for (let dr = 0; dr < rows.length; dr++) {
      const cols = rows[dr].split('\t');
      for (let dc = 0; dc < cols.length; dc++) {
        const rr = selStart.r + dr;
        const cc = selStart.c + dc;
        if (rr < engine.rows && cc < engine.cols) {
          engine.setRaw(addrOf(rr, cc), cols[dc]);
        }
      }
    }
    commitChange();
  };

  const doUndo = () => {
    if (undoStack.length === 0) return;
    redoStack.push(JSON.stringify(engine.cells));
    engine.cells = JSON.parse(undoStack.pop());
    commitChange();
  };

  const doRedo = () => {
    if (redoStack.length === 0) return;
    undoStack.push(JSON.stringify(engine.cells));
    engine.cells = JSON.parse(redoStack.pop());
    commitChange();
  };

  const doSave = () => {
    const targetPath = fnInput.value.trim() || filePath;
    const content = JSON.stringify(engine.serialize(targetPath.split('/').pop()), null, 2);
    const wr = os.vfsWrite(targetPath, content);
    if (wr.ok) {
      filePath = wr.path;
      fileName = filePath.split('/').pop();
      dirty = false;
      updateTitle();
      statusEl.textContent = `已保存至 ${filePath}`;
      os.notify('电子表格已保存', filePath);
      return true;
    }
    statusEl.textContent = `保存失败：${wr.error}`;
    return false;
  };

  const confirmIfDirty = (onProceed) => {
    if (!dirty) { onProceed(); return; }
    os.showConfirmModal({
      title: '工作簿有未保存的修改',
      message: `${fileName} 包含未保存的修改。是否先保存？`,
      buttons: [
        { label: '保存', kind: 'primary', onClick: () => { if (doSave()) onProceed(); } },
        { label: '放弃修改', kind: 'danger', onClick: () => { dirty = false; onProceed(); } },
        { label: '取消', kind: 'secondary', onClick: () => {} },
      ],
    });
  };

  // Mouse & Keyboard interactions
  tableEl.addEventListener('mousedown', (e) => {
    const td = e.target.closest('td.sh-cell');
    if (!td) return;
    const addr = td.dataset.cellAddress;
    if (editingAddr && editingAddr !== addr) finishInlineEdit(true);
    const r = Number(td.dataset.r);
    const c = Number(td.dataset.c);
    if (e.shiftKey) {
      selEnd = { r, c };
    } else {
      selStart = { r, c };
      selEnd = { r, c };
      isSelecting = true;
    }
    td.focus();
    renderGridValues();
  });

  tableEl.addEventListener('mousemove', (e) => {
    if (!isSelecting) return;
    const td = e.target.closest('td.sh-cell');
    if (!td) return;
    selEnd = { r: Number(td.dataset.r), c: Number(td.dataset.c) };
    renderGridValues();
  });

  window.addEventListener('mouseup', () => { isSelecting = false; });

  tableEl.addEventListener('dblclick', (e) => {
    const td = e.target.closest('td.sh-cell');
    if (td) startInlineEdit(td.dataset.cellAddress);
  });

  tableEl.addEventListener('keydown', (e) => {
    if (editingAddr) return;
    if (e.ctrlKey && e.key.toLowerCase() === 'c') { e.preventDefault(); doCopy(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === 'v') { e.preventDefault(); doPaste(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); doSave(); return; }

    if (e.key === 'ArrowDown') { e.preventDefault(); selStart.r = Math.min(engine.rows - 1, selStart.r + 1); selEnd = { ...selStart }; renderGridValues(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); selStart.r = Math.max(0, selStart.r - 1); selEnd = { ...selStart }; renderGridValues(); return; }
    if (e.key === 'ArrowRight' || e.key === 'Tab') { e.preventDefault(); selStart.c = Math.min(engine.cols - 1, selStart.c + 1); selEnd = { ...selStart }; renderGridValues(); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); selStart.c = Math.max(0, selStart.c - 1); selEnd = { ...selStart }; renderGridValues(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      pushUndo();
      const b = getSelectionBounds();
      for (let r = b.r1; r <= b.r2; r++) {
        for (let c = b.c1; c <= b.c2; c++) engine.setRaw(addrOf(r, c), '');
      }
      commitChange();
      return;
    }
    if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      startInlineEdit(activeAddr());
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      startInlineEdit(activeAddr(), e.key);
    }
  });

  formulaIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const a = activeAddr();
      if (formulaIn.value !== engine.getRaw(a)) {
        pushUndo();
        engine.setRaw(a, formulaIn.value);
        commitChange();
      }
      selStart.r = Math.min(engine.rows - 1, selStart.r + 1);
      selEnd = { ...selStart };
      renderGridValues();
    } else if (e.key === 'Escape') {
      formulaIn.value = engine.getRaw(activeAddr());
    }
  });

  bodyEl.querySelector('.sheet-toolbar').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'save') doSave();
    else if (act === 'copy') doCopy();
    else if (act === 'paste') doPaste();
    else if (act === 'undo') doUndo();
    else if (act === 'redo') doRedo();
    else if (act === 'new') {
      confirmIfDirty(() => {
        engine = new SpreadsheetEngine(null);
        filePath = `/Documents/工作簿_${++os.workbookSeq}.sheet`;
        fileName = filePath.split('/').pop();
        dirty = false;
        version += 1;
        updateTitle();
        renderGridValues();
        os.publishWorkbookUpdate(docEntry);
      });
    } else if (act === 'open') {
      const target = fnInput.value.trim();
      if (!target) return;
      confirmIfDirty(() => {
        loadFromPath(target);
        version += 1;
        updateTitle();
        renderGridValues();
        os.publishWorkbookUpdate(docEntry);
      });
    }
  });

  buildTable();
  updateTitle();
  renderGridValues();
  // Immediately announce workbook availability to subsystems
  os.publishWorkbookUpdate(docEntry);

  return {
    beforeClose: (allowClose) => confirmIfDirty(allowClose),
    destroy: () => {
      os.openWorkbooks.delete(docId);
      os.publishWorkbookClosed(docId);
    },
  };
}
