/* OSL 解释器 v4 —— 显式帧栈，任意复合语句/函数调用均可在深处挂起并序列化续跑。
 *
 * 帧类型：
 *   main/function 帧：顺序执行 body；function 帧带 ret {toFrame, var, resumePc}
 *   block 帧：if/when 等分支体；结束后父帧 pc 跳过该复合语句
 *   loop 帧：while/repeat/foreach；一轮 body 跑完后按迭代状态决定再来一轮或弹出
 *
 * 系统调用形式（唯一挂起点）：
 *   (set V (sys name a...))   挂起；宿主完成后续跑同语句，结果存入 V
 *   (sleep ms) (wait-msg [timeout]) (yield)
 * 挂起时整条帧栈（含各帧 pc、作用域、循环迭代状态）可 JSON 序列化。
 */
'use strict';
window.NOS = window.NOS || {};

const BUILTINS = new Set([
  '+', '-', '*', '/', '%', 'mod', '=', '==', '!=', '<', '>', '<=', '>=',
  'and', 'or', 'not', 'neg',
  'list', 'dict', 'get', 'set-key!', 'in?', 'keys', 'values', 'len', 'append!',
  'pop!', 'slice', 'concat', 'str', 'num', 'bool', 'round', 'floor', 'ceil',
  'abs', 'min', 'max', 'pow', 'sqrt', 'sin', 'cos', 'atan2',
  'print', 'substr', 'index-of', 'split', 'join', 'replace', 'upper', 'lower',
  'type-of', 'equal?', 'quote', 'sum-list', 'number?', 'string?', 'list?',
  'nil?', 'to-json', 'from-json', 'format', 'char-code', 'code-char', 'sort!',
  'clamp', 'lerp', 'bit-and', 'bit-or', 'bit-xor', 'shl', 'shr',
  'random-float', 'random-int', 'hash-str', 'list-range', 'find-first',
  'array-fill', 'assert',
]);

class VMError extends Error { constructor(m) { super(m); this.name = 'VMError'; } }

function num(v) { if (typeof v === 'number') return v; if (v === null || v === undefined || v === '') return 0; const n = Number(v); if (Number.isNaN(n)) throw new VMError('需要数字，得到: ' + JSON.stringify(v)); return n; }
function truthy(v) { return !(v === false || v === null || v === undefined || v === 0 || v === ''); }
function deepEq(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(k => deepEq(a[k], b[k]));
  }
  return false;
}
function strVal(v) { if (v === null || v === undefined) return 'nil'; if (typeof v === 'object') return JSON.stringify(v); return String(v); }
const headOf = n => (n && n[0] && n[0].sym) ? n[0].sym : (n && n[0]);
const symOf = n => (n && n.sym) ? n.sym : n;
/* 多语句体：单条语句直接放；多条语句用 (begin ...) 包裹 */
function stmtsOf(node) {
  if (node === undefined || node === null) return [];
  if (!Array.isArray(node)) return [node];
  return headOf(node) === 'begin' ? node.slice(1) : [node];
}
/* 把语法里的“语句位置数组”（循环体等）转成语句列表：
   数组里每个元素都是一条语句 */
function bodyList(arr) { return arr.slice(); }

class VM {
  constructor(prog, hostCall, opts) {
    this.prog = prog;            // {id, compiled:{ast,defs}}
    this.hostCall = hostCall;    // (name,args,vm) => 由内核宿主处理
    this.opts = opts || {};
    this.state = 'ready';        // ready | running | waiting | done | error
    this.totalUsed = 0;
    this.error = null;
    this.resultValue = null;
    this.frames = [];
    this.globalScope = {};
    this.rngState = (opts && opts.rngState) || (Math.random() * 1e9 | 0) || 1;
    this._budget = Infinity;
    this._used = 0;
    this.wait = null;            // {seq, ctx, retVar|null}
    this._waitSeq = 0;
    this._sysReturn = null;      // {seq, value}
  }

  start(entry, args) {
    const c = this.prog.compiled;
    let body, params = [];
    if (entry && c.defs[entry]) { body = c.defs[entry].body; params = c.defs[entry].params; }
    else if (entry && c.defs['__def_' + entry]) { body = c.defs['__def_' + entry].body; }
    else body = c.ast.filter(f => { const h = headOf(f); return h !== 'defn' && h !== 'def'; });
    const scope = {};
    params.forEach((p, i) => scope[p] = args ? (args[i] === undefined ? null : args[i]) : null);
    this.frames = [this._fnFrame(entry || '__main__', body, [scope], [this.globalScope, scope], null)];
    this.frames[0].kind = 'main';
    this.state = 'running';
  }

  _fnFrame(fn, body, ownScopes, chain, ret) {
    return { kind: 'fn', fn, body, pc: 0, own: ownScopes, chain, ret, loopsDone: 0 };
  }

  serialize() {
    return {
      progId: this.prog.id, state: this.state === 'running' ? 'ready' : this.state,
      totalUsed: this.totalUsed, error: this.error, resultValue: this.resultValue,
      frames: this.frames, globalScope: this.globalScope, rngState: this.rngState,
      wait: this.wait, _waitSeq: this._waitSeq
    };
  }

  static restore(data, prog, hostCall, opts) {
    const vm = new VM(prog, hostCall, opts);
    vm.state = data.state; vm.totalUsed = data.totalUsed || 0;
    vm.error = data.error; vm.resultValue = data.resultValue;
    vm.frames = data.frames || []; vm.globalScope = data.globalScope || {};
    vm.rngState = data.rngState || 1; vm.wait = data.wait || null;
    vm._waitSeq = data._waitSeq || 0;
    return vm;
  }

  charge(n) {
    this._used += n; this.totalUsed += n;
    if (this._used >= this._budget) { const e = new VMError('BUDGET'); e.budget = true; throw e; }
  }

  lookup(name) {
    const f = this.frames[this.frames.length - 1];
    for (const s of f.chain) if (Object.prototype.hasOwnProperty.call(s, name)) return s[name];
    if (name === 'PI') return Math.PI;
    throw new VMError('未定义变量: ' + name);
  }

  assign(name, v) {
    const f = this.frames[this.frames.length - 1];
    for (const s of f.chain) if (Object.prototype.hasOwnProperty.call(s, name)) { s[name] = v; return; }
    f.own[f.own.length - 1][name] = v;
  }

  runStep(budget) {
    if (this.state === 'done' || this.state === 'error' || this.state === 'waiting') return this.state;
    this._budget = budget; this._used = 0;
    this.state = 'running';
    try {
      let guard = 0;
      while (this.state === 'running') {
        if (++guard > 30_000_000) throw new VMError('单步保护');
        const f = this.frames[this.frames.length - 1];
        if (!f) { this.state = 'done'; break; }
        if (f.pc >= f.body.length) { this.finishFrame(f, null); continue; }
        this.exec(f.body[f.pc], f);
      }
    } catch (e) {
      if (e && e.budget) this.state = 'ready';
      else if (e && e.waitSignal) this.state = 'waiting';
      else { this.state = 'error'; this.error = e.message || String(e); }
    }
    return this.state;
  }

  finishFrame(f, value) {
    if (f.kind === 'main') { this.frames.pop(); this.state = 'done'; this.resultValue = value === undefined ? null : value; return; }
    if (f.kind === 'fn') {
      const ret = value === undefined ? (f.__retVal === undefined ? null : f.__retVal) : value;
      this.frames.pop();
      if (!this.frames.length) { this.state = 'done'; this.resultValue = ret; return; }
      const caller = this.frames[f.ret.frameIdx] || this.frames[this.frames.length - 1];
      if (f.ret.var) caller.own[caller.own.length - 1][f.ret.var] = ret;
      caller.pc = f.ret.resumePc;
      return;
    }
    if (f.kind === 'block') {
      this.frames.pop();
      const parent = this.frames[f.parentIdx];
      parent.pc = f.resumePc;
      return;
    }
    if (f.kind === 'loop') {
      // body 一轮跑完
      this.advanceLoop(f);
      return;
    }
    this.frames.pop();
  }

  advanceLoop(f) {
    const L = f.loop;
    if (L.kind === 'while') {
      const parent = this.frames[f.parentIdx];
      if (truthy(this.evalIn(L.cond, parent))) { f.pc = 0; }
      else { this.frames.pop(); parent.pc = L.stmtPc + 1; }
    } else if (L.kind === 'repeat') {
      L.i++;
      if (L.i < L.total) { f.own[0].i = L.i; f.pc = 0; }
      else { this.frames.pop(); this.frames[f.parentIdx].pc = L.stmtPc + 1; }
    } else if (L.kind === 'foreach') {
      L.i++;
      if (L.i < L.arr.length) { f.own[0][L.vn] = L.arr[L.i]; f.pc = 0; }
      else { this.frames.pop(); this.frames[f.parentIdx].pc = L.stmtPc + 1; }
    }
  }

  evalIn(node, frame) {
    // 在指定帧的词法链中求值表达式（循环条件在父帧作用域中）
    const top = this.frames[this.frames.length - 1];
    const saved = null;
    // 临时：直接用 frame.chain 构造查值 —— 通过交换帧位置太重；改为支持求值参数 frame
    return this._eval(node, frame);
  }

  exec(node, f) {
    if (node === null || typeof node !== 'object' || typeof node === 'string' || !Array.isArray(node)) { f.pc++; return; }
    const h = headOf(node);
    this.charge(1);

    switch (h) {
      case 'set': case 'set-global': {
        const name = symOf(node[1]);
        const expr = node[2];
        if (Array.isArray(expr) && headOf(expr) === 'sys') {
          // 挂起点续跑
          if (this._sysReturn && this.wait && this.wait.seq === this._sysReturn.seq && this.wait.pc === f.pc && this.wait.frameIdx === this.frames.length - 1) {
            const r = this._sysReturn.value;
            if (h === 'set-global') this.globalScope[name] = r; else this.assign(name, r);
            this._sysReturn = null; this.wait = null; f.pc++;
            return;
          }
          const sysName = symOf(expr[1]);
          const args = expr.slice(2).map(a => this._eval(a, f));
          this.suspend({ type: 'syscall', name: sysName, args }, f, name);
          return;
        }
        const v = this._eval(expr, f);
        if (h === 'set-global') this.globalScope[name] = v; else this.assign(name, v);
        f.pc++; return;
      }
      case 'defn': case 'def': f.pc++; return;
      case 'if': case 'when': case 'unless': {
        const c = truthy(this._eval(node[1], f));
        const go = h === 'unless' ? !c : c;
        if (go && node[2] !== undefined) this.pushBlock(node[2], f);
        else if (!go && node[3] !== undefined) this.pushBlock(node[3], f);
        else f.pc++;
        return;
      }
      case 'while': {
        if (truthy(this._eval(node[1], f))) {
          const idx = this.frames.length - 1;
          this.frames.push({
            kind: 'loop', body: node.slice(2), pc: 0, own: [{}], chain: null,
            parentIdx: idx, loop: { kind: 'while', cond: node[1], stmtPc: f.pc }
          });
          this._buildChain(this.frames[this.frames.length - 1]);
        } else f.pc++;
        return;
      }
      case 'repeat': {
        const total = num(this._eval(node[1], f)) | 0;
        const idx = this.frames.length - 1;
        this.frames.push({
          kind: 'loop', body: node.slice(2), pc: total > 0 ? 0 : -1, own: [{ i: 0 }], chain: null,
          parentIdx: idx, loop: { kind: 'repeat', total, i: 0, stmtPc: f.pc }
        });
        this._buildChain(this.frames[this.frames.length - 1]);
        if (total <= 0) { this.frames.pop(); f.pc++; }
        return;
      }
      case 'foreach': {
        const vn = symOf(node[1]);
        const arr = this._eval(node[2], f) || [];
        const idx = this.frames.length - 1;
        this.frames.push({
          kind: 'loop', body: node.slice(3), pc: 0, own: [{ [vn]: arr[0] }], chain: null,
          parentIdx: idx, loop: { kind: 'foreach', vn, arr: arr.slice(), i: 0, stmtPc: f.pc }
        });
        this._buildChain(this.frames[this.frames.length - 1]);
        if (!arr.length) { this.frames.pop(); f.pc++; }
        return;
      }
      case 'do': case 'call': {
        // (do V (f a...))
        const retVar = symOf(node[1]);
        const callExpr = node[2];
        const fnName = headOf(callExpr);
        const args = callExpr.slice(1).map(a => this._eval(a, f));
        this.invokeDef(fnName, args, f, retVar);
        return;
      }
      case 'return': {
        const v = node.length > 1 ? this._eval(node[1], f) : null;
        let fnIdx = -1;
        for (let i = this.frames.length - 1; i >= 0; i--) {
          if (this.frames[i].kind === 'fn' || this.frames[i].kind === 'main') { fnIdx = i; break; }
        }
        if (fnIdx < 0) { this.state = 'done'; return; }
        const fnFrame = this.frames[fnIdx];
        if (fnFrame.kind === 'main') { this.frames.length = fnIdx; this.state = 'done'; this.resultValue = v; return; }
        if (fnFrame.pureCall) {
          // 表达式位置同步调用：只弹出函数帧及其内部帧；调用点的 block/表达式由 evalPure 收尾
          fnFrame.__retVal = v;
          this.frames.length = fnIdx + 1;
          this.frames.pop();
          this._pureValue = v;
          return;
        }
        const ret = fnFrame.ret;
        this.frames.length = fnIdx;
        if (ret && ret.frameIdx < this.frames.length) {
          const caller = this.frames[ret.frameIdx];
          if (ret.var) caller.own[caller.own.length - 1][ret.var] = v;
          caller.pc = ret.resumePc;
        } else { this.state = 'done'; this.resultValue = v; }
        return;
      }
      case 'sleep': case 'wait-ms': {
        if (this.consumeWait(f)) return;
        const ms = num(this._eval(node[1], f));
        this.suspend({ type: 'time', ms: Math.max(0, ms) }, f, null);
        return;
      }
      case 'wait-msg': {
        if (this.consumeWait(f, '__msg')) return;
        const timeout = node[1] ? num(this._eval(node[1])) : null;
        this.suspend({ type: 'msg', timeout: timeout == null ? null : Math.max(0, timeout) }, f, '__msg');
        return;
      }
      case 'yield': {
        if (this.consumeWait(f)) return;
        this.suspend({ type: 'yield' }, f, null);
        return;
      }
      default: {
        this._eval(node, f);
        f.pc++;
      }
    }
  }

  consumeWait(f, msgVar) {
    if (this._sysReturn && this.wait && this.wait.seq === this._sysReturn.seq && this.wait.pc === f.pc && this.wait.frameIdx === this.frames.length - 1) {
      if (this.wait.ctx.type === 'msg') {
        f.own[f.own.length - 1][msgVar || this.wait.retVar || '__msg'] = this._sysReturn.value;
      }
      this._sysReturn = null; this.wait = null; f.pc++;
      return true;
    }
    return false;
  }

  suspend(ctx, f, retVar) {
    const seq = ++this._waitSeq;
    this.wait = { seq, ctx, retVar, pc: f.pc, frameIdx: this.frames.length - 1 };
    this.state = 'waiting';
    const e = new VMError('wait'); e.waitSignal = true; throw e;
  }

  resume(value) {
    if (this.state !== 'waiting' || !this.wait) return;
    this._sysReturn = { seq: this.wait.seq, value };
    this.state = 'ready';
  }

  resumeError(err) {
    if (this.state !== 'waiting' || !this.wait) return;
    this._sysReturn = { seq: this.wait.seq, value: { __error: String((err && err.message) || err) } };
    this.state = 'ready';
  }

  pushBlock(blockNode, f) {
    // 一条语句：直接当作该语句；多条语句必须用 (begin ...) 包裹
    let stmts;
    if (Array.isArray(blockNode)) {
      stmts = headOf(blockNode) === 'begin' ? blockNode.slice(1) : [blockNode];
    } else stmts = [blockNode];
    const idx = this.frames.length - 1;
    this.frames.push({ kind: 'block', body: stmts, pc: 0, own: [{}], chain: null, parentIdx: idx, resumePc: f.pc + 1 });
    this._buildChain(this.frames[this.frames.length - 1]);
  }

  invokeDef(fnName, args, callerF, retVar) {
    const def = this.prog.compiled.defs[fnName] || this.prog.compiled.defs['__def_' + fnName];
    if (!def) throw new VMError('未定义函数: ' + fnName);
    const scope = {};
    def.params.forEach((p, i) => scope[p] = args[i] === undefined ? null : args[i]);
    const idx = this.frames.length - 1;
    const nf = {
      kind: 'fn', fn: fnName, body: def.body, pc: 0,
      own: [scope], chain: null,
      ret: { frameIdx: idx, var: retVar || null, resumePc: callerF.pc + 1 }
    };
    nf.chain = [this.globalScope, scope];
    this.frames.push(nf);
  }

  _buildChain(frame) {
    const parent = this.frames[frame.parentIdx];
    frame.chain = frame.own.concat(parent.chain);
  }

  eval(node) { return this._eval(node, this.frames[this.frames.length - 1]); }

  _eval(node, f) {
    if (node === null) return null;
    const t = typeof node;
    if (t === 'number' || t === 'boolean') return node;
    if (t === 'string') return node;
    if (!Array.isArray(node)) { if (t === 'object' && node.sym) return this._lookup(node.sym, f); return node; }
    return this._evalList(node, f);
  }

  _lookup(name, f) {
    for (const s of f.chain) if (Object.prototype.hasOwnProperty.call(s, name)) return s[name];
    if (name === 'true') return true;
    if (name === 'false') return false;
    if (name === 'nil' || name === 'null') return null;
    if (name === 'PI') return Math.PI;
    throw new VMError('未定义变量: ' + name);
  }

  _evalList(list, f) {
    const h = headOf(list);
    this.charge(1);
    if (h === 'quote') return this.fromLiteral(list[1]);
    if (h === 'begin') { let v = null; for (let i = 1; i < list.length; i++) v = this._eval(list[i], f); return v; }
    if (h === 'if') return truthy(this._eval(list[1], f)) ? this._eval(list[2], f) : (list[3] ? this._eval(list[3], f) : null);
    if (h === 'when') return truthy(this._eval(list[1], f)) ? this._eval(list[2], f) : null;
    if (h === 'unless') return !truthy(this._eval(list[1], f)) ? this._eval(list[2], f) : null;
    if (h === 'and') { for (let i = 1; i < list.length; i++) if (!truthy(this._eval(list[i], f))) return false; return true; }
    if (h === 'or') { for (let i = 1; i < list.length; i++) { const v = this._eval(list[i], f); if (truthy(v)) return v; } return false; }
    if (h === 'lambda' || h === 'fn') {
      return { __lambda: true, params: list[1].map(symOf), body: list.slice(2), closure: f.chain.map(s => ({ ...s })) };
    }
    if (h === 'sys') throw new VMError('系统调用必须写成 (set V (sys ...)) 或等待语句');
    const args = list.slice(1).map(a => this._eval(a, f));
    if (BUILTINS.has(h)) return this.callBuiltin(h, args);
    const def = this.prog.compiled.defs[h] || this.prog.compiled.defs['__def_' + h];
    if (def) {
      // 表达式位置的纯函数调用：同步运行（函数内不允许挂起）。
      return this.evalPure(def, args, f, h);
    }
    let lv = null;
    try { lv = this._lookup(h, f); } catch (e) {}
    if (lv && lv.__lambda) return this.evalPureLambda(lv, args, f);
    throw new VMError('未定义函数: ' + h);
  }

  evalPure(def, args, callerF, name) {
    const depth0 = this.frames.length;
    this.invokeDef(name, args, callerF, '__pureRet');
    const nf = this.frames[depth0];
    nf.pureCall = true;
    let guard = 0;
    while (this.frames.length > depth0) {
      if (++guard > 20_000_000) throw new VMError('调用保护');
      this._pureValue = undefined;
      const beforeLen = this.frames.length;
      const top = this.frames[this.frames.length - 1];
      if (top.pc >= top.body.length) {
        if (top === nf) { this.frames.pop(); return top.__retVal === undefined ? null : top.__retVal; }
        this.finishFrame(top, null);
        continue;
      }
      this.exec(top.body[top.pc], top);
      if (this.state === 'waiting') {
        this.state = 'error';
        throw new VMError('函数 ' + name + ' 含有等待操作，请用 (do V (' + name + ' ...)) 语句形式调用');
      }
      if (this._pureValue !== undefined && this.frames.length < beforeLen) {
        const v = this._pureValue; this._pureValue = undefined; return v;
      }
    }
    return null;
  }

  evalPureLambda(lv, args, callerF) {
    const scope = {};
    lv.params.forEach((p, i) => scope[p] = args[i] === undefined ? null : args[i]);
    const depth0 = this.frames.length;
    this.frames.push({
      kind: 'fn', fn: '<lambda>', body: lv.body, pc: 0, own: [scope],
      chain: lv.closure.concat([scope]),
      ret: { frameIdx: depth0 - 1, var: null, resumePc: callerF.pc }, pureCall: true, isLambda: true
    });
    let guard = 0;
    while (this.frames.length > depth0) {
      if (++guard > 20_000_000) throw new VMError('调用保护');
      this._pureValue = undefined;
      const beforeLen = this.frames.length;
      const top = this.frames[this.frames.length - 1];
      if (top.pc >= top.body.length) { this.frames.pop(); return top.__retVal === undefined ? null : top.__retVal; }
      this.exec(top.body[top.pc], top);
      if (this.state === 'waiting') { this.state = 'error'; throw new VMError('lambda 内不允许等待操作'); }
      if (this._pureValue !== undefined && this.frames.length < beforeLen) {
        const v = this._pureValue; this._pureValue = undefined; return v;
      }
    }
    return null;
  }

  fromLiteral(node) {
    if (Array.isArray(node)) {
      if (node[0] && symOf(node[0]) === 'dict') {
        const d = {};
        for (let i = 1; i < node.length; i++) { const kv = node[i]; d[symOf(kv[0])] = this.fromLiteral(kv[1]); }
        return d;
      }
      return node.map(x => this.fromLiteral(x));
    }
    if (node && node.sym) {
      if (node.sym === 'true') return true;
      if (node.sym === 'false') return false;
      if (node.sym === 'nil' || node.sym === 'null') return null;
      return node.sym;
    }
    return node;
  }

  callBuiltin(name, A) {
    switch (name) {
      case '+': return A.reduce((a, b) => num(a) + num(b), 0);
      case '-': return A.length === 1 ? -num(A[0]) : num(A[0]) - A.slice(1).reduce((a, b) => a + num(b), 0);
      case '*': return A.reduce((a, b) => num(a) * num(b), 1);
      case '/': { const d = A.slice(1).reduce((a, b) => a * num(b), 1); if (d === 0) throw new VMError('除零错误'); return num(A[0]) / d; }
      case '%': case 'mod': { const b = num(A[1]); if (b === 0) throw new VMError('除零错误'); return ((num(A[0]) % b) + b) % b; }
      case '=': case '==': return deepEq(A[0], A[1]);
      case '!=': return !deepEq(A[0], A[1]);
      case '<': return num(A[0]) < num(A[1]);
      case '>': return num(A[0]) > num(A[1]);
      case '<=': return num(A[0]) <= num(A[1]);
      case '>=': return num(A[0]) >= num(A[1]);
      case 'not': return !truthy(A[0]);
      case 'neg': return -num(A[0]);
      case 'list': return A.slice();
      case 'dict': { const d = {}; for (let i = 0; i + 1 < A.length; i += 2) d[String(A[i])] = A[i + 1]; return d; }
      case 'get': case 'map-get': { const dflt = A[2]; if (A[0] == null) return dflt === undefined ? null : dflt; const v = A[0][String(A[1])]; return v === undefined ? (dflt === undefined ? null : dflt) : v; }
      case 'set-key!': case 'map-set!': { if (A[0] == null) throw new VMError('空容器'); A[0][String(A[1])] = A[2]; return A[2]; }
      case 'in?': return A[0] != null && Object.prototype.hasOwnProperty.call(A[0], String(A[1]));
      case 'keys': return A[0] ? Object.keys(A[0]) : [];
      case 'values': return A[0] ? Object.values(A[0]) : [];
      case 'len': { if (A[0] == null) return 0; return A[0].length !== undefined ? A[0].length : Object.keys(A[0]).length; }
      case 'append!': { if (!Array.isArray(A[0])) throw new VMError('append 需要数组'); A[0].push(A[1]); return A[0].length; }
      case 'pop!': { if (!Array.isArray(A[0])) throw new VMError('pop 需要数组'); return A[0].pop(); }
      case 'slice': return A[0] == null ? null : String(A[0]).slice(A[1] | 0, A[2] === null || A[2] === undefined ? undefined : A[2] | 0);
      case 'concat': return A.map(x => x == null ? '' : String(x)).join('');
      case 'str': return strVal(A[0]);
      case 'num': return Number(A[0]);
      case 'bool': return truthy(A[0]);
      case 'round': return Math.round(num(A[0]));
      case 'floor': return Math.floor(num(A[0]));
      case 'ceil': return Math.ceil(num(A[0]));
      case 'abs': return Math.abs(num(A[0]));
      case 'min': return Math.min(...A.map(num));
      case 'max': return Math.max(...A.map(num));
      case 'pow': return Math.pow(num(A[0]), num(A[1]));
      case 'sqrt': { const v = num(A[0]); if (v < 0) throw new VMError('sqrt 负数'); return Math.sqrt(v); }
      case 'sin': return Math.sin(num(A[0]));
      case 'cos': return Math.cos(num(A[0]));
      case 'atan2': return Math.atan2(num(A[0]), num(A[1]));
      case 'substr': return String(A[0] || '').substr(A[1] | 0, A[2] === undefined ? undefined : A[2] | 0);
      case 'index-of': return String(A[0] || '').indexOf(String(A[1]), A[2] | 0);
      case 'split': return String(A[0] || '').split(A[1] === undefined || A[1] === null ? '' : String(A[1]));
      case 'join': return (A[0] || []).join(A[1] == null ? '' : String(A[1]));
      case 'replace': return String(A[0] || '').split(String(A[1])).join(A[2] == null ? '' : String(A[2]));
      case 'upper': return String(A[0] || '').toUpperCase();
      case 'lower': return String(A[0] || '').toLowerCase();
      case 'type-of': { const v = A[0]; if (v === null || v === undefined) return 'nil'; if (Array.isArray(v)) return 'list'; if (typeof v === 'object') return v.__lambda ? 'lambda' : 'dict'; return typeof v; }
      case 'number?': return typeof A[0] === 'number';
      case 'string?': return typeof A[0] === 'string';
      case 'list?': return Array.isArray(A[0]);
      case 'nil?': return A[0] === null || A[0] === undefined;
      case 'equal?': return deepEq(A[0], A[1]);
      case 'to-json': return JSON.stringify(A[0]);
      case 'from-json': return JSON.parse(String(A[0]));
      case 'format': { const vals = A.slice(1); let i = 0; return String(A[0] || '').replace(/\{\}|\{(\d+)\}/g, (m, n) => { const v = n !== undefined ? vals[n | 0] : vals[i++]; return v == null ? '' : String(v); }); }
      case 'char-code': return String(A[0]).charCodeAt(A[1] | 0);
      case 'code-char': return String.fromCharCode(A[0] | 0);
      case 'sort!': { const desc = A[1] === 'desc'; (A[0] || []).sort((a, b) => { const r = (typeof a === 'number' && typeof b === 'number') ? a - b : String(a).localeCompare(String(b), 'zh'); return desc ? -r : r; }); return A[0]; }
      case 'clamp': return Math.max(num(A[1]), Math.min(num(A[2]), num(A[0])));
      case 'lerp': return num(A[0]) + (num(A[1]) - num(A[0])) * num(A[2]);
      case 'bit-and': return (num(A[0]) | 0) & (num(A[1]) | 0);
      case 'bit-or': return (num(A[0]) | 0) | (num(A[1]) | 0);
      case 'bit-xor': return (num(A[0]) | 0) ^ (num(A[1]) | 0);
      case 'shl': return (num(A[0]) | 0) << (num(A[1]) | 0);
      case 'shr': return (num(A[0]) | 0) >> (num(A[1]) | 0);
      case 'random-float': { this.rngState = (Math.imul(this.rngState, 1664525) + 1013904223) | 0; return (this.rngState >>> 0) / 4294967296; }
      case 'random-int': { this.rngState = (Math.imul(this.rngState, 1664525) + 1013904223) | 0; const lo = A[0] | 0, hi = A[1] | 0; return lo + ((this.rngState >>> 0) % Math.max(1, hi - lo + 1)); }
      case 'hash-str': { let h = 2166136261; for (const ch of String(A[0])) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
      case 'list-range': { const out = []; for (let i = A[0] | 0; i < (A[1] | 0); i++) out.push(i); return out; }
      case 'find-first': { for (const x of (A[0] || [])) if (x && deepEq(x[String(A[1])], A[2])) return x; return null; }
      case 'sum-list': return (A[0] || []).reduce((a, b) => a + (Number(b) || 0), 0);
      case 'array-fill': { const n = A[0] | 0, v = A[1], o = []; for (let i = 0; i < n; i++) o.push(v); return o; }
      case 'assert': if (!truthy(A[0])) throw new VMError('断言失败: ' + (A[1] || '')); return true;
      case 'print': return null;
      default: throw new VMError('未实现内置: ' + name);
    }
  }
}

NOS.VM = VM;
NOS.VMError = VMError;
NOS.truthy = truthy;
NOS.num = num;
NOS.deepEq = deepEq;
NOS.headOf = headOf;
NOS.symOf = symOf;
