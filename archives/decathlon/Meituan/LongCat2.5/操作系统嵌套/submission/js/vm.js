'use strict';
// ============ NIL 语言：编译器 + 栈式虚拟机 ============
(function (NS) {
  const KW = { var:1, func:1, if:1, else:1, while:1, for:1, break:1, continue:1, return:1, true:1, false:1, null:1, try:1, catch:1, throw:1 };

  const OP = {
    CONST:0, LOAD:1, STORE:2, ADD:3, SUB:4, MUL:5, DIV:6, MOD:7, POW:8,
    NEG:9, NOT:10, EQ:11, NE:12, LT:13, LE:14, GT:15, GE:16,
    JMP:17, JMPF:18, JMPT:19, CALL:20, RET:21, SYSCALL:22, POP:23,
    BUILDARR:24, BUILDMAP:25, IDX:26, SETIDX:27, MEMBER:28, SETMEMBER:29,
    YIELD:30, THROW:31, TRYBEGIN:32, TRYEND:33, HALT:34, DUP:35,
    GLOAD:36, GSTORE:37
  };

  // ---------------- 词法分析 ----------------
  function tokenize(src) {
    const toks = []; let i = 0, line = 1;
    const isDig = c => c >= '0' && c <= '9';
    const isId0 = c => /[A-Za-z_]/.test(c);
    const isId = c => /[A-Za-z0-9_]/.test(c);
    while (i < src.length) {
      const c = src[i];
      if (c === '\n') { line++; i++; continue; }
      if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
      if (c === '#') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i+1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (isDig(c) || (c === '.' && isDig(src[i+1]))) {
        let j = i, dot = false;
        while (j < src.length && (isDig(src[j]) || (src[j] === '.' && !dot))) { if (src[j] === '.') dot = true; j++; }
        toks.push({ t:'num', v: parseFloat(src.slice(i,j)), line }); i = j; continue;
      }
      if (c === '"' || c === "'") {
        const q = c; let j = i + 1, s = '';
        while (j < src.length && src[j] !== q) {
          if (src[j] === '\\') {
            const n = src[j+1];
            s += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n === '\\' ? '\\' : n === '"' ? '"' : n === "'" ? "'" : n;
            j += 2;
          } else { if (src[j] === '\n') line++; s += src[j]; j++; }
        }
        if (j >= src.length) throw err('字符串未闭合', line);
        toks.push({ t:'str', v:s, line }); i = j + 1; continue;
      }
      if (isId0(c)) {
        let j = i; while (j < src.length && isId(src[j])) j++;
        const w = src.slice(i, j);
        toks.push({ t: KW[w] ? 'kw':'id', v:w, line }); i = j; continue;
      }
      const two = src.substr(i, 2);
      if (['==','!=','<=','>=','&&','||'].includes(two)) { toks.push({t:'op',v:two,line}); i+=2; continue; }
      if ('+-*/%^()[]{},;:=<>!.'.includes(c)) { toks.push({t:'op',v:c,line}); i++; continue; }
      throw err('无法识别的字符 "' + c + '"', line);
    }
    toks.push({ t:'eof', v:'', line });
    return toks;
  }
  function err(msg, line) { const e = new Error((line ? ('第' + line + '行: ') : '编译错误: ') + msg); e.nilLine = line || 0; return e; }

  // ---------------- 语法分析 ----------------
  function parse(toks) {
    let p = 0;
    const peek = () => toks[p];
    const next = () => toks[p++];
    const expectOp = (v) => { const t = next(); if (t.t !== 'op' || t.v !== v) throw err('期望 "' + v + '"，遇到 "' + (t.v || '文件末尾') + '"', t.line); };
    const expectId = () => { const t = next(); if (t.t !== 'id') throw err('期望标识符，遇到 "' + (t.v||'文件末尾') + '"', t.line); return t.v; };
    const isOp = (v) => peek().t === 'op' && peek().v === v;

    function parseProgram() {
      const funcs = [], stats = [];
      while (peek().t !== 'eof') {
        if (peek().t === 'kw' && peek().v === 'func') funcs.push(parseFunc());
        else stats.push(parseStatement());
      }
      return { funcs, main: stats };
    }
    function parseFunc() {
      next();
      const name = expectId();
      expectOp('(');
      const params = [];
      if (!isOp(')')) { do { params.push(expectId()); } while (isOp(',') && (next(), true)); }
      expectOp(')');
      const body = parseBlock();
      return { name, params, body };
    }
    function parseBlock() {
      expectOp('{');
      const stats = [];
      while (!isOp('}')) {
        if (peek().t === 'eof') throw err('缺少 "}"', peek().line);
        stats.push(parseStatement());
      }
      expectOp('}');
      return stats;
    }
    function parseStatement() {
      const t = peek();
      if (t.t === 'kw') {
        if (t.v === 'var') {
          next(); const name = expectId();
          let init = null;
          if (isOp('=')) { next(); init = parseExpr(); }
          return { t:'var', name, init, line:t.line };
        }
        if (t.v === 'if') {
          next(); const cond = parseExpr(); const then = parseBlock();
          let els = null;
          if (peek().t === 'kw' && peek().v === 'else') { next(); els = (peek().t==='kw'&&peek().v==='if') ? [parseStatement()] : parseBlock(); }
          return { t:'if', cond, then, else: els };
        }
        if (t.v === 'while') { next(); const cond = parseExpr(); const body = parseBlock(); return { t:'while', cond, body }; }
        if (t.v === 'for') {
          next();
          const hasParen = isOp('(');
          if (hasParen) next();
          const init = parseSimpleStmt(); expectOp(';');
          const cond = isOp(';') ? null : parseExpr(); expectOp(';');
          let post = null;
          if (hasParen && !isOp(')')) {
            if (peek().t === 'id' && toks[p+1] && toks[p+1].t === 'op' && toks[p+1].v === '=') post = parseSimpleStmt();
            else post = parseExpr();
          }
          if (hasParen) expectOp(')');
          const body = parseBlock();
          return { t:'for', init, cond, post, body };
        }
        if (t.v === 'break') { next(); return { t:'break' }; }
        if (t.v === 'continue') { next(); return { t:'continue' }; }
        if (t.v === 'return') { next(); const e = (isOp('}') || peek().t==='eof') ? null : parseExpr(); return { t:'return', e }; }
        if (t.v === 'throw') { next(); return { t:'throw', e: parseExpr() }; }
        if (t.v === 'try') { next(); const body = parseBlock();
          if (!(peek().t==='kw'&&peek().v==='catch')) throw err('try 后需要 catch', peek().line);
          next(); const cn = expectId(); const cb = parseBlock();
          return { t:'try', body, catchName: cn, catchBody: cb }; }
      }
      return parseSimpleStmt();
    }
    function parseSimpleStmt() {
      const t = peek();
      if (t.t === 'kw' && t.v === 'var') {
        next(); const name = expectId();
        let init = null;
        if (isOp('=')) { next(); init = parseExpr(); }
        return { t:'var', name, init, line:t.line };
      }
      if (t.t === 'id') {
        // 命令式系统调用：print x、send pid "msg"（参数到行尾）
        const nt = toks[p + 1];
        if (nt && nt.t !== 'eof' && nt.line === t.line && NS.VM.commandNames[t.v] &&
            !(nt.t === 'op' && ['(','=', '[','.',';'].includes(nt.v))) {
          next();
          const args = [];
          while (peek().t !== 'eof' && peek().line === t.line && !isOp(';')) {
            if (peek().t === 'kw' && ['var','while','for','if','else','return','break','continue','func','try','throw','catch'].includes(peek().v)) break;
            args.push(parseExpr());
          }
          return { t:'expr', e:{ t:'call', name:t.v, args, line:t.line, cmd:true } };
        }
        const j = p + 1;
        if (toks[j] && toks[j].t === 'op' && toks[j].v === '=') {
          next(); next(); const value = parseExpr();
          return { t:'assign', target:{ t:'id', name:t.v }, value, line:t.line };
        }
        if (toks[j] && toks[j].t === 'op' && toks[j].v === '[') {
          let k = j + 1, depth = 1;
          while (k < toks.length && depth > 0) { const tk = toks[k]; if (tk.t==='op'&&tk.v==='[')depth++; else if (tk.t==='op'&&tk.v===']')depth--; k++; }
          if (toks[k] && toks[k].t === 'op' && toks[k].v === '=') {
            next(); next(); const idx = parseExpr(); expectOp(']'); next();
            const value = parseExpr();
            return { t:'assign', target:{ t:'idx', obj:{t:'id',name:t.v}, idx }, value, line:t.line };
          }
        }
        if (toks[j] && toks[j].t === 'op' && toks[j].v === '.') {
          const k = j + 1;
          if (toks[k] && toks[k].t === 'id') {
            if (toks[k+1] && toks[k+1].t === 'op' && toks[k+1].v === '=') {
              next(); next(); const key = expectId(); next();
              const value = parseExpr();
              return { t:'assign', target:{ t:'mem', obj:{t:'id',name:t.v}, key }, value, line:t.line };
            }
          }
        }
      }
      const e = parseExpr();
      return { t:'expr', e, line:t.line };
    }
    function parseExpr() { return parseOr(); }
    function parseOr() { let l = parseAnd(); while (isOp('||')) { next(); const r = parseAnd(); l = { t:'bin', op:'||', l, r }; } return l; }
    function parseAnd() { let l = parseEq(); while (isOp('&&')) { next(); const r = parseEq(); l = { t:'bin', op:'&&', l, r }; } return l; }
    function parseEq() { let l = parseCmp(); while (isOp('==') || isOp('!=')) { const op = next().v; const r = parseCmp(); l = { t:'bin', op, l, r }; } return l; }
    function parseCmp() { let l = parseAdd(); while (isOp('<')||isOp('<=')||isOp('>')||isOp('>=')) { const op = next().v; const r = parseAdd(); l = { t:'bin', op, l, r }; } return l; }
    function parseAdd() { let l = parseMul(); while (isOp('+')||isOp('-')) { const op = next().v; const r = parseMul(); l = { t:'bin', op, l, r }; } return l; }
    function parseMul() { let l = parsePow(); while (isOp('*')||isOp('/')||isOp('%')) { const op = next().v; const r = parsePow(); l = { t:'bin', op, l, r }; } return l; }
    function parsePow() { const l = parseUnary(); if (isOp('^')) { next(); const r = parsePow(); return { t:'bin', op:'^', l, r }; } return l; }
    function parseUnary() {
      if (isOp('-')) { next(); return { t:'un', op:'-', e: parseUnary() }; }
      if (isOp('!')) { next(); return { t:'un', op:'!', e: parseUnary() }; }
      return parsePostfix();
    }
    function parsePostfix() {
      let e = parsePrimary();
      while (true) {
        if (isOp('[')) { next(); const idx = parseExpr(); expectOp(']'); e = { t:'idx', obj:e, idx }; }
        else if (isOp('.')) { next(); const key = expectId(); e = { t:'mem', obj:e, key }; }
        else break;
      }
      return e;
    }
    function parsePrimary() {
      const t = next();
      if (t.t === 'num') return { t:'num', v:t.v, line:t.line };
      if (t.t === 'str') return { t:'str', v:t.v, line:t.line };
      if (t.t === 'kw' && (t.v === 'true' || t.v === 'false')) return { t:'bool', v:t.v==='true', line:t.line };
      if (t.t === 'kw' && t.v === 'null') return { t:'null', line:t.line };
      if (t.t === 'id') {
        if (isOp('(')) { next(); const args = []; if (!isOp(')')) { do { args.push(parseExpr()); } while (isOp(',') && (next(), true)); } expectOp(')'); return { t:'call', name:t.v, args, line:t.line }; }
        return { t:'id', name:t.v, line:t.line };
      }
      if (t.t === 'op' && t.v === '(') { const e = parseExpr(); expectOp(')'); return e; }
      if (t.t === 'op' && t.v === '[') {
        const items = [];
        if (!isOp(']')) { do { items.push(parseExpr()); } while (isOp(',') && (next(), true)); }
        expectOp(']');
        return { t:'arr', items };
      }
      if (t.t === 'op' && t.v === '{') {
        const entries = [];
        if (!isOp('}')) {
          do { const k = parseExpr(); expectOp(':'); const v = parseExpr(); entries.push({ k, v }); } while (isOp(',') && (next(), true));
        }
        expectOp('}');
        return { t:'map', entries };
      }
      throw err('意外的符号 "' + (t.v || '文件末尾') + '"', t.line);
    }
    return parseProgram();
  }

  // ---------------- 代码生成 ----------------
  function compile(src) {
    const ast = parse(tokenize(src));
    const consts = []; const constMap = new Map();
    const code = [];
    const funcs = {}; const funcList = [];
    let curLine = 0;
    function addConst(v) {
      const key = typeof v + ':' + v;
      if (constMap.has(key)) return constMap.get(key);
      const idx = consts.length; consts.push(v); constMap.set(key, idx); return idx;
    }
    function emit(op, ...args) { code.push(op, ...args); return code.length - args.length - 1; }
    function here() { return code.length; }
    function patch(at) { code[at + 1] = code.length - at - 2; }

    let scopes = [{ map: new Map(), start: 0 }];
    let slotCount = 0;
    let curFunc = -1;
    let globalSlots = new Map();
    let globalCount = 0;
    function declGlobal(name) {
      if (!globalSlots.has(name)) { globalSlots.set(name, globalCount++); }
      return globalSlots.get(name);
    }
    function declVar(name) {
      const s = scopes[scopes.length - 1];
      if (s.map.has(name)) throw err('变量重复声明: ' + name, curLine);
      const slot = slotCount++;
      s.map.set(name, slot);
      return slot;
    }
    function lookup(name) {
      for (let i = scopes.length - 1; i >= 0; i--) if (scopes[i].map.has(name)) return scopes[i].map.get(name);
      return -1;
    }
    function pushScope() { scopes.push({ map: new Map(), start: slotCount }); }
    function popScope() { const s = scopes.pop(); slotCount = s.start; }

    ast.funcs.forEach((f) => {
      if (funcs[f.name]) throw err('函数重复定义: ' + f.name, curLine);
      funcs[f.name] = { idx: funcList.length, addr: 0, nparams: f.params.length, nlocals: f.params.length };
      funcList.push(f);
    });

    function genExpr(e) {
      switch (e.t) {
        case 'num': case 'str': emit(OP.CONST, addConst(e.v)); return;
        case 'bool': emit(OP.CONST, addConst(e.v)); return;
        case 'null': emit(OP.CONST, addConst(null)); return;
        case 'id': {
          const s = lookup(e.name);
          if (s >= 0) emit(OP.LOAD, s);
          else if (globalSlots.has(e.name)) emit(OP.GLOAD, globalSlots.get(e.name));
          else throw err('未声明的变量: ' + e.name, e.line || curLine);
          return;
        }
        case 'un': genExpr(e.e); emit(e.op === '-' ? OP.NEG : OP.NOT); return;
        case 'bin': {
          if (e.op === '&&') {
            genExpr(e.l); emit(OP.DUP); const jf = emit(OP.JMPF, 0); emit(OP.POP);
            genExpr(e.r); const je = emit(OP.JMP, 0); patch(jf); patch(je);
            return;
          }
          if (e.op === '||') {
            genExpr(e.l); emit(OP.DUP); const jt = emit(OP.JMPT, 0); emit(OP.POP);
            genExpr(e.r); const je = emit(OP.JMP, 0); patch(jt); patch(je);
            return;
          }
          genExpr(e.l); genExpr(e.r);
          const map = { '+':OP.ADD,'-':OP.SUB,'*':OP.MUL,'/':OP.DIV,'%':OP.MOD,'^':OP.POW,'==':OP.EQ,'!=':OP.NE,'<':OP.LT,'<=':OP.LE,'>':OP.GT,'>=':OP.GE };
          emit(map[e.op]); return;
        }
        case 'arr': e.items.forEach(genExpr); emit(OP.BUILDARR, e.items.length); return;
        case 'map':
          e.entries.forEach(en => { genExpr(en.k); genExpr(en.v); });
          emit(OP.BUILDMAP, e.entries.length); return;
        case 'idx': genExpr(e.obj); genExpr(e.idx); emit(OP.IDX); return;
        case 'mem': genExpr(e.obj); emit(OP.MEMBER, addConst(e.key)); return;
        case 'call': {
          const f = funcs[e.name];
          if (!f) {
            e.args.forEach(genExpr);
            emit(OP.SYSCALL, addConst(e.name), e.args.length);
            return;
          }
          if (f.nparams !== e.args.length) throw err('函数 ' + e.name + ' 需要 ' + f.nparams + ' 个参数，实际 ' + e.args.length, e.line || curLine);
          e.args.forEach(genExpr);
          emit(OP.CALL, f.idx, e.args.length);
          return;
        }
      }
      throw err('无法生成的表达式', curLine);
    }
    function genAssign(target, value) {
      if (target.t === 'id') {
        const s = lookup(target.name);
        if (s >= 0) { genExpr(value); emit(OP.STORE, s); }
        else if (globalSlots.has(target.name)) { genExpr(value); emit(OP.GSTORE, globalSlots.get(target.name)); }
        else throw err('未声明的变量: ' + target.name, curLine);
      } else if (target.t === 'idx') {
        genExpr(target.obj); genExpr(target.idx); genExpr(value); emit(OP.SETIDX);
      } else if (target.t === 'mem') {
        genExpr(target.obj); genExpr(value); emit(OP.SETMEMBER, addConst(target.key));
      }
    }
    const breakJumps = [], contJumps = [];
    function genStats(stats) {
      for (const st of stats) {
        if (st.line) curLine = st.line;
        switch (st.t) {
          case 'var': {
            if (curFunc === -1) {
              const gs = declGlobal(st.name);
              if (st.init) { genExpr(st.init); emit(OP.GSTORE, gs); }
              else { emit(OP.CONST, addConst(null)); emit(OP.GSTORE, gs); }
            } else {
              const slot = declVar(st.name);
              if (st.init) { genExpr(st.init); emit(OP.STORE, slot); }
              else { emit(OP.CONST, addConst(null)); emit(OP.STORE, slot); }
            }
            break;
          }
          case 'assign': genAssign(st.target, st.value); break;
          case 'expr': genExpr(st.e); emit(OP.POP); break;
          case 'if': {
            genExpr(st.cond); const jf = emit(OP.JMPF, 0);
            pushScope(); genStats(st.then); popScope();
            if (st.else) { const je = emit(OP.JMP, 0); patch(jf); pushScope(); genStats(st.else); popScope(); patch(je); }
            else patch(jf);
            break;
          }
          case 'while': {
            const start = here(); genExpr(st.cond); const jf = emit(OP.JMPF, 0);
            breakJumps.push([]); contJumps.push([]);
            pushScope(); genStats(st.body); popScope();
            emit(OP.JMP, start - here() - 2);
            patch(jf);
            breakJumps.pop().forEach(patch);
            contJumps.pop().forEach(a => { code[a+1] = start - a - 2; });
            break;
          }
          case 'for': {
            pushScope();
            if (st.init) genStats([st.init]);
            const start = here();
            let jf = -1;
            if (st.cond) { genExpr(st.cond); jf = emit(OP.JMPF, 0); }
            breakJumps.push([]); contJumps.push([]);
            genStats(st.body);
            const contTarget = here();
            if (st.post) genStats([st.post]);
            emit(OP.JMP, start - here() - 2);
            if (jf >= 0) patch(jf);
            breakJumps.pop().forEach(patch);
            contJumps.pop().forEach(a => { code[a+1] = contTarget - a - 2; });
            popScope();
            break;
          }
          case 'break': if (!breakJumps.length) throw err('break 不在循环内', curLine); breakJumps[breakJumps.length-1].push(emit(OP.JMP, 0)); break;
          case 'continue': if (!contJumps.length) throw err('continue 不在循环内', curLine); contJumps[contJumps.length-1].push(emit(OP.JMP, 0)); break;
          case 'return': if (st.e) genExpr(st.e); else emit(OP.CONST, addConst(null)); emit(OP.RET); break;
          case 'throw': genExpr(st.e); emit(OP.THROW); break;
          case 'try': {
            const tb = emit(OP.TRYBEGIN, 0);
            genStats(st.body);
            const je = emit(OP.JMP, 0);
            patch(tb);
            pushScope();
            const cs = declVar(st.catchName);
            emit(OP.STORE, cs);
            genStats(st.catchBody);
            popScope();
            patch(je);
            emit(OP.TRYEND);
            break;
          }
        }
      }
    }
    genStats(ast.main);
    emit(OP.HALT);
    funcs['__main__'] = { idx: funcList.length, addr: 0, nparams: 0, nlocals: 0 };
    funcList.forEach((f) => {
      funcs[f.name].addr = here();
      scopes = [{ map: new Map(), start: 0 }]; slotCount = 0; curLine = 0; curFunc = funcs[f.name].idx;
      f.params.forEach(p => declVar(p));
      pushScope();
      genStats(f.body);
      emit(OP.CONST, addConst(null)); emit(OP.RET);
      funcs[f.name].nlocals = slotCount;
      popScope();
      scopes = [{ map: new Map(), start: 0 }]; slotCount = 0; curFunc = -1;
    });
    funcs['__main__'].nlocals = slotCount;
    return { consts, code, funcs, mainNlocals: slotCount, nglobals: globalCount, src };
  }

  // ---------------- 值操作 ----------------
  function toNum(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v === null) return 0;
    if (typeof v === 'string') { const n = parseFloat(v); return isNaN(n) ? NaN : n; }
    return NaN;
  }
  function toStr(v) {
    if (v === null) return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') { if (Number.isInteger(v)) return String(v); return String(Math.round(v * 1e6) / 1e6); }
    if (typeof v === 'string') return v;
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }
  function truthy(v) { return !(v === null || v === false || v === 0 || v === '' || v === undefined); }
  function valEq(a, b) {
    if (a === null || b === null) return a === b;
    if (typeof a !== typeof b) {
      if ((typeof a === 'number' || typeof a === 'boolean') && (typeof b === 'number' || typeof b === 'boolean')) return toNum(a) === toNum(b);
      return false;
    }
    if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
    if (typeof a === 'object') return JSON.stringify(a) === JSON.stringify(b);
    return a === b;
  }
  class NilError extends Error {}

  function findFunc(prog, idx) {
    for (const k in prog.funcs) if (prog.funcs[k].idx === idx) return prog.funcs[k];
    return null;
  }

  // ---------------- 虚拟机 ----------------
  class VM {
    // ctx: {left, slice}；返回 'budget'|'slice'|'blocked'|'ended'|'error'
    exec(sys, proc, ctx) {
      const prog = proc.program;
      if (!prog) { proc.state = 'error'; proc.error = '程序未编译'; return 'error'; }
      if (proc.state === 'ended' || proc.state === 'error') return proc.state;
      if (proc.state === 'waiting') proc.state = 'ready';
      proc.state = 'running';
      const st = proc.vm;
      let pc = st.pc, sp = st.sp, frames = st.frames, stack = st.stack, handlers = st.handlers;
      let globals = st.globals;
      if (!globals || globals.length < (prog.nglobals || 0)) {
        const g = new Array(prog.nglobals || 0).fill(null);
        if (globals) for (let i = 0; i < globals.length; i++) g[i] = globals[i];
        globals = g;
      }
      if (!frames || !frames.length) {
        frames = [{ retPc: -1, funcIdx: prog.funcs['__main__'].idx, locals: new Array(prog.mainNlocals || 0).fill(null) }];
        stack = []; sp = 0; pc = 0; handlers = [];
      }
      const code = prog.code, consts = prog.consts;
      let reason = 'budget';
      try {
        if (proc._resumeHas) { stack[sp++] = proc._resumeVal; proc._resumeHas = false; proc._resumeVal = undefined; }
        else if (proc._rpcHas) {
          const err = proc._rpcError, val = proc._rpcResult;
          proc._rpcHas = false; proc._rpcResult = undefined; proc._rpcError = false;
          if (err) throw new NilError(toStr(val == null ? '系统调用失败' : val));
          stack[sp++] = val;
        }
        outer:
        while (ctx.left > 0 && ctx.slice > 0) {
          const op = code[pc++];
          ctx.slice--;
          if (sys.trace) sys.trace(proc, pc - 1, op, sp, stack, frames, ctx);
          switch (op) {
            case OP.CONST: ctx.left--; stack[sp++] = consts[code[pc++]]; break;
            case OP.LOAD: ctx.left--; stack[sp++] = frames[frames.length-1].locals[code[pc++]]; break;
            case OP.STORE: ctx.left--; frames[frames.length-1].locals[code[pc++]] = stack[--sp]; break;
            case OP.GLOAD: ctx.left--; stack[sp++] = globals[code[pc++]]; break;
            case OP.GSTORE: ctx.left--; globals[code[pc++]] = stack[--sp]; break;
            case OP.DUP: ctx.left--; stack[sp] = stack[sp-1]; sp++; break;
            case OP.ADD: { ctx.left--; const b = stack[--sp], a = stack[--sp];
              if (Array.isArray(a) && Array.isArray(b)) stack[sp++] = a.concat(b);
              else if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
                const o = {}; for (const k in a) o[k] = a[k]; for (const k in b) o[k] = b[k]; stack[sp++] = o;
              }
              else if (typeof a === 'string' || typeof b === 'string') stack[sp++] = toStr(a) + toStr(b);
              else { const n = toNum(a) + toNum(b); stack[sp++] = isNaN(n) ? NaN : n; } break; }
            case OP.SUB: { ctx.left--; const b = toNum(stack[--sp]), a = toNum(stack[--sp]); const n = a-b; stack[sp++] = isNaN(n)?NaN:n; } break;
            case OP.MUL: { ctx.left--; const b = toNum(stack[--sp]), a = toNum(stack[--sp]); const n = a*b; stack[sp++] = isNaN(n)?NaN:n; } break;
            case OP.DIV: { ctx.left--; const b = toNum(stack[--sp]), a = toNum(stack[--sp]); stack[sp++] = b===0 ? (a===0?NaN:(a>0?Infinity:-Infinity)) : a/b; } break;
            case OP.MOD: { ctx.left--; const b = toNum(stack[--sp]), a = toNum(stack[--sp]); stack[sp++] = b===0?NaN:a%b; } break;
            case OP.POW: { ctx.left--; const b = toNum(stack[--sp]), a = toNum(stack[--sp]); stack[sp++] = Math.pow(a,b); } break;
            case OP.NEG: { ctx.left--; const a = toNum(stack[--sp]); stack[sp++] = -a; } break;
            case OP.NOT: { ctx.left--; stack[sp++] = !truthy(stack[--sp]); } break;
            case OP.EQ: { ctx.left--; const b = stack[--sp], a = stack[--sp]; stack[sp++] = valEq(a,b); } break;
            case OP.NE: { ctx.left--; const b = stack[--sp], a = stack[--sp]; stack[sp++] = !valEq(a,b); } break;
            case OP.LT: case OP.LE: case OP.GT: case OP.GE: {
              ctx.left--; const b = stack[--sp], a = stack[--sp];
              let r;
              if (typeof a === 'string' && typeof b === 'string') r = op===OP.LT ? a<b : op===OP.LE ? a<=b : op===OP.GT ? a>b : a>=b;
              else { const x = toNum(a), y = toNum(b); r = op===OP.LT ? x<y : op===OP.LE ? x<=y : op===OP.GT ? x>y : x>=y; }
              stack[sp++] = r; break; }
            case OP.JMP: { ctx.left--; const _d = code[pc++]; pc += _d; } break;
            case OP.JMPF: { ctx.left--; const d = code[pc++]; if (!truthy(stack[--sp])) pc += d; } break;
            case OP.JMPT: { ctx.left--; const d = code[pc++]; if (truthy(stack[--sp])) pc += d; } break;
            case OP.POP: ctx.left--; sp--; break;
            case OP.BUILDARR: { ctx.left--; const n = code[pc++]; ctx.left -= n; const a = new Array(n); for (let i=n-1;i>=0;i--) a[i]=stack[--sp]; stack[sp++]=a; } break;
            case OP.BUILDMAP: { ctx.left--; const n = code[pc++]; ctx.left -= n*2; const o = {}; for (let i=0;i<n;i++) { const v = stack[--sp]; const k = toStr(stack[--sp]); o[k]=v; } stack[sp++]=o; } break;
            case OP.IDX: { ctx.left--; const idx = stack[--sp], obj = stack[--sp];
              if (Array.isArray(obj)) { const i = toNum(idx); if (!Number.isInteger(i)||i<0||i>=obj.length) throw new NilError('数组下标越界: '+toStr(idx)); stack[sp++]=obj[i]; }
              else if (obj && typeof obj === 'object') stack[sp++] = (obj[toStr(idx)]===undefined)?null:obj[toStr(idx)];
              else throw new NilError('不能对非容器值做下标访问'); break; }
            case OP.SETIDX: { ctx.left--; const v = stack[--sp], idx = stack[--sp], obj = stack[--sp];
              if (Array.isArray(obj)) { const i = toNum(idx); if (!Number.isInteger(i)||i<0) throw new NilError('数组下标无效: '+toStr(idx)); while (obj.length<=i) obj.push(null); obj[i]=v; }
              else if (obj && typeof obj === 'object') obj[toStr(idx)] = v;
              else throw new NilError('不能对非容器值做下标写入');
              stack[sp++]=v; break; }
            case OP.MEMBER: { ctx.left--; const obj = stack[--sp]; const k = consts[code[pc++]];
              if (obj && typeof obj === 'object') stack[sp++] = (obj[k]===undefined)?null:obj[k];
              else throw new NilError('不能读取非对象成员的属性'); break; }
            case OP.SETMEMBER: { ctx.left--; const v = stack[--sp], obj = stack[--sp]; const k = consts[code[pc++]];
              if (obj && typeof obj === 'object') { obj[k]=v; stack[sp++]=v; }
              else throw new NilError('不能写入非对象成员'); break; }
            case OP.CALL: { ctx.left -= 2; const fi = code[pc++], nargs = code[pc++];
              const fdef = findFunc(prog, fi);
              if (!fdef) throw new NilError('函数不存在');
              const nl = Math.max(fdef.nlocals || nargs, nargs);
              const locals = new Array(nl).fill(null);
              for (let i = nargs - 1; i >= 0; i--) locals[i] = stack[--sp];
              frames.push({ retPc: pc, funcIdx: fi, locals });
              pc = fdef.addr;
              break; }
            case OP.RET: { ctx.left--;
              const v = sp > 0 ? stack[--sp] : null;
              const fr = frames.pop();
              if (fr === undefined || frames.length === 0) { reason='ended'; break outer; }
              pc = fr.retPc;
              stack[sp++] = v;
              break; }
            case OP.SYSCALL: { ctx.left -= 3; const name = consts[code[pc++]]; const nargs = code[pc++];
              const args = new Array(nargs);
              for (let i=nargs-1;i>=0;i--) args[i] = stack[--sp];
              const r = sys.runtime.procSyscall(proc, name, args);
              if (r && r.block) {
                proc.waitInfo = r.block;
                proc.state = 'waiting';
                st.pc=pc; st.sp=sp; st.frames=frames; st.stack=stack; st.handlers=handlers; st.globals=globals;
                return 'blocked';
              }
              if (r && r.error) throw new NilError(r.error);
              ctx.left -= nargs;
              stack[sp++] = r ? r.value : null;
              break; }
            case OP.YIELD: ctx.left--; proc.yieldCount=(proc.yieldCount||0)+1; break;
            case OP.THROW: { ctx.left--; const v = stack[--sp];
              const h = handlers.pop();
              if (!h) { reason='error'; proc.error='未捕获的异常: '+toStr(v); break outer; }
              while (frames.length > h.frameDepth) frames.pop();
              sp = h.stackDepth;
              pc = h.addr;
              stack[sp++] = v;
              break; }
            case OP.TRYBEGIN: { ctx.left--; const d = code[pc++]; handlers.push({ addr: pc+d, frameDepth: frames.length, stackDepth: sp }); break; }
            case OP.TRYEND: ctx.left--; handlers.pop(); break;
            case OP.HALT: reason='ended'; break outer;
            default: throw new NilError('非法指令 ' + op);
          }
          if (ctx.left <= 0) { reason='budget'; break; }
          if (ctx.slice <= 0) { reason='slice'; break; }
        }
      } catch (e) {
        const msg = (e && e.message) ? e.message : String(e);
        if (handlers.length) {
          const h = handlers.pop();
          while (frames.length > h.frameDepth) frames.pop();
          sp = h.stackDepth;
          pc = h.addr;
          stack[sp++] = msg;
          st.pc=pc; st.sp=sp; st.frames=frames; st.stack=stack; st.handlers=handlers; st.globals=globals;
          return this.exec(sys, proc, ctx);
        }
        reason = 'error';
        proc.error = msg;
        proc.state = 'error';
        st.pc=pc; st.sp=sp; st.frames=frames; st.stack=stack; st.handlers=handlers; st.globals=globals;
        return 'error';
      }
      st.pc=pc; st.sp=sp; st.frames=frames; st.stack=stack; st.handlers=handlers; st.globals=globals;
      if (reason === 'ended') proc.state = 'ended';
      else if (proc.state !== 'error') proc.state = 'ready';
      return reason;
    }
  }

  const DEFAULT_COMMANDS = ['print','log','sleep','time','read','write','append','listdir','mkdir','delete','rename','exists','stat','copy','spawn','kill','send','recv','msg_poll','msg_deliver','msg_send_proc','proc_list','sched_run','suspend','resume_pid','ui_apply','wm_policy','scene_submit','scene_clear','sensor_read','actuator_write','notify','budget_info','compile','run_program','halt','yield','rand','abs','floor','ceil','round','sqrt','pow','sin','cos','tan','atan2','min','max','clamp','lerp','len','type','str','num','keys','push','pop','substr','find','split','join','replace','upper','lower','trim','json_enc','json_dec','range','state_save','state_load','toast','open_win','close_win','move_win','focus_win','win_list'];
  const commandNames = {};
  DEFAULT_COMMANDS.forEach(k => commandNames[k] = 1);
  VM.exec = (sys, proc, ctx) => new VM().exec(sys, proc, ctx);
  NS.VM = { compile, VM, OP, toStr, toNum, truthy, valEq, fmtVal: toStr, NilError, commandNames };
  NS.VM.exec = (sys, proc, ctx) => new VM().exec(sys, proc, ctx);
  if (typeof module !== 'undefined' && module.exports) module.exports = NS.VM;
})(window.NOS = window.NOS || {});