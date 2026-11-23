// NS (NestScript) 引导编译器：源码 -> 程序对象（与 ns/sys/compiler.ns 的系统内编译器同构，输出一致）
// 单遍递归下降，直接生成字节码；每条指令 3 个整数 [op, a, b]。
export const OP = {
  NOP: 0, CONST: 1, NIL: 2, TRUE: 3, FALSE: 4, POP: 5, DUP: 6, DUP2: 7,
  LOADL: 8, STOREL: 9, LOADG: 10, STOREG: 11,
  ADD: 12, SUB: 13, MUL: 14, DIV: 15, MOD: 16, NEG: 17, NOT: 18,
  EQ: 19, NE: 20, LT: 21, LE: 22, GT: 23, GE: 24,
  JMP: 25, JF: 26, JT: 27, JFK: 28, JTK: 29,
  CALL: 30, CALLN: 31, CALLV: 32, RET: 33,
  MKARR: 34, MKMAP: 35, GETI: 36, SETI: 37, SYS: 38, FNREF: 39, CALLX: 40, FNREFX: 41,
};

const KW = new Set(['let', 'const', 'fn', 'if', 'else', 'while', 'for', 'of', 'in', 'return', 'break', 'continue', 'true', 'false', 'nil', 'include']);
const OPS2 = ['==', '!=', '<=', '>=', '&&', '||', '+=', '-=', '*=', '/=', '%=', '++', '--'];
const OPS1 = '+-*/%()[]{},;:.?!=<>&';

function isIdStart(c) { return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36 || c > 127; }
function isDigit(c) { return c >= 48 && c <= 57; }

export class CompileError extends Error {}

function err(C, msg) { throw new CompileError(`${C.file}:${C.line}: ${msg}`); }

function next(C) {
  const s = C.src; let p = C.p; let nl = false;
  for (;;) {
    const c = s.charCodeAt(p);
    if (c === 10) { C.line++; nl = true; p++; }
    else if (c === 32 || c === 9 || c === 13) p++;
    else if (c === 47 && s.charCodeAt(p + 1) === 47) { while (p < s.length && s.charCodeAt(p) !== 10) p++; }
    else if (c === 47 && s.charCodeAt(p + 1) === 42) {
      p += 2;
      while (p < s.length && !(s.charCodeAt(p) === 42 && s.charCodeAt(p + 1) === 47)) { if (s.charCodeAt(p) === 10) { C.line++; nl = true; } p++; }
      p += 2;
    } else break;
  }
  C.nl = nl;
  if (p >= s.length) { C.p = p; C.t = 'e'; C.v = ''; return; }
  const c = s.charCodeAt(p);
  if (isDigit(c)) {
    let q = p;
    if (c === 48 && (s[p + 1] === 'x' || s[p + 1] === 'X')) {
      q = p + 2; while (/[0-9a-fA-F]/.test(s[q] || '')) q++;
      C.t = 'n'; C.v = parseInt(s.substring(p + 2, q), 16);
    } else {
      while (isDigit(s.charCodeAt(q))) q++;
      if (s[q] === '.' && isDigit(s.charCodeAt(q + 1))) { q++; while (isDigit(s.charCodeAt(q))) q++; }
      if ((s[q] === 'e' || s[q] === 'E') && (isDigit(s.charCodeAt(q + 1)) || ((s[q + 1] === '-' || s[q + 1] === '+') && isDigit(s.charCodeAt(q + 2))))) {
        q += 2; while (isDigit(s.charCodeAt(q))) q++;
      }
      C.t = 'n'; C.v = parseFloat(s.substring(p, q));
    }
    C.p = q; return;
  }
  if (isIdStart(c)) {
    let q = p + 1;
    while (q < s.length && (isIdStart(s.charCodeAt(q)) || isDigit(s.charCodeAt(q)))) q++;
    const w = s.substring(p, q);
    C.p = q; C.v = w; C.t = KW.has(w) ? 'k' : 'i'; return;
  }
  if (c === 34 || c === 39) {
    let q = p + 1; let out = '';
    while (q < s.length && s.charCodeAt(q) !== c) {
      let ch = s[q];
      if (ch === '\n') C.line++;
      if (ch === '\\') {
        q++; const e = s[q];
        if (e === 'n') ch = '\n'; else if (e === 't') ch = '\t'; else if (e === 'r') ch = '\r'; else if (e === '0') ch = '\0';
        else if (e === 'u') { ch = String.fromCharCode(parseInt(s.substring(q + 1, q + 5), 16)); q += 4; }
        else ch = e;
      }
      out += ch; q++;
    }
    if (q >= s.length) err(C, '字符串未结束');
    C.p = q + 1; C.t = 's'; C.v = out; return;
  }
  const two = s.substring(p, p + 2);
  if (OPS2.includes(two)) { C.p = p + 2; C.t = 'o'; C.v = two; return; }
  if (OPS1.includes(s[p])) { C.p = p + 1; C.t = 'o'; C.v = s[p]; return; }
  err(C, '非法字符 ' + s[p]);
}

function isOp(C, v) { return C.t === 'o' && C.v === v; }
function isKw(C, v) { return C.t === 'k' && C.v === v; }
function expectOp(C, v) { if (!isOp(C, v)) err(C, `需要 "${v}"，实际为 "${C.v}"`); next(C); }
function expectId(C) { if (C.t !== 'i') err(C, `需要标识符，实际为 "${C.v}"`); const v = C.v; next(C); return v; }

function emit(C, op, a = 0, b = 0) {
  const f = C.fn; const at = f.code.length;
  f.code.push(op, a, b); f.lines.push(C.line);
  return at;
}
function here(C) { return C.fn.code.length; }
function patch(C, at) { C.fn.code[at + 1] = C.fn.code.length; }
function constIdx(C, v) {
  const key = (typeof v === 'number' ? 'n' : 's') + v;
  let i = C.constMap.get(key);
  if (i === undefined) { i = C.consts.length; C.consts.push(v); C.constMap.set(key, i); }
  return i;
}
function globalIdx(C, name) {
  let i = C.globalMap.get(name);
  if (i === undefined) { i = C.gnames.length; C.gnames.push(name); C.globalMap.set(name, i); }
  return i;
}
function nativeIdx(C, name) {
  let i = C.natMap.get(name);
  if (i === undefined) { i = C.nat.length; C.nat.push(name); C.natMap.set(name, i); }
  return i;
}
function newFn(C, name, file) {
  return { name, argc: 0, code: [], lines: [], locals: [], depth: 0, nlocals: 0, loops: [], file, parent: C.fn };
}
function declLocal(C, name) {
  const f = C.fn; const slot = f.nlocals++;
  f.locals.push({ name, slot, depth: f.depth });
  return slot;
}
function findLocal(C, name) {
  const L = C.fn.locals;
  for (let i = L.length - 1; i >= 0; i--) if (L[i].name === name) return L[i].slot;
  return -1;
}
function beginScope(C) { C.fn.depth++; }
function endScope(C) {
  const f = C.fn; f.depth--;
  while (f.locals.length && f.locals[f.locals.length - 1].depth > f.depth) f.locals.pop();
}

const BINPREC = { '||': 2, '&&': 3, '==': 4, '!=': 4, '<': 5, '<=': 5, '>': 5, '>=': 5, '+': 6, '-': 6, '*': 7, '/': 7, '%': 7 };
const BINOP = { '+': OP.ADD, '-': OP.SUB, '*': OP.MUL, '/': OP.DIV, '%': OP.MOD, '==': OP.EQ, '!=': OP.NE, '<': OP.LT, '<=': OP.LE, '>': OP.GT, '>=': OP.GE };
const ASSIGNOPS = { '=': 0, '+=': OP.ADD, '-=': OP.SUB, '*=': OP.MUL, '/=': OP.DIV, '%=': OP.MOD, '++': OP.ADD, '--': OP.SUB };

function isAssign(C) { return C.t === 'o' && Object.prototype.hasOwnProperty.call(ASSIGNOPS, C.v); }

function parseExpr(C) {
  parseBinary(C, 2);
  if (isOp(C, '?')) {
    next(C);
    const jf = emit(C, OP.JF);
    parseExpr(C); expectOp(C, ':');
    const jend = emit(C, OP.JMP);
    patch(C, jf);
    parseExpr(C);
    patch(C, jend);
  }
}

function parseBinary(C, minPrec) {
  parseUnary(C, minPrec === 2);
  for (;;) {
    if (C.t !== 'o') break;
    const op = C.v; const prec = BINPREC[op];
    if (prec === undefined || prec < minPrec) break;
    next(C);
    if (op === '&&') { const j = emit(C, OP.JFK); parseBinary(C, prec + 1); patch(C, j); }
    else if (op === '||') { const j = emit(C, OP.JTK); parseBinary(C, prec + 1); patch(C, j); }
    else { parseBinary(C, prec + 1); emit(C, BINOP[op]); }
  }
}

function parseUnary(C, canAssign) {
  if (isOp(C, '-')) { next(C); parseUnary(C, false); emit(C, OP.NEG); return; }
  if (isOp(C, '!')) { next(C); parseUnary(C, false); emit(C, OP.NOT); return; }
  parsePostfix(C, canAssign);
}

function parseArgs(C) {
  let n = 0;
  expectOp(C, '(');
  while (!isOp(C, ')')) {
    parseExpr(C); n++;
    if (isOp(C, ',')) next(C); else break;
  }
  expectOp(C, ')');
  return n;
}

// 复合赋值/自增的右侧
function compoundRhs(C, opKind) {
  if (opKind === '++' || opKind === '--') { emit(C, OP.CONST, constIdx(C, 1)); }
  else parseExpr(C);
}

function parsePostfix(C, canAssign) {
  let assigned = parsePrimary(C, canAssign);
  while (!assigned) {
    if (isOp(C, '(') && !C.nl) { const n = parseArgs(C); emit(C, OP.CALLV, n); }
    else if ((isOp(C, '[') && !C.nl) || isOp(C, '.')) {
      if (isOp(C, '[')) { next(C); parseExpr(C); expectOp(C, ']'); }
      else { next(C); const nm = C.t === 'i' || C.t === 'k' ? C.v : err(C, '需要字段名'); next(C); emit(C, OP.CONST, constIdx(C, nm)); }
      if (canAssign && isAssign(C)) {
        const k = C.v; next(C);
        if (k === '=') { parseExpr(C); emit(C, OP.SETI); }
        else { emit(C, OP.DUP2); emit(C, OP.GETI); compoundRhs(C, k); emit(C, ASSIGNOPS[k]); emit(C, OP.SETI); }
        assigned = true;
      } else emit(C, OP.GETI);
    } else break;
  }
}

// 返回 true 表示已经完成了赋值（不再接后缀）
function parsePrimary(C, canAssign) {
  const t = C.t, v = C.v;
  if (t === 'n') { next(C); emit(C, OP.CONST, constIdx(C, v)); return false; }
  if (t === 's') { next(C); emit(C, OP.CONST, constIdx(C, v)); return false; }
  if (t === 'k') {
    if (v === 'true') { next(C); emit(C, OP.TRUE); return false; }
    if (v === 'false') { next(C); emit(C, OP.FALSE); return false; }
    if (v === 'nil') { next(C); emit(C, OP.NIL); return false; }
    if (v === 'fn') { next(C); parseLambda(C); return false; }
    err(C, `表达式中不能使用关键字 ${v}`);
  }
  if (t === 'o') {
    if (v === '(') { next(C); parseExpr(C); expectOp(C, ')'); return false; }
    if (v === '[') {
      next(C); let n = 0;
      while (!isOp(C, ']')) { parseExpr(C); n++; if (isOp(C, ',')) next(C); else break; }
      expectOp(C, ']'); emit(C, OP.MKARR, n); return false;
    }
    if (v === '{') {
      next(C); let n = 0;
      while (!isOp(C, '}')) {
        if (C.t === 'i' || C.t === 'k') { emit(C, OP.CONST, constIdx(C, C.v)); next(C); }
        else if (C.t === 's') { emit(C, OP.CONST, constIdx(C, C.v)); next(C); }
        else if (C.t === 'n') { emit(C, OP.CONST, constIdx(C, String(C.v))); next(C); }
        else err(C, '映射键必须是标识符或字符串');
        expectOp(C, ':'); parseExpr(C); n++;
        if (isOp(C, ',')) next(C); else break;
      }
      expectOp(C, '}'); emit(C, OP.MKMAP, n); return false;
    }
    if (v === '&') { next(C); const nm = expectId(C); emit(C, OP.FNREFX, constIdx(C, nm)); return false; }
    err(C, `意外的 "${v}"`);
  }
  if (t === 'i') {
    next(C);
    if ((v === 'sys' || v === 'sysv') && isOp(C, '(') && !C.nl) {
      const n = parseArgs(C); emit(C, OP.SYS, n, v === 'sysv' ? 1 : 0); return false;
    }
    const slot = findLocal(C, v);
    if (isOp(C, '(') && !C.nl && slot < 0 && !C.globalMap.has(v)) {
      const n = parseArgs(C); emit(C, OP.CALLX, constIdx(C, v), n); return false;
    }
    const load = slot >= 0 ? OP.LOADL : OP.LOADG, store = slot >= 0 ? OP.STOREL : OP.STOREG;
    const idx = slot >= 0 ? slot : globalIdx(C, v);
    if (canAssign && isAssign(C)) {
      const k = C.v; next(C);
      if (k === '=') parseExpr(C);
      else { emit(C, load, idx); compoundRhs(C, k); emit(C, ASSIGNOPS[k]); }
      emit(C, store, idx); return true;
    }
    emit(C, load, idx); return false;
  }
  err(C, `意外的记号 "${v}"`);
}

function parseLambda(C) {
  C.lambdaCount = (C.lambdaCount || 0) + 1;
  const fi = compileFunction(C, '$lambda' + C.lambdaCount);
  emit(C, OP.FNREF, fi);
}

// 编译函数体（当前记号位于参数列表 "("）。返回函数索引
function compileFunction(C, name) {
  const f = newFn(C, name, C.file);
  const saved = C.fn; C.fn = f;
  expectOp(C, '(');
  while (!isOp(C, ')')) { declLocal(C, expectId(C)); f.argc++; if (isOp(C, ',')) next(C); else break; }
  expectOp(C, ')');
  const idx = C.funcs.length; C.funcs.push(f);
  if (name[0] !== '$') {
    if (C.fnIdx.has(name) && !C.preludeNames.has(name)) err(C, `函数 ${name} 重复定义`);
    if (C.inPrelude) C.preludeNames.add(name); else C.preludeNames.delete(name);
    C.fnIdx.set(name, idx);
  }
  f.index = idx;
  parseBlock(C);
  emit(C, OP.NIL); emit(C, OP.RET);
  C.fn = saved;
  return idx;
}

function parseBlock(C) {
  expectOp(C, '{');
  beginScope(C);
  while (!isOp(C, '}')) { if (C.t === 'e') err(C, '缺少 "}"'); parseStmt(C); }
  next(C);
  endScope(C);
}

function endStmt(C) {
  if (isOp(C, ';')) { next(C); return; }
  if (C.nl || isOp(C, '}') || C.t === 'e') return;
  err(C, `语句末尾需要 ";"，实际为 "${C.v}"`);
}

function parseVarDecl(C) {
  next(C); // let / const
  for (;;) {
    const name = expectId(C);
    const isGlobal = C.fn === C.main && C.fn.depth === 0;
    let slot = -1;
    if (!isGlobal) {
      // 先编译初始值再声明，避免 let x = x
      if (isOp(C, '=')) { next(C); parseExpr(C); } else emit(C, OP.NIL);
      slot = declLocal(C, name);
      emit(C, OP.STOREL, slot); emit(C, OP.POP);
    } else {
      if (isOp(C, '=')) { next(C); parseExpr(C); } else emit(C, OP.NIL);
      emit(C, OP.STOREG, globalIdx(C, name)); emit(C, OP.POP);
    }
    if (isOp(C, ',')) { next(C); continue; }
    break;
  }
}

function pushLoop(C, contTarget) { const l = { breaks: [], conts: [], contTarget }; C.fn.loops.push(l); return l; }
function popLoop(C, l, contAddr) {
  C.fn.loops.pop();
  const end = here(C);
  for (const j of l.breaks) C.fn.code[j + 1] = end;
  for (const j of l.conts) C.fn.code[j + 1] = contAddr;
}

function parseStmt(C) {
  const t = C.t, v = C.v;
  if (t === 'o') {
    if (v === '{') { parseBlock(C); return; }
    if (v === ';') { next(C); return; }
  }
  if (t === 'k') {
    if (v === 'let' || v === 'const') { parseVarDecl(C); endStmt(C); return; }
    if (v === 'fn') {
      // 声明或 lambda 表达式语句
      next(C);
      if (C.t === 'i') {
        if (C.fn !== C.main) err(C, '函数只能在顶层声明');
        const name = C.v; next(C);
        compileFunction(C, name); return;
      }
      parseLambda(C); emit(C, OP.POP); endStmt(C); return;
    }
    if (v === 'include') { parseInclude(C); return; }
    if (v === 'if') {
      next(C); expectOp(C, '('); parseExpr(C); expectOp(C, ')');
      const jf = emit(C, OP.JF);
      parseStmt(C);
      if (isKw(C, 'else')) {
        next(C);
        const jend = emit(C, OP.JMP);
        patch(C, jf);
        parseStmt(C);
        patch(C, jend);
      } else patch(C, jf);
      return;
    }
    if (v === 'while') {
      next(C);
      const top = here(C);
      expectOp(C, '('); parseExpr(C); expectOp(C, ')');
      const jf = emit(C, OP.JF);
      const l = pushLoop(C);
      parseStmt(C);
      emit(C, OP.JMP, top);
      patch(C, jf);
      popLoop(C, l, top);
      return;
    }
    if (v === 'for') { parseFor(C); return; }
    if (v === 'return') {
      next(C);
      if (isOp(C, ';') || C.nl || isOp(C, '}') || C.t === 'e') emit(C, OP.NIL); else parseExpr(C);
      emit(C, OP.RET); endStmt(C); return;
    }
    if (v === 'break' || v === 'continue') {
      next(C);
      const loops = C.fn.loops;
      if (!loops.length) err(C, `${v} 只能在循环中使用`);
      const l = loops[loops.length - 1];
      const j = emit(C, OP.JMP);
      if (v === 'break') l.breaks.push(j); else l.conts.push(j);
      endStmt(C); return;
    }
  }
  parseExpr(C); emit(C, OP.POP); endStmt(C);
}

function parseFor(C) {
  next(C); expectOp(C, '(');
  beginScope(C);
  // for (let x of e) / for (let k in e)
  if ((isKw(C, 'let') || isKw(C, 'const'))) {
    const save = { p: C.p, line: C.line, t: C.t, v: C.v, nl: C.nl };
    next(C);
    if (C.t === 'i') {
      const name = C.v; next(C);
      if (isKw(C, 'of') || isKw(C, 'in')) {
        const isIn = C.v === 'in'; next(C);
        parseExpr(C); expectOp(C, ')');
        if (isIn) emit(C, OP.CALLN, nativeIdx(C, 'keys'), 1);
        const arr = declLocal(C, '$arr' + C.fn.nlocals); emit(C, OP.STOREL, arr); emit(C, OP.POP);
        const idx = declLocal(C, '$i' + C.fn.nlocals); emit(C, OP.CONST, constIdx(C, 0)); emit(C, OP.STOREL, idx); emit(C, OP.POP);
        const top = here(C);
        emit(C, OP.LOADL, idx); emit(C, OP.LOADL, arr); emit(C, OP.CALLN, nativeIdx(C, 'len'), 1); emit(C, OP.LT);
        const jf = emit(C, OP.JF);
        const x = declLocal(C, name);
        emit(C, OP.LOADL, arr); emit(C, OP.LOADL, idx); emit(C, OP.GETI); emit(C, OP.STOREL, x); emit(C, OP.POP);
        const l = pushLoop(C);
        parseStmt(C);
        const cont = here(C);
        emit(C, OP.LOADL, idx); emit(C, OP.CONST, constIdx(C, 1)); emit(C, OP.ADD); emit(C, OP.STOREL, idx); emit(C, OP.POP);
        emit(C, OP.JMP, top);
        patch(C, jf);
        popLoop(C, l, cont);
        endScope(C);
        return;
      }
    }
    // 不是 for-of：回退并按普通 for 解析
    C.p = save.p; C.line = save.line; C.t = save.t; C.v = save.v; C.nl = save.nl;
  }
  // 普通 for
  if (isOp(C, ';')) next(C);
  else if (isKw(C, 'let') || isKw(C, 'const')) { parseVarDecl(C); expectOp(C, ';'); }
  else { parseExpr(C); emit(C, OP.POP); expectOp(C, ';'); }
  const top = here(C);
  let jf = -1;
  if (!isOp(C, ';')) { parseExpr(C); jf = emit(C, OP.JF); }
  expectOp(C, ';');
  const jbody = emit(C, OP.JMP);
  const stepAt = here(C);
  if (!isOp(C, ')')) { parseExpr(C); emit(C, OP.POP); }
  expectOp(C, ')');
  emit(C, OP.JMP, top);
  patch(C, jbody);
  const l = pushLoop(C);
  parseStmt(C);
  emit(C, OP.JMP, stepAt);
  if (jf >= 0) patch(C, jf);
  popLoop(C, l, stepAt);
  endScope(C);
}

function parseInclude(C) {
  next(C);
  if (C.t !== 's') err(C, 'include 需要字符串路径');
  const path = C.v; next(C);
  endStmt(C);
  if (C.fn !== C.main) err(C, 'include 只能在顶层');
  includeFile(C, path);
}

function includeFile(C, path) {
  if (C.included.has(path)) return;
  C.included.add(path);
  const r = C.read(path);
  if (r == null) err(C, `找不到包含文件 ${path}`);
  C.deps.push([path, r.sig || '']);
  const sv = { src: C.src, p: C.p, line: C.line, t: C.t, v: C.v, nl: C.nl, file: C.file };
  C.src = r.text; C.p = 0; C.line = 1; C.file = path;
  next(C);
  while (C.t !== 'e') parseStmt(C);
  C.src = sv.src; C.p = sv.p; C.line = sv.line; C.t = sv.t; C.v = sv.v; C.nl = sv.nl; C.file = sv.file;
}

// 链接：把 CALLX / FNREFX 解析成 CALL / CALLN / FNREF
function link(C, nativeSet) {
  for (const f of C.funcs) {
    const code = f.code;
    for (let i = 0; i < code.length; i += 3) {
      const op = code[i];
      if (op === OP.CALLX) {
        const name = C.consts[code[i + 1]];
        if (C.fnIdx.has(name)) { code[i] = OP.CALL; code[i + 1] = C.fnIdx.get(name); }
        else if (nativeSet.has(name)) { code[i] = OP.CALLN; code[i + 1] = nativeIdx(C, name); }
        else throw new CompileError(`${f.file}:${f.lines[i / 3]}: 未定义的函数 ${name}`);
      } else if (op === OP.FNREFX) {
        const name = C.consts[code[i + 1]];
        if (!C.fnIdx.has(name)) throw new CompileError(`${f.file}:${f.lines[i / 3]}: 未定义的函数引用 &${name}`);
        code[i] = OP.FNREF; code[i + 1] = C.fnIdx.get(name);
      }
    }
  }
}

/**
 * opts: { name, read(path)->{text,sig}|null, prelude: path|null, natives: Set<string>, sig }
 * 返回程序对象（可直接 JSON 序列化为 .nsx）
 */
export function compile(src, opts) {
  const C = {
    src, p: 0, line: 1, file: opts.name || 'main', t: 'e', v: '', nl: false,
    consts: [], constMap: new Map(), globalMap: new Map(), gnames: [], nat: [], natMap: new Map(),
    funcs: [], fnIdx: new Map(), fn: null, main: null, read: opts.read || (() => null),
    included: new Set(), deps: [], lambdaCount: 0, inPrelude: false, preludeNames: new Set(),
  };
  const main = newFn(C, '$main', C.file); main.index = 0;
  C.main = main; C.fn = main; C.funcs.push(main);
  if (opts.prelude && !src.slice(0, 200).includes('#noprelude')) { C.inPrelude = true; includeFile(C, opts.prelude); C.inPrelude = false; }
  C.src = src; C.p = 0; C.line = 1; C.file = opts.name || 'main';
  next(C);
  while (C.t !== 'e') parseStmt(C);
  emit(C, OP.NIL); emit(C, OP.RET);
  link(C, opts.natives);
  return {
    v: 1, n: opts.name || 'main', sig: opts.sig || '', deps: C.deps,
    k: C.consts,
    f: C.funcs.map((f) => ({ n: f.name, a: f.argc, l: f.nlocals, c: f.code, ln: f.lines, fl: f.file })),
    g: C.gnames.length, gn: C.gnames, nat: C.nat,
  };
}
