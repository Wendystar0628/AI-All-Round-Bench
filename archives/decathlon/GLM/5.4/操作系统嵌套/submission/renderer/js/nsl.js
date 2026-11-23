// ===========================================================================
//  NSL 编译器（参考实现，JavaScript 版）
//  与 programs/Compiler.nsl 结构一一对应，用于：
//    · 生成预置的 Compiler.bin
//    · 差分测试：两种实现必须产出完全相同的字节码
// ===========================================================================
(function () {
  const OP = window.NSL.OP;

  function tokenize(src) {
    const toks = [];
    let i = 0, line = 1;
    const n = src.length;
    const isDigit = (c) => c >= '0' && c <= '9';
    const isIdStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$';
    const isId = (c) => isIdStart(c) || isDigit(c);
    while (i < n) {
      const c = src[i];
      if (c === '\n') { line++; i++; continue; }
      if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; } i += 2; continue; }
      if (c === '"') {
        i++; let s = '';
        while (i < n && src[i] !== '"') {
          if (src[i] === '\\') {
            const e = src[i + 1];
            if (e === 'n') s += '\n'; else if (e === 't') s += '\t'; else if (e === 'r') s += '\r';
            else if (e === '\\') s += '\\'; else if (e === '"') s += '"'; else if (e === '0') s += '\0';
            else s += e;
            i += 2;
          } else { if (src[i] === '\n') line++; s += src[i]; i++; }
        }
        if (i >= n) return { err: '字符串没有结束（第 ' + line + ' 行）' };
        i++;
        toks.push(['str', s, line]);
        continue;
      }
      if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
        let j = i;
        while (j < n && (isDigit(src[j]) || src[j] === '.')) j++;
        if (src[j] === 'e' || src[j] === 'E') { j++; if (src[j] === '+' || src[j] === '-') j++; while (j < n && isDigit(src[j])) j++; }
        toks.push(['num', parseFloat(src.slice(i, j)), line]);
        i = j; continue;
      }
      if (isIdStart(c)) {
        let j = i;
        while (j < n && isId(src[j])) j++;
        toks.push(['id', src.slice(i, j), line]);
        i = j; continue;
      }
      const three = src.substr(i, 3);
      const two = src.substr(i, 2);
      if (three === '===' || three === '!==') { toks.push(['op', three[0] + '=', line]); i += 3; continue; }
      if (two === '&&' || two === '||' || two === '+=' || two === '-=' || two === '*=' || two === '/=' || two === '==' || two === '!=' || two === '<=' || two === '>=' || two === '++' || two === '--') {
        toks.push(['op', two, line]); i += 2; continue;
      }
      if ('+-*/%=<>!(){}[],.;:?'.indexOf(c) >= 0) { toks.push(['op', c, line]); i++; continue; }
      return { err: '无法识别的字符 "' + c + '"（第 ' + line + ' 行）' };
    }
    toks.push(['eof', null, line]);
    return { toks };
  }

  class Compiler {
    constructor(name) {
      this.name = name || 'program';
      this.code = []; this.lines = [];
      this.consts = []; this.constMap = {};
      this.funcs = {}; this.funcOrder = [];
      this.scopes = [{ vars: new Set() }];
      this.loops = [];
      this.err = null;
      this.toks = []; this.i = 0;
    }
    constIdx(v) {
      const k = typeof v + ':' + String(v);
      if (k in this.constMap) return this.constMap[k];
      this.consts.push(v);
      this.constMap[k] = this.consts.length - 1;
      return this.consts.length - 1;
    }
    emit(op, a, b) {
      this.code.push([op, a === undefined ? 0 : a, b === undefined ? 0 : b]);
      this.lines.push(this.line());
      return this.code.length - 1;
    }
    patch(idx) { this.code[idx][1] = this.code.length; }
    error(msg) { if (!this.err) this.err = msg + '（第 ' + this.line() + ' 行）'; return null; }
    line() { return this.i < this.toks.length ? this.toks[this.i][2] : '?'; }
    peek(off) { return this.toks[Math.min(this.i + (off || 0), this.toks.length - 1)]; }
    at(type, val) { const t = this.peek(); return t[0] === type && (val === undefined || t[1] === val); }
    next() { return this.toks[this.i++]; }
    expect(type, val) {
      const t = this.peek();
      if (t[0] !== type || (val !== undefined && t[1] !== val)) return this.error('期望 ' + (val || type) + '，实际是 ' + t[1]);
      this.i++;
      return t;
    }
    skipToClose(open, close) {
      let d = 0;
      while (!this.at('eof')) {
        const t = this.next();
        if (t[0] === 'op' && t[1] === open) d++;
        else if (t[0] === 'op' && t[1] === close) { d--; if (d === 0) return true; }
      }
      return false;
    }
    declare(n) { this.scopes[this.scopes.length - 1].vars.add(n); }
    resolve(n) {
      for (let s = this.scopes.length - 1; s >= 0; s--) if (this.scopes[s].vars.has(n)) return s === 0 ? 'global' : 'local';
      if (n === 'Math') return 'global';
      return null;
    }
    // ---- 程序 ----
    compile(src) {
      const t = tokenize(src);
      if (t.err) return { err: t.err };
      this.toks = t.toks;
      // 1) 扫描顶层函数声明
      const funcs = [];
      while (!this.at('eof')) {
        if (this.at('id', 'func') && this.peek(1)[0] === 'id') {
          const fn = { name: this.peek(1)[1], params: [], line: this.line() };
          this.i += 2;
          if (!this.expect('op', '(')) return { err: this.err };
          while (!this.at('op', ')') && !this.at('eof')) {
            const p = this.expect('id');
            if (!p) return { err: this.err };
            fn.params.push(p[1]);
            if (this.at('op', ',')) this.i++;
          }
          if (!this.expect('op', ')')) return { err: this.err };
          fn.bodyStart = this.i;
          if (!this.skipToClose('{', '}')) return { err: this.error('函数体没有结束') };
          fn.bodyEnd = this.i - 1;
          funcs.push(fn);
          continue;
        }
        // 跳过一条顶层语句（按行与括号配对）
        const line = this.toks[this.i][2];
        let d = 0;
        while (!this.at('eof')) {
          const tk = this.next();
          if (tk[0] === 'op' && (tk[1] === '{' || tk[1] === '(' || tk[1] === '[')) d++;
          else if (tk[0] === 'op' && (tk[1] === '}' || tk[1] === ')' || tk[1] === ']')) { d--; if (d <= 0) break; }
          else if (tk[0] === 'op' && tk[1] === ';' && d === 0) break;
          else if (d === 0 && this.toks[this.i][2] !== line) break;
        }
      }
      for (const fn of funcs) { this.funcs[fn.name] = { pc: 0, params: fn.params }; this.funcOrder.push(fn.name); }
      // 2) 顶层语句
      this.i = 0;
      while (!this.at('eof')) { if (!this.parseStmt()) return { err: this.err }; }
      if (this.funcs.main) this.emit(OP.CALL, this.constIdx('main'), 0);
      this.emit(OP.RET);
      // 3) 函数体
      for (const fn of funcs) {
        const f = this.funcs[fn.name];
        f.pc = this.code.length;
        this.scopes.push({ vars: new Set() });
        for (const p of fn.params) this.declare(p);
        // 预先声明函数体内的 var
        this.collectVars(fn.bodyStart, fn.bodyEnd);
        this.i = fn.bodyStart;
        this.expect('op', '{');
        while (!this.at('op', '}') && !this.at('eof')) { if (!this.parseStmt()) return { err: this.err }; }
        this.expect('op', '}');
        this.emit(OP.RET);
        this.scopes.pop();
      }
      if (this.err) return { err: this.err };
      return { prog: { name: this.name, code: this.code, consts: this.consts, funcs: this.funcs, lines: this.lines } };
    }
    collectVars(a, b) {
      const save = this.i;
      this.i = a;
      while (this.i < b) {
        if (this.at('id', 'var') && this.peek(1)[0] === 'id') { this.declare(this.peek(1)[1]); this.i += 2; }
        else this.i++;
      }
      this.i = save;
    }
    // ---- 语句 ----
    parseStmt() {
      const t = this.peek();
      if (t[0] === 'op' && t[1] === ';') { this.i++; return true; }
      if (t[0] === 'op' && t[1] === '{') {
        this.i++;
        while (!this.at('op', '}') && !this.at('eof')) { if (!this.parseStmt()) return false; }
        return !!this.expect('op', '}');
      }
      if (t[0] === 'id') {
        const v = t[1];
        if (v === 'var') {
          this.i++;
          while (true) {
            const nt = this.expect('id');
            if (!nt) return false;
            this.declare(nt[1]);
            if (this.at('op', '=')) {
              this.i++;
              const e = this.parseExpr();
              if (!e) return false;
              if (e[0] !== 'assigned') this.genExpr(e);
              const sc = this.resolve(nt[1]);
              this.emit(sc === 'global' ? OP.GSTORE : OP.STORE, this.constIdx(nt[1]));
            }
            if (this.at('op', ',')) { this.i++; continue; }
            break;
          }
          return true;
        }
        if (v === 'if') {
          this.i++;
          if (!this.expect('op', '(')) return false;
          if (!this.genExprValue()) return false;
          if (!this.expect('op', ')')) return false;
          this.emit(OP.JZ, 0);
          const jz = this.code.length - 1;
          if (!this.parseStmt()) return false;
          if (this.at('id', 'else')) {
            this.i++;
            this.emit(OP.JMP, 0);
            const jmp = this.code.length - 1;
            this.patch(jz);
            if (!this.parseStmt()) return false;
            this.patch(jmp);
          } else this.patch(jz);
          return true;
        }
        if (v === 'while') {
          this.i++;
          if (!this.expect('op', '(')) return false;
          const start = this.code.length;
          if (!this.genExprValue()) return false;
          if (!this.expect('op', ')')) return false;
          this.emit(OP.JZ, 0);
          const jz = this.code.length - 1;
          this.loops.push({ breaks: [], contJumps: [] });
          const ok = this.parseStmt();
          const lp = this.loops.pop();
          this.emit(OP.JMP, start);
          for (const b of lp.breaks) this.patch(b);
          for (const c of lp.contJumps) this.code[c][1] = start;
          this.patch(jz);
          return ok;
        }
        if (v === 'for') {
          this.i++;
          if (!this.expect('op', '(')) return false;
          if (!this.at('op', ';')) { if (!this.parseSimple()) return false; }
          if (!this.expect('op', ';')) return false;
          const condPc = this.code.length;
          let hasCond = false;
          if (!this.at('op', ';')) { if (!this.genExprValue()) return false; hasCond = true; }
          if (!this.expect('op', ';')) return false;
          const stepStart = this.i;
          let d = 0;
          while (!this.at('eof')) {
            const tk = this.next();
            if (tk[0] === 'op' && tk[1] === '(') d++;
            else if (tk[0] === 'op' && tk[1] === ')') { if (d === 0) break; d--; }
          }
          if (this.at('eof')) return this.error('for 语句没有结束');
          const stepEnd = this.i - 1;
          let jz = -1;
          if (hasCond) { this.emit(OP.JZ, 0); jz = this.code.length - 1; }
          this.loops.push({ breaks: [], contJumps: [] });
          const lp = this.loops[this.loops.length - 1];
          const ok = this.parseStmt();
          const stepPc = this.code.length;
          for (const c of lp.contJumps) this.code[c][1] = stepPc;
          const saveI = this.i;
          this.i = stepStart;
          if (!this.parseSimple()) return false;
          this.i = saveI;
          this.emit(OP.JMP, condPc);
          this.loops.pop();
          for (const b of lp.breaks) this.patch(b);
          if (jz >= 0) this.patch(jz);
          return ok;
        }
        if (v === 'return') {
          this.i++;
          if (this.at('op', ';') || this.at('op', '}') || this.at('eof')) this.emit(OP.CONST, this.constIdx(null));
          else if (!this.genExprValue()) return false;
          this.emit(OP.RET);
          if (this.at('op', ';')) this.i++;
          return true;
        }
        if (v === 'break') {
          this.i++;
          if (!this.loops.length) return this.error('break 不在循环内');
          this.emit(OP.JMP, 0);
          this.loops[this.loops.length - 1].breaks.push(this.code.length - 1);
          if (this.at('op', ';')) this.i++;
          return true;
        }
        if (v === 'continue') {
          this.i++;
          if (!this.loops.length) return this.error('continue 不在循环内');
          this.emit(OP.JMP, 0);
          this.loops[this.loops.length - 1].contJumps.push(this.code.length - 1);
          if (this.at('op', ';')) this.i++;
          return true;
        }
        if (v === 'func') {
          // 顶层函数声明在扫描阶段已记录，这里跳过
          this.i++;
          this.expect('id');
          this.skipToClose('(', ')');
          this.skipToClose('{', '}');
          return true;
        }
        if (v === 'try') {
          this.i++;
          this.emit(OP.TRY, 0);
          const tr = this.code.length - 1;
          if (!this.parseStmt()) return false;
          this.emit(OP.ENDTRY);
          this.emit(OP.JMP, 0);
          const jmp = this.code.length - 1;
          this.patch(tr);
          if (!this.expect('id', 'catch')) return false;
          if (!this.expect('op', '(')) return false;
          const cv = this.expect('id');
          if (!cv) return false;
          if (!this.expect('op', ')')) return false;
          this.declare(cv[1]);
          this.emit(this.resolve(cv[1]) === 'global' ? OP.GSTORE : OP.STORE, this.constIdx(cv[1]));
          if (!this.parseStmt()) return false;
          this.patch(jmp);
          return true;
        }
        if (v === 'throw') {
          this.i++;
          if (!this.genExprValue()) return false;
          this.emit(OP.THROW);
          if (this.at('op', ';')) this.i++;
          return true;
        }
      }
      const e = this.parseExpr();
      if (!e) return false;
      if (e[0] === 'assigned') { if (this.at('op', ';')) this.i++; return true; }
      this.genExpr(e);
      this.emit(OP.POP);
      if (this.at('op', ';')) this.i++;
      return true;
    }
    genExprValue() {
      const e = this.parseExpr();
      if (!e) return false;
      if (e[0] !== 'assigned') this.genExpr(e);
      return true;
    }
    parseSimple() {
      if (this.at('id', 'var')) return this.parseStmt();
      const e = this.parseExpr();
      if (!e) return false;
      if (e[0] === 'assigned') return true;
      this.genExpr(e);
      this.emit(OP.POP);
      return true;
    }
    // ---- 表达式：返回 AST 节点；赋值节点在解析时已生成代码，用 ['assigned'] 标记 ----
    parseExpr() { return this.parseAssign(); }
    parseAssign() {
      const left = this.parseTernary();
      if (!left) return null;
      const t = this.peek();
      const isAssign = t[0] === 'op' && (t[1] === '=' || t[1] === '+=' || t[1] === '-=' || t[1] === '*=' || t[1] === '/=');
      const isIncr = t[0] === 'op' && (t[1] === '++' || t[1] === '--');
      if (!isAssign && !isIncr) return left;
      if (left[0] !== 'name' && left[0] !== 'idx' && left[0] !== 'prop') return this.error('赋值目标必须是变量、下标或属性');
      this.i++;
      const op = isIncr ? (t[1] === '++' ? '+=' : '-=') : t[1];
      const kind = left[0];
      let sc = null, k = 0;
      // 先取左值地址（复合赋值还需要先取出当前值）
      if (kind === 'name') {
        sc = this.resolve(left[1]);
        if (!sc) return this.error('未声明的变量 ' + left[1]);
        k = this.constIdx(left[1]);
        if (op !== '=') this.emit(sc === 'global' ? OP.GLOAD : OP.LOAD, k);
      } else if (kind === 'idx') {
        this.genExpr(left[1]); this.genExpr(left[2]);
        if (op !== '=') { this.emit(OP.DUP2); this.emit(OP.GETIDX); }
      } else {
        this.genExpr(left[1]);
        k = this.constIdx(left[2]);
        if (op !== '=') { this.emit(OP.DUP); this.emit(OP.GETPROP, k); }
      }
      if (isIncr) this.emit(OP.CONST, this.constIdx(1));
      else {
        const rhs = this.parseAssign();
        if (!rhs) return null;
        if (rhs[0] !== 'assigned') this.genExpr(rhs);
      }
      if (op !== '=') this.emit(op === '+=' ? OP.ADD : op === '-=' ? OP.SUB : op === '*=' ? OP.MUL : OP.DIV);
      if (kind === 'name') { this.emit(sc === 'global' ? OP.GSTORE : OP.STORE, k); }
      else if (kind === 'idx') { this.emit(OP.SETIDX); }
      else { this.emit(OP.SETPROP, k); }
      return ['assigned'];
    }
    parseTernary() {
      const c = this.parseOr();
      if (!c) return null;
      if (!this.at('op', '?')) return c;
      this.i++;
      const a = this.parseAssign();
      if (!this.expect('op', ':')) return null;
      const b = this.parseAssign();
      if (!a || !b) return null;
      return ['cond', c, a, b];
    }
    parseOr() {
      let l = this.parseAnd();
      if (!l) return null;
      while (this.at('op', '||')) { this.i++; const r = this.parseAnd(); if (!r) return null; l = ['or', l, r]; }
      return l;
    }
    parseAnd() {
      let l = this.parseEq();
      if (!l) return null;
      while (this.at('op', '&&')) { this.i++; const r = this.parseEq(); if (!r) return null; l = ['and', l, r]; }
      return l;
    }
    parseEq() {
      let l = this.parseRel();
      if (!l) return null;
      while (this.at('op', '==') || this.at('op', '!=')) { const op = this.next()[1]; const r = this.parseRel(); if (!r) return null; l = ['bin', op, l, r]; }
      return l;
    }
    parseRel() {
      let l = this.parseAdd();
      if (!l) return null;
      while (this.at('op', '<') || this.at('op', '>') || this.at('op', '<=') || this.at('op', '>=')) { const op = this.next()[1]; const r = this.parseAdd(); if (!r) return null; l = ['bin', op, l, r]; }
      return l;
    }
    parseAdd() {
      let l = this.parseMul();
      if (!l) return null;
      while (this.at('op', '+') || this.at('op', '-')) { const op = this.next()[1]; const r = this.parseMul(); if (!r) return null; l = ['bin', op, l, r]; }
      return l;
    }
    parseMul() {
      let l = this.parseUnary();
      if (!l) return null;
      while (this.at('op', '*') || this.at('op', '/') || this.at('op', '%')) { const op = this.next()[1]; const r = this.parseUnary(); if (!r) return null; l = ['bin', op, l, r]; }
      return l;
    }
    parseUnary() {
      if (this.at('op', '-')) { this.i++; const e = this.parseUnary(); return e ? ['un', '-', e] : null; }
      if (this.at('op', '!')) { this.i++; const e = this.parseUnary(); return e ? ['un', '!', e] : null; }
      return this.parsePostfix();
    }
    parsePostfix() {
      let e = this.parsePrimary();
      if (!e) return null;
      while (true) {
        if (this.at('op', '.')) {
          this.i++;
          const n = this.expect('id');
          if (!n) return null;
          if (this.at('op', '(')) {
            this.i++;
            const args = this.parseArgs();
            if (args === null) return null;
            e = ['method', e, n[1], args];
          } else e = ['prop', e, n[1]];
        } else if (this.at('op', '[')) {
          this.i++;
          const idx = this.parseExpr();
          if (!idx) return null;
          if (!this.expect('op', ']')) return null;
          e = ['idx', e, idx];
        } else break;
      }
      return e;
    }
    parseArgs() {
      const args = [];
      while (!this.at('op', ')') && !this.at('eof')) {
        const a = this.parseExpr();
        if (!a) return null;
        args.push(a);
        if (this.at('op', ',')) this.i++;
      }
      if (!this.expect('op', ')')) return null;
      return args;
    }
    parsePrimary() {
      const t = this.peek();
      if (t[0] === 'num') { this.i++; return ['num', t[1]]; }
      if (t[0] === 'str') { this.i++; return ['str', t[1]]; }
      if (t[0] === 'id') {
        const v = t[1];
        if (v === 'true') { this.i++; return ['bool', true]; }
        if (v === 'false') { this.i++; return ['bool', false]; }
        if (v === 'null') { this.i++; return ['null']; }
        if (v === 'sys') {
          this.i++;
          if (!this.expect('op', '.')) return null;
          const n = this.expect('id');
          if (!n) return null;
          if (!this.expect('op', '(')) return null;
          const args = this.parseArgs();
          if (args === null) return null;
          return ['sys', n[1], args];
        }
        this.i++;
        if (this.at('op', '(')) { this.i++; const args = this.parseArgs(); if (args === null) return null; return ['call', v, args]; }
        return ['name', v];
      }
      if (t[0] === 'op' && t[1] === '(') { this.i++; const e = this.parseExpr(); if (!e) return null; if (!this.expect('op', ')')) return null; return e; }
      if (t[0] === 'op' && t[1] === '[') {
        this.i++;
        const items = [];
        while (!this.at('op', ']') && !this.at('eof')) {
          const a = this.parseExpr(); if (!a) return null; items.push(a);
          if (this.at('op', ',')) this.i++;
        }
        if (!this.expect('op', ']')) return null;
        return ['arr', items];
      }
      if (t[0] === 'op' && t[1] === '{') {
        this.i++;
        const props = [];
        while (!this.at('op', '}') && !this.at('eof')) {
          let k;
          if (this.at('id')) k = this.next()[1];
          else if (this.at('str')) k = this.next()[1];
          else if (this.at('num')) k = String(this.next()[1]);
          else return this.error('映射的键必须是标识符或字符串');
          if (!this.expect('op', ':')) return null;
          const v = this.parseExpr();
          if (!v) return null;
          props.push([k, v]);
          if (this.at('op', ',')) this.i++;
        }
        if (!this.expect('op', '}')) return null;
        return ['map', props];
      }
      return this.error('意外的符号 ' + t[1]);
    }
    genExpr(e) {
      if (!e) return;
      switch (e[0]) {
        case 'assigned': break;
        case 'num': case 'str': case 'bool': this.emit(OP.CONST, this.constIdx(e[1])); break;
        case 'null': this.emit(OP.CONST, this.constIdx(null)); break;
        case 'name': {
          const sc = this.resolve(e[1]);
          if (!sc) { this.error('未声明的变量 ' + e[1]); return; }
          this.emit(sc === 'global' ? OP.GLOAD : OP.LOAD, this.constIdx(e[1]));
          break;
        }
        case 'arr': for (const it of e[1]) this.genExpr(it); this.emit(OP.ARRNEW, e[1].length); break;
        case 'map':
          for (const kv of e[1]) { this.emit(OP.CONST, this.constIdx(kv[0])); this.genExpr(kv[1]); }
          this.emit(OP.MAPNEW, e[1].length);
          break;
        case 'cond': {
          this.genExpr(e[1]);
          this.emit(OP.JZ, 0); const jz = this.code.length - 1;
          this.genExpr(e[2]);
          this.emit(OP.JMP, 0); const jmp = this.code.length - 1;
          this.patch(jz);
          this.genExpr(e[3]);
          this.patch(jmp);
          break;
        }
        case 'and': {
          this.genExpr(e[1]); this.emit(OP.DUP);
          this.emit(OP.JZ, 0); const jz = this.code.length - 1;
          this.emit(OP.POP); this.genExpr(e[2]); this.patch(jz);
          break;
        }
        case 'or': {
          this.genExpr(e[1]); this.emit(OP.DUP);
          this.emit(OP.JNZ, 0); const jnz = this.code.length - 1;
          this.emit(OP.POP); this.genExpr(e[2]); this.patch(jnz);
          break;
        }
        case 'bin': {
          this.genExpr(e[2]); this.genExpr(e[3]);
          const map = { '+': OP.ADD, '-': OP.SUB, '*': OP.MUL, '/': OP.DIV, '%': OP.MOD, '<': OP.LT, '>': OP.GT, '<=': OP.LE, '>=': OP.GE, '==': OP.EQ, '!=': OP.NE };
          this.emit(map[e[1]]);
          break;
        }
        case 'un': this.genExpr(e[2]); this.emit(e[1] === '-' ? OP.NEG : OP.NOT); break;
        case 'idx': this.genExpr(e[1]); this.genExpr(e[2]); this.emit(OP.GETIDX); break;
        case 'prop': this.genExpr(e[1]); this.emit(OP.GETPROP, this.constIdx(e[2])); break;
        case 'call': {
          for (const a of e[2]) this.genExpr(a);
          if (!this.funcs[e[1]]) { this.error('未定义的函数 ' + e[1]); return; }
          this.emit(OP.CALL, this.constIdx(e[1]), e[2].length);
          break;
        }
        case 'method': {
          this.genExpr(e[1]);
          for (const a of e[3]) this.genExpr(a);
          this.emit(OP.METHOD, this.constIdx(e[2]), e[3].length);
          break;
        }
        case 'sys': {
          for (const a of e[2]) this.genExpr(a);
          this.emit(OP.SYS, this.constIdx(e[1]), e[2].length);
          break;
        }
        default: this.error('无法生成的表达式 ' + e[0]);
      }
    }
  }

  function compile(src, name) { return new Compiler(name).compile(src); }
  window.NSLC = { compile, tokenize, Compiler };
})();
