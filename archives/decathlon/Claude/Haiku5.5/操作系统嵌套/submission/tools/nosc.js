'use strict';
/*
 * Nest Script 引导编译器（仅开发期使用）。
 *
 * 运行时所有程序都由系统内的编译器程序 (assets/system/compiler.ns) 编译。
 * 这个文件只用于生成编译器自身的第一版字节码 (compiler.nobj)，并用来校验：
 * 系统内编译器对同一源文件的输出必须与本文件逐条一致。
 *
 * 用法：node tools/nosc.js <源文件.ns> [输出.nobj]
 */
const fs = require('fs');

const KEYWORDS = new Set(['var', 'func', 'if', 'else', 'while', 'for', 'in', 'return', 'break', 'continue', 'true', 'false', 'nil']);
const TWO_CHAR = new Set(['==', '!=', '<=', '>=', '&&', '||']);
const ONE_CHAR = new Set(['+', '-', '*', '/', '%', '<', '>', '=', '!', '(', ')', '{', '}', '[', ']', ',', ';', '.', ':', '?']);

class CompileError extends Error {
  constructor(message, line) {
    super(`第 ${line} 行：${message}`);
    this.nosMessage = message;
    this.line = line;
  }
}

function tokenize(src) {
  const toks = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') line++;
        i++;
      }
      if (i >= n) throw new CompileError('注释没有结束', line);
      i += 2;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      const word = src.slice(i, j);
      toks.push({ t: KEYWORDS.has(word) ? 'kw' : 'id', v: word, line });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < n && /[0-9]/.test(src[j])) j++;
      if (src[j] === '.' && /[0-9]/.test(src[j + 1] || '')) {
        j++;
        while (j < n && /[0-9]/.test(src[j])) j++;
      }
      toks.push({ t: 'num', v: Number(src.slice(i, j)), line });
      i = j;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let s = '';
      for (;;) {
        if (j >= n || src[j] === '\n') throw new CompileError('字符串没有结束', line);
        const ch = src[j];
        if (ch === '"') { j++; break; }
        if (ch === '\\') {
          const e = src[j + 1];
          const map = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '0': '\0' };
          if (!(e in map)) throw new CompileError('未知的转义字符 \\' + e, line);
          s += map[e];
          j += 2;
          continue;
        }
        s += ch;
        j++;
      }
      toks.push({ t: 'str', v: s, line });
      i = j;
      continue;
    }
    const two = c + (src[i + 1] || '');
    if (TWO_CHAR.has(two)) {
      toks.push({ t: 'op', v: two, line });
      i += 2;
      continue;
    }
    if (ONE_CHAR.has(c)) {
      toks.push({ t: 'op', v: c, line });
      i++;
      continue;
    }
    throw new CompileError('无法识别的字符 ' + JSON.stringify(c), line);
  }
  toks.push({ t: 'eof', v: '', line });
  return toks;
}

// ---------------- 语法分析：生成 AST（数组形式） ----------------
function parse(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = (k = 0) => toks[Math.min(p + k, toks.length - 1)];
  const isOp = (v, k = 0) => peek(k).t === 'op' && peek(k).v === v;
  const isKw = (v, k = 0) => peek(k).t === 'kw' && peek(k).v === v;
  const next = () => toks[p++];
  const fail = (msg, tok = peek()) => { throw new CompileError(msg, tok.line); };
  const expectOp = (v) => {
    if (!isOp(v)) fail(`缺少 "${v}"，遇到 ${describe(peek())}`);
    return next();
  };
  const expectId = () => {
    if (peek().t !== 'id') fail(`需要一个名字，遇到 ${describe(peek())}`);
    return next();
  };
  const describe = (t) => (t.t === 'eof' ? '文件结束' : `"${t.v}"`);

  function parseProgram() {
    const items = [];
    while (peek().t !== 'eof') {
      if (isKw('var')) {
        const d = parseVarDecl();
        expectOp(';');
        items.push(d);
      } else if (isKw('func')) {
        items.push(parseFunc());
      } else {
        fail(`顶层只能是 var 或 func 声明，遇到 ${describe(peek())}`);
      }
    }
    return items;
  }

  function parseFunc() {
    const kw = next();
    const name = expectId();
    expectOp('(');
    const params = [];
    if (!isOp(')')) {
      for (;;) {
        const pid = expectId();
        if (params.includes(pid.v)) fail('参数名重复 ' + pid.v, pid);
        params.push(pid.v);
        if (isOp(',')) { next(); continue; }
        break;
      }
    }
    expectOp(')');
    const body = parseBlock();
    return ['func', name.v, params, body, kw.line];
  }

  function parseBlock() {
    expectOp('{');
    const stmts = [];
    while (!isOp('}')) {
      if (peek().t === 'eof') fail('代码块没有结束');
      stmts.push(parseStmt());
    }
    next();
    return stmts;
  }

  function parseVarDecl() {
    const kw = next();
    const name = expectId();
    let init = null;
    if (isOp('=')) { next(); init = parseExpr(); }
    return ['var', name.v, init, kw.line];
  }

  function parseSimpleNoSemi() {
    // 用于 for 的初始化与步进：声明、赋值或表达式，不吃分号
    const line = peek().line;
    if (isKw('var')) return parseVarDecl();
    const e = parseExpr();
    if (isOp('=')) {
      next();
      checkLvalue(e);
      return ['set', e, parseExpr(), line];
    }
    return ['expr', e, line];
  }

  function checkLvalue(e) {
    if (e[0] === 'var' || e[0] === 'idx') return;
    fail('赋值的左边必须是变量、下标或成员');
  }

  function parseStmt() {
    const t = peek();
    if (isKw('var')) {
      const d = parseVarDecl();
      expectOp(';');
      return d;
    }
    if (isKw('if')) return parseIf();
    if (isKw('while')) {
      next();
      expectOp('(');
      const cond = parseExpr();
      expectOp(')');
      return ['while', cond, parseBlock(), t.line];
    }
    if (isKw('for')) return parseFor();
    if (isKw('return')) {
      next();
      let e = null;
      if (!isOp(';')) e = parseExpr();
      expectOp(';');
      return ['ret', e, t.line];
    }
    if (isKw('break')) { next(); expectOp(';'); return ['break', t.line]; }
    if (isKw('continue')) { next(); expectOp(';'); return ['cont', t.line]; }
    if (isOp('{')) return ['block', parseBlock(), t.line];
    const s = parseSimpleNoSemi();
    expectOp(';');
    return s;
  }

  function parseIf() {
    const t = next();
    expectOp('(');
    const cond = parseExpr();
    expectOp(')');
    const thenB = parseBlock();
    let elseB = null;
    if (isKw('else')) {
      next();
      if (isKw('if')) elseB = [parseIf()];
      else elseB = parseBlock();
    }
    return ['if', cond, thenB, elseB, t.line];
  }

  function parseFor() {
    const t = next();
    expectOp('(');
    if (isKw('var') && peek(1).t === 'id' && isKw('in', 2)) {
      next();
      const name = next();
      next(); // in
      const e = parseExpr();
      expectOp(')');
      return ['forin', name.v, e, parseBlock(), t.line];
    }
    let init = null;
    if (!isOp(';')) init = parseSimpleNoSemi();
    expectOp(';');
    let cond = null;
    if (!isOp(';')) cond = parseExpr();
    expectOp(';');
    let post = null;
    if (!isOp(')')) post = parseSimpleNoSemi();
    expectOp(')');
    return ['for', init, cond, post, parseBlock(), t.line];
  }

  function parseExpr() {
    const c = parseOr();
    if (isOp('?')) {
      next();
      const a = parseExpr();
      expectOp(':');
      const b = parseExpr();
      return ['cond', c, a, b];
    }
    return c;
  }

  function parseOr() {
    let l = parseAnd();
    while (isOp('||')) { next(); l = ['or', l, parseAnd()]; }
    return l;
  }
  function parseAnd() {
    let l = parseEq();
    while (isOp('&&')) { next(); l = ['and', l, parseEq()]; }
    return l;
  }
  function parseEq() {
    let l = parseRel();
    while (isOp('==') || isOp('!=')) { const op = next().v; l = ['bin', op, l, parseRel()]; }
    return l;
  }
  function parseRel() {
    let l = parseAdd();
    while (isOp('<') || isOp('<=') || isOp('>') || isOp('>=')) { const op = next().v; l = ['bin', op, l, parseAdd()]; }
    return l;
  }
  function parseAdd() {
    let l = parseMul();
    while (isOp('+') || isOp('-')) { const op = next().v; l = ['bin', op, l, parseMul()]; }
    return l;
  }
  function parseMul() {
    let l = parseUnary();
    while (isOp('*') || isOp('/') || isOp('%')) { const op = next().v; l = ['bin', op, l, parseUnary()]; }
    return l;
  }
  function parseUnary() {
    if (isOp('-') || isOp('!')) {
      const op = next().v;
      return ['un', op, parseUnary()];
    }
    return parsePostfix();
  }
  function parsePostfix() {
    let e = parsePrimary();
    for (;;) {
      if (isOp('[')) {
        next();
        const k = parseExpr();
        expectOp(']');
        e = ['idx', e, k];
      } else if (isOp('.')) {
        next();
        const name = expectId();
        e = ['idx', e, ['str', name.v]];
      } else if (isOp('(')) {
        fail('只能调用具名函数');
      } else {
        break;
      }
    }
    return e;
  }
  function parsePrimary() {
    const t = peek();
    if (t.t === 'num') { next(); return ['num', t.v]; }
    if (t.t === 'str') { next(); return ['str', t.v]; }
    if (isKw('true')) { next(); return ['const', true]; }
    if (isKw('false')) { next(); return ['const', false]; }
    if (isKw('nil')) { next(); return ['const', null]; }
    if (t.t === 'id') {
      next();
      if (isOp('(')) {
        next();
        const args = [];
        if (!isOp(')')) {
          for (;;) {
            args.push(parseExpr());
            if (isOp(',')) { next(); continue; }
            break;
          }
        }
        expectOp(')');
        return ['call', t.v, args, t.line];
      }
      return ['var', t.v, t.line];
    }
    if (isOp('(')) {
      next();
      const e = parseExpr();
      expectOp(')');
      return e;
    }
    if (isOp('[')) {
      next();
      const items = [];
      if (!isOp(']')) {
        for (;;) {
          items.push(parseExpr());
          if (isOp(',')) { next(); if (isOp(']')) break; continue; }
          break;
        }
      }
      expectOp(']');
      return ['arr', items];
    }
    if (isOp('{')) {
      next();
      const entries = [];
      if (!isOp('}')) {
        for (;;) {
          const kt = peek();
          if (kt.t !== 'id' && kt.t !== 'str') fail('映射的键必须是名字或字符串');
          next();
          expectOp(':');
          entries.push([kt.v, parseExpr()]);
          if (isOp(',')) { next(); if (isOp('}')) break; continue; }
          break;
        }
      }
      expectOp('}');
      return ['map', entries];
    }
    fail(`缺少表达式，遇到 ${describe(t)}`);
    return null;
  }

  return parseProgram();
}

// ---------------- 代码生成 ----------------
function generate(items) {
  const code = [];
  const lines = [];
  const funcs = {};
  const globals = new Set();
  let curLine = 0;
  const emit = (ins) => { code.push(ins); lines.push(curLine); return code.length - 1; };
  const here = () => code.length;
  const patch = (idx, target) => { code[idx][1] = target; };

  let fn = null; // 当前函数上下文 { ns, scopes, loops }

  const err = (msg, line) => { throw new CompileError(msg, line || curLine); };

  function declare(name, line) {
    if (!fn) {
      if (globals.has(name)) err(`变量 ${name} 重复声明`, line);
      globals.add(name);
      return null;
    }
    const scope = fn.scopes[fn.scopes.length - 1];
    if (scope.has(name)) err(`变量 ${name} 重复声明`, line);
    const slot = fn.ns++;
    scope.set(name, slot);
    return slot;
  }

  function lookup(name) {
    if (fn) {
      for (let i = fn.scopes.length - 1; i >= 0; i--) {
        if (fn.scopes[i].has(name)) return fn.scopes[i].get(name);
      }
    }
    return null; // 全局
  }

  function genExpr(e) {
    switch (e[0]) {
      case 'num':
      case 'str':
      case 'const':
        emit(['c', e[1]]);
        return;
      case 'var': {
        curLine = e[2] || curLine;
        const slot = lookup(e[1]);
        if (slot !== null) emit(['l', slot]);
        else emit(['g', e[1]]);
        return;
      }
      case 'arr':
        for (const x of e[1]) genExpr(x);
        emit(['arr', e[1].length]);
        return;
      case 'map': {
        const keys = [];
        for (const [k, v] of e[1]) {
          if (keys.includes(k)) err(`映射的键 ${k} 重复`);
          keys.push(k);
          genExpr(v);
        }
        emit(['map', keys]);
        return;
      }
      case 'idx':
        genExpr(e[1]);
        genExpr(e[2]);
        emit(['idx']);
        return;
      case 'call':
        curLine = e[3] || curLine;
        for (const a of e[2]) genExpr(a);
        emit(['call', e[1], e[2].length]);
        return;
      case 'un':
        genExpr(e[2]);
        emit(['un', e[1]]);
        return;
      case 'bin':
        genExpr(e[2]);
        genExpr(e[3]);
        emit(['bin', e[1]]);
        return;
      case 'and': {
        genExpr(e[1]);
        const j = emit(['jfk', 0]);
        genExpr(e[2]);
        patch(j, here());
        return;
      }
      case 'or': {
        genExpr(e[1]);
        const j = emit(['jtk', 0]);
        genExpr(e[2]);
        patch(j, here());
        return;
      }
      case 'cond': {
        genExpr(e[1]);
        const jf = emit(['jf', 0]);
        genExpr(e[2]);
        const jend = emit(['j', 0]);
        patch(jf, here());
        genExpr(e[3]);
        patch(jend, here());
        return;
      }
      default:
        err('未知的表达式 ' + e[0]);
    }
  }

  function genBlock(stmts) {
    if (fn) fn.scopes.push(new Map());
    for (const s of stmts) genStmt(s);
    if (fn) fn.scopes.pop();
  }

  function genSetTo(target, valueGen, line) {
    curLine = line;
    if (target[0] === 'var') {
      const slot = lookup(target[1]);
      valueGen();
      if (slot !== null) emit(['s', slot]);
      else emit(['G', target[1]]);
    } else {
      genExpr(target[1]);
      genExpr(target[2]);
      valueGen();
      emit(['sidx']);
    }
  }

  function genVarDecl(s) {
    const [, name, init, line] = s;
    curLine = line;
    if (init) genExpr(init);
    else emit(['c', null]);
    const slot = declare(name, line);
    if (slot === null) emit(['G', name]);
    else emit(['s', slot]);
  }

  function genSimple(s) {
    if (s[0] === 'var') genVarDecl(s);
    else if (s[0] === 'set') genSetTo(s[1], () => genExpr(s[2]), s[3]);
    else if (s[0] === 'expr') { curLine = s[2]; genExpr(s[1]); emit(['p']); }
    else err('未知的语句 ' + s[0]);
  }

  function genStmt(s) {
    switch (s[0]) {
      case 'var':
        genVarDecl(s);
        return;
      case 'set':
      case 'expr':
        genSimple(s);
        return;
      case 'if': {
        const [, cond, thenB, elseB, line] = s;
        curLine = line;
        genExpr(cond);
        const jf = emit(['jf', 0]);
        genBlock(thenB);
        if (elseB) {
          const jend = emit(['j', 0]);
          patch(jf, here());
          genBlock(elseB);
          patch(jend, here());
        } else {
          patch(jf, here());
        }
        return;
      }
      case 'while': {
        const [, cond, body, line] = s;
        curLine = line;
        const top = here();
        genExpr(cond);
        const jf = emit(['jf', 0]);
        const loop = { brk: [], cont: [] };
        fn.loops.push(loop);
        genBlock(body);
        fn.loops.pop();
        curLine = line;
        emit(['j', top]);
        const end = here();
        patch(jf, end);
        for (const b of loop.brk) patch(b, end);
        for (const c of loop.cont) patch(c, top);
        return;
      }
      case 'for': {
        const [, init, cond, post, body, line] = s;
        curLine = line;
        fn.scopes.push(new Map());
        if (init) genSimple(init);
        const top = here();
        let jf = -1;
        if (cond) {
          curLine = line;
          genExpr(cond);
          jf = emit(['jf', 0]);
        }
        const loop = { brk: [], cont: [] };
        fn.loops.push(loop);
        genBlock(body);
        fn.loops.pop();
        const contAt = here();
        if (post) genSimple(post);
        curLine = line;
        emit(['j', top]);
        const end = here();
        if (jf >= 0) patch(jf, end);
        for (const b of loop.brk) patch(b, end);
        for (const c of loop.cont) patch(c, contAt);
        fn.scopes.pop();
        return;
      }
      case 'forin': {
        const [, name, e, body, line] = s;
        curLine = line;
        fn.scopes.push(new Map());
        const arrSlot = fn.ns++;
        const idxSlot = fn.ns++;
        genExpr(e);
        emit(['s', arrSlot]);
        emit(['c', 0]);
        emit(['s', idxSlot]);
        const top = here();
        emit(['l', idxSlot]);
        emit(['l', arrSlot]);
        emit(['call', 'len', 1]);
        emit(['bin', '<']);
        const jf = emit(['jf', 0]);
        emit(['l', arrSlot]);
        emit(['l', idxSlot]);
        emit(['idx']);
        const varSlot = declare(name, line);
        emit(['s', varSlot]);
        const loop = { brk: [], cont: [] };
        fn.loops.push(loop);
        genBlock(body);
        fn.loops.pop();
        const contAt = here();
        emit(['l', idxSlot]);
        emit(['c', 1]);
        emit(['bin', '+']);
        emit(['s', idxSlot]);
        emit(['j', top]);
        const end = here();
        patch(jf, end);
        for (const b of loop.brk) patch(b, end);
        for (const c of loop.cont) patch(c, contAt);
        fn.scopes.pop();
        return;
      }
      case 'ret':
        curLine = s[2];
        if (s[1]) genExpr(s[1]);
        else emit(['c', null]);
        emit(['ret']);
        return;
      case 'break': {
        curLine = s[1];
        if (!fn || !fn.loops.length) err('break 只能用在循环里', s[1]);
        fn.loops[fn.loops.length - 1].brk.push(emit(['j', 0]));
        return;
      }
      case 'cont': {
        curLine = s[1];
        if (!fn || !fn.loops.length) err('continue 只能用在循环里', s[1]);
        fn.loops[fn.loops.length - 1].cont.push(emit(['j', 0]));
        return;
      }
      case 'block':
        genBlock(s[1]);
        return;
      default:
        err('未知的语句 ' + s[0]);
    }
  }

  // 先生成全部函数，再生成顶层初始化（它位于代码末尾，由 image.init 指向）。
  const topVars = [];
  for (const it of items) {
    if (it[0] === 'func') {
      const [, name, params, body, line] = it;
      if (hasOwn(funcs, name)) err(`函数 ${name} 重复定义`, line);
      if (name === 'main' && params.length !== 1) err('main 必须有且只有一个参数（启动参数数组）', line);
      curLine = line;
      fn = { ns: 0, scopes: [new Map()], loops: [] };
      const entry = here();
      for (const p of params) declare(p, line);
      genBlock(body);
      curLine = line;
      emit(['c', null]);
      emit(['ret']);
      funcs[name] = { entry, np: params.length, ns: fn.ns };
      fn = null;
    } else if (it[0] === 'var') {
      topVars.push(it);
    }
  }

  const init = here();
  fn = null;
  for (const v of topVars) genVarDecl(v);
  curLine = 0;
  if (hasOwn(funcs, 'main')) {
    emit(['argv']);
    emit(['call', 'main', 1]);
  } else {
    emit(['c', null]);
  }
  emit(['halt']);
  return { code, lines, funcs, init };
}

function hasOwn(o, k) {
  return Object.prototype.hasOwnProperty.call(o, k);
}

function compile(src) {
  try {
    const items = parse(src);
    return { ok: true, image: generate(items) };
  } catch (e) {
    if (e instanceof CompileError) return { ok: false, error: e.nosMessage, line: e.line, message: e.message };
    throw e;
  }
}

module.exports = { compile, tokenize, parse, CompileError, expandIncludes };

// 展开 #include "/System/..."（与内核的展开规则相同，路径映射到 assets/system）
function expandIncludes(src, seen = new Set()) {
  return src.split('\n').map((ln) => {
    const m = ln.match(/^#include "(.+)"/);
    if (!m) return ln;
    const rel = m[1].replace(/^\/System\//, '');
    if (seen.has(rel)) return '';
    seen.add(rel);
    const file = require('path').join(__dirname, '../assets/system', rel);
    return expandIncludes(fs.readFileSync(file, 'utf8'), seen);
  }).join('\n');
}

if (require.main === module) {
  const [, , input, output] = process.argv;
  const src = expandIncludes(fs.readFileSync(input, 'utf8'));
  const r = compile(src);
  if (!r.ok) {
    console.error(r.message);
    process.exit(1);
  }
  const text = JSON.stringify(r.image);
  if (output) fs.writeFileSync(output, text, 'utf8');
  else process.stdout.write(text + '\n');
}
