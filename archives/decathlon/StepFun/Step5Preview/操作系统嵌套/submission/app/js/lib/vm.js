// ============================================================
// 微型程序语言（OSL）: 词法分析 / 语法分析 / 字节码编译 / 虚拟机
// 程序状态（ip、栈、帧、阻塞条件）全部为可 JSON 序列化数据，
// 因此进程状态可随系统快照保存与恢复。
// ============================================================

export const OPS = {
  PUSH_C: 1, TRUE: 2, FALSE: 3, NULL: 4, POP: 5, POPN: 6, DUP: 7,
  LOADL: 8, STOREL: 9, LOADG: 10, STOREG: 11,
  GETIDX: 12, SETIDX: 13, GETK: 14, SETK: 15,
  ADD: 16, SUB: 17, MUL: 18, DIV: 19, MOD: 20, NEG: 21,
  EQ: 22, NE: 23, LT: 24, LE: 25, GT: 26, GE: 27, NOT: 28,
  JMP: 29, JMP_IF_FALSE: 30, JMP_IF_FALSE_KEEP: 31,
  CALL: 32, RET: 33, HALT: 34,
  NEWARR: 35, NEWMAP: 36, LEN: 37,
  NAT: 38, SYS: 39
};
const OPNAME = {}; for (const k in OPS) OPNAME[OPS[k]] = k;

const KEYWORDS = new Set(['let', 'const', 'fn', 'if', 'else', 'while', 'for', 'in', 'break', 'continue', 'return', 'true', 'false', 'null', 'and', 'or', 'not']);

// ---------------- 词法分析 ----------------
export function tokenize(src) {
  const toks = []; let i = 0; const n = src.length; let line = 1;
  const isIdStart = c => /[A-Za-z_]/.test(c);
  const isId = c => /[A-Za-z0-9_]/.test(c);
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; } i += 2; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i;
      while (j < n && /[0-9]/.test(src[j])) j++;
      if (src[j] === '.' && /[0-9]/.test(src[j + 1] || '')) { j++; while (j < n && /[0-9]/.test(src[j])) j++; }
      if (src[j] === 'e' || src[j] === 'E') {
        let k = j + 1; if (src[k] === '+' || src[k] === '-') k++;
        if (/[0-9]/.test(src[k] || '')) { j = k; while (j < n && /[0-9]/.test(src[j])) j++; }
      }
      toks.push({ t: 'num', v: parseFloat(src.slice(i, j)), line }); i = j; continue;
    }
    if (c === '"') {
      let j = i + 1; let s = '';
      while (j < n && src[j] !== '"') {
        if (src[j] === '\\') {
          const e = src[j + 1];
          s += e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r' : e === '"' ? '"' : e === '\\' ? '\\' : e;
          j += 2;
        } else { if (src[j] === '\n') line++; s += src[j]; j++; }
      }
      if (j >= n) throw new OslError('字符串未闭合', line);
      toks.push({ t: 'str', v: s, line }); i = j + 1; continue;
    }
    if (isIdStart(c)) {
      let j = i; while (j < n && isId(src[j])) j++;
      const w = src.slice(i, j);
      toks.push({ t: KEYWORDS.has(w) ? w : 'ident', v: w, line }); i = j; continue;
    }
    const two = src.substr(i, 2);
    if (['==', '!=', '<=', '>=', '&&', '||', '..'].includes(two)) { toks.push({ t: two, line }); i += 2; continue; }
    if ('+-*/%=<>!(){}[],.:;'.includes(c)) { toks.push({ t: c, line }); i++; continue; }
    throw new OslError('无法识别的字符: ' + c, line);
  }
  toks.push({ t: 'eof', line });
  return toks;
}

export class OslError extends Error {
  constructor(msg, line) { super(line ? `第${line}行: ${msg}` : msg); this.osl = true; }
}

// ---------------- 语法分析 ----------------
function parseProgram(toks) {
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const expect = (t) => { if (toks[p].t !== t) throw new OslError(`期望 ${t}，得到 ${toks[p].t}`, toks[p].line); return toks[p++]; };
  const isKw = (t) => toks[p].t === t;

  function parseBlock() {
    expect('{');
    const body = [];
    while (!isKw('}')) { if (isKw('eof')) throw new OslError('缺少 }', peek().line); body.push(parseStmt()); }
    expect('}');
    return { k: 'block', body };
  }

  function parseStmt() {
    const tk = peek();
    if (tk.t === 'let' || tk.t === 'const') { next(); const name = expect('ident').v; let init = null; if (peek().t === '=') { next(); init = parseExpr(); } semi(); return { k: 'decl', name, init, const: tk.t === 'const' }; }
    if (tk.t === 'fn') { next(); const name = expect('ident').v; expect('('); const params = []; if (peek().t !== ')') { do { params.push(expect('ident').v); } while (peek().t === ',' && next()); } expect(')'); const body = parseBlock(); return { k: 'fn', name, params, body }; }
    if (tk.t === 'if') { next(); const cond = parseExpr(); const then = parseBlock(); let els = null; if (isKw('else')) { next(); els = isKw('if') ? parseStmt() : parseBlock(); } return { k: 'if', cond, then, els }; }
    if (tk.t === 'while') { next(); const cond = parseExpr(); const body = parseBlock(); return { k: 'while', cond, body }; }
    if (tk.t === 'for') {
      next(); const name = expect('ident').v; expect('in');
      const first = parseExpr();
      if (peek().t === '..') { next(); const second = parseExpr(); const body = parseBlock(); return { k: 'forrange', name, from: first, to: second, body }; }
      const body = parseBlock(); return { k: 'forin', name, arr: first, body };
    }
    if (tk.t === 'break') { next(); semi(); return { k: 'break' }; }
    if (tk.t === 'continue') { next(); semi(); return { k: 'continue' }; }
    if (tk.t === 'return') { next(); let val = null; if (peek().t !== ';' && peek().t !== '}' && peek().t !== 'eof') val = parseExpr(); semi(); return { k: 'return', val }; }
    if (tk.t === '{') return parseBlock();
    // 赋值或表达式语句
    const e = parseExpr();
    if (peek().t === '=') {
      next(); const val = parseExpr(); semi();
      if (e.k === 'ident') return { k: 'assign', name: e.name, val };
      if (e.k === 'index') return { k: 'setidx', obj: e.obj, idx: e.idx, val };
      if (e.k === 'field') return { k: 'setfield', obj: e.obj, key: e.name, val };
      throw new OslError('赋值目标无效', tk.line);
    }
    semi();
    return { k: 'expr', e };
  }
  // 语句结束符：分号可选（换行即结束）
  function semi() { if (peek().t === ';') next(); }

  function parseExpr() { return parseOr(); }
  function parseOr() { let l = parseAnd(); while (peek().t === 'or' || peek().t === '||') { next(); const r = parseAnd(); l = { k: 'logic', op: 'or', l, r }; } return l; }
  function parseAnd() { let l = parseEq(); while (peek().t === 'and' || peek().t === '&&') { next(); const r = parseEq(); l = { k: 'logic', op: 'and', l, r }; } return l; }
  function parseEq() { let l = parseRel(); while (peek().t === '==' || peek().t === '!=') { const op = next().t; const r = parseRel(); l = { k: 'bin', op, l, r }; } return l; }
  function parseRel() { let l = parseAdd(); while (['<', '<=', '>', '>='].includes(peek().t)) { const op = next().t; const r = parseAdd(); l = { k: 'bin', op, l, r }; } return l; }
  function parseAdd() { let l = parseMul(); while (peek().t === '+' || peek().t === '-') { const op = next().t; const r = parseMul(); l = { k: 'bin', op, l, r }; } return l; }
  function parseMul() { let l = parseUnary(); while (['*', '/', '%'].includes(peek().t)) { const op = next().t; const r = parseUnary(); l = { k: 'bin', op, l, r }; } return l; }
  function parseUnary() {
    if (peek().t === '-') { next(); return { k: 'neg', e: parseUnary() }; }
    if (peek().t === '!' || peek().t === 'not') { next(); return { k: 'not', e: parseUnary() }; }
    return parsePostfix();
  }
  function parsePostfix() {
    let e = parsePrimary();
    for (;;) {
      if (peek().t === '(') {
        next(); const args = [];
        if (peek().t !== ')') { do { args.push(parseExpr()); } while (peek().t === ',' && next()); }
        expect(')');
        if (e.k !== 'ident') throw new OslError('只能调用具名函数', peek().line);
        e = { k: 'call', name: e.name, args };
      } else if (peek().t === '[') {
        next(); const idx = parseExpr(); expect(']');
        e = { k: 'index', obj: e, idx };
      } else if (peek().t === '.') {
        next(); const name = expect('ident').v;
        e = { k: 'field', obj: e, name };
      } else break;
    }
    return e;
  }
  function parsePrimary() {
    const tk = next();
    if (tk.t === 'num' || tk.t === 'str') return { k: 'lit', v: tk.v };
    if (tk.t === 'true') return { k: 'lit', v: true };
    if (tk.t === 'false') return { k: 'lit', v: false };
    if (tk.t === 'null') return { k: 'lit', v: null };
    if (tk.t === 'ident') return { k: 'ident', name: tk.v };
    if (tk.t === '(') { const e = parseExpr(); expect(')'); return e; }
    if (tk.t === '[') {
      const items = [];
      if (peek().t !== ']') { do { items.push(parseExpr()); } while (peek().t === ',' && next()); }
      expect(']'); return { k: 'arr', items };
    }
    if (tk.t === '{') {
      const pairs = [];
      if (peek().t !== '}') {
        do {
          const kt = next();
          if (kt.t !== 'ident' && kt.t !== 'str') throw new OslError('映射键必须是标识符或字符串', kt.line);
          expect(':'); pairs.push([kt.v, parseExpr()]);
        } while (peek().t === ',' && next());
      }
      expect('}'); return { k: 'map', pairs };
    }
    throw new OslError('意外的记号 ' + tk.t, tk.line);
  }

  const body = [];
  while (!isKw('eof')) body.push(parseStmt());
  return { k: 'program', body };
}

export function parse(src) {
  const toks = tokenize(src);
  return parseProgram(toks);
}

// ---------------- 字节码编译 ----------------
export function compile(ast) {
  const funcs = [];
  const fnIndex = new Map();

  function collect(stmts) {
    for (const s of stmts) {
      if (s.k === 'fn' && !fnIndex.has(s.name)) fnIndex.set(s.name, funcs.length), funcs.push({ name: s.name, params: s.params, body: s.body, code: [], consts: [], nlocals: s.params.length });
      if (s.k === 'block') collect(s.body);
      if (s.k === 'if') { collect(s.then.body); if (s.els) collect(s.els.k === 'block' ? s.els.body : [s.els]); }
      if (s.k === 'while' || s.k === 'forrange' || s.k === 'forin') collect(s.body.body);
    }
  }
  collect(ast.body);

  // main 函数（顶层语句）
  const main = { name: '$main', params: [], body: { k: 'block', body: ast.body }, code: [], consts: [], nlocals: 0 };
  funcs.unshift(main); // main 固定在 0
  // fnIndex 需整体 +1（因为 unshift）
  const old = [...fnIndex.entries()]; fnIndex.clear(); for (const [k, v] of old) fnIndex.set(k, v + 1);

  for (const f of funcs) compileFunc(f);

  return { funcs: funcs.map(f => ({ name: f.name, params: f.params, nlocals: f.nlocals, code: f.code, consts: f.consts })) };

  function compileFunc(f) {
    const code = f.code, consts = f.consts;
    const locals = new Map();
    f.params.forEach((p, i) => locals.set(p, i));
    const isMain = f.name === '$main';
    const emit = (o, a, b) => code.push([o, a === undefined ? 0 : a, b === undefined ? 0 : b]);
    const K = v => { const i = consts.indexOf(v); if (i >= 0) return i; consts.push(v); return consts.length - 1; };
    const newLocal = name => { if (!locals.has(name)) locals.set(name, f.nlocals++); return locals.get(name); };

    // 提升嵌套函数声明
    const hoisted = [];
    (function walk(stmts) {
      for (const s of stmts) {
        if (s.k === 'fn') hoisted.push(s);
        if (s.k === 'block') walk(s.body);
        if (s.k === 'if') { walk(s.then.body); if (s.els) walk(s.els.k === 'block' ? s.els.body : [s.els]); }
        if (s.k === 'while' || s.k === 'forrange' || s.k === 'forin') walk(s.body.body);
      }
    })(f.body.body);
    for (const h of hoisted) if (!fnIndex.has(h.name)) fnIndex.set(h.name, funcs.length), funcs.push({ name: h.name, params: h.params, body: h.body, code: [], consts: [], nlocals: h.params.length });

    function loadName(name) {
      if (locals.has(name)) emit(OPS.LOADL, locals.get(name));
      else emit(OPS.LOADG, name);
    }
    function storeName(name) {
      if (locals.has(name)) emit(OPS.STOREL, locals.get(name));
      else emit(OPS.STOREG, name);
    }

    function compileExpr(e) {
      switch (e.k) {
        case 'lit': emit(e.v === true ? OPS.TRUE : e.v === false ? OPS.FALSE : e.v === null ? OPS.NULL : OPS.PUSH_C, e.v === true || e.v === false || e.v === null ? 0 : K(e.v)); return;
        case 'ident': loadName(e.name); return;
        case 'arr': for (const it of e.items) compileExpr(it); emit(OPS.NEWARR, e.items.length); return;
        case 'map': for (const [k, v] of e.pairs) { emit(OPS.PUSH_C, K(k)); compileExpr(v); } emit(OPS.NEWMAP, e.pairs.length); return;
        case 'neg': compileExpr(e.e); emit(OPS.NEG); return;
        case 'not': compileExpr(e.e); emit(OPS.NOT); return;
        case 'logic': {
          compileExpr(e.l);
          if (e.op === 'and') {
            const jf = code.length; emit(OPS.JMP_IF_FALSE_KEEP, 0);
            emit(OPS.POP);
            compileExpr(e.r);
            code[jf][1] = code.length;
          } else {
            const jf = code.length; emit(OPS.JMP_IF_FALSE_KEEP, 0);
            const jend = code.length; emit(OPS.JMP, 0);
            emit(OPS.POP);
            compileExpr(e.r);
            code[jf][1] = jend + 1;
            code[jend][1] = code.length;
          }
          return;
        }
        case 'bin': {
          compileExpr(e.l); compileExpr(e.r);
          const m = { '+': OPS.ADD, '-': OPS.SUB, '*': OPS.MUL, '/': OPS.DIV, '%': OPS.MOD, '==': OPS.EQ, '!=': OPS.NE, '<': OPS.LT, '<=': OPS.LE, '>': OPS.GT, '>=': OPS.GE };
          emit(m[e.op]); return;
        }
        case 'index': compileExpr(e.obj); compileExpr(e.idx); emit(OPS.GETIDX); return;
        case 'field': compileExpr(e.obj); emit(OPS.GETK, e.name); return;
        case 'call': {
          if (NATIVES.has(e.name)) { for (const a of e.args) compileExpr(a); emit(OPS.NAT, e.name, e.args.length); return; }
          if (e.name === 'rnd' || SYSCALLS.has(e.name)) { for (const a of e.args) compileExpr(a); emit(OPS.SYS, e.name, e.args.length); return; }
          if (!fnIndex.has(e.name)) throw new OslError(`未定义的函数: ${e.name}`);
          for (const a of e.args) compileExpr(a);
          emit(OPS.CALL, fnIndex.get(e.name), e.args.length);
          return;
        }
      }
      throw new OslError('无法编译的表达式');
    }

    function compileStmts(stmts) {
      for (const s of stmts) compileStmt(s);
    }

    function compileStmt(s) {
      switch (s.k) {
        case 'block': compileStmts(s.body); return;
        case 'decl': {
          if (isMain) {
            if (s.init) { compileExpr(s.init); emit(OPS.STOREG, s.name); } else emit(OPS.NULL), emit(OPS.STOREG, s.name);
          } else {
            const slot = newLocal(s.name);
            if (s.init) { compileExpr(s.init); emit(OPS.STOREL, slot); } else { emit(OPS.NULL); emit(OPS.STOREL, slot); }
          }
          return;
        }
        case 'fn': return; // 已提升
        case 'assign': compileExpr(s.val); storeName(s.name); return;
        case 'setidx': compileExpr(s.obj); compileExpr(s.idx); compileExpr(s.val); emit(OPS.SETIDX); return;
        case 'setfield': compileExpr(s.obj); compileExpr(s.val); emit(OPS.SETK, s.key); return;
        case 'expr': compileExpr(s.e); emit(OPS.POP); return;
        case 'if': {
          compileExpr(s.cond); const j1 = code.length; emit(OPS.JMP_IF_FALSE, 0);
          compileStmts(s.then.body);
          if (s.els) {
            const j2 = code.length; emit(OPS.JMP, 0);
            code[j1][1] = code.length;
            if (s.els.k === 'block') compileStmts(s.els.body); else compileStmt(s.els);
            code[j2][1] = code.length;
          } else code[j1][1] = code.length;
          return;
        }
        case 'while': {
          const start = code.length; compileExpr(s.cond);
          const jf = code.length; emit(OPS.JMP_IF_FALSE, 0);
          const loop = { breaks: [], continues: [] };
          loopStack.push(loop);
          compileStmts(s.body.body);
          loopStack.pop();
          emit(OPS.JMP, start);
          code[jf][1] = code.length;
          for (const b of loop.breaks) code[b][1] = code.length;
          return;
        }
        case 'forrange': {
          const slot = newLocal(s.name);
          const iv = newLocal('$i_' + s.name + '_' + code.length);
          const tv = newLocal('$t_' + s.name + '_' + code.length);
          compileExpr(s.from); emit(OPS.STOREL, iv);
          compileExpr(s.to); emit(OPS.STOREL, tv);
          const start = code.length;
          emit(OPS.LOADL, iv); emit(OPS.LOADL, tv); emit(OPS.LE);
          const jf = code.length; emit(OPS.JMP_IF_FALSE, 0);
          emit(OPS.LOADL, iv); emit(OPS.STOREL, slot);
          const loop = { breaks: [], continues: [] };
          loopStack.push(loop);
          compileStmts(s.body.body);
          loopStack.pop();
          loop.continueAt = code.length;
          emit(OPS.LOADL, iv); emit(OPS.PUSH_C, K(1)); emit(OPS.ADD); emit(OPS.STOREL, iv);
          emit(OPS.JMP, start);
          code[jf][1] = code.length;
          for (const b of loop.breaks) code[b][1] = code.length;
          for (const c of loop.continues) code[c][1] = loop.continueAt;
          return;
        }
        case 'forin': {
          const slot = newLocal(s.name);
          const iv = newLocal('$i_' + s.name + '_' + code.length);
          const av = newLocal('$a_' + s.name + '_' + code.length);
          compileExpr(s.arr); emit(OPS.STOREL, av);
          emit(OPS.PUSH_C, K(0)); emit(OPS.STOREL, iv);
          const start = code.length;
          emit(OPS.LOADL, iv); emit(OPS.LOADL, av); emit(OPS.LEN); emit(OPS.LT);
          const jf = code.length; emit(OPS.JMP_IF_FALSE, 0);
          emit(OPS.LOADL, av); emit(OPS.LOADL, iv); emit(OPS.GETIDX); emit(OPS.STOREL, slot);
          const loop = { breaks: [], continues: [] };
          loopStack.push(loop);
          compileStmts(s.body.body);
          loopStack.pop();
          loop.continueAt = code.length;
          emit(OPS.LOADL, iv); emit(OPS.PUSH_C, K(1)); emit(OPS.ADD); emit(OPS.STOREL, iv);
          emit(OPS.JMP, start);
          code[jf][1] = code.length;
          for (const b of loop.breaks) code[b][1] = code.length;
          for (const c of loop.continues) code[c][1] = loop.continueAt;
          return;
        }
        case 'break': { const l = loopStack[loopStack.length - 1]; if (!l) throw new OslError('break 只能在循环内'); l.breaks.push(code.length); emit(OPS.JMP, 0); return; }
        case 'continue': { const l = loopStack[loopStack.length - 1]; if (!l) throw new OslError('continue 只能在循环内'); l.continues.push(code.length); emit(OPS.JMP, 0); return; }
        case 'return': { if (s.val) compileExpr(s.val); else emit(OPS.NULL); emit(OPS.RET); return; }
      }
      throw new OslError('无法编译的语句 ' + s.k);
    }

    const loopStack = [];
    compileStmts(f.body.body);
    if (!isMain) emit(OPS.NULL), emit(OPS.RET); else emit(OPS.HALT);
  }
}

// ---------------- 内建纯函数 ----------------
const NATIVES = new Set(['len', 'str', 'num', 'abs', 'floor', 'ceil', 'round', 'sqrt', 'min', 'max', 'pow', 'sin', 'cos', 'atan2', 'pi',
  'substr', 'split', 'join', 'upper', 'lower', 'find', 'replace', 'trim', 'keys', 'has', 'push', 'type', 'clamp', 'tojson', 'fromjson', 'get', 'shift', 'slice']);

function natCall(name, args) {
  const A = args;
  switch (name) {
    case 'len': { const v = A[0]; if (typeof v === 'string') return v.length; if (Array.isArray(v)) return v.length; if (v && typeof v === 'object') return Object.keys(v).length; throw new OslError('len 需要字符串、数组或映射'); }
    case 'str': { const v = A[0]; return v === null ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v); }
    case 'num': { const v = A[0]; const n = Number(v); if (!isFinite(n)) throw new OslError('无法转换为数值'); return n; }
    case 'abs': return Math.abs(A[0]);
    case 'floor': return Math.floor(A[0]);
    case 'ceil': return Math.ceil(A[0]);
    case 'round': return Math.round(A[0]);
    case 'sqrt': { const r = Math.sqrt(A[0]); if (!isFinite(r)) throw new OslError('负数开方'); return r; }
    case 'min': return Math.min(A[0], A[1]);
    case 'max': return Math.max(A[0], A[1]);
    case 'pow': return Math.pow(A[0], A[1]);
    case 'sin': return Math.sin(A[0]);
    case 'cos': return Math.cos(A[0]);
    case 'atan2': return Math.atan2(A[0], A[1]);
    case 'pi': return Math.PI;
    case 'clamp': return Math.min(A[2], Math.max(A[1], A[0]));
    case 'substr': { const s = A[0], i = A[1] | 0, n = A[2] === undefined ? s.length - i : A[2] | 0; return s.substr(i, n); }
    case 'split': return String(A[0]).split(A[1]);
    case 'join': return A[0].map(x => x === null ? 'null' : String(x)).join(A[1] === undefined ? '' : A[1]);
    case 'upper': return String(A[0]).toUpperCase();
    case 'lower': return String(A[0]).toLowerCase();
    case 'find': return String(A[0]).indexOf(A[1]);
    case 'replace': return String(A[0]).split(A[1]).join(A[2]);
    case 'trim': return String(A[0]).trim();
    case 'keys': return Object.keys(A[0]);
    case 'has': return Object.prototype.hasOwnProperty.call(A[0], A[1]);
    case 'push': A[0].push(A[1]); return null;
    case 'type': { const v = A[0]; if (v === null) return 'null'; if (Array.isArray(v)) return 'arr'; const t = typeof v; return t === 'number' ? 'num' : t === 'string' ? 'str' : t === 'boolean' ? 'bool' : t === 'object' ? 'map' : t; }
    case 'tojson': return JSON.stringify(A[0]);
    case 'fromjson': { try { return JSON.parse(A[0]); } catch (e) { throw new OslError('JSON 解析失败'); } }
    case 'get': { const m = A[0]; if (m === null || typeof m !== 'object') return A[2] === undefined ? null : A[2]; const v = m[A[1]]; return v === undefined ? (A[2] === undefined ? null : A[2]) : v; }
    case 'shift': { const a = A[0]; if (!Array.isArray(a) || a.length === 0) return []; return a.slice(1); }
    case 'slice': { const a = A[0]; const i = A[1] || 0; const n = A[2] === undefined ? a.length - i : A[2]; return a.slice(i, i + n); }
  }
  throw new OslError('未知内建函数 ' + name);
}

// 可由程序调用的系统调用（由所属内核的处理函数实现）
const SYSCALLS = new Set(['time', 'sleep', 'spawn', 'self', 'send', 'recv', 'poll', 'kill', 'procs',
  'read_file', 'write_file', 'list_dir', 'delete_file', 'exists', 'mkdir', 'move_file', 'copy_file', 'file_size',
  'submit_window', 'get_window_content', 'submit_display', 'submit3d', 'get3d', 'project', 'projection_input', 'get_projection',
  'sensors', 'write_controls', 'controls', 'flight_update', 'rnd', 'print', 'connect_data', 'disconnect_data', 'data_state', 'transfer_file', 'transfer_from', 'receive_file',
  'save_snapshot', 'load_snapshot', 'fork_snapshot', 'step_child', 'set_rate', 'sys_info', 'systems', 'request',
  'drag_begin', 'drag_end', 'console_tail', 'reg_win',
  // 以下为内核程序专用的宿主原语（仅内核进程可调用）
  'K_now', 'K_poll', 'K_recv', 'K_send', 'K_send_system', 'K_spawn', 'K_spawn_file', 'K_run', 'K_kill',
  'K_suspend', 'K_resume', 'K_procs', 'K_qpush', 'K_qpop', 'K_qlen', 'K_set_quota',
  'K_fs_read', 'K_fs_write', 'K_fs_list', 'K_fs_delete', 'K_fs_mkdir', 'K_fs_exists', 'K_fs_move', 'K_fs_copy',
  'K_submit', 'K_submit3d', 'K_get3d', 'K_input', 'K_create_system', 'K_step_child',
  'K_snapshot_save', 'K_snapshot_load', 'K_snapshot_fork', 'K_charge', 'K_project', 'K_projection_input',
  'K_self', 'K_budget_left', 'K_compile', 'K_transfer_file', 'K_flight_set', 'K_flight_get',
  'K_ctrl_set', 'K_ctrl_get', 'K_set_config', 'K_log', 'K_set_title',
  'K_fail', 'K_child_info', 'K_mem_used', 'K_mem_quota', 'K_storage_used', 'K_storage_quota', 'K_set_mem',
  'K_get_projection', 'K_self_close', 'K_self_restart', 'K_parse', 'K_set_compiler', 'K_set_time']);

// ---------------- 虚拟机 ----------------
export class VM {
  constructor(program, globals) {
    this.prog = program;
    this.globals = globals || {};
    this.ip = 0;
    this.frames = [{ f: 0, ip: 0, locals: new Array(program.funcs[0].nlocals).fill(null) }];
    this.stack = [];
    this.blocked = null;   // {kind:'vtime', until} | {kind:'msg'} | {kind:'io'}
    this.done = false;
    this.result = null;
  }
  get fn() { return this.prog.funcs[this.frames[this.frames.length - 1].f]; }
  get frame() { return this.frames[this.frames.length - 1]; }

  // 保存可序列化状态
  saveState() {
    return {
      ip: this.ip,
      frames: this.frames.map(f => ({ f: f.f, ip: f.ip, locals: f.locals.slice() })),
      stack: this.stack.slice(),
      blocked: this.blocked, done: this.done, result: this.result
    };
  }
  loadState(st) {
    this.ip = st.ip;
    this.frames = st.frames.map(f => ({ f: f.f, ip: f.ip, locals: f.locals.slice() }));
    this.stack = st.stack.slice();
    this.blocked = st.blocked; this.done = st.done; this.result = st.result;
  }

  // 在当前虚拟机内调用一个全局函数并取回返回值（供内核处理函数使用）
  callFn(name, args, sys, maxQ) {
    const idx = this.prog.funcs.findIndex(f => f.name === name);
    if (idx < 0) return { error: '内核没有处理函数 ' + name };
    const saved = { ip: this.ip, frames: this.frames, stack: this.stack, done: this.done, result: this.result, blocked: this.blocked };
    const fdef = this.prog.funcs[idx];
    const mainF = this.prog.funcs[0];
    this.frames = [{ f: 0, ip: mainF.code.length, locals: new Array(mainF.nlocals).fill(null) }];
    this.frames.push({ f: idx, ip: 0, locals: new Array(fdef.nlocals).fill(null) });
    for (let i = 0; i < args.length; i++) this.frames[1].locals[i] = args[i];
    this.stack = [];
    this.done = false; this.blocked = null; this.left = maxQ || 20000;
    const r = this.run(this.left, sys);
    const val = this.stack.length ? this.stack[this.stack.length - 1] : null;
    this.ip = saved.ip; this.frames = saved.frames; this.stack = saved.stack;
    this.done = saved.done; this.result = saved.result; this.blocked = saved.blocked;
    if (r.status === 'error') return { error: r.error };
    if (r.status === 'blocked') return { error: '内核处理函数发生阻塞' };
    return { value: val };
  }

  // 执行至多 quantum 条指令；sys(name,args) 返回 {value} 或 {block:cond}
  // this.left 为剩余额度，宿主可在系统调用中扣减（用于把子进程的工作计入同一份额）
  run(quantum, sys) {
    this.left = quantum;
    let used = 0;
    const O = OPS;
    try {
      while (used < this.left && !this.done) {
        const fr = this.frames[this.frames.length - 1];
        const code = this.prog.funcs[fr.f].code;
        if (fr.ip >= code.length) { this.done = true; this.result = null; break; }
        const ins = code[fr.ip++];
        this.ip = fr.ip;
        used++;
        const op = ins[0];
        switch (op) {
          case O.PUSH_C: this.stack.push(ins[1] !== undefined ? this.fn.consts[ins[1]] : ins[1]); break;
          case O.TRUE: this.stack.push(true); break;
          case O.FALSE: this.stack.push(false); break;
          case O.NULL: this.stack.push(null); break;
          case O.POP: this.stack.pop(); break;
          case O.POPN: this.stack.length -= ins[1]; break;
          case O.DUP: this.stack.push(this.stack[this.stack.length - 1]); break;
          case O.LOADL: this.stack.push(fr.locals[ins[1]]); break;
          case O.STOREL: fr.locals[ins[1]] = this.stack.pop(); break;
          case O.LOADG: { const v = this.globals[ins[1]]; if (v === undefined) throw new OslError('未定义变量 ' + ins[1]); this.stack.push(v); break; }
          case O.STOREG: this.globals[ins[1]] = this.stack.pop(); break;
          case O.GETIDX: { const i = this.stack.pop(); const o = this.stack.pop(); if (o === null || o === undefined) throw new OslError('对空值取下标'); if (Array.isArray(o)) { const k = i | 0; if (k < 0 || k >= o.length) throw new OslError('数组下标越界: ' + i); this.stack.push(o[k]); } else if (typeof o === 'string') { const k = i | 0; if (k < 0 || k >= o.length) throw new OslError('字符串下标越界'); this.stack.push(o[k]); } else { const v = o[i]; if (v === undefined) throw new OslError('映射没有键 ' + i); this.stack.push(v); } break; }
          case O.SETIDX: { const v = this.stack.pop(); const i = this.stack.pop(); const o = this.stack.pop(); if (o === null) throw new OslError('对空值设置下标'); if (Array.isArray(o)) { const k = i | 0; if (k < 0 || k >= o.length) throw new OslError('数组下标越界: ' + i); o[k] = v; } else o[i] = v; this.stack.push(v); break; }
          case O.GETK: { const o = this.stack.pop(); if (o === null || o === undefined) throw new OslError('对空值取字段 ' + ins[1]); const v = o[ins[1]]; this.stack.push(v === undefined ? null : v); break; }
          case O.SETK: { const v = this.stack.pop(); const o = this.stack.pop(); if (o === null) throw new OslError('对空值设置字段'); o[ins[1]] = v; this.stack.push(v); break; }
          case O.ADD: { const b = this.stack.pop(); const a = this.stack.pop(); if (typeof a === 'string' || typeof b === 'string') this.stack.push(strOf(a) + strOf(b)); else this.stack.push(a + b); break; }
          case O.SUB: { const b = this.stack.pop(); const a = this.stack.pop(); this.stack.push(a - b); break; }
          case O.MUL: { const b = this.stack.pop(); const a = this.stack.pop(); this.stack.push(a * b); break; }
          case O.DIV: { const b = this.stack.pop(); const a = this.stack.pop(); if (b === 0) throw new OslError('除零'); this.stack.push(a / b); break; }
          case O.MOD: { const b = this.stack.pop(); const a = this.stack.pop(); if (b === 0) throw new OslError('除零'); this.stack.push(a % b); break; }
          case O.NEG: this.stack.push(-this.stack.pop()); break;
          case O.EQ: { const b = this.stack.pop(); const a = this.stack.pop(); this.stack.push(eqv(a, b)); break; }
          case O.NE: { const b = this.stack.pop(); const a = this.stack.pop(); this.stack.push(!eqv(a, b)); break; }
          case O.LT: { const b = this.stack.pop(); const a = this.stack.pop(); this.stack.push(cmpv(a, b) < 0); break; }
          case O.LE: { const b = this.stack.pop(); const a = this.stack.pop(); this.stack.push(cmpv(a, b) <= 0); break; }
          case O.GT: { const b = this.stack.pop(); const a = this.stack.pop(); this.stack.push(cmpv(a, b) > 0); break; }
          case O.GE: { const b = this.stack.pop(); const a = this.stack.pop(); this.stack.push(cmpv(a, b) >= 0); break; }
          case O.NOT: this.stack.push(!truthy(this.stack.pop())); break;
          case O.JMP: fr.ip = ins[1]; break;
          case O.JMP_IF_FALSE: { if (!truthy(this.stack.pop())) fr.ip = ins[1]; break; }
          case O.JMP_IF_FALSE_KEEP: { if (!truthy(this.stack[this.stack.length - 1])) fr.ip = ins[1]; break; }
          case O.CALL: {
            const fdef = this.prog.funcs[ins[1]];
            const argc = ins[2];
            const args = this.stack.splice(this.stack.length - argc, argc);
            if (this.frames.length > 200) throw new OslError('调用层级过深');
            fr.ip = this.frames[this.frames.length - 1].ip;
            const nf = { f: ins[1], ip: 0, locals: new Array(fdef.nlocals).fill(null) };
            for (let i = 0; i < argc; i++) nf.locals[i] = args[i];
            this.frames.push(nf);
            break;
          }
          case O.RET: {
            const rv = this.stack.pop();
            this.frames.pop();
            if (this.frames.length === 0) { this.done = true; this.result = rv; this.stack.push(rv); }
            else this.stack.push(rv);
            break;
          }
          case O.HALT: this.done = true; this.result = this.stack.length ? this.stack[this.stack.length - 1] : null; break;
          case O.NEWARR: { const n = ins[1]; const items = this.stack.splice(this.stack.length - n, n); this.stack.push(items); break; }
          case O.NEWMAP: { const n = ins[1]; const flat = this.stack.splice(this.stack.length - n * 2, n * 2); const m = {}; for (let i = 0; i < n; i++) m[flat[i * 2]] = flat[i * 2 + 1]; this.stack.push(m); break; }
          case O.LEN: { const v = this.stack.pop(); this.stack.push(natCall('len', [v])); break; }
          case O.NAT: { const args = this.stack.splice(this.stack.length - ins[2], ins[2]); used += 1; this.stack.push(natCall(ins[1], args)); break; }
          case O.SYS: {
            const args = this.stack.splice(this.stack.length - ins[2], ins[2]);
            const r = sys(ins[1], args);
            if (r && r.block) {
              fr.ip--; // 重新执行该系统调用
              for (const a of args) this.stack.push(a); // 恢复参数，唤醒后重试
              this.blocked = r.block;
              return { status: 'blocked', block: r.block, used };
            }
            if (r && r.error) throw new OslError(r.error);
            this.stack.push(r ? r.value : null);
            break;
          }
          default: throw new OslError('未知操作码 ' + op);
        }
      }
    } catch (e) {
      return { status: 'error', error: e.osl ? e.message : ('内部错误: ' + e.message), used };
    }
    if (this.done) return { status: 'ended', used, result: this.result };
    if (used >= quantum) return { status: 'yield', used };
    return { status: 'yield', used };
  }
}

function strOf(v) { return v === null ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v); }
function truthy(v) { return !(v === false || v === null || v === undefined || v === 0 || v === ''); }
function eqv(a, b) {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  return false;
}
function cmpv(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  throw new OslError('无法比较的值');
}

export function compileSource(src) {
  const ast = parse(src);
  return compile(ast);
}

export function disasm(prog) {
  const out = [];
  prog.funcs.forEach((f, fi) => {
    out.push(`--- fn#${fi} ${f.name} (locals=${f.nlocals}) ---`);
    f.code.forEach((ins, i) => {
      const name = OPNAME[ins[0]];
      let extra = '';
      if (ins[0] === OPS.PUSH_C) extra = ' ' + JSON.stringify(f.consts[ins[1]]);
      else if (ins[1] !== undefined && ins[1] !== 0) extra = ' ' + ins[1] + (ins[2] ? ',' + ins[2] : '');
      else if (ins[2]) extra = ' ,' + ins[2];
      out.push(String(i).padStart(4) + ' ' + name + extra);
    });
  });
  return out.join('\n');
}
