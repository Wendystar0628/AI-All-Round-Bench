/* 电子表格模型：单元格、公式解析与依赖重算 */
'use strict';
window.NOS = window.NOS || {};

function colName(idx) { // 0-based -> A, B, ... AA
  let s = '';
  idx++;
  while (idx > 0) { const m = (idx - 1) % 26; s = String.fromCharCode(65 + m) + s; idx = (idx - 1 - m) / 26; }
  return s;
}
function colIdx(name) {
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
function parseAddress(a) {
  const m = /^([A-Za-z]+)(\d+)$/.exec(a.trim());
  if (!m) return null;
  return { c: colIdx(m[1]), r: parseInt(m[2], 10) - 1 };
}
function addrOf(r, c) { return colName(c) + (r + 1); }

class SheetModel {
  constructor(data) {
    data = data || {};
    this.rows = data.rows || 40;
    this.cols = data.cols || 12;
    this.cells = data.cells || {};   // addr -> {f: raw text, v: value, fmt?, err?}
    this.filename = data.filename || '未命名.sheet';
    this.dirty = false;
    this.version = 0;
    this._recomputeAll();
  }

  static sampleWorkbook() {
    const m = new SheetModel({ filename: 'sample.sheet', rows: 40, cols: 12, cells: {
      A1: { f: '项目' }, B1: { f: '数量' }, C1: { f: '单价' }, D1: { f: '小计' },
      A2: { f: '项目 A' }, B2: { f: '24' }, C2: { f: '6' }, D2: { f: '=B2*C2' },
      A3: { f: '项目 B' }, B3: { f: '12' }, C3: { f: '8' }, D3: { f: '=B3*C3' },
      A4: { f: '项目 C' }, B4: { f: '18' }, C4: { f: '4' }, D4: { f: '=B4*C4' }
    } });
    return m.serialize();
  }

  serialize() {
    return { kind: 'nestedos-sheet', v: 1, rows: this.rows, cols: this.cols, cells: this.cells, filename: this.filename };
  }
  static deserialize(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const m = new SheetModel(data);
    m.dirty = false;
    return m;
  }

  cloneData() { return JSON.parse(JSON.stringify(this.serialize())); }

  setRaw(addr, raw) {
    addr = addr.toUpperCase();
    if (raw === '' || raw === null || raw === undefined) delete this.cells[addr];
    else this.cells[addr] = { f: String(raw) };
    this.dirty = true;
    this.version++;
    this._recomputeAll();
  }

  getRaw(addr) { const c = this.cells[addr.toUpperCase()]; return c ? c.f : ''; }
  getValue(addr) { const c = this.cells[addr.toUpperCase()]; return c ? c.v : null; }
  display(addr) {
    const c = this.cells[addr.toUpperCase()];
    if (!c) return '';
    if (c.err) return c.err;
    if (c.v === null || c.v === undefined) return '';
    if (typeof c.v === 'number') return String(Math.round(c.v * 1e10) / 1e10);
    return String(c.v);
  }

  /* 区域：'A1:D4' -> 地址数组（先行后列 or 行列矩阵） */
  static parseRange(range) {
    const m = /^\s*([A-Za-z]+\d+)\s*:\s*([A-Za-z]+\d+)\s*$/.exec(range);
    if (!m) return null;
    const a = parseAddress(m[1]), b = parseAddress(m[2]);
    const r0 = Math.min(a.r, b.r), r1 = Math.max(a.r, b.r);
    const c0 = Math.min(a.c, b.c), c1 = Math.max(a.c, b.c);
    const addrs = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) addrs.push(addrOf(r, c));
    return { r0, r1, c0, c1, addrs };
  }

  rangeMatrix(range) {
    const R = SheetModel.parseRange(range);
    if (!R) return null;
    const rows = [];
    for (let r = R.r0; r <= R.r1; r++) {
      const row = [];
      for (let c = R.c0; c <= R.c1; c++) {
        const addr = addrOf(r, c);
        const cell = this.cells[addr];
        row.push({ addr, raw: cell ? cell.f : '', value: cell ? cell.v : null, err: cell ? cell.err : null });
      }
      rows.push(row);
    }
    return rows;
  }

  _recomputeAll() {
    const state = {}; // addr -> 'visiting'|'done'
    for (const addr in this.cells) {
      this.cells[addr].v = null; this.cells[addr].err = null;
    }
    for (const addr in this.cells) this._evalCell(addr, state);
  }

  _evalCell(addr, state) {
    addr = addr.toUpperCase();
    const cell = this.cells[addr];
    if (!cell) return null;
    if (state[addr] === 'done') return cell.err ? cell.err : cell.v;
    if (state[addr] === 'visiting') { cell.err = '#循环引用'; return '#循环引用'; }
    state[addr] = 'visiting';
    const raw = cell.f;
    if (raw == null || raw === '') { state[addr] = 'done'; cell.v = null; return null; }
    if (raw[0] !== '=') {
      const n = Number(raw);
      cell.v = (raw.trim() !== '' && !Number.isNaN(n)) ? n : raw;
      state[addr] = 'done';
      return cell.v;
    }
    try {
      const v = evalFormula(raw.slice(1), ref => {
        const r = ref.toUpperCase();
        if (state[r] === 'visiting') { const e = '#循环引用'; return e; }
        const rv = this._evalCell(r, state);
        if (typeof rv === 'string' && rv[0] === '#') throw new FormulaError(rv);
        return rv === null || rv === undefined ? 0 : rv;
      }, rangeRef => {
        const R = SheetModel.parseRange(rangeRef);
        if (!R) throw new FormulaError('#无效引用');
        const vals = [];
        for (const a of R.addrs) {
          if (state[a] === 'visiting') throw new FormulaError('#循环引用');
          const v = this._evalCell(a, state);
          if (typeof v === 'string' && v[0] === '#') throw new FormulaError(v);
          if (typeof v === 'number') vals.push(v);
        }
        return vals;
      });
      cell.v = v; cell.err = null;
    } catch (e) {
      cell.v = null; cell.err = e.message || '#错误';
    }
    state[addr] = 'done';
    return cell.err || cell.v;
  }
}

class FormulaError extends Error {}

/* 小型公式解析器（递归下降），支持 + - * / % 括号、数字、单元格引用、区域(只用于函数)、函数 SUM/MIN/MAX/AVG/COUNT */
function evalFormula(text, resolveRef, resolveRange) {
  let pos = 0;
  const s = text;
  function skip() { while (pos < s.length && /\s/.test(s[pos])) pos++; }
  function parseExpr() {
    let v = parseTerm();
    skip();
    while (s[pos] === '+' || s[pos] === '-') {
      const op = s[pos++];
      const r = parseTerm();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function parseTerm() {
    let v = parseFactor();
    skip();
    while (s[pos] === '*' || s[pos] === '/' || s[pos] === '%') {
      const op = s[pos++];
      const r = parseFactor();
      if (op === '*') v = v * r;
      else if (op === '%') v = v % r;
      else { if (r === 0) throw new FormulaError('#除零'); v = v / r; }
      skip();
    }
    return v;
  }
  function parseFactor() {
    skip();
    if (s[pos] === '-') { pos++; return -parseFactor(); }
    if (s[pos] === '+') { pos++; return parseFactor(); }
    if (s[pos] === '(') { pos++; const v = parseExpr(); skip(); if (s[pos] !== ')') throw new FormulaError('#语法'); pos++; return v; }
    // 数字
    if (/[0-9.]/.test(s[pos])) {
      let num = '';
      while (pos < s.length && /[0-9.]/.test(s[pos])) num += s[pos++];
      const n = Number(num);
      if (Number.isNaN(n)) throw new FormulaError('#数字');
      return n;
    }
    // 函数 或 引用
    if (/[A-Za-z_]/.test(s[pos])) {
      let id = '';
      while (pos < s.length && /[A-Za-z0-9_]/.test(s[pos])) id += s[pos++];
      skip();
      if (s[pos] === '(') {
        pos++;
        const args = [];
        skip();
        if (s[pos] !== ')') {
          while (true) {
            // 参数可以是区域或表达式
            const save = pos;
            const m = /^([A-Za-z]+\d+)\s*:\s*([A-Za-z]+\d+)/.exec(s.slice(pos));
            if (m) {
              args.push({ range: m[0] });
              pos += m[0].length;
            } else {
              args.push({ expr: parseExpr() });
            }
            skip();
            if (s[pos] === ',') { pos++; skip(); continue; }
            break;
          }
        }
        skip();
        if (s[pos] !== ')') throw new FormulaError('#语法');
        pos++;
        return callFn(id.toUpperCase(), args);
      }
      // 单元格引用：字母+数字
      if (/^[A-Za-z]+\d+/.test(id)) return resolveRef(id);
      throw new FormulaError('#无效引用');
    }
    throw new FormulaError('#语法');
  }
  function argVals(args) {
    const vals = [];
    for (const a of args) {
      if (a.range) vals.push(...resolveRange(a.range));
      else vals.push(a.expr);
    }
    return vals;
  }
  function callFn(name, args) {
    const vals = argVals(args);
    switch (name) {
      case 'SUM': return vals.reduce((a, b) => a + (Number(b) || 0), 0);
      case 'MIN': return vals.length ? Math.min(...vals.map(Number)) : 0;
      case 'MAX': return vals.length ? Math.max(...vals.map(Number)) : 0;
      case 'AVG': case 'AVERAGE': return vals.length ? vals.reduce((a, b) => a + Number(b), 0) / vals.length : 0;
      case 'COUNT': return vals.filter(v => typeof v === 'number').length;
      default: throw new FormulaError('#未知函数');
    }
  }
  const v = parseExpr();
  skip();
  if (pos < s.length) throw new FormulaError('#语法');
  return v;
}

NOS.SheetModel = SheetModel;
NOS.sheetUtil = { colName, colIdx, parseAddress, addrOf, evalFormula };
