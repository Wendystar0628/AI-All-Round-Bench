// ===========================================================================
//  apps.js —— 根系统应用
// ===========================================================================
(function () {
  const U = window.U, I = window.Icons;
  const fsMod = window.require('fs'), pathMod = window.require('path');
  const Store = window.Store;

  // =========================================================================
  //  文件管理器
  // =========================================================================
  const files = {
    create(body, win, desk, arg) {
      const st = { path: (arg && arg.path) || '/', sel: new Set(), clip: null, hist: [] };
      const root = U.el('div', { class: 'app-root' });
      const bar = U.el('div', { class: 'toolbar' });
      const side = U.el('div', { class: 'fm-side' });
      const main = U.el('div', { class: 'fm-main' });
      const crumb = U.el('div', { class: 'crumb' });
      const grid = U.el('div', { class: 'fm-grid', dataset: { testid: 'files-list' } });
      const status = U.el('div', { class: 'statusbar' });
      root.append(bar, U.el('div', { class: 'fm' }, [side, U.el('div', { class: 'fm-main' }, [U.el('div', { class: 'toolbar', style: { borderBottom: 'none' } }, [crumb]), grid, status])]));
      body.appendChild(root);
      const fs = desk.root.fs;
      const navs = [['home', '主目录', '/'], ['folder', '文档', '/Documents'], ['download', '下载', '/Downloads'], ['image', '图片', '/Pictures'], ['folder', '示例', '/Demo'], ['trash', '回收站', '/Recycle Bin'], ['systems', '系统', '/Systems']];
      let navSel = '/';
      function buildSide() {
        side.innerHTML = '';
        for (const [ic, label, p] of navs) {
          const n = U.el('div', { class: 'fm-nav' + (st.path === p ? ' active' : ''), dataset: { testid: 'files-nav', filePath: p } }, [U.el('span', { html: I.icon(ic, 15) }), U.el('span', { text: label })]);
          n.addEventListener('click', () => { st.path = p; st.sel.clear(); refresh(); });
          side.appendChild(n);
        }
        side.appendChild(U.el('div', { class: 'sep' }));
        side.appendChild(U.el('div', { class: 'label', style: { padding: '4px 9px' }, text: '存储' }));
        const used = Object.values(fs).reduce((a, k) => a + (k.d ? k.d.length : 0), 0);
        side.appendChild(U.el('div', { class: 'label', style: { padding: '0 9px 6px', whiteSpace: 'normal' }, text: U.fmtBytes(used) + ' / ' + U.fmtBytes(8 * 1024 * 1024) }));
      }
      function listDir(p) {
        const prefix = p === '/' ? '/' : p.replace(/\/$/, '') + '/';
        const out = {};
        for (const k in fs) {
          if (k === p || k.indexOf(prefix) !== 0) continue;
          const rest = k.slice(prefix.length);
          if (!rest) continue;
          const i = rest.indexOf('/');
          const name = i < 0 ? rest : rest.slice(0, i);
          if (!out[name]) out[name] = { name, dir: i >= 0, size: i >= 0 ? 0 : (fs[k].d || '').length, path: (p === '/' ? '' : p) + '/' + name };
        }
        return Object.values(out).sort((a, b) => (a.dir !== b.dir ? (a.dir ? -1 : 1) : a.name.localeCompare(b.name, 'zh-CN')));
      }
      function refresh() {
        buildSide();
        const items = listDir(st.path);
        grid.innerHTML = '';
        for (const it of items) {
          const el = U.el('div', { class: 'fi' + (st.sel.has(it.path) ? ' sel' : ''), dataset: { testid: 'files-item', filePath: it.path } }, [
            U.el('div', { class: 'im', html: I.icon(it.dir ? 'folder' : (it.name.endsWith('.sheet') ? 'spreadsheet' : 'file'), 22) }),
            U.el('div', { class: 'nm', text: it.name })
          ]);
          el.addEventListener('click', (e) => {
            if (!e.ctrlKey) st.sel.clear();
            st.sel.add(it.path); refresh();
          });
          el.addEventListener('dblclick', () => { it.dir ? (st.path = it.path, st.sel.clear(), refresh()) : desk.openFile(it.path); });
          el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            st.sel.clear(); st.sel.add(it.path); refresh();
            const acts = [{ label: '打开', icon: 'folder', action: () => (it.dir ? (st.path = it.path, refresh()) : desk.openFile(it.path)) }];
            if (!it.dir) acts.push({ label: '复制', icon: 'copy', action: () => { st.clip = { mode: 'copy', path: it.path }; desk.toast('已复制'); } });
            if (st.path !== '/Recycle Bin') acts.push({ label: '删除', icon: 'trash', action: () => del(it) });
            else acts.push({ label: '恢复', icon: 'upload', action: () => restore(it) });
            desk.showContext(e.clientX, e.clientY, acts);
          });
          grid.appendChild(el);
        }
        if (!items.length) grid.appendChild(U.el('div', { class: 'empty', text: '这个文件夹是空的' }));
        crumb.innerHTML = '';
        const parts = st.path.split('/').filter(Boolean);
        const home = U.el('span', { class: 'seg', text: '主目录' });
        home.addEventListener('click', () => { st.path = '/'; refresh(); });
        crumb.appendChild(home);
        let acc = '';
        for (const p of parts) {
          acc += '/' + p;
          crumb.appendChild(U.el('span', { class: 'sep2', text: '›' }));
          const s = U.el('span', { class: 'seg', text: p });
          const pp = acc;
          s.addEventListener('click', () => { st.path = pp; refresh(); });
          crumb.appendChild(s);
        }
        const n = st.sel.size;
        status.innerHTML = '';
        status.appendChild(U.el('span', { text: items.length + ' 项' + (n ? ' · 已选 ' + n + ' 项' : '') }));
        if (st.clip) status.appendChild(U.el('span', { class: 'badge', text: '剪贴板：' + st.clip.path.split('/').pop() }));
      }
      function del(it) {
        if (st.path === '/Recycle Bin') {
          const r = window.RootFSDelete(fs, it.path);
          desk.toast(r ? '已彻底删除' : '删除失败');
          refresh(); return;
        }
        const node = fs[it.path];
        if (!node) return;
        const name = it.path.split('/').pop();
        const dst = '/Recycle Bin/' + name + '.' + Date.now().toString(36);
        fs[dst] = JSON.parse(JSON.stringify(node));
        fs[dst].origin = it.path;
        delete fs[it.path];
        Store.save();
        desk.notify('文件操作', '已删除 ' + name + '，可在回收站恢复', 'trash');
        st.sel.clear(); refresh();
      }
      function restore(it) {
        const node = fs[it.path];
        if (!node) return;
        const target = node.origin || ('/Documents/' + it.path.split('/').pop());
        fs[target] = JSON.parse(JSON.stringify(node));
        delete fs[target].origin;
        delete fs[it.path];
        Store.save();
        desk.toast('已恢复到 ' + target);
        refresh();
      }
      function paste() {
        if (!st.clip) return;
        const name = st.clip.path.split('/').pop();
        const target = (st.path === '/' ? '' : st.path) + '/' + name;
        if (fs[target]) return desk.toast('目标已存在同名项', 'err');
        fs[target] = JSON.parse(JSON.stringify(fs[st.clip.path]));
        if (st.clip.mode === 'cut') delete fs[st.clip.path];
        Store.save(); refresh();
      }
      const mkBtn = (label, ic, fn, testid) => {
        const b = U.el('button', { class: 'btn sm', dataset: { testid }, html: I.icon(ic, 14) + ' ' + label });
        b.addEventListener('click', fn); bar.appendChild(b); return b;
      };
      mkBtn('新建文件', 'file', () => {
        const name = '新建文本' + (Object.keys(fs).filter((k) => k.startsWith(st.path + '/新建文本')).length + 1) + '.txt';
        fs[(st.path === '/' ? '' : st.path) + '/' + name] = { d: '', k: 'text', m: Date.now() };
        Store.save(); refresh();
      }, 'files-new-file');
      mkBtn('新建文件夹', 'folder', () => {
        const name = '新建文件夹' + (Object.keys(fs).filter((k) => k.startsWith(st.path + '/新建文件夹')).length + 1);
        fs[(st.path === '/' ? '' : st.path) + '/' + name] = { d: '', k: 'dir', m: Date.now() };
        Store.save(); refresh();
      }, 'files-new-folder');
      mkBtn('复制', 'copy', () => { const it = [...st.sel][0]; if (it) { st.clip = { mode: 'copy', path: it }; desk.toast('已复制'); } }, 'files-copy');
      mkBtn('粘贴', 'paste', paste, 'files-paste');
      mkBtn('删除', 'trash', () => { for (const p of [...st.sel]) { const node = fs[p]; if (node) del({ path: p }); } refresh(); }, 'files-delete');
      mkBtn('打开', 'folder', () => { const it = [...st.sel][0]; if (it) desk.openFile(it); }, 'files-open');
      win.app = {
        onKey(e) {
          if (e.ctrlKey && e.key === 'c') { const it = [...st.sel][0]; if (it) { st.clip = { mode: 'copy', path: it }; desk.toast('已复制'); } return true; }
          if (e.ctrlKey && e.key === 'v') { paste(); return true; }
          if (e.key === 'Backspace') { for (const p of [...st.sel]) { if (fs[p]) del({ path: p }); } refresh(); return true; }
          if (e.key === 'F5') { refresh(); return true; }
          return false;
        }
      };
      refresh();
      return win.app;
    }
  };
  window.RootFSDelete = (fs, p) => { if (!fs[p]) return false; delete fs[p]; return true; };

  // =========================================================================
  //  电子表格
  // =========================================================================
  const sheetEngine = {
    colName(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; },
    colIndex(s) { let n = 0; for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64); return n; },
    parseAddr(a) {
      const m = /^([A-Z]+)(\d+)$/.exec(String(a).trim().toUpperCase());
      if (!m) return null;
      return { c: this.colIndex(m[1]), r: parseInt(m[2], 10) };
    },
    addr(c, r) { return this.colName(c) + r; }
  };
  class SheetDoc {
    constructor(name) { this.name = name || '未命名'; this.cells = {}; this.cols = 12; this.rows = 40; this.version = 0; this.err = null; }
    raw(addr) { const c = this.cells[addr]; return c ? (c.f != null ? c.f : c.v) : ''; }
    setRaw(addr, raw) {
      const s = String(raw == null ? '' : raw);
      if (s === '') { delete this.cells[addr]; return; }
      if (s[0] === '=') this.cells[addr] = { f: s.slice(1) };
      else {
        const n = parseFloat(s);
        this.cells[addr] = { v: (isNaN(n) || String(n) !== s.trim()) ? s : n };
      }
    }
    // 递归求值（带循环检测）
    value(addr, stack) {
      const c = this.cells[addr];
      if (!c) return 0;
      if (c.f != null) {
        if (stack && stack.has(addr)) return '#循环依赖';
        const st = stack ? new Set(stack) : new Set();
        st.add(addr);
        try { return this.evalExpr(c.f, st); } catch (e) { return '#错误'; }
      }
      return c.v;
    }
    evalExpr(src, stack) {
      const toks = [];
      let i = 0;
      while (i < src.length) {
        const ch = src[i];
        if (ch === ' ') { i++; continue; }
        if (ch >= '0' && ch <= '9' || ch === '.') { let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++; toks.push({ t: 'num', v: parseFloat(src.slice(i, j)) }); i = j; continue; }
        if (/[A-Za-z]/.test(ch)) { let j = i; while (j < src.length && /[A-Za-z0-9]/.test(src[j])) j++; toks.push({ t: 'id', v: src.slice(i, j).toUpperCase() }); i = j; continue; }
        if (':+*/(),-'.indexOf(ch) >= 0) { toks.push({ t: ch }); i++; continue; }
        throw new Error('无法识别 ' + ch);
      }
      let p = 0;
      const peek = () => toks[p], eat = (t) => { if (toks[p] && toks[p].t === t) { p++; return true; } return false; };
      const isAddr = (s) => /^[A-Z]+\d+$/.test(s);
      const isCol = (s) => /^[A-Z]+$/.test(s);
      const parsePrimary = () => {
        const tk = peek();
        if (!tk) throw new Error('表达式不完整');
        if (tk.t === 'num') { p++; return tk.v; }
        if (tk.t === '(') { p++; const v = parseExpr(); eat(')'); return v; }
        if (tk.t === 'id') {
          const name = tk.v; p++;
          if (eat('(')) {
            const args = [];
            if (!eat(')')) { do { args.push(parseRangeOrExpr()); } while (eat(',')); eat(')'); }
            if (name === 'SUM') {
              let s = 0;
              for (const a of args) {
                if (Array.isArray(a)) for (const row of a) for (const v of row) s += typeof v === 'number' ? v : 0;
                else s += typeof a === 'number' ? a : 0;
              }
              return s;
            }
            throw new Error('未知函数 ' + name);
          }
          if (eat(':')) {
            const b = peek(); if (!b) throw new Error('区域不完整'); p++;
            if (isAddr(name) && isAddr(b.v)) return this.rangeValues(name, b.v, stack);
            if (isCol(name) && isCol(b.v)) return this.rangeValues(name + '1', b.v + this.rows, stack);
            throw new Error('无效区域');
          }
          if (isAddr(name)) return this.value(name, stack);
          throw new Error('无效引用 ' + name);
        }
        throw new Error('意外的符号');
      };
      const parseRangeOrExpr = () => {
        const save = p;
        if (peek() && peek().t === 'id') {
          const name = peek().v; p++;
          if (eat(':')) {
            const b = peek(); if (b) { p++; return this.rangeValues(name, b.v, stack); }
          }
          p = save;
        }
        return parseExpr();
      };
      const parseUnary = () => { if (eat('-')) return -parseUnary(); if (eat('+')) return parseUnary(); return parsePrimary(); };
      const parseMul = () => { let v = parseUnary(); while (peek() && (peek().t === '*' || peek().t === '/')) { const op = peek().t; p++; const r = parseUnary(); v = op === '*' ? v * r : (r === 0 ? '#除零' : v / r); } return v; };
      const parseAdd = () => { let v = parseMul(); while (peek() && (peek().t === '+' || peek().t === '-')) { const op = peek().t; p++; const r = parseMul(); v = op === '+' ? (typeof v === 'number' && typeof r === 'number' ? v + r : String(v) + String(r)) : v - r; } return v; };
      const parseExpr = () => parseAdd();
      const v = parseExpr();
      if (p < toks.length) throw new Error('多余的内容');
      return v;
    }
    rangeValues(a, b, stack) {
      const A = sheetEngine.parseAddr(a), B = sheetEngine.parseAddr(b);
      if (!A || !B) throw new Error('无效区域');
      const c1 = Math.min(A.c, B.c), c2 = Math.max(A.c, B.c), r1 = Math.min(A.r, B.r), r2 = Math.max(A.r, B.r);
      const out = [];
      for (let r = r1; r <= r2; r++) { const row = []; for (let c = c1; c <= c2; c++) row.push(this.value(sheetEngine.addr(c, r), stack)); out.push(row); }
      return out;
    }
    recalc() {
      const errs = {};
      for (const a in this.cells) { const v = this.value(a); if (typeof v === 'string' && v[0] === '#') errs[a] = v; }
      this.err = errs;
      this.version++;
      return errs;
    }
    serialize() { return JSON.stringify({ name: this.name, cols: this.cols, rows: this.rows, cells: this.cells }); }
    static load(s) { try { const o = JSON.parse(s); const d = new SheetDoc(o.name); d.cells = o.cells || {}; d.cols = o.cols || 12; d.rows = o.rows || 40; return d; } catch (e) { return new SheetDoc(); } }
  }
  window.SheetDoc = SheetDoc;
  window.sheetEngine = sheetEngine;

  const spreadsheet = {
    create(body, win, desk, arg) {
      const st = { doc: null, file: '', sel: 'A1', range: null, editing: false, undo: [], redo: [], dirtyDoc: false };
      const root = U.el('div', { class: 'app-root' });
      const bar = U.el('div', { class: 'formula-bar' });
      const ref = U.el('div', { class: 'cell-ref', dataset: { testid: 'sheet-cell' }, text: 'A1' });
      const input = U.el('input', { class: 'input grow', dataset: { testid: 'sheet-formula' }, placeholder: '输入内容或公式，例如 =SUM(D2:D4)' });
      const saveBtn = U.el('button', { class: 'btn sm primary', dataset: { testid: 'sheet-save' }, text: '保存' });
      const nameIn = U.el('input', { class: 'input', style: { width: '150px' }, dataset: { testid: 'sheet-filename' }, value: '未命名.sheet' });
      bar.append(ref, input, saveBtn, nameIn);
      const scroll = U.el('div', { class: 'sheet-scroll', dataset: { testid: 'sheet-grid' } });
      const table = U.el('table', { class: 'sheet-table' });
      scroll.appendChild(table);
      const status = U.el('div', { class: 'statusbar' });
      root.append(bar, U.el('div', { class: 'sheet-wrap' }, [scroll]), status);
      body.appendChild(root);
      st.doc = new SheetDoc();
      if (arg && arg.path) { const n = desk.root.fs[arg.path]; if (n) { st.doc = SheetDoc.load(n.d); st.file = arg.path; nameIn.value = arg.path.split('/').pop(); } }
      st.doc.recalc();
      function colCount() { return Math.min(26, Math.max(st.doc.cols, 8)); }
      function render() {
        const d = st.doc;
        const cols = colCount(), rows = Math.min(d.rows, 60);
        table.innerHTML = '';
        const thead = U.el('thead');
        const hr = U.el('tr');
        hr.appendChild(U.el('th', { class: 'corner', style: { width: '34px' } }));
        for (let c = 1; c <= cols; c++) hr.appendChild(U.el('th', { style: { width: '92px' }, text: sheetEngine.colName(c) }));
        thead.appendChild(hr); table.appendChild(thead);
        const tbody = U.el('tbody');
        for (let r = 1; r <= rows; r++) {
          const tr = U.el('tr');
          tr.appendChild(U.el('th', { class: 'rowh', text: String(r) }));
          for (let c = 1; c <= cols; c++) {
            const a = sheetEngine.addr(c, r);
            const v = d.value(a);
            const td = U.el('td', { dataset: { testid: 'sheet-cell', cellAddress: a } });
            if (typeof v === 'number') { td.textContent = (Math.round(v * 1000) / 1000).toString(); td.classList.add('num'); }
            else td.textContent = v == null ? '' : String(v);
            if (d.err && d.err[a]) td.classList.add('err');
            if (st.range) {
              const A = sheetEngine.parseAddr(st.range[0]), B = sheetEngine.parseAddr(st.range[1]);
              if (c >= Math.min(A.c, B.c) && c <= Math.max(A.c, B.c) && r >= Math.min(A.r, B.r) && r <= Math.max(A.r, B.r)) td.classList.add('inrange');
            }
            if (a === st.sel) td.classList.add('sel');
            td.addEventListener('mousedown', (e) => { e.preventDefault(); st.sel = a; st.range = null; if (e.shiftKey && st.anchor) st.range = [st.anchor, a]; else st.anchor = a; syncBar(); render(); });
            td.addEventListener('dblclick', () => startEdit(a));
            tbody.appendChild(tr);
          }
        }
        table.appendChild(tbody);
        syncBar();
      }
      function syncBar() {
        ref.textContent = st.sel;
        input.value = st.doc.raw(st.sel);
        win.setTitle && win.setTitle((st.file || '未命名') + (st.dirtyDoc ? ' *' : '') + ' — 电子表格');
        document.querySelectorAll('[data-testid="window-titlebar"] .t-title').forEach((n) => { if (n.closest('.app-window') === win.el) n.textContent = (st.file || '未命名') + (st.dirtyDoc ? ' *' : '') + ' — 电子表格'; });
      }
      function startEdit(addr, init) {
        st.sel = addr;
        st.editing = true;
        input.value = init != null ? init : st.doc.raw(addr);
        input.focus();
        if (init != null) input.setSelectionRange(input.value.length, input.value.length);
      }
      function commit() {
        const before = JSON.stringify(st.doc.cells);
        st.doc.setRaw(st.sel, input.value);
        const errs = st.doc.recalc();
        st.undo.push(before); st.redo = [];
        st.dirtyDoc = true;
        st.editing = false;
        publish();
        render();
        const e = errs[st.sel];
        if (e) desk.toast(st.sel + '：' + e, 'err');
      }
      function publish() { if (window.ChartHub) window.ChartHub.publish(st.file, st.doc); }
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); const a = sheetEngine.parseAddr(st.sel); if (a) { st.sel = sheetEngine.addr(a.c, a.r + 1); render(); } }
        else if (e.key === 'Escape') { st.editing = false; syncBar(); render(); }
        else if (e.key === 'Tab') { e.preventDefault(); commit(); const a = sheetEngine.parseAddr(st.sel); if (a) { st.sel = sheetEngine.addr(a.c + 1, a.r); render(); } }
        e.stopPropagation();
      });
      scroll.addEventListener('keydown', (e) => {
        if (st.editing) return;
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { startEdit(st.sel, e.key); e.preventDefault(); return; }
        if (e.key === 'Enter' || e.key === 'F2') { startEdit(st.sel); e.preventDefault(); return; }
        const a = sheetEngine.parseAddr(st.sel);
        if (!a) return;
        let { c, r } = a;
        if (e.key === 'ArrowUp') r = Math.max(1, r - 1);
        else if (e.key === 'ArrowDown') r = Math.min(st.doc.rows, r + 1);
        else if (e.key === 'ArrowLeft') c = Math.max(1, c - 1);
        else if (e.key === 'ArrowRight') c = Math.min(colCount(), c + 1);
        else if (e.ctrlKey && e.key.toLowerCase() === 'c') { copySel(); return; }
        else if (e.ctrlKey && e.key.toLowerCase() === 'v') { pasteSel(); return; }
        else if (e.ctrlKey && e.key.toLowerCase() === 'z') { undo(); return; }
        else if (e.ctrlKey && e.key.toLowerCase() === 'y') { redo(); return; }
        else if (e.ctrlKey && e.key.toLowerCase() === 's') { save(); return; }
        else return;
        st.sel = sheetEngine.addr(c, r); st.range = null; st.anchor = st.sel; render();
        e.preventDefault();
      });
      let clip = null;
      function copySel() {
        const a = sheetEngine.parseAddr(st.sel);
        clip = { v: st.doc.raw(st.sel) };
        if (st.range) {
          const A = sheetEngine.parseAddr(st.range[0]), B = sheetEngine.parseAddr(st.range[1]);
          const cells = [];
          for (let r = Math.min(A.r, B.r); r <= Math.max(A.r, B.r); r++) { const row = []; for (let c = Math.min(A.c, B.c); c <= Math.max(A.c, B.c); c++) row.push(st.doc.raw(sheetEngine.addr(c, r))); cells.push(row); }
          clip = { cells };
        }
        if (window.ChartHub) window.ChartHub.noteCopy(st.doc, st.sel, st.range);
        desk.toast('已复制');
      }
      function pasteSel() {
        if (!clip) return;
        const a = sheetEngine.parseAddr(st.sel);
        if (clip.cells) {
          const before = JSON.stringify(st.doc.cells);
          clip.cells.forEach((row, ri) => row.forEach((v, ci) => { st.doc.setRaw(sheetEngine.addr(a.c + ci, a.r + ri), v); }));
          st.doc.recalc(); st.undo.push(before); st.dirtyDoc = true; publish(); render();
        } else { st.doc.setRaw(st.sel, clip.v); st.doc.recalc(); st.dirtyDoc = true; publish(); render(); }
      }
      function undo() { if (!st.undo.length) return; st.redo.push(JSON.stringify(st.doc.cells)); st.doc.cells = JSON.parse(st.undo.pop()); st.doc.recalc(); st.dirtyDoc = true; publish(); render(); }
      function redo() { if (!st.redo.length) return; st.undo.push(JSON.stringify(st.doc.cells)); st.doc.cells = JSON.parse(st.redo.pop()); st.doc.recalc(); st.dirtyDoc = true; publish(); render(); }
      function save() {
        let p = st.file;
        if (!p) { p = '/Documents/' + nameIn.value; }
        const r = Store.fs.write(p, st.doc.serialize(), 'sheet');
        if (!r.ok) return desk.toast('保存失败：' + r.error, 'err');
        st.file = p; st.dirtyDoc = false;
        nameIn.value = p.split('/').pop();
        desk.notify('文件操作', '已保存工作簿 ' + nameIn.value, 'spreadsheet');
        render();
        window.ChartHub && window.ChartHub.registerDoc(p, st.doc);
      }
      saveBtn.addEventListener('click', save);
      nameIn.addEventListener('change', () => { if (!st.file) st.file = '/Documents/' + nameIn.value; });
      const newBtn = U.el('button', { class: 'btn sm', text: '新建', dataset: { testid: 'sheet-new' } });
      newBtn.addEventListener('click', () => { st.doc = new SheetDoc(); st.file = ''; nameIn.value = '未命名.sheet'; st.doc.recalc(); render(); });
      bar.appendChild(newBtn);
      win.app = {
        onKey(e) { if (e.ctrlKey && e.key.toLowerCase() === 's') { save(); return true; } return false; },
        onClose() {
          if (!st.dirtyDoc) return true;
          desk.modal({ title: '未保存的修改', body: '工作簿有未保存的修改，要先保存吗？', buttons: [{ label: '取消', value: 'cancel' }, { label: '放弃', value: 'drop' }, { label: '保存', value: 'save', primary: true }] }).then((v) => {
            if (v === 'save') { save(); win.el.remove(); }
            else if (v === 'drop') win.el.remove();
          });
          return false;
        }
      };
      st.doc.recalc();
      render();
      if (st.file) window.ChartHub && window.ChartHub.registerDoc(st.file, st.doc);
      return win.app;
    }
  };

  // =========================================================================
  //  小组件
  // =========================================================================
  const widgets = {
    state: { timer: { left: 0, running: false, total: 0 }, sw: { acc: 0, running: false, t0: 0 }, note: '', clip: [], dnd: false },
    create(body, win, desk) {
      const root = U.el('div', { class: 'app-root' });
      root.appendChild(this.buildPanel(desk, true));
      body.appendChild(root);
      return {};
    },
    buildPanel(desk, embedded) {
      const S = this.state;
      const wrap = U.el('div', { class: embedded ? 'app-root' : '' });
      const scroll = U.el('div', { class: 'sp-body', style: embedded ? { padding: '12px', height: '100%' } : {} });
      // 时钟与日历
      const clockCard = U.el('div', { class: 'card' }, [
        U.el('h4', { html: I.icon('clock', 14) + ' 时钟与日历' }),
        U.el('div', { class: 'big-clock', text: U.fmtClock() }),
        U.el('div', { class: 'big-date', text: U.fmtDate() + ' 星期' + '日一二三四五六'[new Date().getDay()] }),
        U.el('table', { class: 'cal' })
      ]);
      const cal = clockCard.querySelector('.cal');
      let calMonth = new Date().getMonth(), calYear = new Date().getFullYear();
      function drawCal() {
        const first = new Date(calYear, calMonth, 1);
        const start = (first.getDay() + 6) % 7;
        const days = new Date(calYear, calMonth + 1, 0).getDate();
        const prevDays = new Date(calYear, calMonth, 0).getDate();
        let html = '<tr><th>一</th><th>二</th><th>三</th><th>四</th><th>五</th><th>六</th><th>日</th></tr><tr>';
        for (let i = 0; i < 42; i++) {
          const d = i - start + 1;
          let cls = 'other', txt;
          if (d < 1) txt = prevDays + d;
          else if (d > days) txt = d - days;
          else { txt = d; cls = (d === new Date().getDate() && calMonth === new Date().getMonth() && calYear === new Date().getFullYear()) ? 'today' : ''; }
          if (i % 7 === 0 && i > 0) html += '</tr><tr>';
          html += '<td class="' + cls + '"><span>' + txt + '</span></td>';
        }
        cal.innerHTML = html + '</tr>';
      }
      const nav = U.el('div', { class: 'row', style: { marginTop: '6px' } });
      const prev = U.el('button', { class: 'btn sm', html: I.icon('chevronLeft', 13) });
      const next = U.el('button', { class: 'btn sm', html: I.icon('chevronRight', 13) });
      const lbl = U.el('span', { class: 'label grow', style: { textAlign: 'center' } });
      prev.addEventListener('click', () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } drawCal(); });
      next.addEventListener('click', () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } drawCal(); });
      nav.append(prev, lbl, next);
      clockCard.appendChild(nav);
      // 倒计时 / 秒表
      const tCard = U.el('div', { class: 'card' }, [U.el('h4', { html: I.icon('timer', 14) + ' 倒计时与秒表' })]);
      const disp = U.el('div', { class: 'timer-display', text: '0.00' });
      const inp = U.el('input', { class: 'input', dataset: { testid: 'widget-timer-input' }, placeholder: '秒', style: { width: '80px' } });
      const bStart = U.el('button', { class: 'btn sm primary', dataset: { testid: 'widget-timer-start' }, text: '开始' });
      const bPause = U.el('button', { class: 'btn sm', dataset: { testid: 'widget-timer-pause' }, text: '暂停' });
      const bReset = U.el('button', { class: 'btn sm', dataset: { testid: 'widget-timer-reset' }, text: '重置' });
      const swBtn = U.el('button', { class: 'btn sm', text: '秒表' });
      tCard.append(disp, U.el('div', { class: 'row' }, [inp, bStart, bPause, bReset, swBtn]));
      bStart.addEventListener('click', () => {
        const v = parseFloat(inp.value);
        if (!isNaN(v) && v > 0) { S.timer.total = v; S.timer.left = v; S.timer.running = true; desk.notify('倒计时', '已开始 ' + v + ' 秒倒计时', 'timer'); }
      });
      bPause.addEventListener('click', () => { S.timer.running = !S.timer.running; bPause.textContent = S.timer.running ? '暂停' : '继续'; });
      bReset.addEventListener('click', () => { S.timer.running = false; S.timer.left = 0; S.timer.total = 0; disp.textContent = '0.00'; });
      swBtn.addEventListener('click', () => { S.sw.running = !S.sw.running; if (S.sw.running) S.sw.t0 = Date.now(); swBtn.textContent = S.sw.running ? '停止' : '秒表'; });
      // 便笺
      const nCard = U.el('div', { class: 'card' }, [U.el('h4', { html: I.icon('note', 14) + ' 便笺' })]);
      const note = U.el('textarea', { class: 'input note-area', dataset: { testid: 'widget-note-text' }, placeholder: '记点什么…' });
      note.value = S.note;
      const nSave = U.el('button', { class: 'btn sm', dataset: { testid: 'widget-note-save' }, text: '保存' });
      nSave.addEventListener('click', () => { S.note = note.value; desk.toast('便笺已保存'); });
      nCard.append(note, nSave);
      // 剪贴板历史
      const cCard = U.el('div', { class: 'card' }, [U.el('h4', { html: I.icon('copy', 14) + ' 剪贴板历史' })]);
      const clipList = U.el('div', { dataset: { testid: 'widget-clipboard-list' } });
      cCard.appendChild(clipList);
      function drawClip() {
        clipList.innerHTML = '';
        if (!S.clip.length) clipList.appendChild(U.el('div', { class: 'hint', text: '还没有复制内容' }));
        S.clip.forEach((c, i) => {
          const it = U.el('div', { class: 'clip-item', text: c.length > 90 ? c.slice(0, 90) + '…' : c });
          it.addEventListener('click', () => { U.copyText(c); desk.toast('已复制到剪贴板'); });
          clipList.appendChild(it);
        });
      }
      // 快捷设置
      const qCard = U.el('div', { class: 'card' }, [U.el('h4', { html: I.icon('settings', 14) + ' 快捷设置' })]);
      const grid = U.el('div', { class: 'row', style: { flexWrap: 'wrap', gap: '10px' } });
      const mkToggle = (label, key, onChange) => {
        const row = U.el('div', { class: 'row', style: { gap: '8px', width: '46%' } }, [U.el('span', { class: 'label', text: label })]);
        const tg = U.el('div', { class: 'toggle ' + (desk.settings[key] ? 'on' : '') });
        tg.addEventListener('click', () => { desk.settings[key] = !desk.settings[key]; Store.set(key, desk.settings[key]); tg.classList.toggle('on', desk.settings[key]); onChange && onChange(); });
        row.appendChild(tg); grid.appendChild(row);
      };
      mkToggle('勿扰', 'dnd', () => desk.updateBadge());
      mkToggle('夜览', 'nightLight', () => desk.applySettings(desk.settings));
      mkToggle('无线网络', 'wifi');
      mkToggle('蓝牙', 'bluetooth');
      const saveToggle = U.el('div', { class: 'row', style: { gap: '8px', width: '46%' } }, [U.el('span', { class: 'label', text: '自动保存' })]);
      const tg2 = U.el('div', { class: 'toggle ' + (desk.settings.saveLocation ? 'on' : '') });
      tg2.addEventListener('click', () => { desk.settings.saveLocation = !desk.settings.saveLocation; Store.set('saveLocation', desk.settings.saveLocation); tg2.classList.toggle('on'); });
      saveToggle.appendChild(tg2); grid.appendChild(saveToggle);
      qCard.appendChild(grid);
      scroll.append(clockCard, tCard, nCard, cCard, qCard);
      wrap.appendChild(scroll);
      drawCal(); drawClip();
      const iv = setInterval(() => {
        if (!document.body.contains(disp)) return clearInterval(iv);
        clockCard.querySelector('.big-clock').textContent = U.fmtClock();
        if (S.timer.running && S.timer.left > 0) {
          S.timer.left = Math.max(0, S.timer.left - 0.1);
          disp.textContent = S.timer.left.toFixed(2);
          if (S.timer.left <= 0) { S.timer.running = false; desk.notify('倒计时', '时间到', 'timer'); }
        } else if (S.sw.running) {
          disp.textContent = ((Date.now() - S.sw.t0) / 1000).toFixed(2);
        }
        lbl.textContent = calYear + ' 年 ' + (calMonth + 1) + ' 月';
      }, 100);
      this._lastClip = S.clip;
      const clipIv = setInterval(() => { if (!document.body.contains(clipList)) return clearInterval(clipIv); if (S.clip !== this._lastClip) { this._lastClip = S.clip; drawClip(); } }, 500);
      return wrap;
    },
    buildNotifs(desk) {
      const wrap = U.el('div', { class: 'app-root' });
      const head = U.el('div', { class: 'sp-head' }, [U.el('div', { class: 't', text: '通知中心' })]);
      const body = U.el('div', { class: 'sp-body', dataset: { testid: 'widget-notifications' } });
      if (!desk.notifs.length) body.appendChild(U.el('div', { class: 'empty', text: '暂无通知' }));
      for (const n of desk.notifs) {
        const it = U.el('div', { class: 'notif-item' }, [
          U.el('span', { html: I.icon(n.icon || 'bell', 18) }),
          U.el('div', { class: 'grow' }, [U.el('div', { class: 'tt', text: n.title }), U.el('div', { class: 'tx', text: n.body })]),
          U.el('div', { class: 'tm', text: new Date(n.t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) })
        ]);
        body.appendChild(it);
      }
      const dnd = U.el('div', { class: 'card' }, [U.el('div', { class: 'row' }, [U.el('span', { class: 'grow', text: '勿扰模式' })])]);
      const tg = U.el('div', { class: 'toggle ' + (desk.settings.dnd ? 'on' : '') });
      tg.addEventListener('click', () => { desk.settings.dnd = !desk.settings.dnd; Store.set('dnd', desk.settings.dnd); tg.classList.toggle('on'); });
      dnd.firstChild.appendChild(tg);
      body.appendChild(dnd);
      const clear = U.el('button', { class: 'btn sm', text: '全部已读' });
      clear.addEventListener('click', () => { desk.notifs.forEach((n) => n.read = true); desk.updateBadge(); });
      head.appendChild(clear);
      wrap.append(head, body);
      return wrap;
    }
  };

  // =========================================================================
  //  编辑器（根系统）
  // =========================================================================
  const editor = {
    create(body, win, desk, arg) {
      const st = { file: (arg && arg.path) || '', text: '', dirtyDoc: false, readOnly: arg && arg.readOnly };
      const root = U.el('div', { class: 'app-root' });
      const bar = U.el('div', { class: 'toolbar' });
      const nameIn = U.el('input', { class: 'input', dataset: { testid: 'editor-filename' }, style: { width: '260px' }, value: st.file || '未命名.txt' });
      const saveBtn = U.el('button', { class: 'btn sm primary', dataset: { testid: 'editor-save' }, text: '保存' });
      const openBtn = U.el('button', { class: 'btn sm', text: '打开内核源文件' });
      bar.append(nameIn, saveBtn, openBtn);
      const ed = U.el('div', { class: 'ed' });
      const gut = U.el('div', { class: 'ed-gutter' });
      const ta = U.el('textarea', { class: 'ed-area', dataset: { testid: 'editor-text' }, spellcheck: 'false' });
      const consoleEl = U.el('div', { class: 'ed-console' });
      ed.append(gut, ta);
      const status = U.el('div', { class: 'statusbar' });
      root.append(bar, ed, consoleEl, status);
      body.appendChild(root);
      function load(p) {
        const n = desk.root.fs[p];
        if (!n) return desk.toast('文件不存在', 'err');
        st.file = p; st.text = n.d; ta.value = n.d; st.dirtyDoc = false;
        nameIn.value = p.split('/').pop();
        drawGutter(); syncTitle();
      }
      function drawGutter() {
        const lines = ta.value.split('\n').length;
        gut.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('<br>');
      }
      function syncTitle() {
        const t = (st.file.split('/').pop() || '未命名') + (st.dirtyDoc ? ' *' : '');
        const n = win.el.querySelector('.t-title'); if (n) n.textContent = t + ' — 编辑器';
      }
      function save() {
        let p = st.file;
        if (!p) p = '/Documents/' + nameIn.value;
        const r = Store.fs.write(p, ta.value, p.endsWith('.nsl') ? 'nsl' : 'text');
        if (!r.ok) return desk.toast('保存失败：' + r.error, 'err');
        st.file = p; st.dirtyDoc = false; nameIn.value = p.split('/').pop(); syncTitle();
        desk.notify('文件操作', '已保存 ' + nameIn.value, 'editor');
        // 若是子系统内核源文件，提示重启生效
        const m = /^\/Systems\/(inner-\d+)\/kernel\.nsl$/.exec(p);
        if (m) desk.toast('内核源文件已保存，重启 ' + m[1] + ' 后生效', 'ok', 3200);
      }
      openBtn.addEventListener('click', () => {
        const subs = desk.rt.listSystems().filter((s) => s.parentId === 'outer');
        if (!subs.length) return desk.toast('还没有子系统');
        desk.showContext(window.innerWidth - 320, 120, subs.map((s) => ({ label: s.name + ' 内核源文件', icon: 'systems', action: () => load('/Systems/' + s.id + '/kernel.nsl') })));
      });
      ta.addEventListener('input', () => { st.dirtyDoc = true; st.text = ta.value; drawGutter(); syncTitle(); });
      ta.addEventListener('scroll', () => { gut.scrollTop = ta.scrollTop; });
      saveBtn.addEventListener('click', save);
      win.app = {
        onKey(e) { if (e.ctrlKey && e.key.toLowerCase() === 's') { save(); return true; } return false; },
        onClose() {
          if (!st.dirtyDoc) return true;
          desk.modal({ title: '未保存的修改', body: '要先保存吗？', buttons: [{ label: '取消', value: 'cancel' }, { label: '放弃', value: 'drop' }, { label: '保存', value: 'save', primary: true }] }).then((v) => {
            if (v === 'save') { save(); win.el.remove(); }
            else if (v === 'drop') win.el.remove();
          });
          return false;
        }
      };
      if (st.file) load(st.file); else { ta.value = ''; drawGutter(); }
      return win.app;
    }
  };

  // =========================================================================
  //  任务管理器（根系统）
  // =========================================================================
  const tasks = {
    create(body, win, desk) {
      const root = U.el('div', { class: 'app-root' });
      const bar = U.el('div', { class: 'toolbar' });
      const list = U.el('div', { class: 'list', style: { padding: '0' } });
      root.append(bar, list);
      body.appendChild(root);
      const rt = desk.rt;
      function row(cells, head) {
        const r = U.el('div', { class: 'tm-row' + (head ? ' head' : '') });
        for (const c of cells) r.appendChild(typeof c === 'string' ? U.el('span', { text: c }) : c);
        return r;
      }
      function render() {
        bar.innerHTML = '';
        const used = rt.rootBudgetUsed || 0;
        bar.appendChild(U.el('span', { class: 'label', dataset: { testid: 'tasks-budget' }, text: '根系统总预算 ' + U.fmtInt(rt.rootBudget) + ' 指令/步' }));
        const budgetIn = U.el('input', { class: 'input', style: { width: '90px' }, value: String(rt.rootBudget) });
        const bBtn = U.el('button', { class: 'btn sm', text: '应用' });
        bBtn.addEventListener('click', () => { rt.rootBudget = Math.max(5000, parseInt(budgetIn.value, 10) || rt.rootBudget); render(); });
        bar.append(budgetIn, bBtn);
        const memIn = U.el('input', { class: 'input', style: { width: '90px' }, value: String(rt.root.memQuota) });
        const mBtn = U.el('button', { class: 'btn sm', text: '内存配额' });
        mBtn.addEventListener('click', () => { rt.root.memQuota = Math.max(65536, parseInt(memIn.value, 10) || rt.root.memQuota); render(); });
        bar.append(memIn, mBtn);
        const stIn = U.el('input', { class: 'input', style: { width: '90px' }, value: String(rt.root.storageQuota) });
        const sBtn = U.el('button', { class: 'btn sm', text: '存储配额' });
        sBtn.addEventListener('click', () => { rt.root.storageQuota = Math.max(1024, parseInt(stIn.value, 10) || rt.root.storageQuota); render(); });
        bar.append(stIn, sBtn);
        list.innerHTML = '';
        list.appendChild(row(['', '名称', '状态', '工作量', '内存', '剩余', '操作'], true));
        // 根系统应用
        for (const w of desk.win.list()) {
          const ic = U.el('span', { html: I.icon((window.RootApps[w.appId] || {}).icon || 'dot', 14) });
          const b = U.el('button', { class: 'btn sm danger', text: '结束' });
          b.addEventListener('click', () => desk.win.close(w.id));
          list.appendChild(row([ic, w.title + ' (' + w.appId + ')', w.minimized ? '最小化' : '运行中', '—', '—', '—', b]));
        }
        // 子系统
        for (const s of rt.listSystems()) {
          if (s.id === 'outer') continue;
          const inst = rt.getInstance(s.id);
          const ic = U.el('span', { html: I.icon('systems', 14) });
          const st = inst.state === 'error' ? '内核错误' : (inst.paused ? '已暂停' : '运行中');
          const work = U.el('span', { text: U.fmtInt(inst.kernelWork) + ' / 内部 ' + U.fmtInt(inst.innerWork) });
          const mem = U.el('span', { text: U.fmtBytes(inst.kernel ? inst.kernel.mem : 0) });
          const left = U.el('span', { text: inst.paused ? '—' : U.fmtInt(Math.max(0, inst.budgetLimit - inst.budgetUsed)) });
          const btns = U.el('div', { class: 'row' });
          const mk = (label, fn, testid) => { const b = U.el('button', { class: 'btn sm', text: label, dataset: testid ? { testid, targetSystemId: s.id } : {} }); b.addEventListener('click', fn); btns.appendChild(b); };
          mk(inst.paused ? '继续' : '暂停', () => { rt.control(s.id, inst.paused ? 'resume' : 'pause', {}); render(); });
          mk('结束', () => { rt.control(s.id, 'stop', {}); render(); });
          const grant = U.el('input', { class: 'input', style: { width: '70px' }, value: String(inst.budgetLimit), dataset: { testid: 'tasks-grant', targetSystemId: s.id } });
          const gBtn = U.el('button', { class: 'btn sm', text: '拨付' });
          gBtn.addEventListener('click', () => { rt.control(s.id, 'budget', { budget: parseInt(grant.value, 10) || inst.budgetLimit }); render(); });
          btns.append(grant, gBtn);
          list.appendChild(row([ic, s.name + ' · 承载进程', st, work, mem, left, btns]));
        }
        statusLine();
      }
      function statusLine() {
        let el = list.querySelector('.status-inline');
        if (!el) { el = U.el('div', { class: 'status-inline', style: { padding: '8px 10px', color: 'var(--text-faint)', fontSize: '11px' } }); list.appendChild(el); }
        el.textContent = '计量说明：工作量 = 已执行的逻辑指令数；内核自身与内部工作分别统计；宿主绘制与 Chromium 网页执行不计入。';
      }
      render();
      const iv = setInterval(() => { if (!document.body.contains(list)) return clearInterval(iv); render(); }, 800);
      return {};
    }
  };

  // =========================================================================
  //  设置
  // =========================================================================
  const settings = {
    create(body, win, desk) {
      const root = U.el('div', { class: 'app-root' });
      const scroll = U.el('div', { class: 'scroll-y', style: { padding: '16px 18px', flex: '1' } });
      root.appendChild(scroll);
      body.appendChild(root);
      const s = desk.settings;
      const section = (title) => { const d = U.el('div', { style: { marginBottom: '18px' } }); d.appendChild(U.el('div', { class: 'label', style: { marginBottom: '8px', fontSize: '11.5px' }, text: title })); scroll.appendChild(d); return d; };
      const sec1 = section('系统');
      const nameRow = U.el('div', { class: 'row' }, [U.el('span', { class: 'label', style: { width: '70px' }, text: '系统名称' })]);
      const nameIn = U.el('input', { class: 'input', dataset: { testid: 'settings-system-name' }, value: s.systemName });
      nameIn.addEventListener('change', () => { s.systemName = nameIn.value; Store.set('systemName', nameIn.value); desk.applySettings(s); });
      nameRow.appendChild(nameIn); sec1.appendChild(nameRow);
      const sec2 = section('个性化');
      const wpRow = U.el('div', { class: 'row', style: { flexWrap: 'wrap', gap: '10px' } });
      const wps = ['wallpaper-root.png', 'wallpaper-dusk.png', 'wallpaper-mist.png', 'wallpaper-terra.png'];
      for (const w of wps) {
        const b = U.el('div', { class: 'dicon', style: { width: '92px', height: '66px', padding: '0' }, dataset: { testid: 'settings-wallpaper', value: w } });
        b.style.backgroundImage = 'url("' + desk.wallpaperUrl(w) + '")';
        b.style.backgroundSize = 'cover';
        b.style.borderRadius = '8px';
        if (s.wallpaper === w) b.style.outline = '2px solid var(--accent)';
        b.addEventListener('click', () => { s.wallpaper = w; Store.set('wallpaper', w); desk.applySettings(s); win.close && 0; desk.openApp('settings'); desk.win.close(win.id); });
        wpRow.appendChild(b);
      }
      sec2.appendChild(wpRow);
      const acRow = U.el('div', { class: 'row', style: { marginTop: '10px' } });
      for (const c of window.FSUtil.ACCENTS) {
        const b = U.el('button', { class: 'btn', style: { width: '34px', height: '28px', padding: '0', background: c, border: s.accent === c ? '2px solid #fff' : '1px solid transparent' }, dataset: { testid: 'settings-accent', value: c } });
        b.addEventListener('click', () => { s.accent = c; Store.set('accent', c); desk.applySettings(s); desk.win.close(win.id); desk.openApp('settings'); });
        acRow.appendChild(b);
      }
      sec2.appendChild(acRow);
      const scRow = U.el('div', { class: 'row', style: { marginTop: '12px' } }, [U.el('span', { class: 'label', style: { width: '70px' }, text: '界面缩放' })]);
      const scIn = U.el('input', { type: 'range', min: '0.8', max: '1.4', step: '0.1', value: String(s.scale), dataset: { testid: 'settings-scale' }, style: { flex: '1' } });
      const scLbl = U.el('span', { class: 'label', text: Math.round(s.scale * 100) + '%', style: { width: '44px', textAlign: 'right' } });
      scIn.addEventListener('input', () => { s.scale = parseFloat(scIn.value); Store.set('scale', s.scale); desk.applySettings(s); scLbl.textContent = Math.round(s.scale * 100) + '%'; });
      scRow.append(scIn, scLbl); sec2.appendChild(scRow);
      const sec3 = section('关于');
      sec3.appendChild(U.el('div', { class: 'kv' }, [U.el('span', { class: 'k', text: '系统' }), U.el('span', { class: 'v', text: 'Nested OS 1.0 · 根系统 outer' })]));
      sec3.appendChild(U.el('div', { class: 'kv' }, [U.el('span', { class: 'k', text: '内核' }), U.el('span', { class: 'v', text: '宿主实现（根系统可由宿主直接实现）' })]));
      return {};
    }
  };

  // =========================================================================
  //  浏览器
  // =========================================================================
  const browser = {
    create(body, win, desk, arg) {
      const st = { tabs: [], active: 0 };
      const root = U.el('div', { class: 'app-root' });
      const strip = U.el('div', { class: 'tabstrip', dataset: { testid: 'browser-tabs' } });
      const chrome = U.el('div', { class: 'browser-chrome' });
      const back = U.el('button', { class: 'navbtn', dataset: { testid: 'browser-back' }, html: I.icon('chevronLeft', 15) });
      const fwd = U.el('button', { class: 'navbtn', dataset: { testid: 'browser-forward' }, html: I.icon('chevronRight', 15) });
      const reload = U.el('button', { class: 'navbtn', dataset: { testid: 'browser-reload' }, html: I.icon('refresh', 14) });
      const addr = U.el('div', { class: 'addr' }, [U.el('span', { class: 'lock', html: I.icon('link', 12) }), U.el('input', { dataset: { testid: 'browser-address' }, placeholder: '输入网址，例如 https://www.bilibili.com' })]);
      const input = addr.querySelector('input');
      const go = U.el('button', { class: 'navbtn', dataset: { testid: 'browser-go' }, html: I.icon('chevronRight', 14) });
      const newTab = U.el('button', { class: 'navbtn', dataset: { testid: 'browser-new-tab' }, html: I.icon('plus', 15) });
      chrome.append(back, fwd, reload, addr, go, newTab);
      const views = U.el('div', { style: { flex: '1', position: 'relative', minHeight: '0', background: '#0d0f15' } });
      root.append(strip, chrome, views);
      body.appendChild(root);
      const tabs = st.tabs;
      function newTabAt(url, active) {
        const t = { id: 'tab-' + Math.random().toString(36).slice(2, 8), url: url || 'https://www.bilibili.com', title: '新标签', loading: false, view: null, canBack: false, canFwd: false };
        tabs.push(t);
        if (active !== false) st.active = tabs.length - 1;
        build();
        return t;
      }
      function build() {
        strip.innerHTML = '';
        tabs.forEach((t, i) => {
          const el = U.el('div', { class: 'tab' + (i === st.active ? ' active' : ''), dataset: { testid: 'browser-tab', tabId: t.id } }, [
            U.el('span', { class: 'fav' }), U.el('span', { class: 'tt', text: t.title }), U.el('span', { class: 'cl', html: I.icon('close', 11) })
          ]);
          el.addEventListener('click', (e) => { if (e.target.closest('.cl')) { closeTab(i); } else { st.active = i; build(); } });
          strip.appendChild(el);
        });
        views.innerHTML = '';
        tabs.forEach((t, i) => {
          if (!t.view) {
            const wv = document.createElement('webview');
            wv.setAttribute('src', t.url);
            wv.setAttribute('partition', 'persist:browser');
            wv.style.width = '100%'; wv.style.height = '100%';
            wv.addEventListener('did-start-loading', () => { t.loading = true; updateChrome(); });
            wv.addEventListener('did-stop-loading', () => { t.loading = false; updateChrome(); });
            wv.addEventListener('page-title-updated', (e) => { t.title = e.title || t.url; build(); });
            wv.addEventListener('did-navigate', (e) => { t.url = e.url; input.value = e.url; updateChrome(); });
            wv.addEventListener('did-navigate-in-page', (e) => { t.url = e.url; input.value = e.url; updateChrome(); });
            wv.addEventListener('new-window', (e) => { e.preventDefault(); newTabAt(e.url, true); });
            wv.addEventListener('dom-ready', () => { try { t.title = wv.getTitle() || t.url; build(); } catch (err) { /* ignore */ } });
            t.view = wv;
          }
          t.view.style.display = i === st.active ? 'block' : 'none';
          views.appendChild(t.view);
        });
        if (tabs[st.active]) input.value = tabs[st.active].url;
        updateChrome();
      }
      function updateChrome() {
        const t = tabs[st.active];
        back.disabled = !t || !t.canBack; fwd.disabled = !t || !t.canFwd;
        reload.innerHTML = t && t.loading ? I.icon('close', 13) : I.icon('refresh', 14);
        win.el.querySelector('.t-title').textContent = (t ? t.title : '浏览器') + ' — 浏览器';
      }
      function closeTab(i) {
        const t = tabs[i];
        if (t && t.view) t.view.remove();
        tabs.splice(i, 1);
        if (st.active >= tabs.length) st.active = Math.max(0, tabs.length - 1);
        if (!tabs.length) { desk.win.close(win.id); return; }
        build();
      }
      function nav(url) {
        const t = tabs[st.active];
        if (!t) return;
        let u = String(url).trim();
        if (!u) return;
        if (!/^[a-z]+:\/\//i.test(u)) {
          if (/^[\w-]+(\.[\w-]+)+/.test(u)) u = 'https://' + u;
          else u = 'https://www.bing.com/search?q=' + encodeURIComponent(u);
        }
        t.url = u;
        if (t.view) t.view.loadURL(u);
        input.value = u;
      }
      go.addEventListener('click', () => nav(input.value));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') nav(input.value); e.stopPropagation(); });
      back.addEventListener('click', () => { const t = tabs[st.active]; if (t && t.view) t.view.goBack(); });
      fwd.addEventListener('click', () => { const t = tabs[st.active]; if (t && t.view) t.view.goForward(); });
      reload.addEventListener('click', () => { const t = tabs[st.active]; if (t && t.view) { if (t.loading) t.view.stop(); else t.view.reload(); } });
      newTab.addEventListener('click', () => newTabAt('', true));
      window.addEventListener('browser:new-window', (e) => { newTabAt(e.detail, true); });
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.on('browser:new-window', (e, url) => newTabAt(url, true));
      }
      newTabAt((arg && arg.url) || 'https://www.bilibili.com', true);
      return {};
    }
  };

  // =========================================================================
  //  系统管理（根系统）
  // =========================================================================
  const systems = {
    create(body, win, desk) {
      const rt = desk.rt;
      const root = U.el('div', { class: 'app-root row' });
      const left = U.el('div', { style: { width: '300px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flex: 'none' } });
      const right = U.el('div', { class: 'grow', style: { padding: '14px 16px', overflowY: 'auto' } });
      root.append(left, right);
      body.appendChild(root);
      const top = U.el('div', { class: 'toolbar' });
      const newBtn = U.el('button', { class: 'btn primary sm', dataset: { testid: 'system-new' }, text: '+ 新建子系统' });
      newBtn.addEventListener('click', () => createNew());
      top.appendChild(newBtn);
      const tree = U.el('div', { class: 'sys-tree' });
      left.append(top, tree);
      let sel = null;
      function refreshTree() {
        tree.innerHTML = '';
        const list = rt.listSystems();
        for (const s of list) {
          if (s.id === 'outer') continue;
          const el = U.el('div', { class: 'sys-node' + (sel === s.id ? ' sel' : ''), dataset: { testid: 'system-node', targetSystemId: s.id } }, [
            U.el('span', { class: 'dot2 ' + (s.state === 'error' ? 'err' : (s.paused ? 'pause' : (s.state === 'running' ? 'run' : ''))) }),
            U.el('span', { class: 'nm', text: s.name }),
            U.el('span', { class: 'meta', text: '第 ' + s.depth + ' 层 · ' + (s.state === 'error' ? '内核错误' : (s.paused ? '已暂停' : s.state)) })
          ]);
          el.addEventListener('click', () => { sel = s.id; refreshTree(); renderDetail(); });
          tree.appendChild(el);
        }
        if (!list.filter((s) => s.id !== 'outer').length) tree.appendChild(U.el('div', { class: 'empty', text: '还没有子系统' }));
      }
      function renderDetail() {
        right.innerHTML = '';
        if (!sel) { right.appendChild(U.el('div', { class: 'empty', text: '选择左侧的子系统查看与管理' })); return; }
        const s = rt.listSystems().find((x) => x.id === sel);
        if (!s) return;
        const inst = rt.getInstance(sel);
        const head = U.el('div', { class: 'row', style: { marginBottom: '12px' } }, [U.el('span', { style: { fontSize: '17px', fontWeight: '650' }, text: s.name }), U.el('span', { class: 'badge ' + (s.state === 'error' ? 'err' : (s.paused ? 'warn' : 'ok')), text: s.state === 'error' ? '内核错误' : (s.paused ? '已暂停' : '运行中') })]);
        right.appendChild(head);
        const info = [
          ['标识', s.id], ['父系统', s.parentId || 'outer'], ['层级', '第 ' + s.depth + ' 层'],
          ['虚拟时钟', s.clock.toFixed(2) + ' s'], ['时间速率', s.rate.toFixed(2) + '×'],
          ['内核自身指令', U.fmtInt(inst.kernelWork)], ['内部工作', U.fmtInt(inst.innerWork)],
          ['预算/步', U.fmtInt(inst.budgetLimit)], ['内存占用', U.fmtBytes(inst.kernel ? inst.kernel.mem : 0)]
        ];
        for (const [k, v] of info) right.appendChild(U.el('div', { class: 'kv' }, [U.el('span', { class: 'k', text: k }), U.el('span', { class: 'v', text: String(v) })]));
        if (inst.error) right.appendChild(U.el('div', { class: 'badge err', style: { marginTop: '8px' }, dataset: { testid: 'kernel-error' }, text: '内核错误：' + inst.error }));
        const bar = U.el('div', { class: 'row', style: { marginTop: '12px', flexWrap: 'wrap', gap: '6px' } });
        const mk = (label, fn, testid, primary) => { const b = U.el('button', { class: 'btn sm' + (primary ? ' primary' : ''), text: label, dataset: Object.assign({ testid }, testid ? { targetSystemId: s.id } : {}) }); b.addEventListener('click', fn); bar.appendChild(b); };
        mk('打开桌面', () => desk.openSubsystem(s.id), 'system-open-desktop', true);
        mk(inst.paused ? '继续' : '暂停', () => { rt.control(s.id, inst.paused ? 'resume' : 'pause', {}); refreshTree(); renderDetail(); }, inst.paused ? 'system-resume' : 'system-pause');
        mk('单步', () => { rt.control(s.id, 'step', {}); renderDetail(); }, 'system-step');
        mk('调速 −', () => { rt.control(s.id, 'rate', { rate: Math.max(0.25, inst.rate / 2) }); renderDetail(); });
        mk('调速 +', () => { rt.control(s.id, 'rate', { rate: Math.min(8, inst.rate * 2) }); renderDetail(); });
        mk('重启', async () => { const r = await desk.modal({ title: '重启 ' + s.name, body: '结束子树内原有进程，重新载入内核源文件并从初始状态启动；已保存的文件保留。', buttons: [{ label: '取消' }, { label: '重启', primary: true }] }); if (r) { rt.restart(s.id); refreshTree(); renderDetail(); } }, 'system-restart');
        mk('快照', () => { const r = rt.rawSyscall(rt.root, 'subsystem_snapshot', [s.id, null]); desk.toast(r.ok ? '快照已保存：' + r.path : '快照失败：' + r.error, r.ok ? 'ok' : 'err'); }, 'system-snapshot');
        mk('打开内核源文件', () => desk.openApp('editor', { path: '/Systems/' + s.id + '/kernel.nsl' }), 'kernel-open');
        mk('关闭子系统', async () => { const r = await desk.modal({ title: '关闭子系统', body: '关闭会停止整棵子树（' + s.name + ' 及其全部后代）。', buttons: [{ label: '取消' }, { label: '关闭', primary: true, danger: true }] }); if (r) { rt.control(s.id, 'stop', {}); sel = null; refreshTree(); renderDetail(); } });
        right.appendChild(bar);
        // 快照
        const snaps = rt.root.fs['/Snapshots'] ? Object.keys(rt.root.fs).filter((k) => k.startsWith('/Snapshots/') && k.endsWith('.snap')) : [];
        right.appendChild(U.el('div', { class: 'label', style: { margin: '16px 0 6px' }, text: '快照（父系统文件 /Snapshots）' }));
        for (const p of snaps) {
          const row = U.el('div', { class: 'row', style: { padding: '4px 0' } }, [U.el('span', { class: 'grow mono', style: { fontSize: '11px' }, text: p.split('/').pop() })]);
          const b1 = U.el('button', { class: 'btn sm', text: '恢复' });
          b1.addEventListener('click', () => { const r = rt.rawSyscall(rt.root, 'subsystem_restore', [p, null]); desk.toast(r.ok ? '已恢复快照' : '恢复失败：' + r.error); refreshTree(); });
          const b2 = U.el('button', { class: 'btn sm', text: '分叉' });
          b2.addEventListener('click', () => { const r = rt.rawSyscall(rt.root, 'subsystem_fork', [p, null]); desk.toast(r.ok ? '已分叉为 ' + r.name : '分叉失败：' + r.error); refreshTree(); });
          row.append(b1, b2);
          right.appendChild(row);
        }
      }
      function createNew() {
        const inst = rt.createInstance(rt.root, 'inner-' + (rt.counter));
        const ksrc = rt.fixtureSource('Kernel.nsl');
        rt.fsWrite(rt.root, '/Systems/' + inst.id + '/kernel.nsl', ksrc, 'nsl');
        const c = window.NSLC.compile(ksrc, 'kernel');
        if (c.err) return desk.toast('内核编译失败：' + c.err, 'err');
        rt.startKernel(inst, c.prog);
        inst.screen = { w: 900, h: 620 };
        sel = inst.id;
        refreshTree(); renderDetail();
        desk.openSubsystem(inst.id);
        desk.toast('已创建子系统 ' + inst.name, 'ok');
      }
      refreshTree(); renderDetail();
      const iv = setInterval(() => { if (!document.body.contains(tree)) return clearInterval(iv); refreshTree(); if (sel) renderDetail(); }, 1000);
      return {};
    }
  };

  // =========================================================================
  //  帮助
  // =========================================================================
  const help = {
    create(body, win, desk) {
      const root = U.el('div', { class: 'app-root' });
      const doc = U.el('div', { class: 'help-doc scroll-y', style: { padding: '18px 22px', flex: '1' } });
      doc.innerHTML = window.HELP_DOC || '<h2>帮助</h2><p>文档加载中…</p>';
      root.appendChild(doc);
      body.appendChild(root);
      return {};
    }
  };

  window.Apps = { files, spreadsheet, widgets, editor, tasks, settings, browser, systems, help };
})();
