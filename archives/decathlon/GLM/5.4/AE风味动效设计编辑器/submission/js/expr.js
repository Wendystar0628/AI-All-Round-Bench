/* ============================================================
   expr.js — 表达式引擎：词法/语法分析、求值、依赖提取
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------------- 词法 ---------------- */
  const KEYWORDS = new Set(['true', 'false', 'null', 'undefined', 'if', 'else']);
  function tokenize(src) {
    const toks = []; let i = 0;
    const isD = c => (c >= '0' && c <= '9'), isA = c => /[A-Za-z_$]/.test(c), isAN = c => /[A-Za-z0-9_$]/.test(c);
    while (i < src.length) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
      if (isD(c) || (c === '.' && isD(src[i + 1]))) {
        let j = i; while (j < src.length && (isD(src[j]) || src[j] === '.')) j++;
        if (src[j] === 'e' || src[j] === 'E') { j++; if (src[j] === '+' || src[j] === '-') j++; while (j < src.length && isD(src[j])) j++; }
        toks.push({ t: 'num', v: parseFloat(src.slice(i, j)), s: i }); i = j; continue;
      }
      if (isA(c)) {
        let j = i; while (j < src.length && isAN(src[j])) j++;
        const w = src.slice(i, j);
        toks.push({ t: KEYWORDS.has(w) ? 'kw' : 'id', v: w, s: i }); i = j; continue;
      }
      if (c === '"' || c === "'") {
        const q = c; let j = i + 1, out = '';
        while (j < src.length && src[j] !== q) { if (src[j] === '\\') { out += src[j + 1]; j += 2; } else { out += src[j]; j++; } }
        toks.push({ t: 'str', v: out, s: i }); i = j + 1; continue;
      }
      const three = src.substr(i, 3);
      if (three === '===' || three === '!==' || three === '**=') { toks.push({ t: 'op', v: three, s: i }); i += 3; continue; }
      const two = src.substr(i, 2);
      if (['==', '!=', '<=', '>=', '&&', '||', '++', '--', '**'].includes(two)) { toks.push({ t: 'op', v: two, s: i }); i += 2; continue; }
      if ('+-*/%^<>=!?:.,;()[]{}'.includes(c)) { toks.push({ t: 'op', v: c, s: i }); i++; continue; }
      throw new ExprError(`无法识别的字符 "${c}"（位置 ${i}）`, i);
    }
    toks.push({ t: 'eof', v: '', s: src.length });
    return toks;
  }

  class ExprError extends Error {
    constructor(msg, pos) { super(msg); this.pos = pos; }
  }

  /* ---------------- 语法 ---------------- */
  function parse(src) {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p], next = () => toks[p++];
    const isOp = (v) => toks[p].t === 'op' && toks[p].v === v;
    const eat = (v) => { if (!isOp(v)) throw new ExprError(`期望 "${v}"，实际 "${toks[p].v}"`, toks[p].s); return next(); };

    function expression() { return conditional(); }
    function conditional() {
      const test = logicalOr();
      if (isOp('?')) { next(); const a = expression(); eat(':'); const b = expression(); return { k: 'cond', test, a, b }; }
      return test;
    }
    function logicalOr() {
      let l = logicalAnd();
      while (isOp('||')) { next(); l = { k: 'bin', op: '||', a: l, b: logicalAnd() }; }
      return l;
    }
    function logicalAnd() {
      let l = equality();
      while (isOp('&&')) { next(); l = { k: 'bin', op: '&&', a: l, b: equality() }; }
      return l;
    }
    function equality() {
      let l = comparison();
      while (isOp('==') || isOp('!=') || isOp('===') || isOp('!==')) { const op = next().v; l = { k: 'bin', op, a: l, b: comparison() }; }
      return l;
    }
    function comparison() {
      let l = additive();
      while (isOp('<') || isOp('>') || isOp('<=') || isOp('>=')) { const op = next().v; l = { k: 'bin', op, a: l, b: additive() }; }
      return l;
    }
    function additive() {
      let l = multiplicative();
      while (isOp('+') || isOp('-')) { const op = next().v; l = { k: 'bin', op, a: l, b: multiplicative() }; }
      return l;
    }
    function multiplicative() {
      let l = power();
      while (isOp('*') || isOp('/') || isOp('%')) { const op = next().v; l = { k: 'bin', op, a: l, b: power() }; }
      return l;
    }
    function power() {
      let l = unary();
      if (isOp('^') || isOp('**')) { next(); return { k: 'bin', op: '^', a: l, b: power() }; }
      return l;
    }
    function unary() {
      if (isOp('-')) { next(); return { k: 'un', op: '-', a: unary() }; }
      if (isOp('+')) { next(); return unary(); }
      if (isOp('!')) { next(); return { k: 'un', op: '!', a: unary() }; }
      return postfix();
    }
    function postfix() {
      let e = primary();
      for (;;) {
        if (isOp('.')) {
          next();
          const nm = next();
          if (nm.t !== 'id' && nm.t !== 'kw') throw new ExprError(`期望属性名`, nm.s);
          if (isOp('(')) { e = { k: 'call', obj: e, name: nm.v, args: args() }; }
          else e = { k: 'member', obj: e, name: nm.v };
        } else if (isOp('[')) {
          next(); const idx = expression(); eat(']');
          e = { k: 'index', obj: e, idx };
        } else break;
      }
      return e;
    }
    function args() {
      eat('('); const out = [];
      if (!isOp(')')) { out.push(expression()); while (isOp(',')) { next(); out.push(expression()); } }
      eat(')'); return out;
    }
    function primary() {
      const t = peek();
      if (t.t === 'num') { next(); return { k: 'num', v: t.v }; }
      if (t.t === 'str') { next(); return { k: 'str', v: t.v }; }
      if (t.t === 'kw') {
        next();
        if (t.v === 'true') return { k: 'bool', v: true };
        if (t.v === 'false') return { k: 'bool', v: false };
        if (t.v === 'null') return { k: 'null' };
        if (t.v === 'undefined') return { k: 'undefined' };
        if (t.v === 'if') { eat('('); const test = expression(); eat(')'); const a = expression(); if (peek().v === 'else') { next(); const b = expression(); return { k: 'cond', test, a, b }; } return { k: 'cond', test, a, b: { k: 'undefined' } }; }
        if (t.v === 'else') throw new ExprError('多余的 else', t.s);
      }
      if (t.t === 'id') {
        next();
        if (isOp('(')) return { k: 'call', obj: null, name: t.v, args: args() };
        return { k: 'ident', name: t.v };
      }
      if (isOp('(')) { next(); const e = expression(); eat(')'); return e; }
      if (isOp('[')) {
        next(); const el = [];
        if (!isOp(']')) { el.push(expression()); while (isOp(',')) { next(); if (isOp(']')) break; el.push(expression()); } }
        eat(']'); return { k: 'arr', el };
      }
      throw new ExprError(`意外的符号 "${t.v}"`, t.s);
    }
    const ast = expression();
    if (peek().t !== 'eof') throw new ExprError(`表达式末尾有多余内容 "${peek().v}"`, peek().s);
    return ast;
  }

  /* ---------------- 求值 ---------------- */
  const isArr = v => Array.isArray(v);
  const dim = v => isArr(v) ? v.length : 1;
  function broadcast(a, b) {
    if (isArr(a) || isArr(b)) {
      const n = Math.max(dim(a), dim(b));
      return [0, 1, 2].slice(0, n).map(i => [isArr(a) ? (a[i] === undefined ? 0 : a[i]) : a, isArr(b) ? (b[i] === undefined ? 0 : b[i]) : b]);
    }
    return null;
  }
  function binop(op, a, b) {
    if (op === '&&') return truthy(a) ? b : a;
    if (op === '||') return truthy(a) ? a : b;
    if (op === '+') { const p = broadcast(a, b); if (p) return p.map(([x, y]) => x + y); return a + b; }
    if (op === '-') { const p = broadcast(a, b); if (p) return p.map(([x, y]) => x - y); return a - b; }
    if (op === '*') { const p = broadcast(a, b); if (p) return p.map(([x, y]) => x * y); return a * b; }
    if (op === '/') { const p = broadcast(a, b); if (p) return p.map(([x, y]) => x / (y || 1e-9)); return a / (b || 1e-9); }
    if (op === '%') { const p = broadcast(a, b); if (p) return p.map(([x, y]) => x % (y || 1e-9)); return a % (b || 1e-9); }
    if (op === '^') return Math.pow(a, b);
    if (op === '==' || op === '===') return eq(a, b);
    if (op === '!=' || op === '!==') return !eq(a, b);
    if (op === '<') return a < b; if (op === '>') return a > b;
    if (op === '<=') return a <= b; if (op === '>=') return a >= b;
    throw new ExprError('未知运算符 ' + op);
  }
  function eq(a, b) { if (isArr(a) && isArr(b)) return a.length === b.length && a.every((v, i) => v === b[i]); return a === b; }
  function truthy(v) { return isArr(v) ? v.length > 0 : !!v; }
  function num(v, def = 0) { if (typeof v === 'number') return isFinite(v) ? v : def; if (isArr(v)) return num(v[0], def); return def; }

  function evaluate(ast, ctx) {
    switch (ast.k) {
      case 'num': return ast.v;
      case 'str': return ast.v;
      case 'bool': return ast.v;
      case 'null': return null;
      case 'undefined': return undefined;
      case 'arr': return ast.el.map(e => evaluate(e, ctx));
      case 'ident': return ctx.ident(ast.name);
      case 'member': {
        const o = evaluate(ast.obj, ctx);
        return ctx.member(o, ast.name, ast);
      }
      case 'index': {
        const o = evaluate(ast.obj, ctx);
        const i = evaluate(ast.idx, ctx);
        if (o && typeof o === 'object' && o.__prop) return o.__index(i);
        if (isArr(o)) return o[i | 0];
        if (o && typeof o === 'object') return o[i];
        return undefined;
      }
      case 'un': {
        const v = evaluate(ast.a, ctx);
        if (ast.op === '-') return isArr(v) ? v.map(x => -x) : -num(v);
        return !truthy(v);
      }
      case 'bin': return binop(ast.op, evaluate(ast.a, ctx), evaluate(ast.b, ctx));
      case 'cond': return truthy(evaluate(ast.test, ctx)) ? evaluate(ast.a, ctx) : evaluate(ast.b, ctx);
      case 'call': {
        const args = ast.args.map(a => evaluate(a, ctx));
        if (ast.obj) {
          const o = evaluate(ast.obj, ctx);
          if (o && typeof o === 'object' && o.__call) return o.__call(ast.name, args);
          if (o && typeof o === 'object' && typeof o[ast.name] === 'function') return o[ast.name](...args);
          return ctx.call(ast.name, args, ast, o);
        }
        return ctx.call(ast.name, args, ast, undefined);
      }
    }
    throw new ExprError('未知节点');
  }

  /* ---------------- 依赖提取 ---------------- */
  // 返回 [{ layer: 名称|索引|null(本层), path: ['transform','position'] }]
  function collectDeps(ast) {
    const out = [];
    function propPath(node) {
      // 从 member/index 链取属性名
      const path = [];
      let n = node;
      while (n) {
        if (n.k === 'member') { path.unshift(n.name); n = n.obj; }
        else if (n.k === 'index') { path.unshift(null); n = n.obj; }
        else if (n.k === 'call') { path.unshift(n.name); n = n.obj; }
        else break;
      }
      return { path, root: n };
    }
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (node.k === 'member' || node.k === 'index' || node.k === 'call') {
        const { path, root } = propPath(node);
        if (root && root.k === 'call' && root.obj === null) {
          if (root.name === 'thisComp' || (root.name === 'layer')) { /* 不处理 */ }
        }
      }
      if (node.k === 'member' && node.obj && node.obj.k === 'call' && node.obj.name === 'layer' && node.obj.obj && node.obj.obj.k === 'ident' && node.obj.obj.name === 'thisComp') {
        // thisComp.layer("x").a.b
        const arg = node.obj.args[0];
        let layer = null;
        if (arg && arg.k === 'str') layer = arg.v;
        else if (arg && arg.k === 'num') layer = arg.v;
        const path = [node.name];
        let o = node.obj; // 继续向上由外层 walk 处理
        out.push({ layer, path });
      }
      if (node.k === 'member' && node.obj && node.obj.k === 'ident' && node.obj.name === 'thisLayer') {
        out.push({ layer: '__self__', path: [node.name] });
      }
      if (node.k === 'member' && node.obj && node.obj.k === 'ident' && node.obj.name === 'thisProperty') {
        out.push({ layer: '__self__', path: ['__self__'] });
      }
      for (const k in node) {
        if (k === 'k') continue;
        const v = node[k];
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object' && v.k) walk(v);
      }
    }
    walk(ast);
    return out;
  }

  /* ---------------- 平滑噪声（可复现） ---------------- */
  function hashN(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function noise1(x, seed) {
    const i = Math.floor(x), f = x - i;
    const a = hashN(i + seed * 57.13), b = hashN(i + 1 + seed * 57.13);
    const u = f * f * (3 - 2 * f);
    return (a + (b - a) * u) * 2 - 1;
  }
  function wiggleValue(t, freq, amp, oct, seed) {
    let v = 0, a = 1, f = freq, tot = 0;
    for (let o = 0; o < oct; o++) { v += noise1(t * f + o * 31.7, seed + o * 13.3) * a; tot += a; a *= 0.5; f *= 2.03; }
    return (v / (tot || 1)) * amp;
  }

  global.EXPR = { parse, evaluate, collectDeps, ExprError, wiggleValue, isArr, dim };
})(window);
