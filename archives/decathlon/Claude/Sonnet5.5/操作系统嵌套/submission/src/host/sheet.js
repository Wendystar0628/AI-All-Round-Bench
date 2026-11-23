// 电子表格：单工作表、公式（四则、括号、单元格/区域引用、SUM 等）、依赖重算、撤销重做、保存到根系统文件系统。
// 工作簿格式（.sheet，JSON）：{ v:1, title, cells:{ "A1":"项目", "B2":24, "D2":"=B2*C2" }, fmt:{ "A1":{b:1} }, colw:{} }
export const COLS = 26, ROWS = 100;
export const colName = (i) => String.fromCharCode(65 + i);
export const addr = (c, r) => colName(c) + (r + 1);
export function parseAddr(a) { const m = /^([A-Z])(\d+)$/.exec(a); if (!m) return null; const c = m[1].charCodeAt(0) - 65, r = Number(m[2]) - 1; if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null; return { c, r }; }

class FErr { constructor(code) { this.code = code; } toString() { return this.code; } }
const E = (c) => new FErr(c);

// ---------------- 公式解析与求值 ----------------
function tokenize(src) {
  const t = []; let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) { let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++; t.push({ t: 'n', v: parseFloat(src.slice(i, j)) }); i = j; continue; }
    if (/[A-Za-z$]/.test(ch)) { let j = i; while (j < src.length && /[A-Za-z0-9$_]/.test(src[j])) j++; t.push({ t: 'id', v: src.slice(i, j).toUpperCase() }); i = j; continue; }
    if (ch === '"') { let j = i + 1; while (j < src.length && src[j] !== '"') j++; t.push({ t: 's', v: src.slice(i + 1, j) }); i = j + 1; continue; }
    if ('+-*/^(),:%'.includes(ch)) { t.push({ t: 'o', v: ch }); i++; continue; }
    throw E('#NAME?');
  }
  return t;
}
function parseFormula(src) {
  const toks = tokenize(src); let p = 0;
  const peek = () => toks[p], next = () => toks[p++];
  const isOp = (v) => peek() && peek().t === 'o' && peek().v === v;
  function expr() { let l = term(); while (isOp('+') || isOp('-')) { const o = next().v; const r = term(); l = { k: 'bin', o, l, r }; } return l; }
  function term() { let l = pow(); while (isOp('*') || isOp('/')) { const o = next().v; const r = pow(); l = { k: 'bin', o, l, r }; } return l; }
  function pow() { let l = unary(); if (isOp('^')) { next(); const r = pow(); l = { k: 'bin', o: '^', l, r }; } return l; }
  function unary() { if (isOp('-')) { next(); return { k: 'neg', e: unary() }; } if (isOp('+')) { next(); return unary(); } return postfix(); }
  function postfix() { let e = primary(); while (isOp('%')) { next(); e = { k: 'bin', o: '/', l: e, r: { k: 'num', v: 100 } }; } return e; }
  function primary() {
    const t = next();
    if (!t) throw E('#VALUE!');
    if (t.t === 'n') return { k: 'num', v: t.v };
    if (t.t === 's') return { k: 'str', v: t.v };
    if (t.t === 'o' && t.v === '(') { const e = expr(); if (!isOp(')')) throw E('#VALUE!'); next(); return e; }
    if (t.t === 'id') {
      if (isOp('(')) {
        next(); const args = [];
        if (!isOp(')')) { for (;;) { args.push(expr()); if (isOp(',')) { next(); continue; } break; } }
        if (!isOp(')')) throw E('#VALUE!'); next();
        return { k: 'fn', name: t.v, args };
      }
      const ref = t.v.replace(/\$/g, '');
      if (!/^[A-Z]+\d+$/.test(ref)) throw E('#NAME?');
      if (isOp(':')) {
        next(); const t2 = next();
        if (!t2 || t2.t !== 'id') throw E('#REF!');
        return { k: 'range', a: ref, b: t2.v.replace(/\$/g, '') };
      }
      return { k: 'ref', a: ref };
    }
    throw E('#VALUE!');
  }
  const ast = expr();
  if (p < toks.length) throw E('#VALUE!');
  return ast;
}
function countNodes(n) { if (!n) return 0; if (n.k === 'bin') return 1 + countNodes(n.l) + countNodes(n.r); if (n.k === 'neg') return 1 + countNodes(n.e); if (n.k === 'fn') return 1 + n.args.reduce((s, a) => s + countNodes(a), 0); if (n.k === 'range') return 4; return 1; }

export function shiftFormula(f, dr, dc) {
  return f.replace(/(\$?)([A-Z]{1,2})(\$?)(\d+)/g, (m, d1, col, d2, row) => {
    let c = col.length === 1 ? col.charCodeAt(0) - 65 : -1; if (c < 0) return m;
    let r = Number(row) - 1;
    if (!d1) c += dc; if (!d2) r += dr;
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return '#REF!';
    return d1 + colName(c) + d2 + (r + 1);
  });
}

export class Workbook {
  constructor(id, title, path) {
    this.id = id; this.title = title; this.path = path || ''; this.cells = new Map(); this.fmt = {}; this.colw = {};
    this.values = new Map(); this.asts = new Map(); this.dirty = false; this.version = 0; this.undo = []; this.redo = [];
    this.cost = 0;
  }
  static fromJSON(id, text, path) {
    const o = JSON.parse(text); const wb = new Workbook(id, o.title || path.split('/').pop(), path);
    for (const k in (o.cells || {})) wb.cells.set(k, o.cells[k]);
    wb.fmt = o.fmt || {}; wb.colw = o.colw || {};
    wb.recalc(); return wb;
  }
  toJSON() {
    const cells = {}; for (const [k, v] of this.cells) cells[k] = v;
    return JSON.stringify({ v: 1, title: this.title, cells, fmt: this.fmt, colw: this.colw });
  }
  raw(a) { const v = this.cells.get(a); return v === undefined ? '' : v; }
  // 输入文本 -> 单元格内容
  static parseInput(s) {
    s = String(s);
    if (s === '') return null;
    if (s[0] === '=') return s;
    if (/^\s*-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i.test(s)) return Number(s);
    return s;
  }
  // 提交一组修改（一次提交 = 一个撤销步骤）：changes = [[addr, newRaw|null]]
  commit(changes, record = true) {
    const group = [];
    for (const [a, nv] of changes) {
      const old = this.cells.has(a) ? this.cells.get(a) : null;
      if (old === nv) continue;
      group.push([a, old, nv]);
      if (nv === null) this.cells.delete(a); else this.cells.set(a, nv);
    }
    if (!group.length) return false;
    if (record) { this.undo.push(group); this.redo.length = 0; if (this.undo.length > 200) this.undo.shift(); }
    this.dirty = true; this.version++; this.recalc();
    return true;
  }
  doUndo() { const g = this.undo.pop(); if (!g) return false; for (const [a, o] of g) { if (o === null) this.cells.delete(a); else this.cells.set(a, o); } this.redo.push(g); this.dirty = true; this.version++; this.recalc(); return true; }
  doRedo() { const g = this.redo.pop(); if (!g) return false; for (const [a, , n] of g) { if (n === null) this.cells.delete(a); else this.cells.set(a, n); } this.undo.push(g); this.dirty = true; this.version++; this.recalc(); return true; }

  recalc() {
    this.values.clear(); this.asts.clear(); let cost = 0; const state = new Map();
    const evalCell = (a) => {
      if (this.values.has(a)) return this.values.get(a);
      const raw = this.cells.get(a);
      if (raw === undefined || raw === null) return 0 === 1 ? null : '';
      if (typeof raw === 'number') { this.values.set(a, raw); return raw; }
      if (typeof raw === 'string' && raw[0] === '=') {
        if (state.get(a) === 1) { const e = E('#CYCLE!'); this.values.set(a, e); return e; }
        state.set(a, 1);
        let v;
        try { const ast = parseFormula(raw.slice(1)); this.asts.set(a, ast); cost += countNodes(ast) + 2; v = ev(ast); if (Array.isArray(v)) v = E('#VALUE!'); }
        catch (e) { v = e instanceof FErr ? e : E('#VALUE!'); }
        state.set(a, 2); this.values.set(a, v); return v;
      }
      this.values.set(a, raw); return raw;
    };
    const num = (v) => (v === '' || v === undefined || v === null) ? 0 : typeof v === 'number' ? v : (v instanceof FErr ? v : (isNaN(Number(v)) ? E('#VALUE!') : Number(v)));
    const rangeVals = (a, b) => {
      const A = parseAddr(a), B = parseAddr(b); if (!A || !B) throw E('#REF!');
      const out = []; for (let r = Math.min(A.r, B.r); r <= Math.max(A.r, B.r); r++) for (let c = Math.min(A.c, B.c); c <= Math.max(A.c, B.c); c++) out.push(evalCell(addr(c, r)));
      return out;
    };
    const ev = (n) => {
      switch (n.k) {
        case 'num': return n.v; case 'str': return n.v;
        case 'ref': { if (!parseAddr(n.a)) throw E('#REF!'); const v = evalCell(n.a); if (v instanceof FErr) throw v; return v === '' ? 0 : v; }
        case 'range': return rangeVals(n.a, n.b);
        case 'neg': { const v = num(ev(n.e)); if (v instanceof FErr) throw v; return -v; }
        case 'bin': {
          const l = num(ev(n.l)), r = num(ev(n.r));
          if (l instanceof FErr) throw l; if (r instanceof FErr) throw r;
          if (Array.isArray(l) || Array.isArray(r)) throw E('#VALUE!');
          if (n.o === '+') return l + r; if (n.o === '-') return l - r; if (n.o === '*') return l * r;
          if (n.o === '/') { if (r === 0) throw E('#DIV/0!'); return l / r; }
          return Math.pow(l, r);
        }
        case 'fn': {
          const vals = []; for (const a of n.args) { const v = ev(a); if (Array.isArray(v)) vals.push(...v); else vals.push(v); }
          for (const v of vals) if (v instanceof FErr) throw v;
          const nums = vals.filter((v) => typeof v === 'number' || (typeof v === 'string' && v !== '' && !isNaN(Number(v)))).map(Number);
          switch (n.name) {
            case 'SUM': return nums.reduce((s, x) => s + x, 0);
            case 'AVERAGE': if (!nums.length) throw E('#DIV/0!'); return nums.reduce((s, x) => s + x, 0) / nums.length;
            case 'MIN': return nums.length ? Math.min(...nums) : 0;
            case 'MAX': return nums.length ? Math.max(...nums) : 0;
            case 'COUNT': return nums.length;
            case 'ABS': return Math.abs(nums[0] || 0);
            case 'ROUND': return Number((nums[0] || 0).toFixed(nums[1] || 0));
            default: throw E('#NAME?');
          }
        }
      }
      throw E('#VALUE!');
    };
    for (const a of this.cells.keys()) evalCell(a);
    this.cost = cost + this.cells.size;
  }
  value(a) { const v = this.values.get(a); return v === undefined ? '' : v; }
  display(a) {
    const v = this.value(a);
    if (v instanceof FErr) return v.code;
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(10)));
    return String(v);
  }
  // 选区的完整值（二维数组：数字或字符串或错误码字符串）
  rangeValues(c1, r1, c2, r2) {
    const out = [];
    for (let r = r1; r <= r2; r++) { const row = []; for (let c = c1; c <= c2; c++) { const v = this.value(addr(c, r)); row.push(v instanceof FErr ? v.code : (v === '' ? null : v)); } out.push(row); }
    return out;
  }
}

// ---------------- 界面 ----------------
const CSS = `
.sheet{position:absolute;inset:0;display:flex;flex-direction:column;background:#14111f;color:#ece9ff;font:13px "Microsoft YaHei UI","Segoe UI",sans-serif;user-select:none}
.sheet .bar{display:flex;align-items:center;gap:6px;padding:8px 10px;background:#221d40;border-bottom:1px solid #3a3366}
.sheet button{background:#2d2752;color:#ece9ff;border:1px solid #3a3366;border-radius:7px;padding:5px 11px;font:inherit;cursor:pointer}
.sheet button:hover{background:#3a3366}.sheet button.pri{background:#8b6cff;border-color:#8b6cff}.sheet button:disabled{opacity:.4;cursor:default}
.sheet .fname{flex:1;min-width:0;padding:5px 10px;background:#0f0c1d;border:1px solid #3a3366;border-radius:15px;color:#ece9ff;font:inherit}
.sheet .fx{display:flex;align-items:center;gap:8px;padding:6px 10px;background:#181430;border-bottom:1px solid #3a3366}
.sheet .addrbox{width:62px;text-align:center;color:#a49ecb;font-weight:600}
.sheet .fxi{flex:1;padding:5px 10px;background:#0f0c1d;border:1px solid #3a3366;border-radius:8px;color:#ece9ff;font:14px "Cascadia Mono",Consolas,monospace;outline:none}
.sheet .fxi:focus{border-color:#8b6cff}
.sheet .scroller{flex:1;overflow:auto;position:relative;outline:none}
.sheet .grid{position:relative}
.sheet .ch,.sheet .rh{position:sticky;background:#1c1830;color:#a49ecb;text-align:center;font-weight:600;box-sizing:border-box;border-right:1px solid #2a2547;border-bottom:1px solid #2a2547;z-index:3;display:flex;align-items:center;justify-content:center}
.sheet .corner{position:sticky;left:0;top:0;z-index:5;background:#221d40;border-right:1px solid #2a2547;border-bottom:1px solid #2a2547;box-sizing:border-box}
.sheet .cell{position:absolute;box-sizing:border-box;border-right:1px solid #2a2547;border-bottom:1px solid #2a2547;padding:0 7px;line-height:26px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:cell;background:#14111f}
.sheet .cell.num{text-align:right}.sheet .cell.b{font-weight:700}.sheet .cell.err{color:#ff6b81}
.sheet .cell.insel{background:rgba(139,108,255,.20)}
.sheet .cell.cur{outline:2px solid #8b6cff;outline-offset:-2px;background:rgba(139,108,255,.12)}
.sheet .editor{position:absolute;box-sizing:border-box;border:2px solid #ffc83d;background:#0f0c1d;color:#fff;font:13px "Microsoft YaHei UI",sans-serif;padding:0 6px;z-index:8;outline:none}
.sheet .status{display:flex;gap:16px;padding:6px 12px;background:#221d40;border-top:1px solid #3a3366;color:#a49ecb;font-size:12px;align-items:center}
.sheet .status .dirty{color:#fbbf24}.sheet .status .ok{color:#4ade80}.sheet .status .msg{color:#ffc83d;margin-left:auto}
.sheet .modal{position:absolute;inset:0;background:rgba(6,4,16,.6);display:flex;align-items:center;justify-content:center;z-index:20}
.sheet .modal .box{background:#221d40;border:1px solid #fbbf24;border-radius:14px;padding:22px 24px;width:min(460px,86%);box-shadow:0 18px 50px rgba(0,0,0,.6)}
.sheet .modal h3{margin:0 0 10px;font-size:15px}.sheet .modal p{margin:0 0 18px;color:#a49ecb;line-height:1.6}.sheet .modal .row{display:flex;gap:10px;justify-content:flex-end}
.sheet .list{max-height:260px;overflow:auto;margin:0 0 14px}.sheet .list div{padding:7px 10px;border-radius:7px;cursor:pointer}.sheet .list div:hover{background:#3a3366}
`;
let cssDone = false;

export class SheetApp {
  constructor(machine, nid, extra, ctx) {
    this.machine = machine; this.nid = nid; this.kind = 'sheet'; this.app = 'spreadsheet'; this.ctx = ctx; this.wid = (extra && extra.wid) || '';
    this.cw = 100; this.rh = 26; this.hw = 46; this.hh = 26;
    this.sel = { c1: 0, r1: 0, c2: 0, r2: 0 }; this.cur = { c: 0, r: 0 }; this.editing = null; this.msg = ''; this.cellEls = new Map();
    this.clipData = null; this.docId = 'doc-' + nid; this.closed = false; this.title = '电子表格';
    this.wb = new Workbook(this.docId, '未命名工作簿', '');
    if (extra && extra.file) this.openFile(extra.file, true); else this.wb.dirty = false;
    this.build();
    ctx.register(this);
  }
  get dirty() { return this.wb.dirty; }
  toast(m) { this.msg = m; if (this.msgEl) this.msgEl.textContent = m; clearTimeout(this._mt); this._mt = setTimeout(() => { this.msg = ''; if (this.msgEl) this.msgEl.textContent = ''; }, 5000); }
  // ---- 文件 ----
  disk() { return this.machine.root.disk; }
  openFile(path, silent) {
    const e = this.disk().get(path);
    if (!e || e.dir) { this.toast('找不到工作簿：' + path); return false; }
    try { this.wb = Workbook.fromJSON(this.docId, e.data, path); } catch (err) { this.toast('工作簿格式错误：' + err.message); return false; }
    this.wb.dirty = false; this.sel = { c1: 0, r1: 0, c2: 0, r2: 0 }; this.cur = { c: 0, r: 0 };
    if (!silent) { this.refreshAll(); this.toast('已打开 ' + path); }
    this.ctx.publish(this.wb);
    return true;
  }
  save(asPath) {
    let p = asPath || this.wb.path;
    if (!p) { p = '/Documents/新建工作簿.sheet'; let n = 2; while (this.disk().get(p)) p = '/Documents/新建工作簿 (' + n++ + ').sheet'; }
    const d = this.disk(); const parent = p.slice(0, p.lastIndexOf('/')) || '/';
    const pe = parent === '/' ? { dir: true } : d.get(parent); if (!pe || !pe.dir) { this.toast('保存失败：目录不存在 ' + parent); return false; }
    const text = this.wb.toJSON(); const r = this.machine.devs.disk.put.call(this.machine, this.machine.root, [p, text, false, this.machine.clock]);
    if (r && r.err) { this.toast('保存失败：' + r.err); this.ctx.notify('文件保存失败', r.err); return false; }
    this.wb.path = p; this.wb.title = p.split('/').pop(); this.wb.dirty = false;
    this.ctx.fsChanged(); this.refreshChrome(); this.toast('已保存 ' + p); this.ctx.notify('工作簿已保存', p);
    return true;
  }
  newBook() { this.wb = new Workbook(this.docId, '未命名工作簿', ''); this.wb.dirty = false; this.sel = { c1: 0, r1: 0, c2: 0, r2: 0 }; this.cur = { c: 0, r: 0 }; this.refreshAll(); this.ctx.publish(this.wb); }
  // 关闭/打开前询问：保存、放弃、取消
  guard(then) {
    if (!this.wb.dirty) { then(); return; }
    this.modal('有未保存的修改', '“' + (this.wb.path || '未命名工作簿') + '”有尚未保存的修改。是否保存？', [['保存', 'pri', () => { if (this.save()) then(); }], ['放弃', '', () => { this.wb.dirty = false; then(); }], ['取消', '', () => { }]]);
  }
  requestClose() { // 由窗口管理发起的关闭
    if (!this.wb.dirty) return true;
    this.guard(() => this.ctx.closeSelf(this));
    return false;
  }
  modal(title, text, buttons, extraEl) {
    const m = document.createElement('div'); m.className = 'modal'; m.dataset.testid = 'sheet-dialog';
    const box = document.createElement('div'); box.className = 'box'; box.innerHTML = '<h3></h3><p></p>';
    box.querySelector('h3').textContent = title; box.querySelector('p').textContent = text;
    if (extraEl) box.insertBefore(extraEl, box.querySelector('p').nextSibling);
    const row = document.createElement('div'); row.className = 'row';
    for (const [label, cls, fn] of buttons) { const b = document.createElement('button'); b.textContent = label; b.className = cls; b.dataset.testid = 'sheet-dialog-' + (cls === 'pri' ? 'ok' : label === '取消' ? 'cancel' : 'alt'); b.onclick = () => { m.remove(); fn(); }; row.appendChild(b); }
    box.appendChild(row); m.appendChild(box); this.root.appendChild(m);
  }
  // ---- 编辑 ----
  setCell(a, text) {
    const nv = Workbook.parseInput(text);
    if (this.wb.commit([[a, nv]])) this.afterEdit();
  }
  afterEdit() { this.refreshAll(); this.ctx.publish(this.wb, this.wb.cost); }
  // ---- DOM ----
  build() {
    if (!cssDone) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); cssDone = true; }
    const root = this.root = document.createElement('div'); root.className = 'sheet';
    root.innerHTML = `<div class="bar"><button data-testid="sheet-new">新建</button><button data-testid="sheet-open">打开</button><button class="pri" data-testid="sheet-save">保存</button>
      <button data-testid="sheet-undo" title="撤销">↶</button><button data-testid="sheet-redo" title="重做">↷</button><button data-testid="sheet-copy">复制</button><button data-testid="sheet-cut">剪切</button><button data-testid="sheet-paste">粘贴</button><button data-testid="sheet-bold" style="font-weight:700">B</button>
      <input class="fname" data-testid="sheet-filename" spellcheck="false" placeholder="工作簿路径（回车打开，保存时使用）"></div>
      <div class="fx"><span class="addrbox" data-testid="sheet-addr">A1</span><span style="color:#a49ecb;font-style:italic">fx</span><input class="fxi" data-testid="sheet-formula" spellcheck="false" placeholder="在这里输入内容或公式，例如 =SUM(D2:D4)"></div>
      <div class="scroller" tabindex="0" data-testid="sheet-grid"><div class="grid"></div></div>
      <div class="status"><span>工作表 1</span><span data-role="sum"></span><span data-role="state"></span><span class="msg"></span></div>`;
    this.scroller = root.querySelector('.scroller'); this.grid = root.querySelector('.grid');
    this.fnameEl = root.querySelector('.fname'); this.fxi = root.querySelector('.fxi'); this.addrEl = root.querySelector('.addrbox');
    this.sumEl = root.querySelector('[data-role=sum]'); this.stateEl = root.querySelector('[data-role=state]'); this.msgEl = root.querySelector('.msg');
    const hw = this.hw, hh = this.hh, cw = this.cw, rh = this.rh;
    this.grid.style.width = (hw + COLS * cw) + 'px'; this.grid.style.height = (hh + ROWS * rh) + 'px';
    const corner = document.createElement('div'); corner.className = 'corner'; corner.style.cssText = `width:${hw}px;height:${hh}px;left:0;top:0;position:sticky;float:left`; this.grid.appendChild(corner);
    for (let c = 0; c < COLS; c++) { const h = document.createElement('div'); h.className = 'ch'; h.textContent = colName(c); h.style.cssText = `position:absolute;left:${hw + c * cw}px;top:0;width:${cw}px;height:${hh}px;top:0`; h.style.position = 'sticky'; h.style.cssText += `;position:absolute`; h.dataset.col = c; this.grid.appendChild(h); }
    for (let r = 0; r < ROWS; r++) { const h = document.createElement('div'); h.className = 'rh'; h.textContent = r + 1; h.style.cssText = `position:absolute;left:0;top:${hh + r * rh}px;width:${hw}px;height:${rh}px`; h.dataset.row = r; this.grid.appendChild(h); }
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const el = document.createElement('div'); el.className = 'cell'; el.dataset.testid = 'sheet-cell'; el.dataset.cellAddress = addr(c, r); el.dataset.c = c; el.dataset.r = r;
      el.style.cssText = `left:${hw + c * cw}px;top:${hh + r * rh}px;width:${cw}px;height:${rh}px`;
      this.grid.appendChild(el); this.cellEls.set(addr(c, r), el);
    }
    // 表头固定：用滚动事件移动
    this.scroller.addEventListener('scroll', () => this.fixHeaders());
    this.bind(root);
    this.refreshAll();
  }
  fixHeaders() {
    const sl = this.scroller.scrollLeft, st = this.scroller.scrollTop;
    for (const h of this.grid.querySelectorAll('.ch')) h.style.top = st + 'px';
    for (const h of this.grid.querySelectorAll('.rh')) h.style.left = sl + 'px';
    const co = this.grid.querySelector('.corner'); co.style.position = 'absolute'; co.style.left = sl + 'px'; co.style.top = st + 'px';
  }
  bind(root) {
    const $ = (t) => root.querySelector('[data-testid="' + t + '"]');
    $('sheet-new').onclick = () => this.guard(() => this.newBook());
    $('sheet-open').onclick = () => this.guard(() => this.openDialog());
    $('sheet-save').onclick = () => this.save(this.fnameEl.value.trim() && this.fnameEl.value.trim() !== this.wb.path ? this.fnameEl.value.trim() : null);
    $('sheet-undo').onclick = () => { if (this.wb.doUndo()) this.afterEdit(); };
    $('sheet-redo').onclick = () => { if (this.wb.doRedo()) this.afterEdit(); };
    $('sheet-copy').onclick = () => this.copy(false); $('sheet-cut').onclick = () => this.copy(true); $('sheet-paste').onclick = () => this.pasteInternal();
    $('sheet-bold').onclick = () => { const f = this.wb.fmt; for (let r = this.sel.r1; r <= this.sel.r2; r++) for (let c = this.sel.c1; c <= this.sel.c2; c++) { const a = addr(c, r); f[a] = { ...(f[a] || {}), b: f[a] && f[a].b ? 0 : 1 }; } this.wb.dirty = true; this.refreshAll(); };
    this.fnameEl.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { const p = this.fnameEl.value.trim(); if (p) this.guard(() => { if (!this.openFile(p)) { } }); } });
    this.fxi.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); this.setCell(addr(this.cur.c, this.cur.r), this.fxi.value); this.moveCur(0, 1); this.scroller.focus(); }
      else if (e.key === 'Escape') { this.refreshChrome(); this.scroller.focus(); }
    });
    // 选择与编辑
    let dragging = false;
    this.grid.addEventListener('mousedown', (e) => {
      const el = e.target.closest('.cell'); if (!el) return;
      this.endEdit(true);
      const c = +el.dataset.c, r = +el.dataset.r;
      if (e.shiftKey) { this.sel = { c1: Math.min(this.cur.c, c), r1: Math.min(this.cur.r, r), c2: Math.max(this.cur.c, c), r2: Math.max(this.cur.r, r) }; }
      else { this.cur = { c, r }; this.sel = { c1: c, r1: r, c2: c, r2: r }; dragging = true; }
      this.refreshSel(); this.scroller.focus({ preventScroll: true }); e.preventDefault();
    });
    this.grid.addEventListener('mouseover', (e) => {
      if (!dragging) return; const el = e.target.closest('.cell'); if (!el) return;
      const c = +el.dataset.c, r = +el.dataset.r;
      this.sel = { c1: Math.min(this.cur.c, c), r1: Math.min(this.cur.r, r), c2: Math.max(this.cur.c, c), r2: Math.max(this.cur.r, r) }; this.refreshSel();
    });
    window.addEventListener('mouseup', () => { dragging = false; });
    this.grid.addEventListener('dblclick', (e) => { const el = e.target.closest('.cell'); if (el) this.beginEdit(this.wb.raw(addr(this.cur.c, this.cur.r))); });
    this.scroller.addEventListener('keydown', (e) => this.onKey(e));
    this.scroller.addEventListener('paste', (e) => { e.preventDefault(); const t = (e.clipboardData && e.clipboardData.getData('text')) || ''; this.pasteText(t); });
    this.scroller.addEventListener('copy', (e) => { e.preventDefault(); this.copy(false, e); });
  }
  onKey(e) {
    if (this.editing) return;
    const k = e.key; const mod = e.ctrlKey || e.metaKey;
    if (mod && (k === 'c' || k === 'C')) { e.preventDefault(); this.copy(false); return; }
    if (mod && (k === 'x' || k === 'X')) { e.preventDefault(); this.copy(true); return; }
    if (mod && (k === 'v' || k === 'V')) { e.preventDefault(); this.pasteInternal(); return; }
    if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); if (this.wb.doUndo()) this.afterEdit(); return; }
    if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); if (this.wb.doRedo()) this.afterEdit(); return; }
    if (mod && (k === 's' || k === 'S')) { e.preventDefault(); this.save(); return; }
    if (mod && (k === 'a' || k === 'A')) { e.preventDefault(); this.sel = { c1: 0, r1: 0, c2: COLS - 1, r2: ROWS - 1 }; this.refreshSel(); return; }
    const mv = { ArrowDown: [0, 1], ArrowUp: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], Tab: [e.shiftKey ? -1 : 1, 0], Enter: [0, 1] }[k];
    if (mv) { e.preventDefault(); if (e.shiftKey && k.startsWith('Arrow')) this.extend(mv[0], mv[1]); else this.moveCur(mv[0], mv[1]); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); this.clearSel(); return; }
    if (k === 'F2') { e.preventDefault(); this.beginEdit(this.wb.raw(addr(this.cur.c, this.cur.r))); return; }
    if (k.length === 1 && !mod && !e.altKey) { e.preventDefault(); this.beginEdit(k, true); }
  }
  moveCur(dc, dr) {
    this.cur = { c: Math.max(0, Math.min(COLS - 1, this.cur.c + dc)), r: Math.max(0, Math.min(ROWS - 1, this.cur.r + dr)) };
    this.sel = { c1: this.cur.c, r1: this.cur.r, c2: this.cur.c, r2: this.cur.r }; this.refreshSel(); this.ensureVisible();
  }
  extend(dc, dr) {
    const s = this.sel; const ec = (this.cur.c === s.c1 ? s.c2 : s.c1) + dc, er = (this.cur.r === s.r1 ? s.r2 : s.r1) + dr;
    const c = Math.max(0, Math.min(COLS - 1, ec)), r = Math.max(0, Math.min(ROWS - 1, er));
    this.sel = { c1: Math.min(this.cur.c, c), r1: Math.min(this.cur.r, r), c2: Math.max(this.cur.c, c), r2: Math.max(this.cur.r, r) }; this.refreshSel();
  }
  ensureVisible() {
    const el = this.cellEls.get(addr(this.cur.c, this.cur.r)); if (!el) return;
    const sc = this.scroller; const x = this.hw + this.cur.c * this.cw, y = this.hh + this.cur.r * this.rh;
    if (x < sc.scrollLeft + this.hw) sc.scrollLeft = x - this.hw; if (x + this.cw > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = x + this.cw - sc.clientWidth;
    if (y < sc.scrollTop + this.hh) sc.scrollTop = y - this.hh; if (y + this.rh > sc.scrollTop + sc.clientHeight) sc.scrollTop = y + this.rh - sc.clientHeight;
  }
  beginEdit(initial, replace) {
    const a = addr(this.cur.c, this.cur.r); const el = this.cellEls.get(a);
    const ed = document.createElement('input'); ed.className = 'editor'; ed.dataset.testid = 'sheet-cell-editor'; ed.value = initial;
    ed.style.cssText = `left:${this.hw + this.cur.c * this.cw}px;top:${this.hh + this.cur.r * this.rh}px;width:${this.cw + 20}px;height:${this.rh}px`;
    ed.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); this.endEdit(true); this.moveCur(0, 1); this.scroller.focus(); }
      else if (e.key === 'Tab') { e.preventDefault(); this.endEdit(true); this.moveCur(1, 0); this.scroller.focus(); }
      else if (e.key === 'Escape') { this.endEdit(false); this.scroller.focus(); }
    });
    ed.addEventListener('input', () => { this.fxi.value = ed.value; });
    this.grid.appendChild(ed); this.editing = ed; ed.focus(); if (!replace) ed.select(); else ed.setSelectionRange(ed.value.length, ed.value.length);
    this.fxi.value = initial;
  }
  endEdit(commit) {
    const ed = this.editing; if (!ed) return; this.editing = null;
    const a = addr(this.cur.c, this.cur.r); const v = ed.value; ed.remove();
    if (commit) this.setCell(a, v); else this.refreshChrome();
  }
  clearSel() {
    const ch = []; for (let r = this.sel.r1; r <= this.sel.r2; r++) for (let c = this.sel.c1; c <= this.sel.c2; c++) ch.push([addr(c, r), null]);
    if (this.wb.commit(ch)) this.afterEdit();
  }
  // ---- 复制粘贴 ----
  copy(cut, ev) {
    const s = this.sel; const raw = [], disp = [];
    for (let r = s.r1; r <= s.r2; r++) { const rr = [], dd = []; for (let c = s.c1; c <= s.c2; c++) { rr.push(this.wb.cells.has(addr(c, r)) ? this.wb.cells.get(addr(c, r)) : null); dd.push(this.wb.display(addr(c, r))); } raw.push(rr); disp.push(dd); }
    const text = disp.map((r) => r.join('\t')).join('\n');
    this.clipData = { raw, text, c1: s.c1, r1: s.r1 };
    if (ev && ev.clipboardData) ev.clipboardData.setData('text/plain', text); else try { navigator.clipboard && navigator.clipboard.writeText(text); } catch (e) { }
    this.ctx.clipPush(text);
    if (cut) { const ch = []; for (let r = s.r1; r <= s.r2; r++) for (let c = s.c1; c <= s.c2; c++) ch.push([addr(c, r), null]); if (this.wb.commit(ch)) this.afterEdit(); }
    this.toast((cut ? '已剪切 ' : '已复制 ') + (s.r2 - s.r1 + 1) * (s.c2 - s.c1 + 1) + ' 个单元格');
  }
  pasteInternal() {
    const cd = this.clipData; if (!cd) { this.toast('剪贴板里没有表格内容'); return; }
    const dr = this.cur.r - cd.r1, dc = this.cur.c - cd.c1; const ch = [];
    cd.raw.forEach((row, ri) => row.forEach((v, ci) => {
      const c = this.cur.c + ci, r = this.cur.r + ri; if (c >= COLS || r >= ROWS) return;
      let nv = v; if (typeof v === 'string' && v[0] === '=') nv = shiftFormula(v, dr, dc);
      ch.push([addr(c, r), nv]);
    }));
    if (this.wb.commit(ch)) { this.afterEdit(); this.toast('已粘贴'); }
  }
  pasteText(t) {
    if (this.clipData && this.clipData.text === t) { this.pasteInternal(); return; }
    const rows = t.replace(/\r/g, '').split('\n'); const ch = [];
    rows.forEach((line, ri) => line.split('\t').forEach((cell, ci) => { const c = this.cur.c + ci, r = this.cur.r + ri; if (c < COLS && r < ROWS && !(line === '' && rows.length > 1)) ch.push([addr(c, r), Workbook.parseInput(cell)]); }));
    if (this.wb.commit(ch)) this.afterEdit();
  }
  openDialog() {
    const list = document.createElement('div'); list.className = 'list';
    const files = []; const d = this.disk();
    const scan = (dir) => { for (const e of d.list(dir)) { if (e.dir) scan(e.key); else if (e.name.endsWith('.sheet')) files.push(e.key); } };
    scan('/');
    for (const f of files) { const it = document.createElement('div'); it.textContent = f; it.dataset.testid = 'sheet-open-item'; it.dataset.filePath = f; it.onclick = () => { this.root.querySelector('.modal').remove(); this.openFile(f); }; list.appendChild(it); }
    if (!files.length) list.textContent = '文件系统里没有 .sheet 工作簿';
    this.modal('打开工作簿', '选择根系统文件系统中的工作簿：', [['取消', '', () => { }]], list);
  }
  // ---- 刷新 ----
  refreshAll() {
    for (const [a, el] of this.cellEls) {
      const v = this.wb.value(a); const has = this.wb.cells.has(a);
      const txt = has ? this.wb.display(a) : '';
      if (el.textContent !== txt) el.textContent = txt;
      const isErr = typeof v === 'object' && v !== null;
      el.className = 'cell' + (typeof v === 'number' ? ' num' : '') + (isErr ? ' err' : '') + (this.wb.fmt[a] && this.wb.fmt[a].b ? ' b' : '');
    }
    this.refreshSel(); this.refreshChrome();
  }
  refreshSel() {
    for (const el of this.grid.querySelectorAll('.cell.insel, .cell.cur')) el.classList.remove('insel', 'cur');
    const s = this.sel;
    if (s.c1 !== s.c2 || s.r1 !== s.r2) for (let r = s.r1; r <= s.r2; r++) for (let c = s.c1; c <= s.c2; c++) this.cellEls.get(addr(c, r)).classList.add('insel');
    const ce = this.cellEls.get(addr(this.cur.c, this.cur.r)); if (ce) ce.classList.add('cur');
    this.refreshChrome();
  }
  refreshChrome() {
    const a = addr(this.cur.c, this.cur.r); this.addrEl.textContent = (this.sel.c1 !== this.sel.c2 || this.sel.r1 !== this.sel.r2) ? addr(this.sel.c1, this.sel.r1) + ':' + addr(this.sel.c2, this.sel.r2) : a;
    if (!this.editing && document.activeElement !== this.fxi) this.fxi.value = String(this.wb.raw(a));
    if (document.activeElement !== this.fnameEl) this.fnameEl.value = this.wb.path;
    let sum = 0, n = 0; const s = this.sel;
    for (let r = s.r1; r <= s.r2; r++) for (let c = s.c1; c <= s.c2; c++) { const v = this.wb.value(addr(c, r)); if (typeof v === 'number') { sum += v; n++; } }
    this.sumEl.textContent = n ? '选区求和 ' + Number(sum.toPrecision(10)) + ' · 计数 ' + n : '';
    this.stateEl.innerHTML = this.wb.dirty ? '<span class="dirty">● 未保存</span> · 版本 ' + this.wb.version : '<span class="ok">已保存</span> · 版本 ' + this.wb.version;
    this.title = '电子表格' + (this.wb.dirty ? ' ●' : '') + ' — ' + (this.wb.path || '未命名');
  }
  // ---- 宿主接口 ----
  mountTo(el) { el.appendChild(this.root); }
  unmount(el) { }
  resize() { }
  destroy() { if (this.closed) return; this.closed = true; this.root.remove(); this.ctx.unregister(this); }
  info() { return { nid: this.nid, app: 'spreadsheet', title: this.title, kind: 'sheet', views: 0 }; }
}
