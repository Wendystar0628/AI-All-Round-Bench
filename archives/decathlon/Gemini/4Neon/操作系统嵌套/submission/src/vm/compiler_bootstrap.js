// Bootstrap Compiler for Nested OS Script (NOS) -> Bytecode
// Used ONLY to bootstrap /sys/compiler.nos into /sys/compiler.bc on initial cold boot;
// once bootstrapped, systems compile programs using their own /sys/compiler.bc (compiled from /sys/compiler.nos).

import { OP, BUILTIN_NAMES } from './opcodes.js';

const BUILTIN_SET = new Set(BUILTIN_NAMES);

const KEYWORDS = new Set([
  'let', 'fn', 'if', 'else', 'while', 'for', 'break', 'continue',
  'return', 'true', 'false', 'null', 'try', 'catch', 'throw', 'syscall',
]);

export function tokenize(src) {
  const tokens = [];
  let i = 0;
  let line = 1;
  const n = src.length;

  while (i < n) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++;
      continue;
    }
    if (ch === '\n') {
      line++;
      i++;
      continue;
    }
    if (ch === '/' && src[i + 1] === '/') {
      i += 2;
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') line++;
        i++;
      }
      i += 2;
      continue;
    }
    // String literal
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let val = '';
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\' && i + 1 < n) {
          const esc = src[i + 1];
          if (esc === 'n') val += '\n';
          else if (esc === 'r') val += '\r';
          else if (esc === 't') val += '\t';
          else if (esc === '\\') val += '\\';
          else if (esc === '"') val += '"';
          else if (esc === "'") val += "'";
          else val += esc;
          i += 2;
        } else {
          if (src[i] === '\n') line++;
          val += src[i++];
        }
      }
      if (i >= n) throw new Error(`第 ${line} 行：字符串未闭合`);
      i++;
      tokens.push({ t: 'STR', v: val, line });
      continue;
    }
    // Number literal
    if (ch >= '0' && ch <= '9') {
      let start = i;
      while (i < n && src[i] >= '0' && src[i] <= '9') i++;
      if (src[i] === '.' && src[i + 1] >= '0' && src[i + 1] <= '9') {
        i++;
        while (i < n && src[i] >= '0' && src[i] <= '9') i++;
      }
      tokens.push({ t: 'NUM', v: Number(src.slice(start, i)), line });
      continue;
    }
    // Identifier / keyword
    const cc = ch.charCodeAt(0);
    if ((cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122) || ch === '_' || cc > 127) {
      let start = i;
      i++;
      while (i < n) {
        const c2 = src[i];
        const cc2 = c2.charCodeAt(0);
        if ((cc2 >= 65 && cc2 <= 90) || (cc2 >= 97 && cc2 <= 122) || (cc2 >= 48 && cc2 <= 57) || c2 === '_' || cc2 > 127) {
          i++;
        } else {
          break;
        }
      }
      const word = src.slice(start, i);
      tokens.push({ t: KEYWORDS.has(word) ? word : 'ID', v: word, line });
      continue;
    }
    // Two-char operators
    const two = src.slice(i, i + 2);
    if (two === '==' || two === '!=' || two === '<=' || two === '>=' ||
        two === '&&' || two === '||' || two === '+=' || two === '-=' ||
        two === '*=' || two === '/=') {
      tokens.push({ t: two, v: two, line });
      i += 2;
      continue;
    }
    // Single-char punctuators/operators
    if ('+-*/%<>=!(){}[],.;:?'.includes(ch)) {
      tokens.push({ t: ch, v: ch, line });
      i++;
      continue;
    }
    throw new Error(`第 ${line} 行：无法识别的字符 '${ch}'`);
  }
  tokens.push({ t: 'EOF', v: '', line });
  return tokens;
}

export function compileNOS(src) {
  const tokens = tokenize(src);
  let pos = 0;

  const consts = [];
  const constMap = new Map();
  const globals = [];
  const globalMap = new Map();
  const fnNameMap = new Map();
  const funcs = [
    { name: '__main__', params: 0, locals: 0, code: [] },
  ];

  function addConst(val) {
    const key = typeof val + ':' + String(val);
    if (constMap.has(key)) return constMap.get(key);
    const idx = consts.length;
    consts.push(val);
    constMap.set(key, idx);
    return idx;
  }

  function ensureGlobal(name) {
    if (globalMap.has(name)) return globalMap.get(name);
    const idx = globals.length;
    globals.push(name);
    globalMap.set(name, idx);
    return idx;
  }

  // Pre-scan top-level `fn name(...)` declarations so functions can be mutually recursive
  {
    let braceDepth = 0;
    for (let k = 0; k < tokens.length; k++) {
      const tk = tokens[k];
      if (tk.t === '{') braceDepth++;
      else if (tk.t === '}') braceDepth--;
      else if (braceDepth === 0 && tk.t === 'fn' && tokens[k + 1] && tokens[k + 1].t === 'ID') {
        const fname = tokens[k + 1].v;
        if (!fnNameMap.has(fname)) {
          const fidx = funcs.length;
          fnNameMap.set(fname, fidx);
          funcs.push({ name: fname, params: 0, locals: 0, code: [] });
        }
      }
    }
  }

  // Active compilation context
  let curFn = funcs[0];
  let inFunc = false;
  let scopes = []; // array of Map<name, localSlot>
  let loopStack = []; // { breaks: [], continues: [], continueTarget: -1 }

  function peek(offset = 0) {
    return tokens[Math.min(pos + offset, tokens.length - 1)];
  }
  function next() {
    return tokens[pos++];
  }
  function expect(t) {
    const tk = peek();
    if (tk.t !== t) {
      throw new Error(`第 ${tk.line} 行：期望 '${t}'，实际为 '${tk.v || tk.t}'`);
    }
    return next();
  }
  function match(t) {
    if (peek().t === t) {
      next();
      return true;
    }
    return false;
  }

  function emit(op, ...args) {
    const addr = curFn.code.length;
    curFn.code.push(op);
    for (const a of args) curFn.code.push(a);
    return addr;
  }
  function patch(jumpOpAddr, target) {
    curFn.code[jumpOpAddr + 1] = target;
  }

  function pushScope() {
    scopes.push(new Map());
  }
  function popScope() {
    scopes.pop();
  }
  function declareLocal(name) {
    const slot = curFn.locals++;
    scopes[scopes.length - 1].set(name, slot);
    return slot;
  }
  function resolveLocal(name) {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (scopes[i].has(name)) return scopes[i].get(name);
    }
    return -1;
  }

  function parseProgram() {
    while (peek().t !== 'EOF') {
      if (peek().t === 'fn') {
        parseFnDecl();
      } else {
        parseStmt();
      }
    }
    emit(OP.NULL);
    emit(OP.RET);
  }

  function parseFnDecl() {
    expect('fn');
    const nameTk = expect('ID');
    const fidx = fnNameMap.get(nameTk.v);
    const fnObj = funcs[fidx];
    expect('(');
    const params = [];
    if (peek().t !== ')') {
      do {
        params.push(expect('ID').v);
      } while (match(','));
    }
    expect(')');

    const prevFn = curFn;
    const prevInFunc = inFunc;
    const prevScopes = scopes;
    const prevLoops = loopStack;

    curFn = fnObj;
    inFunc = true;
    scopes = [new Map()];
    loopStack = [];
    fnObj.params = params.length;
    fnObj.locals = 0;
    for (const p of params) {
      declareLocal(p);
    }

    expect('{');
    while (peek().t !== '}' && peek().t !== 'EOF') {
      parseStmt();
    }
    expect('}');
    emit(OP.NULL);
    emit(OP.RET);

    curFn = prevFn;
    inFunc = prevInFunc;
    scopes = prevScopes;
    loopStack = prevLoops;
  }

  function parseBlock() {
    expect('{');
    if (inFunc) pushScope();
    while (peek().t !== '}' && peek().t !== 'EOF') {
      parseStmt();
    }
    if (inFunc) popScope();
    expect('}');
  }

  function parseStmt() {
    const tk = peek();
    if (tk.t === ';') {
      next();
      return;
    }
    if (tk.t === '{') {
      parseBlock();
      return;
    }
    if (tk.t === 'let') {
      parseLetStmt(true);
      return;
    }
    if (tk.t === 'if') {
      parseIfStmt();
      return;
    }
    if (tk.t === 'while') {
      parseWhileStmt();
      return;
    }
    if (tk.t === 'for') {
      parseForStmt();
      return;
    }
    if (tk.t === 'break') {
      next();
      expect(';');
      if (loopStack.length === 0) throw new Error(`第 ${tk.line} 行：break 必须在循环内`);
      const jmpAddr = emit(OP.JMP, 0);
      loopStack[loopStack.length - 1].breaks.push(jmpAddr);
      return;
    }
    if (tk.t === 'continue') {
      next();
      expect(';');
      if (loopStack.length === 0) throw new Error(`第 ${tk.line} 行：continue 必须在循环内`);
      const jmpAddr = emit(OP.JMP, 0);
      loopStack[loopStack.length - 1].continues.push(jmpAddr);
      return;
    }
    if (tk.t === 'return') {
      next();
      if (peek().t === ';') {
        next();
        emit(OP.NULL);
      } else {
        parseExpr();
        expect(';');
      }
      emit(OP.RET);
      return;
    }
    if (tk.t === 'try') {
      parseTryStmt();
      return;
    }
    if (tk.t === 'throw') {
      next();
      parseExpr();
      expect(';');
      emit(OP.THROW);
      return;
    }
    parseExpr();
    expect(';');
    emit(OP.POP);
  }

  function parseLetStmt(needSemi) {
    expect('let');
    const name = expect('ID').v;
    if (match('=')) {
      parseExpr();
    } else {
      emit(OP.NULL);
    }
    if (inFunc) {
      const slot = declareLocal(name);
      emit(OP.STORE_L, slot);
      emit(OP.POP);
    } else {
      const gidx = ensureGlobal(name);
      emit(OP.STORE_G, gidx);
      emit(OP.POP);
    }
    if (needSemi) expect(';');
  }

  function parseIfStmt() {
    expect('if');
    expect('(');
    parseExpr();
    expect(')');
    const jmpFalse = emit(OP.JMP_FALSE, 0);
    parseStmt();
    if (match('else')) {
      const jmpEnd = emit(OP.JMP, 0);
      patch(jmpFalse, curFn.code.length);
      parseStmt();
      patch(jmpEnd, curFn.code.length);
    } else {
      patch(jmpFalse, curFn.code.length);
    }
  }

  function parseWhileStmt() {
    expect('while');
    const loopStart = curFn.code.length;
    expect('(');
    parseExpr();
    expect(')');
    const jmpExit = emit(OP.JMP_FALSE, 0);
    const loop = { breaks: [], continues: [] };
    loopStack.push(loop);
    parseStmt();
    loopStack.pop();
    for (const c of loop.continues) patch(c, loopStart);
    emit(OP.JMP, loopStart);
    const exitAddr = curFn.code.length;
    patch(jmpExit, exitAddr);
    for (const b of loop.breaks) patch(b, exitAddr);
  }

  function parseForStmt() {
    expect('for');
    expect('(');
    if (inFunc) pushScope();
    if (peek().t === 'let') {
      parseLetStmt(true);
    } else if (peek().t !== ';') {
      parseExpr();
      emit(OP.POP);
      expect(';');
    } else {
      next();
    }
    const condStart = curFn.code.length;
    let jmpExit = -1;
    if (peek().t !== ';') {
      parseExpr();
      jmpExit = emit(OP.JMP_FALSE, 0);
    }
    expect(';');
    // Jump over step to body, then step jumps back to cond
    const jmpBody = emit(OP.JMP, 0);
    const stepStart = curFn.code.length;
    if (peek().t !== ')') {
      parseExpr();
      emit(OP.POP);
    }
    expect(')');
    emit(OP.JMP, condStart);

    patch(jmpBody, curFn.code.length);
    const loop = { breaks: [], continues: [] };
    loopStack.push(loop);
    parseStmt();
    loopStack.pop();
    for (const c of loop.continues) patch(c, stepStart);
    emit(OP.JMP, stepStart);
    const exitAddr = curFn.code.length;
    if (jmpExit >= 0) patch(jmpExit, exitAddr);
    for (const b of loop.breaks) patch(b, exitAddr);
    if (inFunc) popScope();
  }

  function parseTryStmt() {
    expect('try');
    const tryPush = emit(OP.TRY_PUSH, 0);
    parseBlock();
    emit(OP.TRY_POP);
    const jmpEnd = emit(OP.JMP, 0);
    patch(tryPush, curFn.code.length);
    expect('catch');
    expect('(');
    const errName = expect('ID').v;
    expect(')');
    if (inFunc) {
      pushScope();
      const slot = declareLocal(errName);
      emit(OP.STORE_L, slot);
      emit(OP.POP);
      expect('{');
      while (peek().t !== '}' && peek().t !== 'EOF') parseStmt();
      expect('}');
      popScope();
    } else {
      const gidx = ensureGlobal(errName);
      emit(OP.STORE_G, gidx);
      emit(OP.POP);
      parseBlock();
    }
    patch(jmpEnd, curFn.code.length);
  }

  // Expressions
  function parseExpr() {
    parseAssign();
  }

  function parseAssign() {
    // Parse LHS by saving position / AST-free two-way or clean LHS descriptor
    const startPos = pos;
    const lhs = parseOrWithTarget();
    const tk = peek();
    if (tk.t === '=' || tk.t === '+=' || tk.t === '-=' || tk.t === '*=' || tk.t === '/=') {
      if (!lhs || !lhs.assignable) {
        throw new Error(`第 ${tk.line} 行：无效的赋值目标`);
      }
      const op = next().t;
      // Rewind bytecode emitted for simple read of LHS and emit clean store!
      curFn.code.length = lhs.codeStart;
      if (lhs.kind === 'var') {
        if (op !== '=') {
          if (lhs.isLocal) emit(OP.LOAD_L, lhs.slot);
          else emit(OP.LOAD_G, lhs.slot);
        }
        parseAssign();
        if (op === '+=') emit(OP.ADD);
        else if (op === '-=') emit(OP.SUB);
        else if (op === '*=') emit(OP.MUL);
        else if (op === '/=') emit(OP.DIV);
        if (lhs.isLocal) emit(OP.STORE_L, lhs.slot);
        else emit(OP.STORE_G, lhs.slot);
      } else if (lhs.kind === 'prop') {
        // Re-emit obj & key from saved target expressions
        // For compound assignment on obj[key], re-parse obj and key cleanly
        if (op === '=') {
          const endOfLhs = lhs.opPos;
          const savedPos = pos;
          pos = startPos;
          emitPropObjAndKey(endOfLhs);
          pos = savedPos;
          parseAssign();
          emit(OP.SET_PROP);
        } else {
          // Compound: evaluate obj & key once via temp? Simpler: re-evaluate obj & key cleanly (expressions are simple lvalues)
          const endOfLhs = lhs.opPos;
          const savedPos = pos;
          pos = startPos;
          emitPropObjAndKey(endOfLhs);
          pos = startPos;
          emitPropObjAndKey(endOfLhs);
          emit(OP.GET_PROP);
          pos = savedPos;
          parseAssign();
          if (op === '+=') emit(OP.ADD);
          else if (op === '-=') emit(OP.SUB);
          else if (op === '*=') emit(OP.MUL);
          else if (op === '/=') emit(OP.DIV);
          emit(OP.SET_PROP);
        }
      }
    }
  }

  // Helper: re-emits object and key for `base... .k` or `base... [expr]` ending at `endTokenPos`
  function emitPropObjAndKey(endTokenPos) {
    // Parse postfix chain stopping right before the final `.prop` or `[idx]`
    parsePrimary();
    while (pos < endTokenPos) {
      if (peek().t === '.') {
        const isLast = (pos + 2 === endTokenPos);
        next();
        const prop = expect('ID').v;
        emit(OP.CONST, addConst(prop));
        if (!isLast) emit(OP.GET_PROP);
      } else if (peek().t === '[') {
        next();
        parseExpr();
        expect(']');
        if (pos < endTokenPos) emit(OP.GET_PROP);
      } else if (peek().t === '(') {
        next();
        let argc = 0;
        if (peek().t !== ')') {
          do {
            parseExpr();
            argc++;
          } while (match(','));
        }
        expect(')');
        emit(OP.CALL, argc);
      } else {
        break;
      }
    }
  }

  function parseOrWithTarget() {
    const codeStart = curFn.code.length;
    const target = parseAndWithTarget();
    let combined = target;
    while (match('||')) {
      combined = null;
      const jmpTrue = emit(OP.JMP_TRUE_PEEK, 0);
      emit(OP.POP);
      parseAndWithTarget();
      patch(jmpTrue, curFn.code.length);
    }
    if (match('?')) {
      combined = null;
      const jmpFalse = emit(OP.JMP_FALSE, 0);
      parseAssign();
      const jmpEnd = emit(OP.JMP, 0);
      expect(':');
      patch(jmpFalse, curFn.code.length);
      parseAssign();
      patch(jmpEnd, curFn.code.length);
    }
    return combined ? { ...combined, codeStart } : null;
  }

  function parseAndWithTarget() {
    const target = parseEqWithTarget();
    let combined = target;
    while (match('&&')) {
      combined = null;
      const jmpFalse = emit(OP.JMP_FALSE_PEEK, 0);
      emit(OP.POP);
      parseEqWithTarget();
      patch(jmpFalse, curFn.code.length);
    }
    return combined;
  }

  function parseEqWithTarget() {
    const target = parseCmpWithTarget();
    let combined = target;
    while (peek().t === '==' || peek().t === '!=') {
      combined = null;
      const op = next().t;
      parseCmpWithTarget();
      emit(op === '==' ? OP.EQ : OP.NEQ);
    }
    return combined;
  }

  function parseCmpWithTarget() {
    const target = parseAddWithTarget();
    let combined = target;
    while (peek().t === '<' || peek().t === '<=' || peek().t === '>' || peek().t === '>=') {
      combined = null;
      const op = next().t;
      parseAddWithTarget();
      if (op === '<') emit(OP.LT);
      else if (op === '<=') emit(OP.LE);
      else if (op === '>') emit(OP.GT);
      else emit(OP.GE);
    }
    return combined;
  }

  function parseAddWithTarget() {
    const target = parseMulWithTarget();
    let combined = target;
    while (peek().t === '+' || peek().t === '-') {
      combined = null;
      const op = next().t;
      parseMulWithTarget();
      emit(op === '+' ? OP.ADD : OP.SUB);
    }
    return combined;
  }

  function parseMulWithTarget() {
    const target = parseUnaryWithTarget();
    let combined = target;
    while (peek().t === '*' || peek().t === '/' || peek().t === '%') {
      combined = null;
      const op = next().t;
      parseUnaryWithTarget();
      if (op === '*') emit(OP.MUL);
      else if (op === '/') emit(OP.DIV);
      else emit(OP.MOD);
    }
    return combined;
  }

  function parseUnaryWithTarget() {
    if (match('!')) {
      parseUnaryWithTarget();
      emit(OP.NOT);
      return null;
    }
    if (match('-')) {
      parseUnaryWithTarget();
      emit(OP.NEG);
      return null;
    }
    return parsePostfixWithTarget();
  }

  function parsePostfixWithTarget() {
    let target = parsePrimary();
    while (true) {
      if (match('.')) {
        const prop = expect('ID').v;
        emit(OP.CONST, addConst(prop));
        emit(OP.GET_PROP);
        target = { assignable: true, kind: 'prop', opPos: pos };
      } else if (match('[')) {
        parseExpr();
        expect(']');
        emit(OP.GET_PROP);
        target = { assignable: true, kind: 'prop', opPos: pos };
      } else if (match('(')) {
        let argc = 0;
        if (peek().t !== ')') {
          do {
            parseExpr();
            argc++;
          } while (match(','));
        }
        expect(')');
        emit(OP.CALL, argc);
        target = null;
      } else {
        break;
      }
    }
    return target;
  }

  function parsePrimary() {
    const tk = peek();
    if (tk.t === 'NUM') {
      next();
      emit(OP.CONST, addConst(tk.v));
      return null;
    }
    if (tk.t === 'STR') {
      next();
      emit(OP.CONST, addConst(tk.v));
      return null;
    }
    if (tk.t === 'true') {
      next();
      emit(OP.TRUE);
      return null;
    }
    if (tk.t === 'false') {
      next();
      emit(OP.FALSE);
      return null;
    }
    if (tk.t === 'null') {
      next();
      emit(OP.NULL);
      return null;
    }
    if (tk.t === 'syscall') {
      next();
      expect('(');
      parseExpr(); // syscall name
      let argc = 0;
      while (match(',')) {
        parseExpr();
        argc++;
      }
      expect(')');
      emit(OP.SYSCALL, argc);
      return null;
    }
    if (tk.t === 'ID') {
      next();
      const name = tk.v;
      if (inFunc) {
        const lslot = resolveLocal(name);
        if (lslot >= 0) {
          emit(OP.LOAD_L, lslot);
          return { assignable: true, kind: 'var', isLocal: true, slot: lslot };
        }
      }
      if (fnNameMap.has(name)) {
        emit(OP.LOAD_FN, fnNameMap.get(name));
        return null;
      }
      if (globalMap.has(name)) {
        const gidx = globalMap.get(name);
        emit(OP.LOAD_G, gidx);
        return { assignable: true, kind: 'var', isLocal: false, slot: gidx };
      }
      if (BUILTIN_SET.has(name)) {
        emit(OP.LOAD_BUILTIN, addConst(name));
        return null;
      }
      const gidx = ensureGlobal(name);
      emit(OP.LOAD_G, gidx);
      return { assignable: true, kind: 'var', isLocal: false, slot: gidx };
    }
    if (match('(')) {
      parseExpr();
      expect(')');
      return null;
    }
    if (match('[')) {
      let count = 0;
      if (peek().t !== ']') {
        do {
          if (peek().t === ']') break;
          parseExpr();
          count++;
        } while (match(','));
      }
      expect(']');
      emit(OP.MAKE_ARR, count);
      return null;
    }
    if (match('{')) {
      let count = 0;
      if (peek().t !== '}') {
        do {
          if (peek().t === '}') break;
          const ktk = peek();
          let keyName;
          if (ktk.t === 'ID' || ktk.t === 'STR' || KEYWORDS.has(ktk.t)) {
            next();
            keyName = ktk.v;
          } else {
            throw new Error(`第 ${ktk.line} 行：对象键必须为标识符或字符串`);
          }
          expect(':');
          emit(OP.CONST, addConst(keyName));
          parseExpr();
          count++;
        } while (match(','));
      }
      expect('}');
      emit(OP.MAKE_OBJ, count);
      return null;
    }
    throw new Error(`第 ${tk.line} 行：意外的记号 '${tk.v || tk.t}'`);
  }

  parseProgram();

  return {
    version: 1,
    consts,
    globals,
    funcs,
  };
}
