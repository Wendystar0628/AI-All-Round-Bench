// 自定义程序语言 NOScript：词法、语法、编译器与基于显式程序计数器的解释器
import { clamp } from './util.js';

export class LangError extends Error {
  constructor(msg, line = 0) { super(msg); this.name = 'LangError'; this.line = line; }
}

const KEYWORDS = new Set(['let', 'set', 'if', 'else', 'while', 'call', 'break', 'continue', 'true', 'false', 'nil', 'and', 'or', 'not']);

export function tokenize(src) {
  const toks = [];
  let i = 0, line = 1;
  const n = src.length;
  const push = (type, value, extra = {}) => toks.push({ type, value, line, ...extra });
  while (i < n) {
    const c = src[i];
    if (c === '\n') { push('nl', '\n'); line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '#') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') { line++; push('nl', '\n'); } i++; }
      i += 2; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i;
      while (j < n && /[0-9.]/.test(src[j])) j++;
      const raw = src.slice(i, j);
      const v = Number(raw);
      if (!isFinite(v)) throw new LangError('非法数字 ' + raw, line);
      push('num', v, { raw }); i = j; continue;
    }
    if (c === '"' || c === "'") {
      const quote = c; let j = i + 1; let out = '';
      while (j < n && src[j] !== quote) {
        if (src[j] === '\\') {
          const e = src[j + 1];
          if (e === 'n') out += '\n';
          else if (e === 't') out += '\t';
          else if (e === 'r') out += '\r';
          else if (e === '\\') out += '\\';
          else if (e === '"') out += '"';
          else if (e === "'") out += "'";
          else out += e;
          j += 2; continue;
        }
        if (src[j] === '\n') { line++; }
        out += src[j]; j++;
      }
      if (j >= n) throw new LangError('字符串未结束', line);
      push('str', out); i = j + 1; continue;
    }
    if (/[A-Za-z_\u4e00-\u9fa5]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_\u4e00-\u9fa5]/.test(src[j])) j++;
      const w = src.slice(i, j);
      push(KEYWORDS.has(w) ? 'kw' : 'ident', w);
      i = j; continue;
    }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||', '..'].includes(two)) { push('op', two); i += 2; continue; }
    if ('+-*/%<>=!(){}[],;.'.includes(c)) { push('op', c); i++; continue; }
    throw new LangError('无法识别的字符 ' + c, line);
  }
  push('eof', null);
  return toks;
}

class Parser {
  constructor(tokens) { this.t = tokens; this.i = 0; }
  peek(k = 0) { return this.t[Math.min(this.i + k, this.t.length - 1)]; }
  next() { return this.t[this.i++]; }
  at(type, value) {
    const t = this.peek();
    if (t.type !== type) return false;
    return value == null || t.value === value;
  }
  skipNl() { while (this.peek().type === 'nl') this.i++; }
  expect(type, value) {
    const t = this.next();
    if (t.type !== type || (value != null && t.value !== value)) {
      throw new LangError(`语法错误：期望 ${value ?? type}，实际为 ${t.value ?? t.type}`, t.line);
    }
    return t;
  }
  parseProgram() {
    const body = [];
    this.skipNl();
    while (this.peek().type !== 'eof') {
      body.push(this.parseStatement());
      this.skipNl();
      if (this.at('op', ';')) { this.next(); this.skipNl(); }
    }
    return body;
  }
  parseBlock() {
    this.skipNl();
    this.expect('op', '{');
    const body = [];
    this.skipNl();
    while (!this.at('op', '}')) {
      if (this.peek().type === 'eof') throw new LangError('缺少 }', this.peek().line);
      body.push(this.parseStatement());
      this.skipNl();
      if (this.at('op', ';')) { this.next(); this.skipNl(); }
    }
    this.expect('op', '}');
    return body;
  }
  parseStatement() {
    this.skipNl();
    const t = this.peek();
    if (t.type === 'kw') {
      if (t.value === 'let') {
        this.next();
        const nameTok = this.expect('ident');
        this.expect('op', '=');
        const expr = this.parseExpr();
        return { t: 'let', name: nameTok.value, expr, line: t.line };
      }
      if (t.value === 'set') {
        this.next();
        const target = this.parseLValue();
        this.expect('op', '=');
        const expr = this.parseExpr();
        return { t: 'set', target, expr, line: t.line };
      }
      if (t.value === 'if') return this.parseIf();
      if (t.value === 'while') return this.parseWhile();
      if (t.value === 'call') {
        this.next();
        const name = this.expect('ident').value;
        const args = this.parseArgs();
        return { t: 'expr', expr: { t: 'call', name, args, line: t.line }, line: t.line };
      }
      if (t.value === 'break') { this.next(); return { t: 'break', line: t.line }; }
      if (t.value === 'continue') { this.next(); return { t: 'continue', line: t.line }; }
    }
    if (t.type === 'ident') {
      const name = t.value;
      const save = this.i;
      this.next();
      if (this.at('op', '(')) {
        const args = this.parseArgs();
        return { t: 'expr', expr: { t: 'call', name, args, line: t.line }, line: t.line };
      }
      if (this.at('op', '=')) {
        this.next();
        const expr = this.parseExpr();
        return { t: 'set', target: { t: 'name', name }, expr, line: t.line };
      }
      this.i = save;
    }
    const expr = this.parseExpr();
    if (expr.t !== 'call') throw new LangError('这里需要一条语句（赋值、调用、if 或 while）', t.line);
    return { t: 'expr', expr, line: t.line };
  }
  parseLValue() {
    const t = this.peek();
    if (t.type === 'ident') {
      this.next();
      if (this.at('op', '[')) {
        this.next();
        const idx = this.parseExpr();
        this.expect('op', ']');
        return { t: 'index', name: t.value, idx, line: t.line };
      }
      return { t: 'name', name: t.value, line: t.line };
    }
    throw new LangError('这里需要变量名', t.line);
  }
  parseIf() {
    const t = this.expect('kw', 'if');
    const cond = this.parseExpr();
    const thenBody = this.parseBlock();
    let elseBody = [];
    this.skipNl();
    if (this.at('kw', 'else')) {
      this.next();
      this.skipNl();
      if (this.at('kw', 'if')) {
        const nested = this.parseIf();
        elseBody = [{ t: 'if', cond: nested.cond, then: nested.then, else: nested.else, line: nested.line }];
      } else elseBody = this.parseBlock();
    }
    return { t: 'if', cond, then: thenBody, else: elseBody, line: t.line };
  }
  parseWhile() {
    const t = this.expect('kw', 'while');
    const cond = this.parseExpr();
    const body = this.parseBlock();
    return { t: 'while', cond, body, line: t.line };
  }
  parseArgs() {
    this.expect('op', '(');
    const args = [];
    this.skipNl();
    if (!this.at('op', ')')) {
      do {
        args.push(this.parseExpr());
        this.skipNl();
      } while (this.at('op', ',') && this.next());
    }
    this.expect('op', ')');
    return args;
  }
  parseExpr() { return this.parseOr(); }
  parseOr() {
    let left = this.parseAnd();
    while (this.at('op', '||') || this.at('kw', 'or')) { const t = this.next(); const right = this.parseAnd(); left = { t: 'bin', op: '||', l: left, r: right, line: t.line }; }
    return left;
  }
  parseAnd() {
    let left = this.parseCmp();
    while (this.at('op', '&&') || this.at('kw', 'and')) { const t = this.next(); const right = this.parseCmp(); left = { t: 'bin', op: '&&', l: left, r: right, line: t.line }; }
    return left;
  }
  parseCmp() {
    let left = this.parseAdd();
    while (['==', '!=', '<', '>', '<=', '>='].includes(this.peek().value) && this.peek().type === 'op') {
      const t = this.next(); const right = this.parseAdd(); left = { t: 'bin', op: t.value, l: left, r: right, line: t.line };
    }
    return left;
  }
  parseAdd() {
    let left = this.parseMul();
    while ((this.at('op', '+') || this.at('op', '-')) && this.peek().type === 'op') {
      const t = this.next(); const right = this.parseMul(); left = { t: 'bin', op: t.value, l: left, r: right, line: t.line };
    }
    return left;
  }
  parseMul() {
    let left = this.parseUnary();
    while (['*', '/', '%'].includes(this.peek().value) && this.peek().type === 'op') {
      const t = this.next(); const right = this.parseUnary(); left = { t: 'bin', op: t.value, l: left, r: right, line: t.line };
    }
    return left;
  }
  parseUnary() {
    if (this.at('op', '-') || this.at('op', '!') || this.at('kw', 'not')) {
      const t = this.next(); const v = this.parseUnary(); return { t: 'un', op: t.value === 'not' ? '!' : t.value, v, line: t.line };
    }
    return this.parsePostfix();
  }
  parsePostfix() {
    let node = this.parsePrimary();
    while (true) {
      if (this.at('op', '[')) {
        const t = this.next();
        const idx = this.parseExpr();
        this.expect('op', ']');
        node = { t: 'index', obj: node, idx, line: t.line };
      } else if (this.at('op', '(') && node.t === 'name') {
        const t = this.peek();
        const args = this.parseArgs();
        node = { t: 'call', name: node.name, args, line: t.line };
      } else break;
    }
    return node;
  }
  parsePrimary() {
    const t = this.peek();
    if (t.type === 'num') { this.next(); return { t: 'num', v: t.value, line: t.line }; }
    if (t.type === 'str') { this.next(); return { t: 'str', v: t.value, line: t.line }; }
    if (t.type === 'kw' && (t.value === 'true' || t.value === 'false')) { this.next(); return { t: 'lit', v: t.value === 'true', line: t.line }; }
    if (t.type === 'kw' && t.value === 'nil') { this.next(); return { t: 'lit', v: null, line: t.line }; }
    if (t.type === 'ident') { this.next(); return { t: 'name', name: t.value, line: t.line }; }
    if (this.at('op', '(')) {
      this.next(); const e = this.parseExpr(); this.expect('op', ')'); return e;
    }
    if (this.at('op', '[')) {
      this.next();
      const items = [];
      this.skipNl();
      if (!this.at('op', ']')) {
        do { items.push(this.parseExpr()); this.skipNl(); } while (this.at('op', ',') && this.next());
      }
      this.expect('op', ']');
      return { t: 'array', items, line: t.line };
    }
    throw new LangError('无法解析的表达式，接近 ' + (t.value ?? t.type), t.line);
  }
}

export function parseProgram(src) {
  return new Parser(tokenize(src)).parseProgram();
}

// 编译为线性字节码；指令带源码行号，便于错误定位
export function compile(src) {
  const ast = parseProgram(src);
  const code = [];
  const emit = (op, ...args) => { const line = args.length && typeof args[args.length - 1] === 'number' ? args[args.length - 1] : 0; code.push({ op, args, line }); };
  const emitLine = (op, line, ...args) => code.push({ op, args, line });

  function compileExpr(node) {
    switch (node.t) {
      case 'num': emitLine('push', node.line, node.v); break;
      case 'str': emitLine('push', node.line, node.v); break;
      case 'lit': emitLine('push', node.line, node.v); break;
      case 'name': emitLine('load', node.line, node.name); break;
      case 'array':
        for (const it of node.items) compileExpr(it);
        emitLine('arr', node.line, node.items.length);
        break;
      case 'index':
        compileExpr(node.obj); compileExpr(node.idx); emitLine('index', node.line);
        break;
      case 'un':
        compileExpr(node.v); emitLine('un', node.line, node.op); break;
      case 'bin':
        if (node.op === '&&' || node.op === '||') {
          const short = node.op === '&&' ? 'jfalse' : 'jtrue';
          const end = code.length;
          compileExpr(node.l);
          emitLine(short, node.line, -1);
          compileExpr(node.r);
          code[end + 1].args[0] = code.length;
          break;
        }
        compileExpr(node.l); compileExpr(node.r); emitLine('bin', node.line, node.op);
        break;
      case 'call':
        for (const a of node.args) compileExpr(a);
        emitLine('call', node.line, node.name, node.args.length);
        break;
      default: throw new LangError('未知表达式', node.line);
    }
  }

  function compileStmts(list, out, breakStack, continueStack) {
    for (const st of list) compileStmt(st, out, breakStack, continueStack);
  }
  function compileStmt(st, out, breakStack, continueStack) {
    switch (st.t) {
      case 'let':
        compileExpr(st.expr); emitLine('store', st.line, st.name); break;
      case 'set':
        if (st.target.t === 'name') { compileExpr(st.expr); emitLine('store', st.line, st.target.name); }
        else if (st.target.t === 'index') {
          compileExpr({ t: 'name', name: st.target.name, line: st.line });
          compileExpr(st.target.idx);
          compileExpr(st.expr);
          emitLine('setindex', st.line);
        } else throw new LangError('无法赋值', st.line);
        break;
      case 'expr':
        compileExpr(st.expr); emitLine('pop', st.line); break;
      case 'if': {
        compileExpr(st.cond);
        const jf = code.length; emitLine('jumpf', st.line, -1);
        compileStmts(st.then, out, breakStack, continueStack);
        if (st.else && st.else.length) {
          const j = code.length; emitLine('jump', st.line, -1);
          code[jf].args[0] = code.length;
          compileStmts(st.else, out, breakStack, continueStack);
          code[j].args[0] = code.length;
        } else code[jf].args[0] = code.length;
        break;
      }
      case 'while': {
        const start = code.length;
        compileExpr(st.cond);
        const jf = code.length; emitLine('jumpf', st.line, -1);
        breakStack.push(-1); continueStack.push(start);
        compileStmts(st.body, out, breakStack, continueStack);
        breakStack.pop(); continueStack.pop();
        emitLine('jump', st.line, start);
        code[jf].args[0] = code.length;
        if (breakStack.length === 0) { /* noop */ }
        // 回填 break 目标
        for (let k = start; k < code.length; k++) {
          if (code[k].op === 'jump' && code[k].args[0] === -1 && code[k].line === st.line + 1) { /* not reliable */ }
        }
        break;
      }
      case 'break':
        if (!breakStack.length) throw new LangError('break 不在循环中', st.line);
        emitLine('jump', st.line, -1); breakStack[breakStack.length - 1] = { at: code.length - 1 };
        break;
      case 'continue':
        if (!continueStack.length) throw new LangError('continue 不在循环中', st.line);
        emitLine('jump', st.line, continueStack[continueStack.length - 1]); break;
      default: throw new LangError('未知语句', st.line);
    }
  }

  // 使用带标签的跳转修复：重新实现一遍循环以便正确回填
  const code2 = [];
  const emit2 = (op, line, ...args) => code2.push({ op, args, line });
  function ce(node) {
    switch (node.t) {
      case 'num': case 'str': case 'lit': emit2('push', node.line, node.v); break;
      case 'name': emit2('load', node.line, node.name); break;
      case 'array': node.items.forEach(ce); emit2('arr', node.line, node.items.length); break;
      case 'index': ce(node.obj); ce(node.idx); emit2('index', node.line); break;
      case 'un': ce(node.v); emit2('un', node.line, node.op); break;
      case 'bin':
        if (node.op === '&&' || node.op === '||') {
          const short = node.op === '&&' ? 'jfalse' : 'jtrue';
          ce(node.l);
          const idx = code2.length; emit2(short, node.line, -1);
          ce(node.r);
          code2[idx].args[0] = code2.length;
        } else { ce(node.l); ce(node.r); emit2('bin', node.line, node.op); }
        break;
      case 'call': node.args.forEach(ce); emit2('call', node.line, node.name, node.args.length); break;
      default: throw new LangError('未知表达式', node.line);
    }
  }
  function cs(list, breaks, continues) {
    for (const st of list) cst(st, breaks, continues);
  }
  function cst(st, breaks, continues) {
    switch (st.t) {
      case 'let': ce(st.expr); emit2('store', st.line, st.name); break;
      case 'set':
        if (st.target.t === 'name') { ce(st.expr); emit2('store', st.line, st.target.name); }
        else { ce({ t: 'name', name: st.target.name, line: st.line }); ce(st.target.idx); ce(st.expr); emit2('setindex', st.line); }
        break;
      case 'expr': ce(st.expr); emit2('pop', st.line); break;
      case 'if': {
        ce(st.cond);
        const jf = code2.length; emit2('jumpf', st.line, -1);
        cs(st.then, breaks, continues);
        if (st.else && st.else.length) {
          const j = code2.length; emit2('jump', st.line, -1);
          code2[jf].args[0] = code2.length;
          cs(st.else, breaks, continues);
          code2[j].args[0] = code2.length;
        } else code2[jf].args[0] = code2.length;
        break;
      }
      case 'while': {
        const start = code2.length;
        ce(st.cond);
        const jf = code2.length; emit2('jumpf', st.line, -1);
        const b = []; const c = [start];
        cs(st.body, b, c);
        emit2('jump', st.line, start);
        const end = code2.length;
        code2[jf].args[0] = end;
        for (const bi of b) code2[bi].args[0] = end;
        break;
      }
      case 'break': { const idx = code2.length; emit2('jump', st.line, -1); breaks.push(idx); break; }
      case 'continue': emit2('jump', st.line, continues[continues.length - 1]); break;
      default: throw new LangError('未知语句', st.line);
    }
  }
  cs(ast, [], []);
  emit2('halt', 0);
  return { code: code2, source: src, ast };
}

function typeName(v) {
  if (v === null) return 'nil';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}
function toNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v);
  return 0;
}

export class Process {
  constructor(sys, name, source, program, opts = {}) {
    this.sys = sys;
    this.id = opts.id ?? sys.nextPid();
    this.name = name || 'program';
    this.source = source;
    this.program = program;
    this.pc = 0;
    this.stack = [];
    this.vars = {};
    this.state = 'ready';
    this.error = null;
    this.quota = opts.quota ?? 1200;
    this.usedTotal = 0;
    this.usedStep = 0;
    this.wakeAt = 0;
    this.waitKind = null;
    this.inbox = [];
    this.pending = null;
    this.pendingPush;
    this.wakePushSet = false;
    this.wakePush = 0;
    this.serviceReq = 0;
    this.serviceValue;
    this.output = [];
    this.type = opts.type || 'program';
    this.meta = opts.meta || {};
    this.yieldFlag = false;
    this.startedAt = sys.clock;
    this.finishedAt = null;
    this.mem = 0;
    this.lines = 0;
    this.lastError = null;
  }
  get done() { return this.state === 'finished'; }
  log(text) {
    const line = `[${this.name}] ${text}`;
    this.output.push(line);
    if (this.output.length > 80) this.output.shift();
    if (this.sys && this.sys.onProcessLog) this.sys.onProcessLog(this, text);
  }
  errorThrow(msg, line) {
    this.state = 'error';
    this.error = `${msg}${line ? ' (第 ' + line + ' 行)' : ''}`;
    this.lastError = this.error;
    this.log('错误：' + this.error);
    if (this.sys && this.sys.onProcessError) this.sys.onProcessError(this);
  }
  estimateMem() {
    let m = 64 + JSON.stringify(this.vars || {}).length + (this.source ? this.source.length : 0) + (this.stack ? this.stack.length * 8 : 0);
    return m;
  }
  runBudget(budget, sys) {
    if (this.state !== 'ready') return 0;
    if (this.pendingPush !== undefined) {
      if (sys.debugService) console.log('DBG push pending', this.name, this.pendingPush, 'pc', this.pc);
      this.stack.push(this.pendingPush);
      this.pendingPush = undefined;
    }
    let used = 0;
    const code = this.program.code;
    const limit = Math.min(budget, Math.max(0, this.quota - this.usedStep));
    while (used < limit) {
      if (this.pc >= code.length) { this.state = 'finished'; this.finishedAt = sys.clock; break; }
      const ins = code[this.pc];
      this.pc++;
      let cost = 1;
      try {
        const op = ins.op;
        switch (op) {
          case 'push': this.stack.push(ins.args[0]); break;
          case 'load': {
            const name = ins.args[0];
            if (!(name in this.vars)) throw new LangError(`变量 ${name} 未定义`, ins.line);
            this.stack.push(this.vars[name]);
            break;
          }
          case 'store': {
            const v = this.stack.pop();
            if (sys.debugService) console.log('DBG store', this.name, ins.args[0], v);
            this.vars[ins.args[0]] = v;
            break;
          }
          case 'pop': this.stack.pop(); break;
          case 'arr': {
            const n = ins.args[0];
            const start = this.stack.length - n;
            const arr = this.stack.splice(start, n);
            this.stack.push(arr);
            cost += Math.floor(n / 8);
            break;
          }
          case 'index': {
            const idx = this.stack.pop();
            const obj = this.stack.pop();
            if (obj == null) throw new LangError('无法对空值取索引', ins.line);
            if (Array.isArray(obj)) {
              const i = Math.trunc(toNum(idx));
              if (i < 0 || i >= obj.length) throw new LangError(`数组下标 ${i} 越界（长度 ${obj.length}）`, ins.line);
              this.stack.push(obj[i]);
            } else if (typeof obj === 'string') {
              this.stack.push(obj[Math.trunc(toNum(idx))] ?? '');
            } else throw new LangError('该值不支持索引', ins.line);
            break;
          }
          case 'setindex': {
            const val = this.stack.pop();
            const idx = this.stack.pop();
            const obj = this.stack.pop();
            if (!Array.isArray(obj)) throw new LangError('只能修改数组成员', ins.line);
            const i = Math.trunc(toNum(idx));
            if (i < 0 || i >= obj.length) throw new LangError(`数组下标 ${i} 越界（长度 ${obj.length}）`, ins.line);
            obj[i] = val;
            break;
          }
          case 'un': {
            const v = this.stack.pop();
            if (ins.args[0] === '-') this.stack.push(-toNum(v));
            else if (ins.args[0] === '!') this.stack.push(!v);
            break;
          }
          case 'bin': {
            const b = this.stack.pop();
            const a = this.stack.pop();
            const o = ins.args[0];
            switch (o) {
              case '+':
                if (typeof a === 'string' || typeof b === 'string') {
                  const s = String(a) + String(b);
                  cost += Math.ceil(s.length / 12);
                  this.stack.push(s);
                } else this.stack.push(toNum(a) + toNum(b));
                break;
              case '-': this.stack.push(toNum(a) - toNum(b)); break;
              case '*': this.stack.push(toNum(a) * toNum(b)); break;
              case '/': {
                if (toNum(b) === 0) throw new LangError('除数为零', ins.line);
                this.stack.push(toNum(a) / toNum(b));
                break;
              }
              case '%': {
                if (toNum(b) === 0) throw new LangError('取模的除数为零', ins.line);
                this.stack.push(toNum(a) % toNum(b));
                break;
              }
              case '==': this.stack.push(a === b || (typeof a === 'number' && typeof b === 'number' && a === b)); break;
              case '!=': this.stack.push(!(a === b)); break;
              case '<': this.stack.push(toNum(a) < toNum(b)); break;
              case '>': this.stack.push(toNum(a) > toNum(b)); break;
              case '<=': this.stack.push(toNum(a) <= toNum(b)); break;
              case '>=': this.stack.push(toNum(a) >= toNum(b)); break;
              case '&&': this.stack.push(!!a && !!b); break;
              case '||': this.stack.push(!!a || !!b); break;
              default: throw new LangError('未知运算符 ' + o, ins.line);
            }
            break;
          }
          case 'jump': this.pc = ins.args[0]; break;
          case 'jumpf': {
            const v = this.stack.pop();
            if (!v) this.pc = ins.args[0];
            break;
          }
          case 'jfalse': {
            const v = this.stack.pop();
            if (!v) this.pc = ins.args[0];
            else this.stack.push(true);
            break;
          }
          case 'jtrue': {
            const v = this.stack.pop();
            if (v) this.pc = ins.args[0];
            else this.stack.push(false);
            break;
          }
          case 'call': {
            const name = ins.args[0], argc = ins.args[1];
            const args = argc ? this.stack.splice(this.stack.length - argc, argc) : [];
            const r = sys.syscall(name, args, this);
            if (sys.debugService && (name === 'service' || name === 'service_reply')) console.log('DBG call', this.name, name, JSON.stringify(args), '->', JSON.stringify(r));
            if (r && r.block) {
              const b = r.block;
              if (b.kind === 'msg') { this.state = 'waiting'; this.waitKind = 'msg'; }
              else if (b.kind === 'service') {
                this.state = 'waiting'; this.waitKind = 'service';
                if (sys.pendingServices) sys.pendingServices.set(this.id, { proc: this, req: this.serviceReq });
              } else { this.state = 'waiting'; this.waitKind = 'time'; this.wakeAt = b.wakeAt; }
              break;
            }
            const val = r ? r.value : null;
            this.stack.push(val);
            if (r && r.cost) cost += r.cost;
            break;
          }
          case 'halt': this.state = 'finished'; break;
          default: throw new LangError('未知指令 ' + op, ins.line);
        }
      } catch (e) {
        if (e instanceof LangError) {
          this.errorThrow(e.message, e.line || ins.line);
          return used;
        }
        this.errorThrow('运行时错误：' + (e && e.message ? e.message : String(e)), ins.line);
        return used;
      }
      used += cost;
      this.usedStep += cost;
      this.usedTotal += cost;
      if (this.state !== 'ready') break;
      if (this.yieldFlag) { this.yieldFlag = false; break; }
    }
    this.mem = Math.max(this.mem, this.estimateMem());
    return used;
  }
  toSnapshot() {
    return {
      id: this.id, name: this.name, source: this.source, pc: this.pc,
      stack: this.stack, vars: this.vars, state: this.state, error: this.error,
      quota: this.quota, usedTotal: this.usedTotal, wakeAt: this.wakeAt, waitKind: this.waitKind,
      type: this.type, meta: this.meta, output: this.output.slice(-40), mem: this.mem,
      inbox: this.inbox
    };
  }
}

export class Builtins {
  static call(name, args, proc, sys) {
    const A = args;
    switch (name) {
      case 'len': return { value: A[0] == null ? 0 : (A[0].length ?? String(A[0]).length) };
      case 'str': return { value: A[0] == null ? '' : String(A[0]) };
      case 'num': return { value: toNum(A[0]) };
      case 'abs': return { value: Math.abs(toNum(A[0])) };
      case 'floor': return { value: Math.floor(toNum(A[0])) };
      case 'ceil': return { value: Math.ceil(toNum(A[0])) };
      case 'round': return { value: Math.round(toNum(A[0])) };
      case 'min': return { value: Math.min(...A.map(toNum)) };
      case 'max': return { value: Math.max(...A.map(toNum)) };
      case 'sqrt': return { value: Math.sqrt(Math.max(0, toNum(A[0]))) };
      case 'sin': return { value: Math.sin(toNum(A[0])) };
      case 'cos': return { value: Math.cos(toNum(A[0])) };
      case 'atan2': return { value: Math.atan2(toNum(A[0]), toNum(A[1])) };
      case 'pi': return { value: Math.PI };
      case 'substr': {
        const s = String(A[0] ?? ''); const a = Math.trunc(toNum(A[1])); const b = A.length > 2 ? Math.trunc(toNum(A[2])) : undefined;
        return { value: b === undefined ? s.slice(a) : s.slice(a, a + b) };
      }
      case 'split': return { value: String(A[0] ?? '').split(String(A[1] ?? ',')) };
      case 'join': return { value: (A[0] || []).join(String(A[1] ?? ',')) };
      case 'indexof': return { value: (A[0] || []).indexOf(A[1]) };
      case 'print': proc.log(A.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(' ')); return { value: 1 };
      case 'clock': return { value: sys.clock };
      default: return null;
    }
  }
}