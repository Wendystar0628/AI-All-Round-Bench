'use strict';
/*
 * NVM —— 嵌套系统的程序执行环境（宿主提供的“处理器”）。
 * 只负责：执行字节码、按指令与数据规模计费、嵌套上下文（vm_run）、状态保存/恢复。
 * 调度、系统调用分发、消息、文件、窗口管理都不在这里，它们写在 .nx 程序里。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NVM = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const OP = {
    NOP: 0, CONST: 1, NUM: 2, NULL: 3, TRUE: 4, FALSE: 5, LOADL: 6, STOREL: 7, LOADG: 8, STOREG: 9,
    POP: 10, DUP: 11, DUP2: 12, ADD: 13, SUB: 14, MUL: 15, DIV: 16, MOD: 17, NEG: 18, NOT: 19,
    EQ: 20, NE: 21, LT: 22, LE: 23, GT: 24, GE: 25, JMP: 26, JF: 27, JT: 28, JFK: 29, JTK: 30,
    CALL: 31, CALLV: 32, RET: 33, BUILTIN: 34, SYS: 35, NEWARR: 36, NEWMAP: 37, GETI: 38, SETI: 39,
    GETF: 40, SETF: 41, FUNC: 42, HALT: 43
  };
  const ST = { RUN: 0, SYS: 1, DONE: 2, FAULT: 3 };
  const R = { BUDGET: 0, SYS: 1, EXIT: 2, FAULT: 3, BLOCKED: 4 };
  const MAX_FRAMES = 3 * 2500;

  class FnRef { constructor(i) { this.i = i; } }
  class CtxRef { constructor(c) { this.ctx = c; } }

  function isMap(v) { return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof FnRef) && !(v instanceof CtxRef); }
  function typeOf(v) {
    if (v === null || v === undefined) return 'null';
    const t = typeof v;
    if (t === 'number') return 'num';
    if (t === 'string') return 'str';
    if (t === 'boolean') return 'bool';
    if (Array.isArray(v)) return 'arr';
    if (v instanceof FnRef) return 'fn';
    if (v instanceof CtxRef) return 'ctx';
    return 'map';
  }
  function toStr(v) {
    if (typeof v === 'string') return v;
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (v instanceof FnRef) return '<fn>';
    if (v instanceof CtxRef) return '<ctx>';
    return toJSON(v);
  }
  function toJSON(v, indent) {
    return JSON.stringify(v, (k, x) => {
      if (x instanceof FnRef || x instanceof CtxRef) return null;
      if (typeof x === 'number' && !isFinite(x)) return null;
      return x;
    }, indent || undefined);
  }
  function nullProto(v) {
    if (v === null || typeof v !== 'object') return v === undefined ? null : v;
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = nullProto(v[i]); return v; }
    const o = Object.create(null);
    for (const k in v) o[k] = nullProto(v[k]);
    return o;
  }
  // 宿主值 → 来宾值（深拷贝，映射为无原型对象）
  function toGuest(v) {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'object') return v;
    if (v instanceof FnRef || v instanceof CtxRef) return v;
    if (Array.isArray(v)) { const a = new Array(v.length); for (let i = 0; i < v.length; i++) a[i] = toGuest(v[i]); return a; }
    const o = Object.create(null);
    for (const k in v) { const x = v[k]; if (x !== undefined) o[k] = toGuest(x); }
    return o;
  }
  // 来宾值 → 宿主普通对象（深拷贝）
  function fromGuest(v, depth) {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'object') return v;
    if (v instanceof FnRef || v instanceof CtxRef) return null;
    depth = depth || 0;
    if (depth > 64) return null;
    if (Array.isArray(v)) { const a = new Array(v.length); for (let i = 0; i < v.length; i++) a[i] = fromGuest(v[i], depth + 1); return a; }
    const o = {};
    for (const k in v) o[k] = fromGuest(v[k], depth + 1);
    return o;
  }
  // 上下文之间的值复制（隔离堆）；返回副本
  function copyVal(v, depth) {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'object') return v;
    if (v instanceof FnRef) return v;
    if (v instanceof CtxRef) return null;
    depth = depth || 0;
    if (depth > 64) throw new Error('数据嵌套过深，无法复制');
    if (Array.isArray(v)) { const a = new Array(v.length); for (let i = 0; i < v.length; i++) a[i] = copyVal(v[i], depth + 1); return a; }
    const o = Object.create(null);
    for (const k in v) o[k] = copyVal(v[k], depth + 1);
    return o;
  }
  // 复制/比较的计费规模：每 2 个元素或条目 1 单位，每 16 个字符 1 单位
  function sizeUnits(v) {
    let entries = 0, chars = 0;
    const walk = (x, d) => {
      if (typeof x === 'string') { chars += x.length; return; }
      if (x === null || typeof x !== 'object' || d > 64) return;
      if (Array.isArray(x)) { entries += x.length + 1; for (let i = 0; i < x.length; i++) { const y = x[i]; if (typeof y === 'string') chars += y.length; else if (y !== null && typeof y === 'object') walk(y, d + 1); } return; }
      if (x instanceof FnRef || x instanceof CtxRef) return;
      entries += 1;
      for (const k in x) { entries++; const y = x[k]; if (typeof y === 'string') chars += y.length; else if (y !== null && typeof y === 'object') walk(y, d + 1); }
    };
    walk(v, 0);
    return (entries >> 1) + (chars >> 4);
  }
  // 内存占用估算（字节）
  function memOf(v, seen) {
    if (typeof v === 'string') return 16 + v.length;
    if (v === null || typeof v !== 'object') return 8;
    if (v instanceof FnRef) return 8;
    if (v instanceof CtxRef) return 8 + measure(v.ctx);
    if (seen.has(v)) return 8;
    seen.add(v);
    let n;
    if (Array.isArray(v)) { n = 24 + 8 * v.length; for (let i = 0; i < v.length; i++) { const y = v[i]; if (typeof y === 'string') n += 16 + y.length; else if (y !== null && typeof y === 'object') n += memOf(y, seen); } return n; }
    n = 32;
    for (const k in v) { n += 24 + k.length; const y = v[k]; if (typeof y === 'string') n += 16 + y.length; else if (y !== null && typeof y === 'object') n += memOf(y, seen); }
    return n;
  }
  function measure(ctx) {
    const seen = new Set();
    let n = 64 + ctx.prog.codeBytes + 8 * ctx.sp + 4 * ctx.frames.length;
    const g = ctx.globals, skip = ctx.prog.diskIndex;
    for (let i = 0; i < g.length; i++) if (i !== skip) n += memOf(g[i], seen);
    const st = ctx.stack;
    for (let i = 0; i < ctx.sp; i++) n += memOf(st[i], seen);
    if (ctx.sysArgs) n += memOf(ctx.sysArgs, seen);
    if (ctx.cache !== null) n += memOf(ctx.cache, seen);
    ctx.memBase = n; ctx.allocAcc = 0; ctx.memAt = ++measureClock;
    return n;
  }
  let measureClock = 0;

  // ---------- 程序装载 ----------
  const progCache = new Map();
  function loadProgram(text) {
    let p = progCache.get(text);
    if (p) return p;
    let j;
    try { j = JSON.parse(text); } catch (e) { throw new Error('不是有效的可执行文件'); }
    if (!j || j.nxb !== 1 || !Array.isArray(j.funcs)) throw new Error('不是有效的可执行文件');
    let codeBytes = 0;
    const funcs = j.funcs.map(f => { codeBytes += f.c.length * 4; return { name: f.n, np: f.p, nl: f.l, code: Int32Array.from(f.c), lines: f.ln || [], file: f.fl || j.src || '' }; });
    const bfn = (j.bn || []).map(e => {
      const b = BUILTINS[e[0]];
      if (!b) throw new Error('第 ' + e[1] + ' 行：未定义的函数 ' + e[0]);
      return b;
    });
    const gnames = j.globals || [];
    p = { text, src: j.src || '', consts: j.consts || [], gnames, funcs, main: j.main | 0, bfn, bnames: (j.bn || []).map(e => e[0]), codeBytes, diskIndex: gnames.indexOf('DISK') };
    for (const c of p.consts) if (typeof c === 'string') codeBytes += c.length;
    p.codeBytes = codeBytes;
    const ri = p.bnames.indexOf('vm_run');
    if (ri >= 0) for (const f of p.funcs) { const c = f.code; for (let i = 0; i < c.length; i += 2) if (c[i] === OP.BUILTIN && (c[i + 1] >> 8) === ri) { c[i] = 44; c[i + 1] = 0; } }
    progCache.set(text, p);
    return p;
  }

  let ctxSeq = 0;
  class Ctx {
    constructor(prog, parent) {
      this.uid = ++ctxSeq;
      this.prog = prog; this.parent = parent || null;
      this.globals = new Array(prog.gnames.length).fill(null);
      this.stack = []; this.sp = 0; this.frames = [];
      this.fi = prog.main; this.pc = 0; this.fp = 0;
      const nl = prog.funcs[prog.main].nl;
      for (let i = 0; i < nl; i++) this.stack[this.sp++] = null;
      this.state = ST.RUN; this.exitCode = null; this.error = null; this.errLine = 0;
      this.own = 0; this.total = 0;
      this.limit = 0; this.memBase = 0; this.allocAcc = 0; this.allocPend = 0; this.memAt = 0;
      this.prepaid = 0; this.pendCost = 0; this.runAcc = 0; this.execBudget = 0; this.execChild = 0;
      this.sysName = null; this.sysArgs = null; this.trapTaken = false;
      this.cache = null; this.memFault = null; this.isHost = false; this.memPressure = false; this.dead = false;
    }
  }

  function lineOf(ctx) {
    const f = ctx.prog.funcs[ctx.fi]; if (!f) return 0;
    const ln = f.lines, pc = ctx.pc; let line = 0;
    for (let i = 0; i + 1 < ln.length; i += 2) { if (ln[i] <= pc) line = ln[i + 1]; else break; }
    return line;
  }
  function fault(ctx, msg) {
    ctx.state = ST.FAULT; ctx.errLine = lineOf(ctx);
    const fl = ctx.prog.funcs[ctx.fi] ? ctx.prog.funcs[ctx.fi].file : '';
    ctx.error = (ctx.errLine ? (fl ? fl.slice(fl.lastIndexOf('/') + 1) + ' ' : '') + '第 ' + ctx.errLine + ' 行：' : '') + msg;
  }

  // 分配记账：沿祖先链累加；超过配额的那一层触发精确测量
  function noteAlloc(ctx) {
    const n = ctx.allocPend; ctx.allocPend = 0;
    for (let c = ctx; c; c = c.parent) {
      c.allocAcc += n;
      if (c.limit > 0 && c.memBase + c.allocAcc > c.limit) {
        const m = measure(c);
        if (m > c.limit) {
          if (c === ctx && ctx.isHost) { ctx.memPressure = true; continue; }
          ctx.memFault = c === ctx ? '内存配额不足（进程上限 ' + Math.round(c.limit / 1024) + ' KB）' : '内存配额不足（所在系统的内存拨付已用尽）';
          return false;
        }
      }
    }
    return true;
  }

  // ---------- 内建函数 ----------
  const BUILTINS = Object.create(null);
  // def(name, fn, pre, post, alloc)：pre(a0,a1,a2) 事先已知的规模费用；post(r,a0,a1) 事后才知的规模费用
  function def(name, fn, pre, post) {
    BUILTINS[name] = function (ctx, argc, left) {
      const st = ctx.stack, base = ctx.sp - argc;
      const a0 = argc > 0 ? st[base] : null, a1 = argc > 1 ? st[base + 1] : null, a2 = argc > 2 ? st[base + 2] : null, a3 = argc > 3 ? st[base + 3] : null;
      if (pre) {
        const c = pre(a0, a1, a2) | 0;
        if (c > 0) { const need = c - ctx.prepaid; if (need > left) { ctx.prepaid += left; ctx.pendCost = c; return -1; } left -= need; ctx.prepaid = 0; ctx.pendCost = 0; }
      }
      let r = fn(a0, a1, a2, a3, ctx);
      if (r === undefined) r = null;
      if (post) {
        const c = post(r, a0, a1) | 0;
        if (c > 0) { const need = c - ctx.prepaid; if (need > left) { ctx.prepaid += left; ctx.pendCost = c; return -1; } left -= need; ctx.prepaid = 0; ctx.pendCost = 0; }
      }
      if (typeof r === 'string') ctx.allocPend += 16 + r.length;
      else if (r !== null && typeof r === 'object') ctx.allocPend += Array.isArray(r) ? 24 + 8 * r.length : 64;
      st[base] = r; ctx.sp = base + 1;
      return left;
    };
  }
  function need(cond, msg) { if (!cond) throw new Error(msg); }
  const isArr = Array.isArray;
  function fnv(s) {
    let h1 = 0x811c9dc5, h2 = 0x1b873593;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 + c, 0x85ebca6b) ^ (h2 >>> 13); }
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  }
  // 纯函数实现（也供编译器的宿主自举使用）
  const PURE = {
    len: v => typeof v === 'string' || isArr(v) ? v.length : isMap(v) ? Object.keys(v).length : 0,
    push: (a, v) => { need(isArr(a), 'push 需要数组'); a.push(v === undefined ? null : v); return a.length; },
    pop: a => { need(isArr(a), 'pop 需要数组'); return a.length ? a.pop() : null; },
    insert: (a, i, v) => { need(isArr(a), 'insert 需要数组'); a.splice(i | 0, 0, v === undefined ? null : v); return a.length; },
    remove: (a, i) => { need(isArr(a), 'remove 需要数组'); const r = a.splice(i | 0, 1); return r.length ? r[0] : null; },
    slice: (a, i, j) => { need(typeof a === 'string' || isArr(a), 'slice 需要数组或字符串'); return a.slice(i === null ? 0 : i, j === null || j === undefined ? undefined : j); },
    concat: (a, b) => { need(isArr(a) && isArr(b), 'concat 需要两个数组'); return a.concat(b); },
    substr: (s, i, n) => { need(typeof s === 'string', 'substr 需要字符串'); i = i | 0; return n === null || n === undefined ? s.substring(i) : s.substring(i, i + (n | 0)); },
    ord: (s, i) => { need(typeof s === 'string', 'ord 需要字符串'); const c = s.charCodeAt(i | 0); return c !== c ? -1 : c; },
    chr: n => String.fromCharCode(n | 0),
    str: v => toStr(v),
    num: s => { if (typeof s === 'number') return s; if (typeof s !== 'string' || s.trim() === '') return null; const n = Number(s); return n !== n ? null : n; },
    indexOf: (s, x, from) => { need(typeof s === 'string' || isArr(s), 'indexOf 需要数组或字符串'); return s.indexOf(x, from | 0); },
    split: (s, sep) => { need(typeof s === 'string' && typeof sep === 'string', 'split 需要字符串'); return s.split(sep); },
    join: (a, sep) => { need(isArr(a), 'join 需要数组'); return a.map(toStr).join(sep === null || sep === undefined ? ',' : sep); },
    upper: s => toStr(s).toUpperCase(),
    lower: s => toStr(s).toLowerCase(),
    trim: s => toStr(s).trim(),
    replace: (s, a, b) => toStr(s).split(toStr(a)).join(toStr(b)),
    keys: m => { need(isMap(m), 'keys 需要映射'); return Object.keys(m); },
    has: (m, k) => isMap(m) ? Object.prototype.hasOwnProperty.call(m, k) : false,
    del: (m, k) => { need(isMap(m), 'del 需要映射'); const h = Object.prototype.hasOwnProperty.call(m, k); delete m[k]; return h; },
    type: v => typeOf(v),
    copy: v => copyVal(v),
    json: (v, indent) => toJSON(v, indent),
    parse: s => { if (typeof s !== 'string') return null; try { return nullProto(JSON.parse(s)); } catch (e) { return null; } },
    hash: s => fnv(toStr(s)),
    floor: Math.floor, ceil: Math.ceil, round: Math.round, abs: Math.abs, sqrt: Math.sqrt,
    sin: Math.sin, cos: Math.cos, tan: Math.tan, atan2: Math.atan2, asin: Math.asin, acos: Math.acos,
    exp: Math.exp, log: Math.log, pow: Math.pow,
    min: (a, b) => a < b ? a : b, max: (a, b) => a > b ? a : b,
    fixed: (n, d) => Number(n).toFixed(d | 0),
    sort: a => { need(isArr(a), 'sort 需要数组'); a.sort((x, y) => x < y ? -1 : x > y ? 1 : 0); return a; }
  };
  const u8 = s => (typeof s === 'string' ? s.length >> 3 : 0);
  def('len', PURE.len); def('push', PURE.push); def('pop', PURE.pop);
  def('insert', PURE.insert, a => isArr(a) ? a.length >> 4 : 0);
  def('remove', PURE.remove, a => isArr(a) ? a.length >> 4 : 0);
  def('slice', PURE.slice, null, r => typeof r === 'string' ? r.length >> 3 : r.length >> 1);
  def('concat', PURE.concat, null, r => r.length >> 1);
  def('substr', PURE.substr, null, r => r.length >> 3);
  def('ord', PURE.ord); def('chr', PURE.chr); def('str', PURE.str, null, u8); def('num', PURE.num);
  def('indexOf', PURE.indexOf, (s, x, from) => typeof s === 'string' ? Math.max(0, s.length - (from | 0)) >> 4 : (isArr(s) ? s.length >> 2 : 0));
  def('split', PURE.split, null, (r, s) => (s.length >> 3) + (r.length >> 1));
  def('join', PURE.join, null, (r, a) => (r.length >> 3) + (a.length >> 1));
  def('upper', PURE.upper, null, u8); def('lower', PURE.lower, null, u8); def('trim', PURE.trim, null, u8);
  def('replace', PURE.replace, null, (r, s) => (toStr(s).length >> 3) + (r.length >> 3));
  def('keys', PURE.keys, null, r => r.length >> 1);
  def('has', PURE.has); def('del', PURE.del); def('type', PURE.type);
  def('copy', PURE.copy, v => sizeUnits(v));
  def('json', PURE.json, null, r => r.length >> 3);
  def('parse', PURE.parse, s => typeof s === 'string' ? s.length >> 3 : 0);
  def('hash', PURE.hash, s => toStr(s).length >> 4);
  for (const k of ['floor', 'ceil', 'round', 'abs', 'sqrt', 'sin', 'cos', 'tan', 'atan2', 'asin', 'acos', 'exp', 'log', 'pow', 'min', 'max', 'fixed']) def(k, PURE[k]);
  def('sort', PURE.sort, a => isArr(a) ? Math.ceil(a.length * Math.log2(a.length + 2)) >> 1 : 0);
  // 记一笔服务工作量：付清后才返回
  def('charge', n => n, n => Math.max(0, n | 0));

  // --- 嵌套执行环境 ---
  def('vm_new', (text, _b, _c, _d, ctx) => {
    need(typeof text === 'string', 'vm_new 需要可执行文本');
    let p;
    try { p = loadProgram(text); } catch (e) { const m = Object.create(null); m.error = e.message; return m; }
    ctx.isHost = true;
    return new CtxRef(new Ctx(p, ctx));
  }, t => typeof t === 'string' ? t.length >> 6 : 0);
  def('vm_ret', (ref, v) => {
    need(ref instanceof CtxRef, 'vm_ret 需要上下文');
    const c = ref.ctx;
    if (c.state !== ST.SYS) return false;
    c.stack[c.sp++] = copyVal(v); c.state = ST.RUN; c.sysArgs = null; c.sysName = null; c.trapTaken = false;
    return true;
  }, (ref, v) => sizeUnits(v));
  def('vm_kill', ref => { need(ref instanceof CtxRef, 'vm_kill 需要上下文'); killCtx(ref.ctx, '已被结束'); return true; });
  def('vm_stat', (ref, _b, _c, _d, ctx) => {
    const c = ref instanceof CtxRef ? ref.ctx : ctx;
    const m = Object.create(null);
    m.state = c.state; m.own = c.own; m.total = c.total; m.line = lineOf(c);
    if (measureClock - c.memAt > 40 || c.memAt === 0) measure(c);
    m.mem = c.memBase + c.allocAcc; m.limit = c.limit; m.pending = c.pendCost > c.prepaid ? c.pendCost - c.prepaid : 0; m.pressure = !!c.memPressure; c.memPressure = false; m.fn = c.prog.funcs[c.fi] ? c.prog.funcs[c.fi].name : '';
    return m;
  });
  def('vm_mem', (ref, _b, _c, _d, ctx) => measure(ref instanceof CtxRef ? ref.ctx : ctx));
  def('vm_limit', (ref, n) => { need(ref instanceof CtxRef, 'vm_limit 需要上下文'); ref.ctx.limit = Math.max(0, +n || 0); return true; });
  // 实时读数：包含本次执行片内已经消耗的部分
  BUILTINS['vm_own'] = function (ctx, argc, left) { const st = ctx.stack, base = ctx.sp - argc; st[base] = ctx.own + (ctx.execBudget - left) - ctx.execChild; ctx.sp = base + 1; return left; };
  BUILTINS['vm_total'] = function (ctx, argc, left) { const st = ctx.stack, base = ctx.sp - argc; st[base] = ctx.total + (ctx.execBudget - left); ctx.sp = base + 1; return left; };
  BUILTINS['vm_save'] = function (ctx, argc, left) {
    const st = ctx.stack, base = ctx.sp - argc, ref = st[base];
    need(ref instanceof CtxRef, 'vm_save 需要上下文');
    let text;
    if (ctx.cache !== null && typeof ctx.cache === 'object' && ctx.cache.k === 'save' && ctx.cache.uid === ref.ctx.uid) text = ctx.cache.v;
    else { text = saveCtx(ref.ctx); ctx.cache = { k: 'save', uid: ref.ctx.uid, v: text }; }
    const c = text.length >> 3, nd = c - ctx.prepaid;
    if (nd > left) { ctx.prepaid += left; ctx.pendCost = c; return -1; }
    left -= nd; ctx.prepaid = 0; ctx.pendCost = 0; ctx.cache = null;
    ctx.allocPend += 16 + text.length;
    st[base] = text; ctx.sp = base + 1;
    return left;
  };
  def('vm_load', (text, _b, _c, _d, ctx) => {
    need(typeof text === 'string', 'vm_load 需要快照文本');
    try { const c = loadCtx(text, ctx); ctx.isHost = true; return new CtxRef(c); }
    catch (e) { const m = Object.create(null); m.error = '快照无效：' + e.message; return m; }
  }, t => typeof t === 'string' ? t.length >> 3 : 0);
  def('vm_peek', (ref, name) => {
    need(ref instanceof CtxRef, 'vm_peek 需要上下文');
    const c = ref.ctx, i = c.prog.gnames.indexOf(name);
    if (i < 0) return null;
    return copyKeepCtx(c.globals[i], 0);
  }, (ref, name) => { if (!(ref instanceof CtxRef)) return 0; const c = ref.ctx, i = c.prog.gnames.indexOf(name); return i < 0 ? 0 : sizeUnits(c.globals[i]); });
  function copyKeepCtx(v, d) {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'object' || v instanceof FnRef || v instanceof CtxRef) return v;
    if (d > 64) return null;
    if (isArr(v)) return v.map(x => copyKeepCtx(x, d + 1));
    const o = Object.create(null); for (const k in v) o[k] = copyKeepCtx(v[k], d + 1); return o;
  }
  function killCtx(c, why) {
    if (c.state !== ST.DONE && c.state !== ST.FAULT) { c.state = ST.DONE; c.exitCode = -1; }
    c.dead = true;
  }

  // ---------- 解释器 ----------
  // 返回 [code, used, a, b]（宿主数组，a/b 为未复制的来宾值）
  function exec(ctx, budget) {
    if (ctx.state !== ST.RUN) return finish(ctx, 0);
    const prog = ctx.prog, consts = prog.consts, funcs = prog.funcs, bfn = prog.bfn, globals = ctx.globals, stack = ctx.stack, frames = ctx.frames;
    let fn = funcs[ctx.fi], code = fn.code, pc = ctx.pc, sp = ctx.sp, fp = ctx.fp;
    let left = budget, childUsed = 0, err = null;
    ctx.execBudget = budget; ctx.execChild = 0;
    try {
      loop: while (left > 0) {
        const op = code[pc], a = code[pc + 1]; pc += 2; left--;
        switch (op) {
          case 1: stack[sp++] = consts[a]; break;
          case 2: stack[sp++] = a; break;
          case 3: stack[sp++] = null; break;
          case 4: stack[sp++] = true; break;
          case 5: stack[sp++] = false; break;
          case 6: stack[sp++] = stack[fp + a]; break;
          case 7: stack[fp + a] = stack[sp - 1]; break;
          case 8: stack[sp++] = globals[a]; break;
          case 9: globals[a] = stack[sp - 1]; break;
          case 10: sp--; break;
          case 11: stack[sp] = stack[sp - 1]; sp++; break;
          case 12: stack[sp] = stack[sp - 2]; stack[sp + 1] = stack[sp - 1]; sp += 2; break;
          case 13: {
            const y = stack[sp - 1], x = stack[sp - 2];
            if (typeof x === 'number' && typeof y === 'number') { stack[sp - 2] = x + y; sp--; break; }
            if (typeof x === 'string' || typeof y === 'string') {
              const s = toStr(x) + toStr(y), c = s.length >> 3;
              if (c > 0) { const nd = c - ctx.prepaid; if (nd > left) { ctx.prepaid += left; ctx.pendCost = c; left = 0; pc -= 2; break loop; } left -= nd; ctx.prepaid = 0; ctx.pendCost = 0; }
              ctx.allocPend += 16 + s.length;
              stack[sp - 2] = s; sp--;
              if (ctx.allocPend > 4096) { ctx.sp = sp; if (!noteAlloc(ctx)) { err = ctx.memFault; break loop; } }
              break;
            }
            err = '不能对 ' + typeOf(x) + ' 和 ' + typeOf(y) + ' 做加法'; break loop;
          }
          case 14: { const y = stack[--sp], x = stack[sp - 1]; if (typeof x !== 'number' || typeof y !== 'number') { err = '减法需要数字，得到 ' + typeOf(x) + ' 和 ' + typeOf(y); break loop; } stack[sp - 1] = x - y; break; }
          case 15: { const y = stack[--sp], x = stack[sp - 1]; if (typeof x !== 'number' || typeof y !== 'number') { err = '乘法需要数字，得到 ' + typeOf(x) + ' 和 ' + typeOf(y); break loop; } stack[sp - 1] = x * y; break; }
          case 16: { const y = stack[--sp], x = stack[sp - 1]; if (typeof x !== 'number' || typeof y !== 'number') { err = '除法需要数字，得到 ' + typeOf(x) + ' 和 ' + typeOf(y); break loop; } stack[sp - 1] = x / y; break; }
          case 17: { const y = stack[--sp], x = stack[sp - 1]; if (typeof x !== 'number' || typeof y !== 'number') { err = '取余需要数字，得到 ' + typeOf(x) + ' 和 ' + typeOf(y); break loop; } stack[sp - 1] = x % y; break; }
          case 18: { const x = stack[sp - 1]; if (typeof x !== 'number') { err = '取负需要数字，得到 ' + typeOf(x); break loop; } stack[sp - 1] = -x; break; }
          case 19: { const x = stack[sp - 1]; stack[sp - 1] = !(x !== null && x !== false && x !== 0 && x !== '' && x === x); break; }
          case 20: case 21: {
            const y = stack[--sp], x = stack[sp - 1];
            if (typeof x === 'string' && typeof y === 'string' && x.length === y.length && x.length > 15) {
              const c = x.length >> 3, nd = c - ctx.prepaid;
              if (nd > left) { ctx.prepaid += left; left = 0; pc -= 2; sp++; break loop; }
              left -= nd; ctx.prepaid = 0;
            }
            stack[sp - 1] = op === 20 ? x === y : x !== y; break;
          }
          case 22: case 23: case 24: case 25: {
            const y = stack[--sp], x = stack[sp - 1], tx = typeof x;
            if (tx !== typeof y || (tx !== 'number' && tx !== 'string')) { err = '不能比较 ' + typeOf(x) + ' 和 ' + typeOf(y); break loop; }
            stack[sp - 1] = op === 22 ? x < y : op === 23 ? x <= y : op === 24 ? x > y : x >= y; break;
          }
          case 26: pc = a; break;
          case 27: { const x = stack[--sp]; if (!(x !== null && x !== false && x !== 0 && x !== '' && x === x)) pc = a; break; }
          case 28: { const x = stack[--sp]; if (x !== null && x !== false && x !== 0 && x !== '' && x === x) pc = a; break; }
          case 29: { const x = stack[sp - 1]; if (!(x !== null && x !== false && x !== 0 && x !== '' && x === x)) pc = a; break; }
          case 30: { const x = stack[sp - 1]; if (x !== null && x !== false && x !== 0 && x !== '' && x === x) pc = a; break; }
          case 31: {
            if (frames.length >= MAX_FRAMES) { err = '调用栈过深'; break loop; }
            const f = funcs[a];
            frames.push(ctx.fi, pc, fp);
            fp = sp - f.np;
            for (let i = f.np; i < f.nl; i++) stack[fp + i] = null;
            sp = fp + f.nl; ctx.fi = a; fn = f; code = f.code; pc = 0; break;
          }
          case 32: {
            const callee = stack[sp - a - 1];
            if (!(callee instanceof FnRef)) { err = '被调用的值不是函数（' + typeOf(callee) + '）'; break loop; }
            if (frames.length >= MAX_FRAMES) { err = '调用栈过深'; break loop; }
            const f = funcs[callee.i];
            if (!f) { err = '无效的函数引用'; break loop; }
            let argc = a;
            while (argc < f.np) { stack[sp++] = null; argc++; }
            if (argc > f.np) { sp -= argc - f.np; }
            frames.push(ctx.fi, pc, fp, -1);
            fp = sp - f.np;
            for (let i = f.np; i < f.nl; i++) stack[fp + i] = null;
            sp = fp + f.nl; ctx.fi = callee.i; fn = f; code = f.code; pc = 0; break;
          }
          case 33: {
            const rv = stack[sp - 1];
            if (frames.length === 0) { ctx.state = ST.DONE; ctx.exitCode = typeof rv === 'number' ? rv : 0; sp = 0; break loop; }
            let viaV = false;
            if (frames[frames.length - 1] === -1) { frames.pop(); viaV = true; }
            sp = fp;
            fp = frames.pop(); pc = frames.pop(); ctx.fi = frames.pop();
            fn = funcs[ctx.fi]; code = fn.code;
            if (viaV) sp--;
            stack[sp++] = rv; break;
          }
          case 34: {
            const argc = a & 255;
            ctx.sp = sp; ctx.pc = pc;
            const r = bfn[a >> 8](ctx, argc, left);
            if (r < 0) { left = 0; pc -= 2; break loop; }
            left = r; sp = ctx.sp;
            if (ctx.allocPend > 4096) { ctx.sp = sp; if (!noteAlloc(ctx)) { err = ctx.memFault; break loop; } }
            break;
          }
          case 35: {
            const base = sp - a, name = stack[base];
            if (typeof name !== 'string') { err = 'sys 的第一个参数必须是系统调用名'; break loop; }
            const args = new Array(a - 1);
            for (let i = 1; i < a; i++) args[i - 1] = stack[base + i];
            sp = base;
            ctx.sysName = name; ctx.sysArgs = args; ctx.trapTaken = false; ctx.state = ST.SYS;
            break loop;
          }
          case 36: {
            const arr = new Array(a);
            for (let i = 0; i < a; i++) arr[i] = stack[sp - a + i];
            sp -= a; stack[sp++] = arr; ctx.allocPend += 24 + 8 * a;
            if (ctx.allocPend > 4096) { ctx.sp = sp; if (!noteAlloc(ctx)) { err = ctx.memFault; break loop; } }
            break;
          }
          case 37: {
            const m = Object.create(null), base = sp - 2 * a;
            for (let i = 0; i < a; i++) m[stack[base + 2 * i]] = stack[base + 2 * i + 1];
            sp = base; stack[sp++] = m; ctx.allocPend += 32 + 32 * a;
            if (ctx.allocPend > 4096) { ctx.sp = sp; if (!noteAlloc(ctx)) { err = ctx.memFault; break loop; } }
            break;
          }
          case 38: {
            const k = stack[--sp], o = stack[sp - 1];
            if (typeof o === 'string') { const c = typeof k === 'number' ? o[k] : undefined; stack[sp - 1] = c === undefined ? null : c; break; }
            if (o === null || typeof o !== 'object' || o instanceof FnRef || o instanceof CtxRef) { err = '不能对 ' + typeOf(o) + ' 取下标 ' + toStr(k).slice(0, 40); break loop; }
            const v = o[k]; stack[sp - 1] = v === undefined ? null : v; break;
          }
          case 39: {
            const v = stack[--sp], k = stack[--sp], o = stack[sp - 1];
            if (Array.isArray(o)) {
              if (typeof k !== 'number' || k < 0 || k > o.length || k !== (k | 0)) { err = '数组下标越界：' + toStr(k) + '（长度 ' + o.length + '）'; break loop; }
              if (k === o.length) ctx.allocPend += 8;
              o[k] = v;
            } else if (o !== null && typeof o === 'object' && !(o instanceof FnRef) && !(o instanceof CtxRef)) {
              if (typeof k !== 'string' && typeof k !== 'number') { err = '映射的键必须是字符串或数字'; break loop; }
              if (!(k in o)) ctx.allocPend += 32;
              o[k] = v;
            } else { err = '不能对 ' + typeOf(o) + ' 赋值下标'; break loop; }
            stack[sp - 1] = v; break;
          }
          case 40: {
            const o = stack[sp - 1];
            if (o === null || typeof o !== 'object' || o instanceof FnRef || o instanceof CtxRef || Array.isArray(o)) { err = '不能读取 ' + typeOf(o) + ' 的字段 ' + consts[a]; break loop; }
            const v = o[consts[a]]; stack[sp - 1] = v === undefined ? null : v; break;
          }
          case 41: {
            const v = stack[--sp], o = stack[sp - 1];
            if (o === null || typeof o !== 'object' || o instanceof FnRef || o instanceof CtxRef || Array.isArray(o)) { err = '不能写入 ' + typeOf(o) + ' 的字段 ' + consts[a]; break loop; }
            const k = consts[a];
            if (!(k in o)) ctx.allocPend += 32;
            o[k] = v; stack[sp - 1] = v; break;
          }
          case 42: stack[sp++] = new FnRef(a); break;
          case 43: ctx.state = ST.DONE; ctx.exitCode = 0; sp = 0; break loop;
          case 44: { // VMRUN（内建 vm_run 的专用指令）：栈 [ctxref, n]
            const ref = stack[sp - 2]; let n = stack[sp - 1];
            if (!(ref instanceof CtxRef) || typeof n !== 'number') { err = 'vm_run 需要上下文与额度'; break loop; }
            const child = ref.ctx;
            if (child.state === ST.RUN && n > 0 && !child.dead) {
              const give = n < left ? n : left;
              ctx.sp = sp; ctx.pc = pc;
              const r = exec(child, give);
              const used = r[1];
              left -= used; childUsed += used; ctx.runAcc += used; ctx.execChild = childUsed;
              if (child.state === ST.RUN) {
                if (used < n && left <= 0) { stack[sp - 1] = n - used; pc -= 2; left = 0; break loop; }
              }
            }
            let res;
            if (child.state === ST.SYS) {
              if (!child.trapTaken) {
                const c = sizeUnits(child.sysArgs), nd = c - ctx.prepaid;
                if (nd > left) { ctx.prepaid += left; ctx.pendCost = c; left = 0; pc -= 2; stack[sp - 1] = 0; break loop; }
                left -= nd; ctx.prepaid = 0; ctx.pendCost = 0;
                const args = copyVal(child.sysArgs);
                child.trapTaken = true;
                ctx.allocPend += 64 + c * 16;
                res = [1, ctx.runAcc, child.sysName, args];
              } else res = [4, ctx.runAcc, null, null];
            } else if (child.state === ST.DONE) res = [2, ctx.runAcc, child.exitCode, null];
            else if (child.state === ST.FAULT) res = [3, ctx.runAcc, child.error, child.errLine];
            else res = [0, ctx.runAcc, null, null];
            ctx.runAcc = 0;
            sp -= 2; stack[sp++] = res;
            if (ctx.allocPend > 4096) { ctx.sp = sp; if (!noteAlloc(ctx)) { err = ctx.memFault; break loop; } }
            break;
          }
          default: err = '非法指令 ' + op; break loop;
        }
      }
    } catch (e) {
      err = (e && e.message) || String(e);
    }
    ctx.pc = pc; ctx.sp = sp; ctx.fp = fp;
    if (err !== null) fault(ctx, err);
    if (left < 0) left = 0;
    const used = budget - left;
    ctx.own += used - childUsed; ctx.total += used; ctx.execBudget = 0; ctx.execChild = 0;
    return finish(ctx, used);
  }
  function finish(ctx, used) {
    switch (ctx.state) {
      case ST.RUN: return [R.BUDGET, used, null, null];
      case ST.SYS: return [R.SYS, used, ctx.sysName, ctx.sysArgs];
      case ST.DONE: return [R.EXIT, used, ctx.exitCode, null];
      default: return [R.FAULT, used, ctx.error, ctx.errLine];
    }
  }
  // vm_run 编译为专用指令 44（需要可重入、可中途续跑）；这里登记名字以便装载时解析
  BUILTINS['vm_run'] = function () { throw new Error('vm_run 只能直接调用'); };

  // 宿主侧：给处于 SYS 的上下文返回结果
  function ret(ctx, value) {
    if (ctx.state !== ST.SYS) return false;
    ctx.stack[ctx.sp++] = toGuest(value); ctx.state = ST.RUN; ctx.sysArgs = null; ctx.sysName = null; ctx.trapTaken = false;
    return true;
  }
  function retRaw(ctx, value) {
    if (ctx.state !== ST.SYS) return false;
    ctx.stack[ctx.sp++] = value === undefined ? null : value; ctx.state = ST.RUN; ctx.sysArgs = null; ctx.sysName = null; ctx.trapTaken = false;
    return true;
  }

  // ---------- 保存 / 恢复 ----------
  function saveCtx(root) {
    const progs = [], progIdx = new Map(), strs = [], strIdx = new Map();
    const encCtx = (c) => {
      let pi = progIdx.get(c.prog);
      if (pi === undefined) { pi = progs.length; progs.push(c.prog.text); progIdx.set(c.prog, pi); }
      const objs = [], ids = new Map(), kids = [];
      const enc = (v) => {
        if (v === null || v === undefined) return null;
        const t = typeof v;
        if (t === 'number') return isFinite(v) ? v : { $n: String(v) };
        if (t === 'string') {
          if (v.length < 200) return v;
          let si = strIdx.get(v);
          if (si === undefined) { si = strs.length; strs.push(v); strIdx.set(v, si); }
          return { $s: si };
        }
        if (t === 'boolean') return v;
        if (v instanceof FnRef) return { $f: v.i };
        if (v instanceof CtxRef) { kids.push(encCtx(v.ctx)); return { $c: kids.length - 1 }; }
        let id = ids.get(v);
        if (id !== undefined) return { $r: id };
        id = objs.length; ids.set(v, id); objs.push(null);
        if (Array.isArray(v)) { const a = new Array(v.length); for (let i = 0; i < v.length; i++) a[i] = enc(v[i]); objs[id] = a; }
        else { const o = {}; for (const k in v) o[k] = enc(v[k]); objs[id] = o; }
        return { $r: id };
      };
      const g = c.globals.map(enc);
      const s = []; for (let i = 0; i < c.sp; i++) s.push(enc(c.stack[i]));
      return {
        p: pi, g, s, f: c.frames.slice(), fi: c.fi, pc: c.pc, fp: c.fp, st: c.state, ec: c.exitCode, er: c.error, el: c.errLine,
        own: c.own, tot: c.total, lim: c.limit, pre: c.prepaid, pc2: c.pendCost, racc: c.runAcc, sn: c.sysName, sa: enc(c.sysArgs), tt: c.trapTaken,
        ca: (c.cache && c.cache.k === 'save') ? null : enc(c.cache), dead: !!c.dead, objs, kids
      };
    };
    const rootEnc = encCtx(root);
    return JSON.stringify({ nvs: 1, progs, strs, root: rootEnc });
  }
  function loadCtx(text, parent) {
    const j = JSON.parse(text);
    if (!j || j.nvs !== 1) throw new Error('格式不符');
    const progs = j.progs.map(loadProgram), strs = j.strs || [];
    const decCtx = (e, par) => {
      const c = new Ctx(progs[e.p], par);
      const objs = e.objs.map(o => Array.isArray(o) ? new Array(o.length) : Object.create(null));
      const kids = [];
      const dec = (v) => {
        if (v === null || typeof v !== 'object') return v;
        if ('$r' in v) return objs[v.$r];
        if ('$s' in v) return strs[v.$s];
        if ('$n' in v) return Number(v.$n);
        if ('$f' in v) return new FnRef(v.$f);
        if ('$c' in v) { if (!kids[v.$c]) kids[v.$c] = new CtxRef(decCtx(e.kids[v.$c], c)); return kids[v.$c]; }
        return null;
      };
      for (let i = 0; i < objs.length; i++) {
        const src = e.objs[i], dst = objs[i];
        if (Array.isArray(src)) for (let k = 0; k < src.length; k++) dst[k] = dec(src[k]);
        else for (const k in src) dst[k] = dec(src[k]);
      }
      c.globals = e.g.map(dec);
      c.stack = e.s.map(dec); c.sp = c.stack.length;
      c.frames = e.f.slice(); c.fi = e.fi; c.pc = e.pc; c.fp = e.fp; c.state = e.st; c.exitCode = e.ec; c.error = e.er; c.errLine = e.el || 0;
      c.own = e.own; c.total = e.tot; c.limit = e.lim || 0; c.prepaid = e.pre || 0; c.pendCost = e.pc2 || 0; c.runAcc = e.racc || 0;
      c.sysName = e.sn; c.sysArgs = dec(e.sa); c.trapTaken = !!e.tt; c.cache = dec(e.ca); c.dead = !!e.dead; c.isHost = e.kids.length > 0;
      return c;
    };
    return decCtx(j.root, parent || null);
  }


  function stat(ctx) {
    if (measureClock - ctx.memAt > 40 || ctx.memAt === 0) measure(ctx);
    return { state: ctx.state, own: ctx.own, total: ctx.total, mem: ctx.memBase + ctx.allocAcc, line: lineOf(ctx), error: ctx.error, pending: ctx.pendCost > ctx.prepaid ? ctx.pendCost - ctx.prepaid : 0 };
  }
  function peek(ctx, name) { const i = ctx.prog.gnames.indexOf(name); return i < 0 ? undefined : ctx.globals[i]; }

  return {
    OP, ST, R, FnRef, CtxRef, PURE, BUILTINS,
    create(text, parent) { return new Ctx(loadProgram(text), parent || null); },
    checkProgram(text) { try { loadProgram(text); return null; } catch (e) { return e.message; } },
    run: exec, ret, retRaw, kill: killCtx, save: saveCtx,
    load(text, parent) { const c = loadCtx(text, parent); return c; },
    measure, stat, peek, toGuest, fromGuest, copyVal, sizeUnits, toStr, typeOf, isMap, lineOf, hash: fnv,
    tickMeasure() { measureClock++; },
    setLimit(ctx, n) { ctx.limit = n; }
  };
});
