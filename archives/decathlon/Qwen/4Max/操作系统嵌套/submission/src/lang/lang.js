'use strict';
// NestedOS 程序语言：词法/语法/字节码编译 + 可序列化栈式虚拟机（宿主引导实现）
// 程序格式与接口见 docs/操作说明.md

// ---------- 词法 ----------
function lex(src) {
  const toks = [];
  let i = 0, line = 1;
  const n = src.length;
  const isIdStart = c => /[A-Za-z_$]/.test(c);
  const isId = c => /[A-Za-z0-9_$]/.test(c);
  const isDigit = c => c >= '0' && c <= '9';
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; } i += 2; continue; }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
      let j = i;
      while (j < n && (isDigit(src[j]) || src[j] === '.')) j++;
      if (src[j] === 'e' || src[j] === 'E') { j++; if (src[j] === '+' || src[j] === '-') j++; while (j < n && isDigit(src[j])) j++; }
      toks.push({ t: 'num', v: parseFloat(src.slice(i, j)), line });
      i = j; continue;
    }
    if (c === '"' || c === "'") {
      const q = c; let j = i + 1, s = '';
      while (j < n && src[j] !== q) {
        if (src[j] === '\\') {
          j++;
          const e = src[j];
          if (e === 'n') s += '\n'; else if (e === 't') s += '\t'; else if (e === 'r') s += '\r';
          else if (e === '\\') s += '\\'; else if (e === '"') s += '"'; else if (e === "'") s += "'";
          else if (e === '0') s += '\0'; else s += e;
          j++;
        } else { s += src[j]; j++; }
      }
      if (j >= n) throw new Error('字符串未结束 (行 ' + line + ')');
      toks.push({ t: 'str', v: s, line });
      i = j + 1; continue;
    }
    if (isIdStart(c)) {
      let j = i; while (j < n && isId(src[j])) j++;
      const w = src.slice(i, j);
      const kw = ['var', 'fn', 'if', 'else', 'while', 'for', 'break', 'continue', 'return', 'true', 'false', 'null'];
      toks.push({ t: kw.includes(w) ? w : 'id', v: w, line });
      i = j; continue;
    }
    const three = src.slice(i, i + 3);
    if (three === '===' || three === '!==') { toks.push({ t: 'op', v: three.slice(0, 2), line }); i += 3; continue; }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||', '+=', '-=', '*=', '/='].includes(two)) { toks.push({ t: 'op', v: two, line }); i += 2; continue; }
    if ('+-*/%()<>=!{}[];,:.?'.includes(c)) { toks.push({ t: 'op', v: c, line }); i++; continue; }
    throw new Error('无法识别的字符 "' + c + '" (行 ' + line + ')');
  }
  toks.push({ t: 'eof', v: null, line });
  return toks;
}

// ---------- 语法（含赋值） ----------
function parseWithAssign(src) {
  const toks = lex(src);
  let p = 0;
  const peek = () => toks[p];
  const is = (t, v) => { const k = toks[p]; return k.t === t && (v === undefined || k.v === v); };
  const next = () => toks[p++];
  const expect = (t, v) => {
    const k = toks[p];
    if (k.t !== t || (v !== undefined && k.v !== v)) throw new Error('语法错误: 期望 ' + (v || t) + ' 实际 "' + (k.v === null ? 'EOF' : k.v) + '" (行 ' + k.line + ')');
    return next();
  };
  const prec = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };
  function parseProgram() { const body = []; while (!is('eof')) body.push(parseStmt()); return { type: 'Block', body }; }
  function parseBlock() {
    expect('op', '{');
    const body = [];
    while (!is('op', '}')) { if (is('eof')) throw new Error('语法错误: 缺少 }'); body.push(parseStmt()); }
    expect('op', '}');
    return { type: 'Block', body };
  }
  function parseStmt() {
    const k = peek();
    if (k.t === 'var') {
      next();
      const name = expect('id').v;
      let init = null;
      if (is('op', '=')) { next(); init = parseAssign(); }
      expect('op', ';');
      return { type: 'Var', name, init };
    }
    if (k.t === 'fn') {
      next();
      const name = expect('id').v;
      expect('op', '(');
      const params = [];
      while (!is('op', ')')) { params.push(expect('id').v); if (is('op', ',')) next(); else break; }
      expect('op', ')');
      return { type: 'Fn', name, params, body: parseBlock() };
    }
    if (k.t === 'if') {
      next(); expect('op', '(');
      const cond = parseAssign();
      expect('op', ')');
      const then = parseBlock();
      let els = null;
      if (is('else')) { next(); els = is('if') ? parseStmt() : parseBlock(); }
      return { type: 'If', cond, then, els };
    }
    if (k.t === 'while') {
      next(); expect('op', '(');
      const cond = parseAssign();
      expect('op', ')');
      return { type: 'While', cond, body: parseBlock() };
    }
    if (k.t === 'for') {
      next(); expect('op', '(');
      const init = is('op', ';') ? null : parseStmt();
      const cond = is('op', ';') ? null : parseAssign();
      expect('op', ';');
      const step = is('op', ')') ? null : parseAssign();
      expect('op', ')');
      return { type: 'For', init, cond, step, body: parseBlock() };
    }
    if (k.t === 'break') { next(); expect('op', ';'); return { type: 'Break' }; }
    if (k.t === 'continue') { next(); expect('op', ';'); return { type: 'Continue' }; }
    if (k.t === 'return') {
      next();
      let val = null;
      if (!is('op', ';')) val = parseAssign();
      expect('op', ';');
      return { type: 'Return', val };
    }
    if (k.t === 'op' && k.v === '{') return parseBlock();
    const e = parseAssign();
    expect('op', ';');
    return { type: 'ExprStmt', expr: e };
  }
  function parseAssign() {
    const left = parseExpr(0);
    if (is('op', '?')) {
      next();
      const t = parseAssign();
      expect('op', ':');
      const e = parseAssign();
      return { type: 'Tern', cond: left, then: t, els: e };
    }
    if (is('op', '=') || is('op', '+=') || is('op', '-=') || is('op', '*=') || is('op', '/=')) {
      const op = next().v;
      const right = parseAssign();
      if (left.type !== 'Id' && left.type !== 'Index') throw new Error('语法错误: 非法赋值目标');
      return { type: 'Assign', op, target: left, value: right };
    }
    return left;
  }
  function parseExpr(minPrec) {
    let left = parseUnary();
    while (true) {
      const k = peek();
      if (k.t === 'op' && prec[k.v] !== undefined && prec[k.v] >= minPrec) {
        next();
        left = { type: 'Bin', op: k.v, left, right: parseExpr(prec[k.v] + 1) };
      } else break;
    }
    return left;
  }
  function parseUnary() {
    if (is('op', '!')) { next(); return { type: 'Un', op: '!', arg: parseUnary() }; }
    if (is('op', '-')) { next(); return { type: 'Un', op: '-', arg: parseUnary() }; }
    return parsePostfix();
  }
  function parsePostfix() {
    let e = parsePrimary();
    while (true) {
      if (is('op', '(')) {
        next();
        const args = [];
        while (!is('op', ')')) { args.push(parseAssign()); if (is('op', ',')) next(); else break; }
        expect('op', ')');
        e = { type: 'Call', callee: e, args };
      } else if (is('op', '[')) {
        next();
        const idx = parseAssign();
        expect('op', ']');
        e = { type: 'Index', obj: e, idx };
      } else if (is('op', '.')) {
        next();
        e = { type: 'Index', obj: e, idx: { type: 'Str', v: expect('id').v } };
      } else break;
    }
    return e;
  }
  function parsePrimary() {
    const k = peek();
    if (k.t === 'num') { next(); return { type: 'Num', v: k.v }; }
    if (k.t === 'str') { next(); return { type: 'Str', v: k.v }; }
    if (k.t === 'true') { next(); return { type: 'Bool', v: true }; }
    if (k.t === 'false') { next(); return { type: 'Bool', v: false }; }
    if (k.t === 'null') { next(); return { type: 'Null' }; }
    if (k.t === 'id') { next(); return { type: 'Id', name: k.v }; }
    if (k.t === 'op' && k.v === '(') { next(); const e = parseAssign(); expect('op', ')'); return e; }
    if (k.t === 'op' && k.v === '[') {
      next();
      const items = [];
      while (!is('op', ']')) { items.push(parseAssign()); if (is('op', ',')) next(); else break; }
      expect('op', ']');
      return { type: 'Arr', items };
    }
    if (k.t === 'op' && k.v === '{') {
      next();
      const entries = [];
      while (!is('op', '}')) {
        let key;
        if (is('str')) key = next().v; else key = expect('id').v;
        expect('op', ':');
        entries.push([key, parseAssign()]);
        if (is('op', ',')) next(); else break;
      }
      expect('op', '}');
      return { type: 'Obj', entries };
    }
    throw new Error('语法错误: 意外的 "' + (k.v === null ? 'EOF' : k.v) + '" (行 ' + k.line + ')');
  }
  return parseProgram();
}

// ---------- 代码生成 ----------
function compile(source) {
  const ast = parseWithAssign(source);
  const funcs = [];
  function newFunc(name, params) {
    const f = { name, params, code: [], consts: [] };
    funcs.push(f);
    return f;
  }
  const constIdx = (f, v) => {
    for (let i = 0; i < f.consts.length; i++) {
      const c = f.consts[i];
      if (c === v && typeof c === typeof v) return i;
      if (typeof v === 'number' && typeof c === 'number' && Object.is(c, v)) return i;
    }
    f.consts.push(v);
    return f.consts.length - 1;
  };
  const emit = (f, op, arg) => { f.code.push(arg === undefined ? [op] : [op, arg]); return f.code.length - 1; };

  const entry = newFunc('<main>', []);
  const loopStack = []; // {breaks:[], continues:[]}

  function genBlock(node, f) { for (const s of node.body) genStmt(s, f); }
  function genStmt(node, f) {
    switch (node.type) {
      case 'Block': genBlock(node, f); break;
      case 'Var':
        if (node.init) genExpr(node.init, f); else emit(f, 'push', constIdx(f, null));
        emit(f, 'decl', node.name);
        break;
      case 'Fn': {
        const nf = newFunc(node.name, node.params);
        emit(nf, 'enter', funcs.indexOf(nf));
        genBlock(node.body, nf);
        emit(nf, 'push', constIdx(nf, null));
        emit(nf, 'ret');
        // 闭包值：在当前环境创建
        emit(f, 'push', constIdx(f, { __fnref: funcs.indexOf(nf) }));
        emit(f, 'decl', node.name);
        break;
      }
      case 'If': {
        genExpr(node.cond, f);
        const jz = emit(f, 'jz', 0);
        genStmt(node.then, f);
        if (node.els) {
          const jmp = emit(f, 'jmp', 0);
          f.code[jz][1] = f.code.length;
          genStmt(node.els, f);
          f.code[jmp][1] = f.code.length;
        } else {
          f.code[jz][1] = f.code.length;
        }
        break;
      }
      case 'While': {
        const start = f.code.length;
        genExpr(node.cond, f);
        const jz = emit(f, 'jz', 0);
        loopStack.push({ breaks: [], continues: [] });
        genStmt(node.body, f);
        const ls = loopStack.pop();
        emit(f, 'jmp', start);
        f.code[jz][1] = f.code.length;
        for (const b of ls.breaks) f.code[b][1] = f.code.length;
        for (const c of ls.continues) f.code[c][1] = start;
        break;
      }
      case 'For': {
        if (node.init) genStmt(node.init, f);
        const start = f.code.length;
        let jz = -1;
        if (node.cond) { genExpr(node.cond, f); jz = emit(f, 'jz', 0); }
        loopStack.push({ breaks: [], continues: [] });
        genStmt(node.body, f);
        const ls = loopStack.pop();
        const contTarget = f.code.length;
        if (node.step) { genExpr(node.step, f); emit(f, 'pop'); }
        emit(f, 'jmp', start);
        const end = f.code.length;
        if (jz >= 0) f.code[jz][1] = end;
        for (const b of ls.breaks) f.code[b][1] = end;
        for (const c of ls.continues) f.code[c][1] = contTarget;
        break;
      }
      case 'Break': {
        if (!loopStack.length) throw new Error('break 不在循环中');
        const ls = loopStack[loopStack.length - 1];
        ls.breaks.push(emit(f, 'jmp', 0));
        break;
      }
      case 'Continue': {
        if (!loopStack.length) throw new Error('continue 不在循环中');
        const ls = loopStack[loopStack.length - 1];
        ls.continues.push(emit(f, 'jmp', 0));
        break;
      }
      case 'Return':
        if (node.val) genExpr(node.val, f); else emit(f, 'push', constIdx(f, null));
        emit(f, 'ret');
        break;
      case 'ExprStmt':
        genExpr(node.expr, f);
        emit(f, 'pop');
        break;
      default: throw new Error('未知语句 ' + node.type);
    }
  }
  function genExpr(node, f) {
    switch (node.type) {
      case 'Num': emit(f, 'push', constIdx(f, node.v)); break;
      case 'Str': emit(f, 'push', constIdx(f, node.v)); break;
      case 'Bool': emit(f, 'push', constIdx(f, node.v)); break;
      case 'Null': emit(f, 'push', constIdx(f, null)); break;
      case 'Id': emit(f, 'load', node.name); break;
      case 'Arr':
        for (const it of node.items) genExpr(it, f);
        emit(f, 'arr', node.items.length);
        break;
      case 'Obj':
        for (const [k, v] of node.entries) { emit(f, 'push', constIdx(f, k)); genExpr(v, f); }
        emit(f, 'obj', node.entries.length);
        break;
      case 'Index':
        genExpr(node.obj, f);
        genExpr(node.idx, f);
        emit(f, 'idx');
        break;
      case 'Un':
        genExpr(node.arg, f);
        emit(f, node.op === '!' ? 'not' : 'neg');
        break;
      case 'Tern': {
        genExpr(node.cond, f);
        const jz = emit(f, 'jz', 0);
        genExpr(node.then, f);
        const jmp = emit(f, 'jmp', 0);
        f.code[jz][1] = f.code.length;
        genExpr(node.els, f);
        f.code[jmp][1] = f.code.length;
        break;
      }
      case 'Bin': {
        if (node.op === '&&') {
          genExpr(node.left, f);
          const jz = emit(f, 'jz', 0);
          genExpr(node.right, f);
          const jmp = emit(f, 'jmp', 0);
          f.code[jz][1] = f.code.length;
          emit(f, 'push', constIdx(f, false));
          f.code[jmp][1] = f.code.length;
          break;
        }
        if (node.op === '||') {
          genExpr(node.left, f);
          const jnz = emit(f, 'jnz', 0);
          genExpr(node.right, f);
          const jmp = emit(f, 'jmp', 0);
          f.code[jnz][1] = f.code.length;
          emit(f, 'push', constIdx(f, true));
          f.code[jmp][1] = f.code.length;
          break;
        }
        genExpr(node.left, f);
        genExpr(node.right, f);
        const map = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '%': 'mod', '==': 'eq', '!=': 'ne', '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge' };
        emit(f, map[node.op]);
        break;
      }
      case 'Assign': {
        const t = node.target;
        if (node.op === '=') {
          if (t.type === 'Id') { genExpr(node.value, f); emit(f, 'store', t.name); }
          else { genExpr(t.obj, f); genExpr(t.idx, f); genExpr(node.value, f); emit(f, 'setidx'); }
        } else {
          const bop = { '+=': 'add', '-=': 'sub', '*=': 'mul', '/=': 'div' }[node.op];
          if (t.type === 'Id') {
            emit(f, 'load', t.name); genExpr(node.value, f); emit(f, bop); emit(f, 'store', t.name);
          } else {
            genExpr(t.obj, f); genExpr(t.idx, f);
            emit(f, 'dup2');
            emit(f, 'idx');
            genExpr(node.value, f);
            emit(f, bop);
            emit(f, 'setidx');
          }
        }
        break;
      }
      case 'Call': {
        // 成员调用 a.b(x)：先取函数值
        genExpr(node.callee, f);
        for (const a of node.args) genExpr(a, f);
        emit(f, 'call', node.args.length);
        break;
      }
      default: throw new Error('未知表达式 ' + node.type);
    }
  }
  genBlock(ast, entry);
  emit(entry, 'halt');
  // 解析 fnref 常量
  for (const f of funcs) {
    for (let i = 0; i < f.consts.length; i++) {
      const c = f.consts[i];
      if (c && typeof c === 'object' && c.__fnref !== undefined) f.consts[i] = { __fnref: c.__fnref };
    }
  }
  return { funcs, entry: 0 };
}

// ---------- 值工具 ----------
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) && v.__fnref === undefined && v.__native === undefined; }
function truthy(v) { return !(v === null || v === false || v === 0 || v === ''); }
function typeName(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'object') { if (v.__fnref !== undefined) return 'function'; if (v.__native !== undefined) return 'function'; return 'object'; }
  return typeof v;
}
function deepCopy(v, budget) {
  let cost = 0;
  const seen = new Set();
  function cp(x) {
    cost++;
    if (budget && cost > budget.max) throw new Error('复制超出配额');
    if (x === null || typeof x !== 'object') return x;
    if (seen.has(x)) throw new Error('数据存在循环引用，无法复制');
    seen.add(x);
    let r;
    if (Array.isArray(x)) { r = []; for (const it of x) r.push(cp(it)); }
    else if (x.__fnref !== undefined || x.__native !== undefined) { r = x; }
    else { r = {}; for (const k of Object.keys(x)) r[k] = cp(x[k]); }
    seen.delete(x);
    return r;
  }
  const out = cp(v);
  if (budget) budget.used += cost;
  return out;
}
function valueSize(v) {
  let cost = 0;
  const seen = new Set();
  function sz(x) {
    cost++;
    if (cost > 200000) return;
    if (x === null || typeof x !== 'object') return;
    if (seen.has(x)) return;
    seen.add(x);
    if (Array.isArray(x)) { for (const it of x) sz(it); }
    else if (x.__fnref === undefined && x.__native === undefined) { for (const k of Object.keys(x)) sz(x[k]); }
    seen.delete(x);
  }
  sz(v);
  return cost;
}

// ---------- 内置函数 ----------
const NATIVE_PURE = {
  len: a => { if (typeof a.v[0] === 'string') return a.v[0].length; if (Array.isArray(a.v[0])) return a.v[0].length; if (isObj(a.v[0])) return Object.keys(a.v[0]).length; throw new Error('len: 参数类型错误'); },
  str: a => { const v = a.v[0]; if (typeof v === 'string') return v; if (v === null) return 'null'; if (typeof v === 'object') return JSON.stringify(v); return String(v); },
  num: a => { const x = parseFloat(a.v[0]); if (isNaN(x)) throw new Error('num: 无法转换 "' + a.v[0] + '"'); return x; },
  sub: a => { const s = String(a.v[0]); let i = a.v[1] | 0; let n = a.v[2] === undefined ? s.length - i : a.v[2] | 0; if (i < 0) i = Math.max(0, s.length + i); return s.substr(i, Math.max(0, n)); },
  find: a => String(a.v[0]).indexOf(String(a.v[1])),
  push: a => { if (!Array.isArray(a.v[0])) throw new Error('push: 需要数组'); a.v[0].push(a.v[1]); return a.v[0].length; },
  pop: a => { if (!Array.isArray(a.v[0])) throw new Error('pop: 需要数组'); return a.v[0].length ? a.v[0].pop() : null; },
  keys: a => { if (!isObj(a.v[0])) throw new Error('keys: 需要对象'); return Object.keys(a.v[0]); },
  has: a => isObj(a.v[0]) && Object.prototype.hasOwnProperty.call(a.v[0], a.v[1]),
  del: a => { if (isObj(a.v[0])) { delete a.v[0][a.v[1]]; } return null; },
  floor: a => Math.floor(a.v[0]),
  ceil: a => Math.ceil(a.v[0]),
  abs: a => Math.abs(a.v[0]),
  min: a => Math.min(...a.v),
  max: a => Math.max(...a.v),
  sqrt: a => Math.sqrt(a.v[0]),
  sin: a => Math.sin(a.v[0]),
  cos: a => Math.cos(a.v[0]),
  atan2: a => Math.atan2(a.v[0], a.v[1]),
  pow: a => Math.pow(a.v[0], a.v[1]),
  type: a => typeName(a.v[0]),
  chr: a => String.fromCharCode(a.v[0]),
  ord: a => { const s = String(a.v[0]); return s.length ? s.charCodeAt(0) : 0; },
  split: a => String(a.v[0]).split(String(a.v[1])),
  join: a => { if (!Array.isArray(a.v[0])) throw new Error('join: 需要数组'); return a.v[0].map(x => typeof x === 'string' ? x : NATIVE_PURE.str({ v: [x] })).join(String(a.v[1])); },
  upper: a => String(a.v[0]).toUpperCase(),
  lower: a => String(a.v[0]).toLowerCase(),
  trim: a => String(a.v[0]).trim(),
  replace: a => String(a.v[0]).split(String(a.v[1])).join(String(a.v[2])),
  copy: a => deepCopy(a.v[0], a.budget),
  sort: a => { const arr = a.v[0]; if (!Array.isArray(arr)) throw new Error('sort: 需要数组'); arr.sort((x, y) => (typeof x === 'number' && typeof y === 'number') ? x - y : String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0); return arr; },
  slice: a => { const x = a.v[0]; const s = a.v[1] | 0; const e = a.v[2] === undefined ? undefined : a.v[2] | 0; if (Array.isArray(x) || typeof x === 'string') return x.slice(s, e); throw new Error('slice: 类型错误'); },
  json_parse: a => { try { return JSON.parse(String(a.v[0])); } catch (e) { throw new Error('json_parse: ' + e.message); } },
  json_str: a => JSON.stringify(a.v[0]),
  rand: a => { a.vm.rngState = (a.vm.rngState * 1664525 + 1013904223) >>> 0; return a.vm.rngState / 4294967296; },
  srand: a => { a.vm.rngState = (a.v[0] >>> 0) || 1; return null; },
  contains: a => String(a.v[0]).indexOf(String(a.v[1])) >= 0,
  starts: a => String(a.v[0]).indexOf(String(a.v[1])) === 0,
  ends: a => { const s = String(a.v[0]), t = String(a.v[1]); return s.length >= t.length && s.slice(s.length - t.length) === t; },
  pad: a => { let s = String(a.v[0]); const w = a.v[1] | 0; const ch = a.v[2] === undefined ? ' ' : String(a.v[2]); while (s.length < w) s = ch + s; return s; },
  round: a => Math.round(a.v[0]),
  clamp: a => Math.min(Math.max(a.v[0], a.v[1]), a.v[2]),
  error: a => { throw new Error(String(a.v[0])); },
};
// 内置函数额外计费（按规模）
function builtinCost(name, args) {
  switch (name) {
    case 'str': case 'json_str': return 4 + valueSize(args[0]) * 2;
    case 'json_parse': return 4 + String(args[0]).length;
    case 'sub': return 2 + Math.min(String(args[0]).length, (args[2] === undefined ? String(args[0]).length : args[2]) + 1);
    case 'find': case 'contains': case 'starts': case 'ends': return 2 + Math.min(String(args[0]).length, 4096);
    case 'split': return 2 + String(args[0]).length;
    case 'join': return 2 + valueSize(args[0]) * 2;
    case 'copy': return 2;
    case 'sort': return 2 + (Array.isArray(args[0]) ? args[0].length * 8 : 0);
    case 'keys': return 2 + (isObj(args[0]) ? Object.keys(args[0]).length : 0);
    case 'replace': return 2 + String(args[0]).length;
    case 'slice': return 2 + (Array.isArray(args[0]) ? args[0].length : String(args[0]).length);
    default: return 1;
  }
}

// 系统调用（阻塞式，由内核/宿主处理）
const SYSCALLS = new Set([
  'sys_self', 'sys_time', 'sys_wait', 'sys_spawn', 'sys_exit', 'sys_kill', 'sys_suspend', 'sys_resume_proc',
  'sys_send', 'sys_recv', 'sys_poll', 'sys_read', 'sys_write', 'sys_list', 'sys_mkdir', 'sys_delete',
  'sys_rename', 'sys_fcopy', 'sys_exists', 'sys_stat', 'sys_display', 'sys_scene', 'sys_scene_state',
  'sys_scene_close', 'sys_ps', 'sys_log', 'sys_request', 'sys_set', 'sys_args', 'sys_subscribe',
  'sys_unsubscribe', 'sys_windows', 'sys_child_create', 'sys_child_cmd', 'sys_child_list', 'sys_recompile',
  'sys_child_adopt', 'sys_recv_timeout', 'sys_register',
  // 内核特权调用（宿主处理）
  'sys_boot', 'sys_slice', 'sys_reply', 'sys_newvm', 'sys_dropvm', 'sys_suspendvm', 'sys_resumevm',
  'sys_child_spawn', 'sys_host_display', 'sys_host_windows', 'sys_host_scene',
  'sys_host_scene_state', 'sys_host_scene_close', 'sys_host_request', 'sys_host_log', 'sys_host_time',
  'sys_host_notify', 'sys_host_focus', 'sys_host_child_event', 'sys_meminfo',
  'sys_host_selfmsg', 'sys_host_reply'
]);

// ---------- 虚拟机 ----------
class VM {
  constructor(program, opts) {
    opts = opts || {};
    this.program = program;
    this.envs = [{ vars: {}, parent: -1 }];
    this.stack = [];
    this.frames = [{ f: program.entry, pc: 0, base: 0, env: 0 }];
    this.rngState = opts.rngSeed || 12345;
    this.work = 0;
    this.pending = null;      // {call, args}
    this.pendingReply = undefined;
    this.halted = false;
    this.error = null;
    if (opts.globals) {
      for (const k of Object.keys(opts.globals)) this.envs[0].vars[k] = opts.globals[k];
    }
    for (const name of Object.keys(NATIVE_PURE)) this.envs[0].vars[name] = { __native: name };
    for (const name of SYSCALLS) this.envs[0].vars[name] = { __native: name };
  }
  cur() { return this.frames[this.frames.length - 1]; }
  lookup(envIdx, name) {
    let e = envIdx;
    while (e >= 0) {
      const env = this.envs[e];
      if (Object.prototype.hasOwnProperty.call(env.vars, name)) return env;
      e = env.parent;
    }
    return null;
  }
  run(budget) {
    this.work = 0;
    const prog = this.program;
    let limit = budget;
    if (this.pendingReply !== undefined) {
      this.stack.push(this.pendingReply);
      this.pendingReply = undefined;
      this.cur().pc++;
      this.pending = null;
    }
    try {
      while (this.work < limit) {
        const fr = this.cur();
        const fn = prog.funcs[fr.f];
        if (fr.pc >= fn.code.length) { this.halted = true; return this.result('done'); }
        const ins = fn.code[fr.pc];
        const op = ins[0];
        this.work++;
        switch (op) {
          case 'push': {
            let c = fn.consts[ins[1]];
            if (c && typeof c === 'object' && c.__fnref !== undefined) c = { __fnref: c.__fnref, __env: fr.env };
            this.stack.push(c);
            fr.pc++; break;
          }
          case 'pop': this.stack.pop(); fr.pc++; break;
          case 'dup': this.stack.push(this.stack[this.stack.length - 1]); fr.pc++; break;
          case 'dup2': { const b = this.stack.pop(), a = this.stack.pop(); this.stack.push(a, b, a, b); fr.pc++; break; }
          case 'load': {
            const env = this.lookup(fr.env, ins[1]);
            if (!env) throw new Error('未定义的变量 "' + ins[1] + '"');
            this.stack.push(env.vars[ins[1]]);
            fr.pc++; break;
          }
          case 'store': {
            const env = this.lookup(fr.env, ins[1]);
            if (!env) throw new Error('未定义的变量 "' + ins[1] + '"');
            env.vars[ins[1]] = this.stack[this.stack.length - 1];
            fr.pc++; break;
          }
          case 'decl': this.envs[fr.env].vars[ins[1]] = this.stack.pop(); fr.pc++; break;
          case 'add': case 'sub': case 'mul': case 'div': case 'mod':
          case 'lt': case 'le': case 'gt': case 'ge': case 'eq': case 'ne': {
            const b = this.stack.pop(), a = this.stack.pop();
            let r;
            switch (op) {
              case 'add': r = (typeof a === 'string' || typeof b === 'string') ? (typeof a === 'string' ? a : NATIVE_PURE.str({ v: [a] })) + (typeof b === 'string' ? b : NATIVE_PURE.str({ v: [b] })) : a + b; break;
              case 'sub': r = a - b; break;
              case 'mul': r = a * b; break;
              case 'div': if (b === 0) throw new Error('除以零'); r = a / b; break;
              case 'mod': if (b === 0) throw new Error('除以零'); r = a % b; break;
              case 'lt': r = a < b; break;
              case 'le': r = a <= b; break;
              case 'gt': r = a > b; break;
              case 'ge': r = a >= b; break;
              case 'eq': r = a === b; break;
              case 'ne': r = a !== b; break;
            }
            this.stack.push(r);
            fr.pc++; break;
          }
          case 'neg': this.stack.push(-this.stack.pop()); fr.pc++; break;
          case 'not': this.stack.push(!truthy(this.stack.pop())); fr.pc++; break;
          case 'jmp': fr.pc = ins[1]; break;
          case 'jz': fr.pc = truthy(this.stack.pop()) ? fr.pc + 1 : ins[1]; break;
          case 'jnz': fr.pc = truthy(this.stack.pop()) ? ins[1] : fr.pc + 1; break;
          case 'arr': { const n = ins[1]; const a = this.stack.splice(this.stack.length - n, n); this.stack.push(a); fr.pc++; break; }
          case 'obj': {
            const n = ins[1]; const o = {};
            const items = this.stack.splice(this.stack.length - n * 2, n * 2);
            for (let i = 0; i < n; i++) o[items[i * 2]] = items[i * 2 + 1];
            this.stack.push(o); fr.pc++; break;
          }
          case 'idx': {
            const k = this.stack.pop(), o = this.stack.pop();
            if (o === null || o === undefined) throw new Error('对空值取下标 "' + k + '"');
            if (typeof o === 'string') { this.stack.push(o[k | 0] === undefined ? '' : o[k | 0]); }
            else if (Array.isArray(o)) { const i = k | 0; this.stack.push(i >= 0 && i < o.length ? o[i] : null); }
            else if (isObj(o)) { this.stack.push(Object.prototype.hasOwnProperty.call(o, k) ? o[k] : null); }
            else throw new Error('不能取下标: ' + typeName(o));
            fr.pc++; break;
          }
          case 'setidx': {
            const v = this.stack.pop(), k = this.stack.pop(), o = this.stack.pop();
            if (Array.isArray(o)) { const i = k | 0; if (i >= 0 && i < 1000000) { while (o.length <= i) o.push(null); o[i] = v; } else throw new Error('数组下标越界'); }
            else if (isObj(o)) o[k] = v;
            else throw new Error('不能设置下标: ' + typeName(o));
            this.stack.push(v);
            fr.pc++; break;
          }
          case 'enter': {
            const fidx = ins[1];
            const target = prog.funcs[fidx];
            const fr2 = this.cur();
            const env = { vars: {}, parent: fr2.env };
            const args = this.stack.splice(fr2.base, this.stack.length - fr2.base);
            for (let i = 0; i < target.params.length; i++) env.vars[target.params[i]] = i < args.length ? args[i] : null;
            this.envs.push(env);
            fr2.env = this.envs.length - 1;
            fr2.pc++;
            break;
          }
          case 'call': {
            const n = ins[1];
            const callee = this.stack[this.stack.length - n - 1];
            if (callee && typeof callee === 'object' && callee.__native !== undefined) {
              const name = callee.__native;
              const args = this.stack.splice(this.stack.length - n, n);
              this.stack.pop();
              if (SYSCALLS.has(name)) {
                this.pending = { call: name, args };
                return this.result('syscall');
              }
              const fnative = NATIVE_PURE[name];
              if (!fnative) throw new Error('未知函数 "' + name + '"');
              const extra = builtinCost(name, args);
              this.work += extra;
              const ctx = { v: args, vm: this, budget: { used: 0, max: 2000000 } };
              const r = fnative(ctx);
              this.work += ctx.budget.used;
              this.stack.push(r === undefined ? null : r);
              fr.pc++;
              break;
            }
            if (callee && typeof callee === 'object' && callee.__fnref !== undefined) {
              if (this.frames.length >= 200) throw new Error('调用栈过深');
              const base = this.stack.length - n;
              // 移除 callee，保留参数；帧先携带闭包环境，enter 时建立调用环境
              this.stack.splice(base - 1, 1);
              fr.pc++;
              this.frames.push({ f: callee.__fnref, pc: 0, base: base - 1, env: callee.__env !== undefined ? callee.__env : 0 });
              break;
            }
            throw new Error('调用非函数值: ' + typeName(callee));
          }
          case 'ret': {
            const v = this.stack.pop();
            const fr2 = this.frames.pop();
            this.stack.length = fr2.base;
            this.stack.push(v);
            if (!this.frames.length) { this.halted = true; return this.result('done'); }
            break;
          }
          case 'halt': this.halted = true; return this.result('done');
          default: throw new Error('未知指令 ' + op);
        }
        if (this.stack.length > 200000) throw new Error('栈溢出');
      }
      return this.result('budget');
    } catch (e) {
      this.error = e.message || String(e);
      return this.result('error');
    }
  }
  result(status) {
    return { status, work: this.work, call: this.pending ? this.pending.call : null, args: this.pending ? this.pending.args : null, error: this.error };
  }
  reply(v) { this.pendingReply = v; }
  memSize() {
    try { return JSON.stringify({ e: this.envs, s: this.stack, f: this.frames }).length; } catch (e) { return 1000000; }
  }
  toJSON() {
    return { envs: this.envs, stack: this.stack, frames: this.frames, rngState: this.rngState, pending: this.pending, pendingReply: this.pendingReply === undefined ? null : this.pendingReply, hasReply: this.pendingReply !== undefined, halted: this.halted, error: this.error };
  }
  static fromJSON(program, data) {
    const vm = new VM(program);
    vm.envs = data.envs;
    vm.stack = data.stack;
    vm.frames = data.frames;
    vm.rngState = data.rngState;
    vm.pending = data.pending;
    vm.pendingReply = data.hasReply ? data.pendingReply : undefined;
    vm.halted = data.halted;
    vm.error = data.error;
    return vm;
  }
}

module.exports = { compile, VM, NATIVE_PURE, SYSCALLS, deepCopy, valueSize, typeName, truthy, isObj, lex, parseWithAssign };
