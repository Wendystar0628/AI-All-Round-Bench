// 根系统：电子表格（公式、依赖重算、撤销重做、数据连接发布）
export function mountSheet(win, api) {
  const fs = api.fs;
  let path = '/Demo/sample.sheet';
  let wb = null;
  let dirty = false;
  let sel = { r: 1, c: 0 };
  let range = null;
  let undoStack = [], redoStack = [];
  let recalcQueue = [];
  let msg = '';
  win.bar.querySelector('.wtitle').textContent = '电子表格';

  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;background:#121826;color:#e8ecf4;font:13px "Microsoft YaHei",sans-serif';
  el.innerHTML = `
    <div style="display:flex;gap:4px;padding:5px 6px;background:#1c2433;border-bottom:1px solid #33405a;align-items:center">
      <button data-a="new" class="sbtn">新建</button>
      <button data-a="open" class="sbtn">打开</button>
      <button data-a="save" class="sbtn">保存</button>
      <button data-a="saveas" class="sbtn">另存为</button>
      <button data-a="undo" class="sbtn">撤销</button>
      <button data-a="redo" class="sbtn">重做</button>
      <button data-a="copy" class="sbtn">复制</button>
      <button data-a="paste" class="sbtn">粘贴</button>
      <span id="fname" style="color:#ffd23f;margin-left:6px"></span>
      <span id="dirty" style="color:#ff5d6c;margin-left:4px"></span>
    </div>
    <div style="display:flex;align-items:center;gap:6px;padding:4px 6px;background:#0e1420;border-bottom:1px solid #223">
      <span style="color:#93a1bb;font-size:12px">fx</span>
      <input id="fbar" style="flex:1;background:#0a0f18;border:1px solid #33405a;border-radius:5px;color:#e8ecf4;padding:3px 8px;font-size:13px" />
      <span id="cellref" style="color:#8b6cff;font-size:12px;width:60px"></span>
    </div>
    <div id="grid" style="flex:1;overflow:auto;background:#0e1420;position:relative"></div>
    <div id="st" style="flex:0 0 22px;background:#1c2433;color:#43d9a3;font-size:12px;padding:2px 8px"></div>
    <style>.sbtn{background:#232d3f;border:1px solid #33405a;color:#e8ecf4;border-radius:5px;padding:2px 9px;font-size:12px;cursor:pointer}.sbtn:hover{background:#2f3c5c}
    #grid{table-layout:fixed;border-collapse:collapse;font-size:12px}
    #grid td{border:1px solid #22304a;height:22px;padding:0 4px;white-space:nowrap;overflow:hidden;max-width:120px;background:#101623}
    #grid td.h{background:#1c2433;color:#93a1bb;text-align:center;font-size:11px}
    #grid td.sel{outline:2px solid #8b6cff;outline-offset:-2px}
    #grid td.inrange{background:#1b2440}
    </style>`;
  win.body.appendChild(el);
  const grid = el.querySelector('#grid');
  const fbar = el.querySelector('#fbar');
  const st = el.querySelector('#st');
  const cellref = el.querySelector('#cellref');
  const fname = el.querySelector('#fname');
  const dirtyEl = el.querySelector('#dirty');

  function colName(c) { let s = ''; c++; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
  function ref(r, c) { return colName(c) + (r + 1); }

  function newBook() {
    wb = { name: '未命名.sheet', cells: {}, values: {}, colWidths: {} };
    dirty = false;
    recalcAll();
    render();
  }

  function load(p) {
    const c = fs.read(p);
    if (c === null) { msg = '文件不存在: ' + p; render(); return; }
    try { wb = JSON.parse(c); wb.cells = wb.cells || {}; wb.values = wb.values || {}; path = p; dirty = false; recalcAll(); render(); msg = '已打开 ' + p; }
    catch (e) { msg = '文件损坏'; }
  }

  function save(p) {
    path = p || path;
    const r = fs.write(path, JSON.stringify(wb));
    if (r) { msg = '保存失败: ' + r; }
    else { dirty = false; msg = '已保存 ' + path; api.host.publishDataVersion(path); }
    render();
  }

  function pushUndo() {
    undoStack.push(JSON.stringify(wb));
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
  }

  // ---------------- 公式引擎 ----------------
  function tokenize(s) {
    const toks = []; let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === ' ') { i++; continue; }
      if (/[0-9.]/.test(ch)) { let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; toks.push({ t: 'num', v: parseFloat(s.slice(i, j)) }); i = j; continue; }
      if (/[A-Za-z]/.test(ch)) {
        let j = i; while (j < s.length && /[A-Za-z0-9]/.test(s[j])) j++;
        const w = s.slice(i, j);
        if (/^[A-Za-z]+[0-9]+$/.test(w)) toks.push({ t: 'ref', v: w.toUpperCase() });
        else toks.push({ t: 'fn', v: w.toUpperCase() });
        i = j; continue;
      }
      if (ch === ':') { toks.push({ t: ':' }); i++; continue; }
      if ('+-*/(),'.includes(ch)) { toks.push({ t: ch }); i++; continue; }
      throw new Error('无法识别的字符 ' + ch);
    }
    toks.push({ t: 'eof' });
    return toks;
  }

  function evalFormula(s) {
    const toks = tokenize(s);
    let pos = 0;
    const peek = () => toks[pos];
    const next = () => toks[pos++];
    function primary() {
      const t = next();
      if (t.t === 'num') return t.v;
      if (t.t === '(') { const v = expr(); if (next().t !== ')') throw new Error('缺少 )'); return v; }
      if (t.t === '-') return -primary();
      if (t.t === 'fn') {
        if (next().t !== '(') throw new Error('函数缺少括号');
        const args = [];
        if (peek().t !== ')') {
          for (;;) {
            const a = next();
            if (a.t === 'ref' && peek().t === ':') {
              next(); const b = next();
              if (b.t !== 'ref') throw new Error('区域无效');
              args.push({ range: [a.v, b.v] });
            } else if (a.t === 'ref') args.push({ cell: a.v });
            else if (a.t === 'num') args.push(a.v);
            else throw new Error('参数无效');
            if (peek().t === ',') { next(); continue; }
            break;
          }
        }
        if (next().t !== ')') throw new Error('缺少 )');
        return callFn(t.v, args);
      }
      if (t.t === 'ref') return cellValue(t.v);
      throw new Error('表达式无效');
    }
    function expr() {
      let v = term();
      while (peek().t === '+' || peek().t === '-') { const op = next().t; const r = term(); v = op === '+' ? v + r : v - r; }
      return v;
    }
    function term() {
      let v = unary();
      while (peek().t === '*' || peek().t === '/') { const op = next().t; const r = unary(); if (op === '/') { if (r === 0) throw new Error('#DIV/0!'); v = v / r; } else v = v * r; }
      return v;
    }
    function unary() {
      if (peek().t === '-') { next(); return -unary(); }
      return primary();
    }
    function callFn(name, args) {
      const nums = [];
      for (const a of args) {
        if (a.range) nums.push(...rangeValues(a.range[0], a.range[1]));
        else if (a.cell) nums.push(cellValue(a.cell));
        else nums.push(a);
      }
      if (name === 'SUM') return nums.reduce((x, y) => x + y, 0);
      if (name === 'AVG') { if (!nums.length) throw new Error('#DIV/0!'); return nums.reduce((x, y) => x + y, 0) / nums.length; }
      if (name === 'MIN') return Math.min(...nums);
      if (name === 'MAX') return Math.max(...nums);
      if (name === 'COUNT') return nums.length;
      throw new Error('未知函数 ' + name);
    }
    const v = expr();
    if (peek().t !== 'eof') throw new Error('表达式多余内容');
    return v;
  }

  function parseRef(r) {
    const m = r.match(/^([A-Z]+)([0-9]+)$/);
    if (!m) throw new Error('#REF!');
    let c = 0; for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
    return { r: parseInt(m[2], 10) - 1, c: c - 1 };
  }
  function rangeValues(a, b) {
    const p1 = parseRef(a), p2 = parseRef(b);
    const out = [];
    for (let r = Math.min(p1.r, p2.r); r <= Math.max(p1.r, p2.r); r++)
      for (let c = Math.min(p1.c, p2.c); c <= Math.max(p1.c, p2.c); c++) {
        const v = cellValue(ref(r, c));
        if (typeof v === 'number' && isFinite(v)) out.push(v);
      }
    return out;
  }
  function cellValue(rf) {
    const v = wb.values[rf];
    return typeof v === 'number' ? v : 0;
  }

  function depsOf(rf) {
    const cell = wb.cells[rf];
    const out = [];
    if (cell && cell.f) {
      const m = cell.f.match(/([A-Z]+[0-9]+):([A-Z]+[0-9]+)/g) || [];
      for (const rg of m) { const [a, b] = rg.split(':'); const p1 = parseRef(a), p2 = parseRef(b); for (let r = Math.min(p1.r, p2.r); r <= Math.max(p1.r, p2.r); r++) for (let c = Math.min(p1.c, p2.c); c <= Math.max(p1.c, p2.c); c++) out.push(ref(r, c)); }
      const single = cell.f.replace(/([A-Z]+[0-9]+):([A-Z]+[0-9]+)/g, '').match(/[A-Z]+[0-9]+/g) || [];
      for (const s of single) out.push(s);
    }
    return out;
  }

  function recalcAll() {
    recalcQueue = [];
    for (let r = 0; r < 60; r++) for (let c = 0; c < 20; c++) recalcQueue.push(ref(r, c));
  }
  function recalcFrom(rf) {
    recalcQueue.push(rf);
    // 依赖传递
    const seen = new Set();
    const stack = [rf];
    while (stack.length) {
      const cur = stack.pop();
      for (const k in wb.cells) {
        if (seen.has(k)) continue;
        if (depsOf(k).includes(cur)) { seen.add(k); stack.push(k); recalcQueue.push(k); }
      }
    }
  }

  // 按预算分步重算（预算不足时保留进度）
  function pump() {
    let budget = (api.host.root && api.host.root.appBudget) || 3000;
    let n = 0;
    while (recalcQueue.length && budget > 0 && n < 4000) {
      const rf = recalcQueue.shift();
      const cell = wb.cells[rf];
      budget -= 2; n++;
      api.host.chargeRoot(2);
      if (cell && cell.f) {
        try { wb.values[rf] = evalFormula(cell.f.slice(1)); }
        catch (e) { wb.values[rf] = String(e.message || '错误'); }
      } else if (cell) {
        wb.values[rf] = cell.v;
      } else wb.values[rf] = undefined;
    }
    if (recalcQueue.length === 0 && dirty && path) {
      api.host.publishDataVersion(path);
    }
    if (n) render();
  }
  setInterval(pump, 50);

  // ---------------- 渲染 ----------------
  function render() {
    fname.textContent = path;
    dirtyEl.textContent = dirty ? '● 未保存' : '';
    st.textContent = msg || (range ? `区域 ${rangeText()}` : '');
    msg = '';
    const ROWS = 40, COLS = 12;
    let html = '<table style="width:100%"><tr><td class="h" style="width:34px"></td>';
    for (let c = 0; c < COLS; c++) html += `<td class="h">${colName(c)}</td>`;
    html += '</tr>';
    for (let r = 0; r < ROWS; r++) {
      html += `<tr><td class="h">${r + 1}</td>`;
      for (let c = 0; c < COLS; c++) {
        const rf = ref(r, c);
        const cell = wb.cells[rf];
        const val = wb.values[rf];
        let text = '';
        if (cell && cell.f) text = '=' + String(cell.f).slice(1);
        else if (val !== undefined && val !== null) text = String(val);
        const fmt = wb.formats && wb.formats[rf] ? wb.formats[rf] : {};
        const cls = (sel.r === r && sel.c === c) ? 'sel' : (range && inRange(r, c) ? 'inrange' : '');
        html += `<td class="${cls}" data-r="${r}" data-c="${c}" style="${fmt.bold ? 'font-weight:bold;' : ''}${fmt.color ? 'color:' + fmt.color + ';' : ''}${fmt.bg ? 'background:' + fmt.bg + ';' : ''}">${escapeHtml(text)}</td>`;
      }
      html += '</tr>';
    }
    html += '</table>';
    grid.innerHTML = html;
    cellref.textContent = ref(sel.r, sel.c);
    grid.querySelectorAll('td[data-r]').forEach(td => {
      td.onmousedown = (e) => {
        const r = +td.dataset.r, c = +td.dataset.c;
        if (e.shiftKey && range) { range.r2 = r; range.c2 = c; }
        else { sel = { r, c }; range = { r1: r, c1: c, r2: r, c2: c }; }
        fbar.value = cellText(ref(sel.r, sel.c));
        render();
      };
      td.ondblclick = () => {
        const rf = ref(+td.dataset.r, +td.dataset.c);
        const v = prompt('输入值或公式（以 = 开头）', cellText(rf));
        if (v !== null) setCell(rf, v);
      };
    });
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
  function inRange(r, c) { return range && r >= Math.min(range.r1, range.r2) && r <= Math.max(range.r1, range.r2) && c >= Math.min(range.c1, range.c2) && c <= Math.max(range.c1, range.c2); }
  function rangeText() { return ref(Math.min(range.r1, range.r2), Math.min(range.c1, range.c2)) + ':' + ref(Math.max(range.r1, range.r2), Math.max(range.c1, range.c2)); }
  function cellText(rf) { const cell = wb.cells[rf]; if (!cell) return ''; return cell.f || (cell.v === undefined || cell.v === null ? '' : String(cell.v)); }

  function setCell(rf, v) {
    pushUndo();
    wb.cells[rf] = wb.cells[rf] || {};
    if (v.startsWith('=')) { wb.cells[rf].f = v; delete wb.cells[rf].v; }
    else {
      const n = Number(v);
      wb.cells[rf].v = v === '' ? undefined : (isFinite(n) && v.trim() !== '' ? n : v);
      delete wb.cells[rf].f;
      if (v === '') delete wb.cells[rf];
    }
    dirty = true;
    recalcFrom(rf);
    msg = '已修改 ' + rf;
    render();
  }

  fbar.onkeydown = (e) => {
    if (e.key === 'Enter') { setCell(ref(sel.r, sel.c), fbar.value); }
  };

  el.querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'new') { if (dirty && !confirm('有未保存修改，放弃吗？')) return; newBook(); msg = '已新建工作簿'; render(); }
      else if (a === 'open') { const p = prompt('工作簿路径', path); if (p) { if (dirty && !confirm('有未保存修改，放弃吗？')) return; load(p); } }
      else if (a === 'save') { if (path === '未命名.sheet') { const p = prompt('保存路径', '/Documents/未命名.sheet'); save(p || path); } else save(); api.refreshIcons(); }
      else if (a === 'saveas') { const p = prompt('另存为', path.replace('.sheet', ' 副本.sheet')); if (p) save(p); api.refreshIcons(); }
      else if (a === 'undo') { if (!undoStack.length) { msg = '没有可撤销的操作'; render(); return; } redoStack.push(JSON.stringify(wb)); wb = JSON.parse(undoStack.pop()); recalcAll(); dirty = true; render(); }
      else if (a === 'redo') { if (!redoStack.length) { msg = '没有可重做的操作'; render(); return; } undoStack.push(JSON.stringify(wb)); wb = JSON.parse(redoStack.pop()); recalcAll(); dirty = true; render(); }
      else if (a === 'copy') { if (range) { nav.clipboard.writeText(rangeText() + '|' + JSON.stringify(selRangeData())); msg = '已复制 ' + rangeText(); } render(); }
      else if (a === 'paste') {
        if (!nav.clipboard.readText) { msg = '请用 Ctrl+V'; render(); return; }
        nav.clipboard.readText().then(t => { if (t) applyPaste(t); });
      }
    };
  });

  function selRangeData() {
    const out = [];
    for (let r = Math.min(range.r1, range.r2); r <= Math.max(range.r1, range.r2); r++) {
      const row = [];
      for (let c = Math.min(range.c1, range.c2); c <= Math.max(range.c1, range.c2); c++) row.push(cellText(ref(r, c)));
      out.push(row);
    }
    return out;
  }
  function applyPaste(t) {
    try {
      const idx = t.indexOf('|');
      if (idx < 0) return;
      const data = JSON.parse(t.slice(idx + 1));
      pushUndo();
      data.forEach((row, i) => row.forEach((v, j) => {
        const rf = ref(sel.r + i, sel.c + j);
        wb.cells[rf] = wb.cells[rf] || {};
        if (String(v).startsWith('=')) { wb.cells[rf].f = v; delete wb.cells[rf].v; }
        else { const n = Number(v); wb.cells[rf].v = v === '' ? undefined : (isFinite(n) && v.trim() !== '' ? n : v); delete wb.cells[rf].f; }
      }));
      dirty = true; recalcAll(); msg = '已粘贴'; render();
    } catch (e) { msg = '粘贴内容无法识别'; render(); }
  }

  window.addEventListener('keydown', (e) => {
    if (document.activeElement === fbar) return;
    if (!win.el.contains(document.activeElement) && document.activeElement !== document.body) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') { if (range) { e.preventDefault(); nav.clipboard.writeText(rangeText() + '|' + JSON.stringify(selRangeData())); msg = '已复制 ' + rangeText(); render(); } }
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') { e.preventDefault(); nav.clipboard.readText().then(t2 => { if (t2) applyPaste(t2); }); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); el.querySelector('[data-a="undo"]').click(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); el.querySelector('[data-a="redo"]').click(); }
  });

  load(path);
  win.api = { openPath: (p) => load(p), dispose: () => { } };
}
