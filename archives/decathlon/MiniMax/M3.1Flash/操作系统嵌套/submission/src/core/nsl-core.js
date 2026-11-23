/*
 * NSL —— Nested System Language（嵌套系统语言）
 * 本文件包含：引导用编译器（JS 实现）+ 字节码虚拟机。
 * 说明：作品内的编译器是用 NSL 自己写的（src/nsl/compiler.nsl），
 *       本文件中的 JS 编译器只用于第一次引导（把编译器自身装载起来），
 *       之后系统内所有程序都由 NSL 编译器编译。
 * 字节码与 NSL 编译器产生的是同一种格式，因此二者可互换。
 */
(function (g) {
  const NSL = (g.NSL = g.NSL || {});

  /* ============================ 词法 ============================ */
  const TWO_OPS = ['==', '!=', '<=', '>=', '&&', '||', '+=', '-=', '*=', '/='];
  const ONE_OPS = '+-*/%()[]{};,:<>=!.?';

  function lex(src) {
    const toks = [];
    let i = 0;
    const n = src.length;
    let line = 1;
    const isDigit = (c) => c >= '0' && c <= '9';
    const isAlpha = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
    const isAlnum = (c) => isAlpha(c) || isDigit(c);
    while (i < n) {
      const c = src[i];
      if (c === '\n') { line++; i++; continue; }
      if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
        i += 2; continue;
      }
      if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
        let j = i;
        while (j < n && isDigit(src[j])) j++;
        if (src[j] === '.') { j++; while (j < n && isDigit(src[j])) j++; }
        if (src[j] === 'e' || src[j] === 'E') {
          j++; if (src[j] === '+' || src[j] === '-') j++;
          while (j < n && isDigit(src[j])) j++;
        }
        toks.push({ k: 'num', v: parseFloat(src.slice(i, j)), line }); i = j; continue;
      }
      if (c === '"' || c === "'") {
        const q = c; let j = i + 1; let s = '';
        while (j < n && src[j] !== q) {
          if (src[j] === '\\') {
            const e = src[j + 1];
            s += e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r' : e === '0' ? '\0' : e;
            j += 2;
          } else { s += src[j]; j++; }
        }
        toks.push({ k: 'str', v: s, line }); i = j + 1; continue;
      }
      if (isAlpha(c)) {
        let j = i; while (j < n && isAlnum(src[j])) j++;
        // 支持带点的标识符（内建函数名，如 arr.len / str.at）
        while (j < n && src[j] === '.' && j + 1 < n && isAlpha(src[j + 1])) {
          j++;
          while (j < n && isAlnum(src[j])) j++;
        }
        toks.push({ k: 'id', v: src.slice(i, j), line }); i = j; continue;
      }
      const two = src.substr(i, 2);
      if (TWO_OPS.indexOf(two) >= 0) { toks.push({ k: 'op', v: two, line }); i += 2; continue; }
      if (ONE_OPS.indexOf(c) >= 0) { toks.push({ k: 'op', v: c, line }); i++; continue; }
      throw new Error('无法识别的字符 "' + c + '"（第 ' + line + ' 行）');
    }
    toks.push({ k: 'eof', v: null, line });
    return toks;
  }

  /* ============================ 语法 ============================ */
  function parse(src) {
    const toks = lex(src);
    let p = 0;
    const peek = () => toks[p];
    const atOp = (v) => toks[p].k === 'op' && toks[p].v === v;
    const atId = (v) => toks[p].k === 'id' && (v === undefined || toks[p].v === v);
    function fail(msg) { throw new Error('语法错误：' + msg + '（第 ' + toks[p].line + ' 行：' + (toks[p].v === null ? '文件结束' : toks[p].v) + '）'); }
    function expectOp(v) { if (!atOp(v)) fail('期望 "' + v + '"'); p++; }
    function expectId() { if (!atId()) fail('期望标识符'); return toks[p++].v; }

    // --- 表达式 ---
    function parseExpr() { return parseAssign(); }
    function parseAssign() {
      const left = parseTernary();
      if (atOp('=') || atOp('+=') || atOp('-=') || atOp('*=') || atOp('/=')) {
        const op = toks[p++].v;
        const value = parseAssign();
        if (left.type !== 'ident' && left.type !== 'index') fail('赋值目标无效');
        return { type: 'assign', op, target: left, value };
      }
      return left;
    }
    function parseTernary() {
      const cond = parseOr();
      if (atOp('?')) {
        p++;
        const a = parseTernary();
        expectOp(':');
        const b = parseTernary();
        return { type: 'ternary', cond, a, b };
      }
      return cond;
    }
    function parseOr() {
      let l = parseAnd();
      while (atOp('||')) { p++; l = { type: 'logical', op: '||', l, r: parseAnd() }; }
      return l;
    }
    function parseAnd() {
      let l = parseEquality();
      while (atOp('&&')) { p++; l = { type: 'logical', op: '&&', l, r: parseEquality() }; }
      return l;
    }
    function parseEquality() {
      let l = parseRelational();
      while (atOp('==') || atOp('!=')) { const op = toks[p++].v; l = { type: 'bin', op, l, r: parseRelational() }; }
      return l;
    }
    function parseRelational() {
      let l = parseAdditive();
      while (atOp('<') || atOp('<=') || atOp('>') || atOp('>=')) { const op = toks[p++].v; l = { type: 'bin', op, l, r: parseAdditive() }; }
      return l;
    }
    function parseAdditive() {
      let l = parseMultiplicative();
      while (atOp('+') || atOp('-')) { const op = toks[p++].v; l = { type: 'bin', op, l, r: parseMultiplicative() }; }
      return l;
    }
    function parseMultiplicative() {
      let l = parseUnary();
      while (atOp('*') || atOp('/') || atOp('%')) { const op = toks[p++].v; l = { type: 'bin', op, l, r: parseUnary() }; }
      return l;
    }
    function parseUnary() {
      if (atOp('!')) { p++; return { type: 'unary', op: '!', e: parseUnary() }; }
      if (atOp('-')) { p++; return { type: 'unary', op: '-', e: parseUnary() }; }
      return parsePrimary();
    }
    function parsePrimary() {
      const t = peek();
      if (t.k === 'num') { p++; return parsePostfix({ type: 'num', v: t.v }); }
      if (t.k === 'str') { p++; return parsePostfix({ type: 'str', v: t.v }); }
      if (atId('true')) { p++; return { type: 'bool', v: true }; }
      if (atId('false')) { p++; return { type: 'bool', v: false }; }
      if (atId('null')) { p++; return { type: 'null' }; }
      if (atOp('(')) { p++; const e = parseExpr(); expectOp(')'); return parsePostfix(e); }
      if (atOp('{')) {
        p++; const props = [];
        if (!atOp('}')) {
          for (;;) {
            let key = null;
            if (toks[p].k === 'id') key = toks[p++].v;
            else if (toks[p].k === 'str') key = toks[p++].v;
            else fail('对象键必须是标识符或字符串');
            expectOp(':');
            props.push([key, parseExpr()]);
            if (atOp(',')) { p++; continue; }
            break;
          }
        }
        expectOp('}');
        return { type: 'obj', props };
      }
      if (atOp('[')) {
        p++; const items = [];
        if (!atOp(']')) { items.push(parseExpr()); while (atOp(',')) { p++; items.push(parseExpr()); } }
        expectOp(']'); return { type: 'arr', items };
      }
      if (t.k === 'id') {
        const name = t.v; p++;
        if (atOp('(')) {
          p++; const args = [];
          if (!atOp(')')) { args.push(parseExpr()); while (atOp(',')) { p++; args.push(parseExpr()); } }
          expectOp(')');
          return parsePostfix({ type: 'call', name, args });
        }
        return parsePostfix({ type: 'ident', name });
      }
      fail('无法解析的表达式');
    }
    function parsePostfix(base) {
      while (atOp('[')) {
        p++; const idx = parseExpr(); expectOp(']');
        base = { type: 'index', obj: base, idx };
      }
      return base;
    }

    // --- 语句 ---
    function parseBlock() {
      expectOp('{');
      const body = [];
      while (!atOp('}')) { if (toks[p].k === 'eof') fail('函数体缺少 "}"'); body.push(parseStatement()); }
      expectOp('}');
      return { type: 'block', body };
    }
    function parseStatement() {
      if (atOp('{')) return parseBlock();
      if (atOp(';')) { p++; return { type: 'block', body: [] }; }
      if (atId('var')) {
        p++; const name = expectId();
        let value = null;
        if (atOp('=')) { p++; value = parseExpr(); }
        expectOp(';');
        return { type: 'var', name, value };
      }
      if (atId('if')) {
        p++; expectOp('('); const cond = parseExpr(); expectOp(')');
        const then = parseStatement();
        let alt = null;
        if (atId('else')) { p++; alt = parseStatement(); }
        return { type: 'if', cond, then, alt };
      }
      if (atId('while')) {
        p++; expectOp('('); const cond = parseExpr(); expectOp(')');
        return { type: 'while', cond, body: parseStatement() };
      }
      if (atId('for')) {
        p++; expectOp('(');
        let init = null, cond = null, step = null;
        if (!atOp(';')) {
          if (atId('var')) init = parseStatement();
          else { init = { type: 'exprstmt', e: parseExpr() }; expectOp(';'); }
        } else p++;
        if (!atOp(';')) cond = parseExpr();
        expectOp(';');
        if (!atOp(')')) step = { type: 'exprstmt', e: parseExpr() };
        expectOp(')');
        return { type: 'for', init, cond, step, body: parseStatement() };
      }
      if (atId('return')) {
        p++; let value = null;
        if (!atOp(';')) value = parseExpr();
        expectOp(';');
        return { type: 'ret', value };
      }
      if (atId('break')) { p++; expectOp(';'); return { type: 'break' }; }
      if (atId('continue')) { p++; expectOp(';'); return { type: 'continue' }; }
      if (atId('function')) {
        p++; const name = expectId(); expectOp('(');
        const params = [];
        if (!atOp(')')) { params.push(expectId()); while (atOp(',')) { p++; params.push(expectId()); } }
        expectOp(')');
        const body = parseBlock();
        return { type: 'func', name, params, body };
      }
      const e = parseExpr();
      expectOp(';');
      return { type: 'exprstmt', e };
    }

    const body = [];
    const funcs = {};
    while (toks[p].k !== 'eof') {
      const st = parseStatement();
      if (st.type === 'func') funcs[st.name] = st; else body.push(st);
    }
    return { type: 'prog', body, funcs };
  }

  /* ============================ 作用域与代码生成 ============================ */
  const OP = {
    CONST: 0, NIL: 1, POP: 2, DUP: 3, DUP2: 33, NEWOBJ: 34,
    GETG: 4, SETG: 5, GETL: 6, SETL: 7,
    NEWARR: 8, AGET: 9, ASET: 10,
    ADD: 11, SUB: 12, MUL: 13, DIV: 14, MOD: 15,
    NEG: 16, NOT: 17,
    EQ: 18, NE: 19, LT: 20, LE: 21, GT: 22, GE: 23,
    AND: 24, OR: 25,
    JMP: 26, JF: 27, JT: 28,
    CALL: 29, RET: 30, BUILTIN: 31, HALT: 32,
  };
  NSL.OP = OP;

  function collectLocals(fn) {
    const set = new Set();
    fn.params.forEach((p) => set.add(p));
    const walk = (n) => {
      if (!n || typeof n !== 'object') return;
      if (n.type === 'func') return;
      if (n.type === 'var') { set.add(n.name); return; }
      if (n.type === 'block') { n.body.forEach(walk); return; }
      if (n.type === 'if') { walk(n.cond); walk(n.then); walk(n.alt); return; }
      if (n.type === 'while') { walk(n.cond); walk(n.body); return; }
      if (n.type === 'for') { walk(n.init); walk(n.cond); walk(n.step); walk(n.body); return; }
      if (n.type === 'exprstmt') { walk(n.e); return; }
      if (n.type === 'ret') { walk(n.value); return; }
      if (n.type === 'assign') { walk(n.target); walk(n.value); return; }
      if (n.type === 'bin') { walk(n.l); walk(n.r); return; }
      if (n.type === 'unary') { walk(n.e); return; }
      if (n.type === 'logical') { walk(n.l); walk(n.r); return; }
      if (n.type === 'index') { walk(n.obj); walk(n.idx); return; }
      if (n.type === 'call') { n.args.forEach(walk); return; }
      if (n.type === 'arr') { n.items.forEach(walk); return; }
    };
    walk(fn.body);
    return set;
  }

  function codegen(ast) {
    const consts = [];
    const constIndex = new Map();
    const nameIndex = new Map();
    function kc(v) {
      const key = typeof v + ':' + String(v);
      if (constIndex.has(key)) return constIndex.get(key);
      const i = consts.length; consts.push(v); constIndex.set(key, i); return i;
    }
    function kn(name) {
      if (nameIndex.has(name)) return nameIndex.get(name);
      const i = nameIndex.size; nameIndex.set(name, i); return i;
    }
    const funcNames = Object.keys(ast.funcs);
    const funcIndex = {};
    funcNames.forEach((n, i) => { funcIndex[n] = i; });

    function emitFunc(fn, noLocals) {
      const code = [];
      const locals = noLocals ? new Set() : collectLocals(fn);
      const slot = new Map();
      let n = 0;
      locals.forEach((name) => { slot.set(name, n++); });
      const loops = [];
      const isLocal = (name) => slot.has(name);

      function emitExpr(e) {
        switch (e.type) {
          case 'num': case 'str': case 'bool': code.push([OP.CONST, kc(e.v)]); break;
          case 'null': code.push([OP.NIL]); break;
          case 'ident': {
            if (isLocal(e.name)) code.push([OP.GETL, slot.get(e.name)]);
            else code.push([OP.GETG, kn(e.name)]);
            break;
          }
          case 'arr': {
            e.items.forEach(emitExpr);
            code.push([OP.NEWARR, e.items.length]);
            break;
          }
          case 'obj': {
            const keys = e.props.map((pr) => kc(pr[0]));
            e.props.forEach((pr) => emitExpr(pr[1]));
            code.push([OP.NEWOBJ, keys, e.props.length]);
            break;
          }
          case 'index': {
            emitExpr(e.obj); emitExpr(e.idx); code.push([OP.AGET]);
            break;
          }
          case 'call': {
            e.args.forEach(emitExpr);
            if (funcIndex[e.name] !== undefined) code.push([OP.CALL, funcIndex[e.name], e.args.length]);
            else code.push([OP.BUILTIN, kn(e.name), e.args.length]);
            break;
          }
          case 'unary':
            emitExpr(e.e);
            code.push(e.op === '-' ? [OP.NEG] : [OP.NOT]);
            break;
          case 'bin': {
            emitExpr(e.l); emitExpr(e.r);
            const map = { '+': OP.ADD, '-': OP.SUB, '*': OP.MUL, '/': OP.DIV, '%': OP.MOD,
              '==': OP.EQ, '!=': OP.NE, '<': OP.LT, '<=': OP.LE, '>': OP.GT, '>=': OP.GE };
            code.push([map[e.op]]);
            break;
          }
          case 'logical': {
            emitExpr(e.l);
            code.push([OP.DUP]);
            const j = code.length;
            code.push([e.op === '&&' ? OP.JF : OP.JT, 0]);
            code.push([OP.POP]);
            emitExpr(e.r);
            code[j][1] = code.length;
            break;
          }
          case 'ternary': {
            emitExpr(e.cond);
            const jf = code.length; code.push([OP.JF, 0]);
            emitExpr(e.a);
            const jend = code.length; code.push([OP.JMP, 0]);
            code[jf][1] = code.length;
            emitExpr(e.b);
            code[jend][1] = code.length;
            break;
          }
          case 'assign': {
            if (e.op === '=') {
              if (e.target.type === 'ident') {
                emitExpr(e.value);
                code.push([OP.DUP]);
                if (isLocal(e.target.name)) code.push([OP.SETL, slot.get(e.target.name)]);
                else code.push([OP.SETG, kn(e.target.name)]);
              } else {
                emitExpr(e.target.obj); emitExpr(e.target.idx); emitExpr(e.value);
                code.push([OP.ASET]);
              }
            } else {
              const bop = e.op[0];
              if (e.target.type === 'ident') {
                if (isLocal(e.target.name)) code.push([OP.GETL, slot.get(e.target.name)]);
                else code.push([OP.GETG, kn(e.target.name)]);
                emitExpr(e.value);
                const map = { '+': OP.ADD, '-': OP.SUB, '*': OP.MUL, '/': OP.DIV };
                code.push([map[bop]]);
                code.push([OP.DUP]);
                if (isLocal(e.target.name)) code.push([OP.SETL, slot.get(e.target.name)]);
                else code.push([OP.SETG, kn(e.target.name)]);
              } else {
                // a[i] op= v  =>  a[i] = a[i] op v
                emitExpr(e.target.obj); emitExpr(e.target.idx);
                code.push([OP.DUP2]);
                code.push([OP.AGET]);
                emitExpr(e.value);
                const map = { '+': OP.ADD, '-': OP.SUB, '*': OP.MUL, '/': OP.DIV };
                code.push([map[bop]]);
                code.push([OP.ASET]);
              }
            }
            break;
          }
        }
      }
      function emitStmt(s) {
        switch (s.type) {
          case 'block': s.body.forEach(emitStmt); break;
          case 'var': {
            if (s.value) emitExpr(s.value); else code.push([OP.NIL]);
            if (isLocal(s.name)) code.push([OP.SETL, slot.get(s.name)]);
            else code.push([OP.SETG, kn(s.name)]);
            break;
          }
          case 'exprstmt': emitExpr(s.e); code.push([OP.POP]); break;
          case 'if': {
            emitExpr(s.cond);
            const jf = code.length; code.push([OP.JF, 0]);
            emitStmt(s.then);
            const jend = code.length; code.push([OP.JMP, 0]);
            code[jf][1] = code.length;
            if (s.alt) emitStmt(s.alt);
            code[jend][1] = code.length;
            break;
          }
          case 'while': {
            const start = code.length;
            emitExpr(s.cond);
            const jf = code.length; code.push([OP.JF, 0]);
            loops.push({ breaks: [], continues: [] });
            emitStmt(s.body);
            const loop = loops.pop();
            code.push([OP.JMP, start]);
            code[jf][1] = code.length;
            loop.breaks.forEach((b) => { code[b][1] = code.length; });
            loop.continues.forEach((c) => { code[c][1] = start; });
            break;
          }
          case 'for': {
            if (s.init) emitStmt(s.init);
            const start = code.length;
            let condJf = -1;
            if (s.cond) { emitExpr(s.cond); condJf = code.length; code.push([OP.JF, 0]); }
            loops.push({ breaks: [], continues: [] });
            emitStmt(s.body);
            const loop = loops.pop();
            const stepPos = code.length;
            if (s.step) emitStmt(s.step);
            code.push([OP.JMP, start]);
            if (condJf >= 0) code[condJf][1] = code.length;
            loop.breaks.forEach((b) => { code[b][1] = code.length; });
            loop.continues.forEach((c) => { code[c][1] = stepPos; });
            break;
          }
          case 'ret': {
            if (s.value) emitExpr(s.value); else code.push([OP.NIL]);
            code.push([OP.RET]);
            break;
          }
          case 'break': {
            const j = code.length; code.push([OP.JMP, 0]);
            if (loops.length) loops[loops.length - 1].breaks.push(j);
            else code[j][1] = code.length;
            break;
          }
          case 'continue': {
            const j = code.length; code.push([OP.JMP, 0]);
            if (loops.length) loops[loops.length - 1].continues.push(j);
            else code[j][1] = code.length;
            break;
          }
        }
      }
      emitStmt({ type: 'block', body: fn.body.type === 'block' ? fn.body.body : [fn.body] });
      code.push([OP.NIL]); code.push([OP.RET]);
      return { name: fn.name, code, nlocals: n, params: fn.params.length };
    }

    const funcs = funcNames.map((n) => emitFunc(ast.funcs[n]));
    const main = emitFunc({ name: 'main', params: [], body: { type: 'block', body: ast.body } }, true);
    return { consts, names: Array.from(nameIndex.keys()), funcs, main, globals: {}, funcNames: funcNames.slice() };
  }

  NSL.compileSource = function (src) {
    const ast = parse(src);
    return codegen(ast);
  };

  /* ============================ 虚拟机 ============================ */
  function RuntimeError(msg) { this.message = msg; this.name = 'NSL运行时错误'; }
  RuntimeError.prototype = Object.create(Error.prototype);

  function truthy(v) { return !(v === false || v === null || v === undefined || v === 0 || v === ''); }

  function numOf(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v === null || v === undefined) return 0;
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }
  function strOf(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (Array.isArray(v)) return v.map(strOf).join(',');
    return String(v);
  }
  function deepCopy(v) {
    if (Array.isArray(v)) return v.map(deepCopy);
    if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = deepCopy(v[k]); return o; }
    return v;
  }

  const BUILTINS = {
    /* 系统 */
    'print': (a, ctx) => { ctx.log(a.map(strOf).join(' ')); return null; },
    'sys.log': (a, ctx) => { ctx.log(a.map(strOf).join(' ')); return null; },
    'sys.time': (a, ctx) => ctx.now(),
    'sys.typeOf': (a) => {
      const v = a[0];
      if (v === null || v === undefined) return 'null';
      if (typeof v === 'number') return 'number';
      if (typeof v === 'string') return 'string';
      if (typeof v === 'boolean') return 'boolean';
      if (Array.isArray(v)) return 'array';
      return 'object';
    },
    'sys.call': (a, ctx) => { if (!ctx.svc) throw new RuntimeError('sys.call 只能由内核程序使用'); return ctx.svc(a[0], a[1] === undefined ? '' : a[1]); },
    'sys.syscall': (a, ctx) => {
      if (!ctx.syscall) throw new RuntimeError('sys.syscall 不可用');
      // 被内核回复唤醒后的续行：回复数据只交付一次
      const resume = ctx.takeResume ? ctx.takeResume() : null;
      if (resume && resume.tag === ctx.pendingTag) return resume.data;
      const r = ctx.syscall(a[0], a[1] === undefined ? '' : a[1]);
      if (r && r.done) return r.data;
      // 挂起在系统调用上：虚拟机记住指令位置，等待回复后重新执行本条指令
      return { __nslWait: r ? r.tag : 0 };
    },
    'sys.inbox': (a, ctx) => (ctx.inbox ? ctx.inbox() : '[]'),
    'sys.takeMsg': (a, ctx) => (ctx.takeMsg ? ctx.takeMsg() : ''),
    'sys.yield': (a, ctx) => { if (ctx.yieldRequest) ctx.yieldRequest(); return 1; },
    'sys.self': (a, ctx) => (ctx.selfId ? ctx.selfId() : 0),
    /* 数学 */
    'math.sqrt': (a) => Math.sqrt(numOf(a[0])),
    'math.sin': (a) => Math.sin(numOf(a[0])),
    'math.cos': (a) => Math.cos(numOf(a[0])),
    'math.tan': (a) => Math.tan(numOf(a[0])),
    'math.atan2': (a) => Math.atan2(numOf(a[0]), numOf(a[1])),
    'math.abs': (a) => Math.abs(numOf(a[0])),
    'math.floor': (a) => Math.floor(numOf(a[0])),
    'math.ceil': (a) => Math.ceil(numOf(a[0])),
    'math.round': (a) => Math.round(numOf(a[0])),
    'math.min': (a) => Math.min(numOf(a[0]), numOf(a[1])),
    'math.max': (a) => Math.max(numOf(a[0]), numOf(a[1])),
    'math.pow': (a) => Math.pow(numOf(a[0]), numOf(a[1])),
    'math.log': (a) => Math.log(numOf(a[0])),
    'math.exp': (a) => Math.exp(numOf(a[0])),
    'math.pi': () => Math.PI,
    'math.clamp': (a) => Math.max(numOf(a[1]), Math.min(numOf(a[2]), numOf(a[0]))),
    /* 字符串 */
    'str.len': (a) => strOf(a[0]).length,
    'str.at': (a) => { const s = strOf(a[0]); const i = Math.floor(numOf(a[1])); return i >= 0 && i < s.length ? s[i] : ''; },
    'str.sub': (a) => { const s = strOf(a[0]); let i = Math.floor(numOf(a[1])); let j = a[2] === undefined ? s.length : Math.floor(numOf(a[2])); if (i < 0) i = 0; if (j > s.length) j = s.length; if (j < i) j = i; return s.slice(i, j); },
    'str.cmp': (a) => { const x = strOf(a[0]); const y = strOf(a[1]); return x < y ? -1 : (x > y ? 1 : 0); },
    'str.eq': (a) => strOf(a[0]) === strOf(a[1]),
    'str.lower': (a) => strOf(a[0]).toLowerCase(),
    'str.upper': (a) => strOf(a[0]).toUpperCase(),
    'str.indexOf': (a) => strOf(a[0]).indexOf(strOf(a[1])),
    'str.lastIndexOf': (a) => strOf(a[0]).lastIndexOf(strOf(a[1])),
    'str.split': (a) => strOf(a[0]).split(strOf(a[1] === undefined ? ',' : a[1])),
    'str.trim': (a) => strOf(a[0]).trim(),
    'str.replace': (a) => strOf(a[0]).split(strOf(a[1])).join(strOf(a[2])),
    'str.startsWith': (a) => strOf(a[0]).lastIndexOf(strOf(a[1]), 0) === 0,
    'str.endsWith': (a) => { const s = strOf(a[0]); const t = strOf(a[1]); return s.length >= t.length && s.slice(s.length - t.length) === t; },
    'str.charFromCode': (a) => String.fromCharCode(Math.floor(numOf(a[0]))),
    'str.codeOf': (a) => { const s = strOf(a[0]); return s.length ? s.charCodeAt(0) : -1; },
    'str.concat': (a) => a.map(strOf).join(''),
    'str.toNum': (a) => { const n = parseFloat(strOf(a[0])); return isNaN(n) ? 0 : n; },
    /* 数字 */
    'num.toStr': (a) => strOf(a[0]),
    'num.toInt': (a) => Math.floor(numOf(a[0])),
    'num.isInt': (a) => Number.isInteger(numOf(a[0])),
    'num.fixed': (a) => numOf(a[0]).toFixed(Math.floor(numOf(a[1]))),
    /* 数组 */
    'arr.len': (a) => (Array.isArray(a[0]) ? a[0].length : 0),
    'arr.get': (a) => { const arr = a[0]; const i = Math.floor(numOf(a[1])); return Array.isArray(arr) && i >= 0 && i < arr.length ? arr[i] : null; },
    'arr.set': (a) => { const arr = a[0]; const i = Math.floor(numOf(a[1])); if (!Array.isArray(arr) || i < 0 || i >= arr.length) throw new RuntimeError('数组下标越界: ' + i); arr[i] = a[2]; return a[2]; },
    'arr.push': (a) => { const arr = a[0]; if (!Array.isArray(arr)) throw new RuntimeError('arr.push 目标不是数组（类型 ' + (arr === null ? 'null' : typeof arr) + ' 参数 ' + JSON.stringify(a) + '）'); arr.push(a[1]); return arr.length; },
    'arr.pop': (a) => { const arr = a[0]; if (!Array.isArray(arr) || !arr.length) return null; return arr.pop(); },
    'arr.removeAt': (a) => { const arr = a[0]; const i = Math.floor(numOf(a[1])); if (!Array.isArray(arr) || i < 0 || i >= arr.length) return null; return arr.splice(i, 1)[0]; },
    'arr.indexOf': (a) => { const arr = a[0]; if (!Array.isArray(arr)) return -1; return arr.findIndex((x) => x === a[1]); },
    'arr.slice': (a) => { const arr = a[0]; if (!Array.isArray(arr)) return []; const s = a[1] === undefined ? 0 : Math.floor(numOf(a[1])); const e = a[2] === undefined ? arr.length : Math.floor(numOf(a[2])); return arr.slice(s, e); },
    'arr.join': (a) => (Array.isArray(a[0]) ? a[0].map(strOf).join(a[1] === undefined ? ',' : strOf(a[1])) : ''),
    'arr.contains': (a) => (Array.isArray(a[0]) ? a[0].some((x) => x === a[1]) : false),
    'arr.copy': (a) => (Array.isArray(a[0]) ? a[0].map(deepCopy) : []),
    'arr.reverse': (a) => { if (!Array.isArray(a[0])) return []; return a[0].slice().reverse(); },
    'arr.insert': (a) => { const arr = a[0]; if (!Array.isArray(arr)) return []; arr.splice(Math.floor(numOf(a[1])), 0, a[2]); return arr.length; },
    'arr.sortNumbers': (a) => { if (!Array.isArray(a[0])) return []; return a[0].slice().sort((x, y) => numOf(x) - numOf(y)); },
    'arr.sortStrings': (a) => { if (!Array.isArray(a[0])) return []; return a[0].slice().sort((x, y) => (strOf(x) < strOf(y) ? -1 : (strOf(x) > strOf(y) ? 1 : 0))); },
    /* 映射表（数组实现的对） */
    'map.new': () => [],
    'map.set': (a) => {
      const m = a[0]; const k = strOf(a[1]); if (!Array.isArray(m)) throw new RuntimeError('map.set 目标不是映射表');
      const hit = m.find((p) => p[0] === k);
      if (hit) { hit[1] = a[2]; return a[2]; }
      m.push([k, a[2]]); return a[2];
    },
    'map.get': (a) => { const m = a[0]; if (!Array.isArray(m)) return null; const hit = m.find((p) => p[0] === strOf(a[1])); return hit ? hit[1] : null; },
    'map.has': (a) => { const m = a[0]; if (!Array.isArray(m)) return false; return m.some((p) => p[0] === strOf(a[1])); },
    'map.keys': (a) => (Array.isArray(a[0]) ? a[0].map((p) => p[0]) : []),
    'map.values': (a) => (Array.isArray(a[0]) ? a[0].map((p) => p[1]) : []),
    'map.del': (a) => { const m = a[0]; if (!Array.isArray(m)) return false; const i = m.findIndex((p) => p[0] === strOf(a[1])); if (i < 0) return false; m.splice(i, 1); return true; },
    'map.len': (a) => (Array.isArray(a[0]) ? a[0].length : 0),
    /* JSON 与随机数 */
    'json.str': (a) => jsonValue(a[0] === undefined ? null : a[0]),
    'obj.get': (a) => {
      const o = a[0]; const k = a[1];
      if (o === null || o === undefined) return null;
      if (typeof o !== 'object') return null;
      const v = o[k];
      return v === undefined ? null : v;
    },
    'obj.has': (a) => {
      const o = a[0]; const k = a[1];
      if (o === null || o === undefined || typeof o !== 'object') return false;
      return Object.prototype.hasOwnProperty.call(o, k);
    },
    'obj.keys': (a) => {
      const o = a[0];
      if (o === null || o === undefined || typeof o !== 'object') return [];
      return Object.keys(o);
    },
    'json.parse': (a) => { try { return JSON.parse(strOf(a[0])); } catch (e) { throw new RuntimeError('JSON 解析失败: ' + e.message); } },
    'rng.seed': (a, ctx) => { ctx.rngState = (Math.floor(numOf(a[0])) >>> 0) || 1; return ctx.rngState; },
    'rng.next': (a, ctx) => { ctx.rngState = (ctx.rngState * 1664525 + 1013904223) >>> 0; return ctx.rngState / 4294967296; },
    'rng.range': (a, ctx) => { ctx.rngState = (ctx.rngState * 1664525 + 1013904223) >>> 0; const lo = numOf(a[0]); const hi = numOf(a[1]); return lo + (ctx.rngState / 4294967296) * (hi - lo); },
  };
  NSL.BUILTINS = BUILTINS;

  function binaryOp(op, a, b) {
    switch (op) {
      case OP.ADD:
        if (typeof a === 'string' || typeof b === 'string') return strOf(a) + strOf(b);
        return numOf(a) + numOf(b);
      case OP.SUB: return numOf(a) - numOf(b);
      case OP.MUL: return numOf(a) * numOf(b);
      case OP.DIV: {
        const d = numOf(b);
        if (d === 0) throw new RuntimeError('除数为零');
        return numOf(a) / d;
      }
      case OP.MOD: {
        const d = numOf(b);
        if (d === 0) throw new RuntimeError('除数为零');
        return numOf(a) % d;
      }
      case OP.EQ: return looseEq(a, b);
      case OP.NE: return !looseEq(a, b);
      case OP.LT: return compare(a, b) < 0;
      case OP.LE: return compare(a, b) <= 0;
      case OP.GT: return compare(a, b) > 0;
      case OP.GE: return compare(a, b) >= 0;
    }
    throw new RuntimeError('未知运算 ' + op);
  }
  function looseEq(a, b) {
    const an = a === null || a === undefined;
    const bn = b === null || b === undefined;
    if (an || bn) return an && bn;
    if (typeof a === 'string' || typeof b === 'string') return strOf(a) === strOf(b);
    if (typeof a === 'boolean' || typeof b === 'boolean') return truthy(a) === truthy(b);
    return numOf(a) === numOf(b);
  }
  function compare(a, b) {
    if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : (a > b ? 1 : 0);
    return numOf(a) - numOf(b);
  }

  /*
   * 执行一段字节码。
   * ctx: { globals, budget, log, now, svc, syscall, rngState }
   */
  function execute(prog, ctx) {
    const consts = prog.consts;
    const names = prog.names;
    const funcs = prog.funcs;
    const globals = ctx.globals || (ctx.globals = {});
    const stack = [];
    const frames = [];
    const pushFrame = (fn) => {
      const locals = new Array(fn.nlocals);
      for (let i = 0; i < locals.length; i++) locals[i] = null;
      frames.push({ fn, pc: 0, locals, base: stack.length });
    };
    const main = { name: 'main', code: prog.main.code, nlocals: prog.main.nlocals, params: 0 };
    if (ctx.callFunc !== undefined && ctx.callFunc !== null) {
      const fn = prog.funcs[ctx.callFunc];
      if (!fn) throw new RuntimeError('找不到要调用的函数（索引 ' + ctx.callFunc + '）');
      const locals = new Array(fn.nlocals);
      for (let i = 0; i < locals.length; i++) locals[i] = null;
      const args = ctx.callArgs || [];
      for (let i = 0; i < args.length; i++) locals[i] = args[i];
      frames.push({ fn, pc: 0, locals, base: 0 });
    } else {
      pushFrame(main);
    }
    let consumed = 0;
    const budget = ctx.budget === undefined ? Infinity : ctx.budget;
    try {
      for (;;) {
        if (consumed >= budget) return { status: 'budget', consumed, globals, frames, stack };
        const frame = frames[frames.length - 1];
        if (!frame) return { status: 'done', consumed, globals, value: stack.pop(), frames, stack };
        const instr = frame.fn.code[frame.pc++];
        consumed++;
        if (ctx.trace) {
          let top = '';
          try {
            if (instr[0] === 6) top = 'L' + instr[1] + '=' + JSON.stringify(frame.locals[instr[1]]);
            else if (instr[0] === 7) top = 'L' + instr[1] + '<=';
            else top = JSON.stringify(stack);
            if (top && top.length > 90) top = top.slice(0, 90);
          } catch (e) { top = '?'; }
          ctx.trace.push((frame.fn.name || 'f') + '#' + (frame.pc - 1) + '/s' + stack.length + '/f' + frames.length + ':' + top);
        }
        if (!instr) return { status: 'done', consumed, globals, value: null, frames, stack };
        if (ctx.yielded) { ctx.yielded = false; return { status: 'yield', consumed, globals, frames, stack }; }
        switch (instr[0]) {
          case OP.CONST: stack.push(consts[instr[1]]); break;
          case OP.NIL: stack.push(null); break;
          case OP.POP: stack.pop(); break;
          case OP.DUP: { const v = stack[stack.length - 1]; stack.push(v); break; }
          case OP.DUP2: { const n = stack.length; stack.push(stack[n - 2], stack[n - 1]); break; }
          case OP.GETG: { const k = names[instr[1]]; stack.push(globals[k] === undefined ? null : globals[k]); break; }
          case OP.SETG: { const k = names[instr[1]]; globals[k] = stack.pop(); break; }
          case OP.GETL: stack.push(frame.locals[instr[1]]); break;
          case OP.SETL: frame.locals[instr[1]] = stack.pop(); break;
          case OP.NEWOBJ: { const keys = instr[1]; const n = instr[2]; const o = {}; for (let i = n - 1; i >= 0; i--) o[consts[keys[i]]] = stack.pop(); stack.push(o); break; }
          case OP.NEWARR: { const n = instr[1]; const a = new Array(n); for (let i = n - 1; i >= 0; i--) a[i] = stack.pop(); stack.push(a); break; }
          case OP.AGET: { const idx = stack.pop(); const obj = stack.pop(); const i = Math.floor(numOf(idx));
            if (!Array.isArray(obj) || i < 0 || i >= obj.length) { stack.push(null); break; }
            stack.push(obj[i]); break; }
          case OP.ASET: { const n = stack.length; const v = stack[n - 1]; const idx = stack[n - 2]; const obj = stack[n - 3]; const i = Math.floor(numOf(idx));
            if (!Array.isArray(obj)) throw new RuntimeError('ASET 目标不是数组（' + (obj === null ? 'null' : typeof obj) + '）');
            if (i < 0 || i >= obj.length) throw new RuntimeError('数组下标越界: ' + i);
            obj[i] = v; stack.length = n - 2; break; }
          case OP.ADD: case OP.SUB: case OP.MUL: case OP.DIV: case OP.MOD:
          case OP.EQ: case OP.NE: case OP.LT: case OP.LE: case OP.GT: case OP.GE: {
            const b = stack.pop(); const a = stack.pop(); stack.push(binaryOp(instr[0], a, b)); break;
          }
          case OP.NEG: stack.push(-numOf(stack.pop())); break;
          case OP.NOT: stack.push(!truthy(stack.pop())); break;
          case OP.AND: case OP.OR: {
            const b = stack.pop(); const a = stack.pop();
            stack.push(instr[0] === OP.AND ? (truthy(a) ? b : a) : (truthy(a) ? a : b)); break;
          }
          case OP.JMP: frame.pc = instr[1]; break;
          case OP.JF: { const c = stack.pop(); if (!truthy(c)) frame.pc = instr[1]; break; }
          case OP.JT: { const c = stack.pop(); if (truthy(c)) frame.pc = instr[1]; break; }
          case OP.CALL: {
            const argc = instr[2];
            const args = stack.splice(stack.length - argc, argc);
            const fn = funcs[instr[1]];
            if (!fn) throw new RuntimeError('找不到函数 ' + instr[1]);
            const locals = new Array(fn.nlocals);
            for (let i = 0; i < locals.length; i++) locals[i] = null;
            for (let i = 0; i < argc; i++) locals[i] = args[i];
            frames.push({ fn, pc: 0, locals, base: stack.length });
            break;
          }
          case OP.BUILTIN: {
            const name = names[instr[1]];
            const fn = BUILTINS[name];
            const argc = instr[2];
            const args = stack.splice(stack.length - argc, argc);
            if (!fn) throw new RuntimeError('未知函数 ' + name);
            const res = fn(args, ctx);
            if (res && typeof res === 'object' && (res.__nslWait !== undefined || res.__nslPark !== undefined)) {
              /* 挂起/等待：按原顺序还原参数并退回本条指令，续行时重新执行它 */
              for (let i = 0; i < args.length; i++) stack.push(args[i]);
              frame.pc--;
              if (res.__nslPark !== undefined) return { status: 'parked', consumed, globals, frames, stack };
              return { status: 'wait', consumed, globals, frames, stack, tag: res.__nslWait };
            }
            stack.push(res);
            break;
          }
          case OP.RET: {
            const v = stack.pop();
            const f = frames.pop();
            if (!f) { return { status: 'done', consumed, globals, value: v, frames, stack }; }
            stack.length = f.base;
            stack.push(v);
            break;
          }
          case OP.HALT: return { status: 'done', consumed, globals, value: stack.pop(), frames, stack };
          default: throw new RuntimeError('非法指令 ' + instr[0]);
        }
      }
    } catch (e) {
      if (e && e.name === 'ParkSignal') return { status: 'parked', consumed, globals, frames, stack };
      if (e && e.name === 'WaitSignal') return { status: 'wait', consumed, globals, frames, stack, tag: e.tag };
      const fr = frames[frames.length - 1];
      const where = fr ? (' @' + fr.fn.name + '#' + fr.pc) : '';
      return { status: 'error', consumed, globals, error: (e && e.message ? e.message : String(e)) + where, frames, stack };
    }
  }

  /* 续行：把暂停的执行现场恢复后继续跑 */
  function resume(prog, saved, ctx, budget) {
    const consts = prog.consts;
    const names = prog.names;
    const funcs = prog.funcs;
    const globals = saved.globals;
    const stack = saved.stack;
    const frames = saved.frames;
    let consumed = 0;
    const limit = budget === undefined ? Infinity : budget;
    try {
      for (;;) {
        if (consumed >= limit) return { status: 'budget', consumed, globals, frames, stack };
        const frame = frames[frames.length - 1];
        if (!frame) return { status: 'done', consumed, globals, value: stack.pop(), frames, stack };
        const instr = frame.fn.code[frame.pc++];
        consumed++;
        if (ctx.trace) {
          let top = '';
          try {
            if (instr[0] === 6) top = 'L' + instr[1] + '=' + JSON.stringify(frame.locals[instr[1]]);
            else if (instr[0] === 7) top = 'L' + instr[1] + '<=';
            else top = JSON.stringify(stack);
            if (top && top.length > 90) top = top.slice(0, 90);
          } catch (e) { top = '?'; }
          ctx.trace.push((frame.fn.name || 'f') + '#' + (frame.pc - 1) + '/s' + stack.length + '/f' + frames.length + ':' + top);
        }
        if (!instr) return { status: 'done', consumed, globals, value: null, frames, stack };
        if (ctx.yielded) { ctx.yielded = false; return { status: 'yield', consumed, globals, frames, stack }; }
        switch (instr[0]) {
          case OP.CONST: stack.push(consts[instr[1]]); break;
          case OP.NIL: stack.push(null); break;
          case OP.POP: stack.pop(); break;
          case OP.DUP: { const v = stack[stack.length - 1]; stack.push(v); break; }
          case OP.DUP2: { const n = stack.length; stack.push(stack[n - 2], stack[n - 1]); break; }
          case OP.GETG: { const k = names[instr[1]]; stack.push(globals[k] === undefined ? null : globals[k]); break; }
          case OP.SETG: { const k = names[instr[1]]; globals[k] = stack.pop(); break; }
          case OP.GETL: stack.push(frame.locals[instr[1]]); break;
          case OP.SETL: frame.locals[instr[1]] = stack.pop(); break;
          case OP.NEWOBJ: { const keys = instr[1]; const n = instr[2]; const o = {}; for (let i = n - 1; i >= 0; i--) o[consts[keys[i]]] = stack.pop(); stack.push(o); break; }
          case OP.NEWARR: { const n = instr[1]; const a = new Array(n); for (let i = n - 1; i >= 0; i--) a[i] = stack.pop(); stack.push(a); break; }
          case OP.AGET: { const idx = stack.pop(); const obj = stack.pop(); const i = Math.floor(numOf(idx));
            if (!Array.isArray(obj) || i < 0 || i >= obj.length) { stack.push(null); break; }
            stack.push(obj[i]); break; }
          case OP.ASET: { const n = stack.length; const v = stack[n - 1]; const idx = stack[n - 2]; const obj = stack[n - 3]; const i = Math.floor(numOf(idx));
            if (!Array.isArray(obj)) throw new RuntimeError('ASET 目标不是数组（' + (obj === null ? 'null' : typeof obj) + '）');
            if (i < 0 || i >= obj.length) throw new RuntimeError('数组下标越界: ' + i);
            obj[i] = v; stack.length = n - 2; break; }
          case OP.ADD: case OP.SUB: case OP.MUL: case OP.DIV: case OP.MOD:
          case OP.EQ: case OP.NE: case OP.LT: case OP.LE: case OP.GT: case OP.GE: {
            const b = stack.pop(); const a = stack.pop(); stack.push(binaryOp(instr[0], a, b)); break;
          }
          case OP.NEG: stack.push(-numOf(stack.pop())); break;
          case OP.NOT: stack.push(!truthy(stack.pop())); break;
          case OP.AND: case OP.OR: {
            const b = stack.pop(); const a = stack.pop();
            stack.push(instr[0] === OP.AND ? (truthy(a) ? b : a) : (truthy(a) ? a : b)); break;
          }
          case OP.JMP: frame.pc = instr[1]; break;
          case OP.JF: { const c = stack.pop(); if (!truthy(c)) frame.pc = instr[1]; break; }
          case OP.JT: { const c = stack.pop(); if (truthy(c)) frame.pc = instr[1]; break; }
          case OP.CALL: {
            const argc = instr[2]; const args = stack.splice(stack.length - argc, argc);
            const fn = funcs[instr[1]];
            if (!fn) throw new RuntimeError('找不到函数 ' + instr[1]);
            const locals = new Array(fn.nlocals);
            for (let i = 0; i < locals.length; i++) locals[i] = null;
            for (let i = 0; i < argc; i++) locals[i] = args[i];
            frames.push({ fn, pc: 0, locals, base: stack.length });
            break;
          }
          case OP.BUILTIN: {
            const name = names[instr[1]]; const fn = BUILTINS[name]; const argc = instr[2];
            const args = stack.splice(stack.length - argc, argc);
            if (!fn) throw new RuntimeError('未知函数 ' + name);
            const res = fn(args, ctx);
            if (res && typeof res === 'object' && (res.__nslWait !== undefined || res.__nslPark !== undefined)) {
              for (let i = 0; i < args.length; i++) stack.push(args[i]);
              frame.pc--;
              if (res.__nslPark !== undefined) return { status: 'parked', consumed, globals, frames, stack };
              return { status: 'wait', consumed, globals, frames, stack, tag: res.__nslWait };
            }
            stack.push(res);
            break;
          }
          case OP.RET: {
            const v = stack.pop(); const f = frames.pop();
            if (!f) return { status: 'done', consumed, globals, value: v, frames, stack };
            stack.length = f.base; stack.push(v); break;
          }
          case OP.HALT: return { status: 'done', consumed, globals, value: stack.pop(), frames, stack };
          default: throw new RuntimeError('非法指令 ' + instr[0]);
        }
      }
    } catch (e) {
      if (e && e.name === 'ParkSignal') return { status: 'parked', consumed, globals, frames, stack };
      if (e && e.name === 'WaitSignal') return { status: 'wait', consumed, globals, frames, stack, tag: e.tag };
      const fr = frames[frames.length - 1];
      const where = fr ? (' @' + fr.fn.name + '#' + fr.pc) : '';
      return { status: 'error', consumed, globals, error: (e && e.message ? e.message : String(e)) + where, frames, stack };
    }
  }

  /* JSON 序列化：数组若是 [[键,值],...] 的形式则输出为对象 */
  function jsonValue(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'string') return JSON.stringify(v);
    if (Array.isArray(v)) {
      if (v.length > 0 && v.every((x) => Array.isArray(x) && x.length === 2 && typeof x[0] === 'string')) {
        return '{' + v.map((x) => JSON.stringify(x[0]) + ':' + jsonValue(x[1])).join(',') + '}';
      }
      return '[' + v.map(jsonValue).join(',') + ']';
    }
    if (typeof v === 'object') {
      return '{' + Object.keys(v).map((k) => JSON.stringify(k) + ':' + jsonValue(v[k])).join(',') + '}';
    }
    return 'null';
  }

  NSL.jsonValue = jsonValue;
  NSL.execute = execute;
  NSL.resume = resume;
  NSL.callFunction = function (prog, name, args, ctx) {
    const g = ctx.globals || (ctx.globals = {});
    const base = Object.assign({}, ctx, { globals: g, callFunc: null, callArgs: null });
    const r1 = execute(prog, base);
    if (r1.status === 'error') return r1;
    const idx = NSL.funcIndexOf(prog, name);
    if (idx < 0) return { status: 'error', error: '找不到函数 ' + name, consumed: r1.consumed };
    const r2 = execute(prog, Object.assign({}, ctx, { globals: g, callFunc: idx, callArgs: args || [] }));
    r2.consumed = (r1.consumed || 0) + (r2.consumed || 0);
    return r2;
  };
  NSL.funcIndexOf = function (prog, name) {
    const names = prog.funcNames || (prog.funcs || []).map((f) => f.name);
    const i = names.indexOf(name);
    return i < 0 ? -1 : i;
  };
  NSL.deepCopy = deepCopy;
  NSL.strOf = strOf;
  NSL.numOf = numOf;
  NSL.truthy = truthy;
  NSL.RuntimeError = RuntimeError;

  /* 便捷：从源码创建进程对象 */
  NSL.createProcess = function (prog, opts) {
    opts = opts || {};
    return {
      prog,
      globals: opts.globals || {},
      frames: null,
      stack: null,
      status: 'ready',
      consumed: 0,
      error: null,
      pending: false,
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
