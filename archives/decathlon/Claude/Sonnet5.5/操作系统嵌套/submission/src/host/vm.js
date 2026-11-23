// NS 虚拟机：可序列化的字节码解释器 + 嵌套执行（vm_run）+ 逐级预算计量
import { OP } from './compiler.js';

export const SUSPEND = Symbol('suspend');
export class NSError extends Error {}

export function newMap(o) { const m = Object.create(null); if (o) for (const k in o) m[k] = o[k]; return m; }
export function isMap(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) && !('$f' in v); }
export function isFn(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) && '$f' in v; }
export function typeOf(v) {
  if (v === null || v === undefined) return 'nil';
  const t = typeof v;
  if (t === 'boolean') return 'bool';
  if (t === 'number') return 'num';
  if (t === 'string') return 'str';
  if (Array.isArray(v)) return 'arr';
  if ('$f' in v) return 'fn';
  return 'map';
}
export function truthy(v) { return v !== null && v !== false && v !== undefined; }

// 值的规模（用于按规模计费）：单元格数
export function sizeOf(v, depth = 0) {
  if (v === null || v === undefined) return 1;
  const t = typeof v;
  if (t === 'string') return 1 + (v.length >> 4);
  if (t !== 'object') return 1;
  if (depth > 60) return 1;
  let n = 1;
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) n += sizeOf(v[i], depth + 1); }
  else for (const k in v) n += 1 + sizeOf(v[k], depth + 1);
  return n;
}

export function deepCopy(v, depth = 0) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object') return v;
  if (depth > 60) return null;
  if (Array.isArray(v)) { const a = new Array(v.length); for (let i = 0; i < v.length; i++) a[i] = deepCopy(v[i], depth + 1); return a; }
  if ('$f' in v) return null;
  const m = Object.create(null);
  for (const k in v) m[k] = deepCopy(v[k], depth + 1);
  return m;
}

export function tostr(v, depth = 0) {
  if (v === null || v === undefined) return 'nil';
  const t = typeof v;
  if (t === 'string') return v;
  if (t === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e9) / 1e9);
  if (t === 'boolean') return v ? 'true' : 'false';
  if (depth > 4) return '…';
  if (Array.isArray(v)) {
    const parts = []; const lim = Math.min(v.length, 40);
    for (let i = 0; i < lim; i++) parts.push(typeof v[i] === 'string' && depth > 0 ? JSON.stringify(v[i]) : tostr(v[i], depth + 1));
    if (v.length > lim) parts.push('…');
    return '[' + parts.join(', ') + ']';
  }
  if ('$f' in v) return '<fn ' + v.$f + '>';
  const parts = []; let n = 0;
  for (const k in v) { if (n++ > 30) { parts.push('…'); break; } parts.push(k + ': ' + (typeof v[k] === 'string' ? JSON.stringify(v[k]) : tostr(v[k], depth + 1))); }
  return '{' + parts.join(', ') + '}';
}

// 估算占用内存（字节）：对可达对象图遍历
export function memOfValue(v, seen, depth = 0) {
  if (v === null || v === undefined) return 8;
  const t = typeof v;
  if (t === 'string') return 16 + v.length * 2;
  if (t !== 'object') return 8;
  if (seen.has(v)) return 8;
  seen.add(v);
  if (depth > 80) return 8;
  let n = 24;
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) n += 8 + memOfValue(v[i], seen, depth + 1); }
  else for (const k in v) n += 24 + k.length + memOfValue(v[k], seen, depth + 1);
  return n;
}

function rt(ctx, msg) { throw new NSError(msg); }
function toKey(k) { return typeof k === 'string' ? k : (typeof k === 'number' ? String(k) : rt(null, '映射键必须是字符串或数字')); }

const progCache = new Map();
export function loadProgram(textOrObj) {
  if (typeof textOrObj !== 'string') return prepProgram(textOrObj);
  let p = progCache.get(textOrObj);
  if (!p) { p = prepProgram(JSON.parse(textOrObj)); if (progCache.size > 64) progCache.clear(); progCache.set(textOrObj, p); }
  return p;
}
function prepProgram(p) {
  if (!p.natf) {
    Object.defineProperty(p, 'natf', {
      enumerable: false, configurable: true,
      value: p.nat.map((n) => { const f = NATIVES[n]; if (!f) throw new NSError('未知原生函数 ' + n); return f; }),
    });
  }
  return p;
}

export const NATIVES = Object.create(null);
function def(name, fn, est) { NATIVES[name] = { name, fn, est }; }

export class Ctx {
  constructor(vm, cid, prog, opts) {
    this.vm = vm; this.cid = cid; this.owner = opts.owner || 0; this.prog = prog; this.name = opts.name || prog.n;
    this.priv = !!opts.priv; this.args = opts.args === undefined ? null : opts.args;
    this.stack = new Array(prog.f[0].l).fill(null); this.frames = []; this.globals = new Array(prog.g).fill(null);
    this.f = 0; this.pc = 0; this.base = 0;
    this.state = 'ready'; this.trap = null; this.err = null; this.result = null;
    this.own = 0; this.inner = 0; this.debt = 0; this.pay = 0; this.fuel = 0;
    this.pendingRun = null; this.rng = (opts.seed || (cid * 2654435761)) >>> 0 || 1; this.children = new Set();
    this.memLimit = 0; this.devMem = 0; this.memCache = 0; this.alloc = 0; this.kernel = !!opts.kernel;
    this.sysId = opts.sysId || null; this.created = vm.tick;
  }
}

export class VM {
  constructor() {
    this.ctxs = new Map(); this.nextCid = 1; this.tick = 0;
    this.memLimitHook = null;
  }
  spawn(progOrText, opts = {}) {
    const prog = loadProgram(progOrText);
    const cid = opts.cid || this.nextCid++;
    if (cid >= this.nextCid) this.nextCid = cid + 1;
    const ctx = new Ctx(this, cid, prog, opts);
    this.ctxs.set(cid, ctx);
    if (ctx.owner) { const o = this.ctxs.get(ctx.owner); if (o) o.children.add(cid); }
    return ctx;
  }
  get(cid) { return this.ctxs.get(cid); }
  kill(cid) {
    const c = this.ctxs.get(cid); if (!c) return;
    for (const k of [...c.children]) this.kill(k);
    const o = this.ctxs.get(c.owner); if (o) o.children.delete(cid);
    c.state = 'dead'; this.ctxs.delete(cid);
    if (this.onKill) this.onKill(c);
  }
  inTree(root, cid) { // cid 是否属于 root 的子树（含自身）
    let c = this.ctxs.get(cid);
    while (c) { if (c.cid === root) return true; c = this.ctxs.get(c.owner); }
    return false;
  }
  ret(ctx, value) { // 完成一次系统调用
    if (ctx.state !== 'trap') return false;
    ctx.stack.push(value === undefined ? null : value); ctx.trap = null; ctx.state = 'ready'; return true;
  }
  fail(ctx, msg) { ctx.state = 'error'; ctx.err = { msg, fn: ctx.prog.f[ctx.f].n, line: ctx.prog.f[ctx.f].ln[(ctx.pc / 3 | 0) - 1] || 0, file: ctx.prog.f[ctx.f].fl }; }
  memOf(ctx) {
    const seen = new Set(); let n = 0;
    for (let i = 0; i < ctx.stack.length; i++) n += 8 + memOfValue(ctx.stack[i], seen);
    for (let i = 0; i < ctx.globals.length; i++) n += 8 + memOfValue(ctx.globals[i], seen);
    n += ctx.frames.length * 24 + (ctx.args ? memOfValue(ctx.args, seen) : 0);
    ctx.memCache = n; ctx.alloc = 0; ctx.memTick = this.tick;
    return n + ctx.devMem;
  }
  // 子树内存（含所有后代上下文）
  treeMem(cid) {
    const c = this.ctxs.get(cid); if (!c) return 0;
    let n = this.memOf(c);
    for (const k of c.children) n += this.treeMem(k);
    return n;
  }

  /** 运行上下文最多 limit 个单位。返回 {status, used}；status: slice|trap|done|error|blocked|dead */
  run(ctx, limit) {
    if (ctx.state === 'dead') return { status: 'dead', used: 0 };
    if (ctx.state === 'done') return { status: 'done', used: 0 };
    if (ctx.state === 'error') return { status: 'error', used: 0 };
    if (ctx.state === 'trap') return { status: 'blocked', used: 0 };
    limit = Math.floor(limit);
    if (limit <= 0) return { status: 'slice', used: 0 };
    const repay = Math.min(ctx.debt, limit);
    ctx.debt -= repay;
    let fuel = limit - repay;
    const inner0 = ctx.inner;
    const prog = ctx.prog, consts = prog.k, natf = prog.natf, funcs = prog.f, stack = ctx.stack, frames = ctx.frames, globals = ctx.globals;
    let fnObj = funcs[ctx.f], code = fnObj.c, pc = ctx.pc, base = ctx.base;
    let status = 'slice';
    try {
      for (;;) {
        if (fuel <= 0) break;
        const op = code[pc], a = code[pc + 1], b = code[pc + 2];
        pc += 3; fuel--;
        switch (op) {
          case OP.CONST: stack.push(consts[a]); break;
          case OP.NIL: stack.push(null); break;
          case OP.TRUE: stack.push(true); break;
          case OP.FALSE: stack.push(false); break;
          case OP.POP: stack.pop(); break;
          case OP.DUP: stack.push(stack[stack.length - 1]); break;
          case OP.DUP2: { const n = stack.length; stack.push(stack[n - 2], stack[n - 1]); break; }
          case OP.LOADL: stack.push(stack[base + a]); break;
          case OP.STOREL: stack[base + a] = stack[stack.length - 1]; break;
          case OP.LOADG: { const v = globals[a]; stack.push(v === undefined ? null : v); break; }
          case OP.STOREG: globals[a] = stack[stack.length - 1]; break;
          case OP.ADD: {
            const y = stack.pop(), x = stack.pop();
            if (typeof x === 'number' && typeof y === 'number') stack.push(x + y);
            else if (typeof x === 'string' || typeof y === 'string') {
              const s = tostr(x) + tostr(y); fuel -= s.length >> 4; stack.push(s);
            } else rt(ctx, `+ 的操作数类型不对：${typeOf(x)} + ${typeOf(y)}`);
            break;
          }
          case OP.SUB: { const y = stack.pop(), x = stack.pop(); if (typeof x !== 'number' || typeof y !== 'number') rt(ctx, `- 需要数字：${typeOf(x)} - ${typeOf(y)}`); stack.push(x - y); break; }
          case OP.MUL: { const y = stack.pop(), x = stack.pop(); if (typeof x !== 'number' || typeof y !== 'number') rt(ctx, `* 需要数字：${typeOf(x)} * ${typeOf(y)}`); stack.push(x * y); break; }
          case OP.DIV: { const y = stack.pop(), x = stack.pop(); if (typeof x !== 'number' || typeof y !== 'number') rt(ctx, `/ 需要数字：${typeOf(x)} / ${typeOf(y)}`); stack.push(x / y); break; }
          case OP.MOD: { const y = stack.pop(), x = stack.pop(); if (typeof x !== 'number' || typeof y !== 'number') rt(ctx, `% 需要数字：${typeOf(x)} % ${typeOf(y)}`); stack.push(x % y); break; }
          case OP.NEG: { const x = stack.pop(); if (typeof x !== 'number') rt(ctx, '负号需要数字'); stack.push(-x); break; }
          case OP.NOT: { const x = stack.pop(); stack.push(x === null || x === false || x === undefined); break; }
          case OP.EQ: { const y = stack.pop(), x = stack.pop(); stack.push(x === y || (x == null && y == null)); break; }
          case OP.NE: { const y = stack.pop(), x = stack.pop(); stack.push(!(x === y || (x == null && y == null))); break; }
          case OP.LT: case OP.LE: case OP.GT: case OP.GE: {
            const y = stack.pop(), x = stack.pop();
            const tx = typeof x;
            if (!((tx === 'number' && typeof y === 'number') || (tx === 'string' && typeof y === 'string'))) rt(ctx, `比较需要同类型的数字或字符串：${typeOf(x)} 与 ${typeOf(y)}`);
            stack.push(op === OP.LT ? x < y : op === OP.LE ? x <= y : op === OP.GT ? x > y : x >= y);
            break;
          }
          case OP.JMP: pc = a; break;
          case OP.JF: { const x = stack.pop(); if (x === null || x === false || x === undefined) pc = a; break; }
          case OP.JT: { const x = stack.pop(); if (!(x === null || x === false || x === undefined)) pc = a; break; }
          case OP.JFK: { const x = stack[stack.length - 1]; if (x === null || x === false || x === undefined) pc = a; else stack.pop(); break; }
          case OP.JTK: { const x = stack[stack.length - 1]; if (!(x === null || x === false || x === undefined)) pc = a; else stack.pop(); break; }
          case OP.CALL: {
            const callee = funcs[a];
            if (frames.length > 3000) rt(ctx, '调用栈溢出');
            let argc = b;
            while (argc < callee.a) { stack.push(null); argc++; }
            if (argc > callee.a) stack.length -= (argc - callee.a);
            frames.push([ctx.f, pc, base]);
            ctx.f = a; fnObj = callee; code = callee.c; pc = 0; base = stack.length - callee.a;
            for (let i = callee.a; i < callee.l; i++) stack.push(null);
            break;
          }
          case OP.CALLV: {
            const fv = stack[stack.length - 1 - a];
            if (fv === null || typeof fv !== 'object' || !('$f' in fv)) rt(ctx, '调用的值不是函数：' + typeOf(fv));
            const callee = funcs[fv.$f];
            if (frames.length > 3000) rt(ctx, '调用栈溢出');
            stack.splice(stack.length - 1 - a, 1);
            let argc = a;
            while (argc < callee.a) { stack.push(null); argc++; }
            if (argc > callee.a) stack.length -= (argc - callee.a);
            frames.push([ctx.f, pc, base]);
            ctx.f = fv.$f; fnObj = callee; code = callee.c; pc = 0; base = stack.length - callee.a;
            for (let i = callee.a; i < callee.l; i++) stack.push(null);
            break;
          }
          case OP.RET: {
            const rv = stack.pop();
            stack.length = base;
            const fr = frames.pop();
            if (!fr) { ctx.state = 'done'; ctx.result = rv === undefined ? null : rv; status = 'done'; fuel++; }
            else { ctx.f = fr[0]; fnObj = funcs[fr[0]]; code = fnObj.c; pc = fr[1]; base = fr[2]; stack.push(rv); }
            break;
          }
          case OP.CALLN: {
            const nf = natf[a];
            const n0 = stack.length - b;
            const args = b === 0 ? [] : stack.slice(n0);
            if (nf.est) {
              const need = nf.est(args, ctx);
              if (need > 0) {
                const take = Math.min(fuel, need - ctx.pay);
                ctx.pay += take; fuel -= take;
                if (ctx.pay < need) { pc -= 3; status = 'slice'; fuel = 0; break; }
                ctx.pay = 0;
              }
            }
            ctx.fuel = fuel; ctx.pc = pc; ctx.base = base;
            const r = nf.fn(ctx, args);
            fuel = ctx.fuel;
            if (r === SUSPEND) { pc -= 3; fuel = Math.min(fuel, 0); if (ctx.state === 'ready') status = 'slice'; break; }
            stack.length = n0;
            stack.push(r === undefined ? null : r);
            break;
          }
          case OP.MKARR: { const n0 = stack.length - a; const arr = stack.slice(n0); stack.length = n0; stack.push(arr); break; }
          case OP.MKMAP: {
            const n0 = stack.length - a * 2; const m = Object.create(null);
            for (let i = 0; i < a; i++) m[stack[n0 + i * 2]] = stack[n0 + i * 2 + 1];
            stack.length = n0; stack.push(m); break;
          }
          case OP.GETI: {
            const k = stack.pop(), o = stack.pop();
            let v = null;
            if (Array.isArray(o)) { if (typeof k !== 'number') rt(ctx, '数组下标必须是数字'); v = o[k]; }
            else if (typeof o === 'string') { if (typeof k !== 'number') rt(ctx, '字符串下标必须是数字'); v = k >= 0 && k < o.length ? o[k] : null; }
            else if (o !== null && typeof o === 'object') { v = o[typeof k === 'string' ? k : toKey(k)]; }
            else rt(ctx, `对 ${typeOf(o)} 取下标/字段 "${tostr(k)}"`);
            stack.push(v === undefined ? null : v); break;
          }
          case OP.SETI: {
            const v = stack.pop(), k = stack.pop(), o = stack[stack.length - 1];
            if (Array.isArray(o)) {
              if (typeof k !== 'number' || k < 0 || k > o.length) rt(ctx, `数组下标越界：${tostr(k)}（长度 ${o.length}）`);
              o[k] = v;
            } else if (o !== null && typeof o === 'object' && !('$f' in o)) o[typeof k === 'string' ? k : toKey(k)] = v;
            else rt(ctx, `不能给 ${typeOf(o)} 赋下标`);
            stack[stack.length - 1] = v; ctx.alloc++; break;
          }
          case OP.SYS: {
            let args, name;
            if (b === 1) { const arr = stack.pop(); name = stack.pop(); if (!Array.isArray(arr)) rt(ctx, 'sysv 的第二个参数必须是数组'); args = arr.slice(); }
            else { args = stack.splice(stack.length - a, a); name = args.shift(); }
            if (typeof name !== 'string') rt(ctx, 'sys 的第一个参数必须是调用名');
            fuel -= 4 + (sizeOf(args) >> 3);
            ctx.trap = { name, args }; ctx.state = 'trap'; status = 'trap'; break;
          }
          case OP.FNREF: { const m = Object.create(null); m.$f = a; stack.push(m); break; }
          default: rt(ctx, '非法指令 ' + op);
        }
        if (status !== 'slice') break;
      }
      ctx.pc = pc; ctx.base = base;
    } catch (e) {
      ctx.pc = pc; ctx.base = base;
      if (e instanceof NSError) { this.fail(ctx, e.message); }
      else if (e instanceof RangeError) this.fail(ctx, '内部错误：' + e.message);
      else { this.fail(ctx, '宿主异常：' + (e && e.message)); console.error(e); }
      status = 'error';
    }
    if (fuel < 0) { ctx.debt += -fuel; fuel = 0; }
    const used = limit - fuel;
    const innerUsed = ctx.inner - inner0;
    ctx.own += used - innerUsed;
    if (status === 'slice' && ctx.state === 'trap') status = 'trap';
    ctx.alloc += 0;
    return { status, used };
  }
}

// ------------------------------------------------------------------ 原生函数
const num = (v, name) => { if (typeof v !== 'number') throw new NSError(`${name} 需要数字，实际是 ${typeOf(v)}`); return v; };
const str = (v, name) => { if (typeof v !== 'string') throw new NSError(`${name} 需要字符串，实际是 ${typeOf(v)}`); return v; };
const arr = (v, name) => { if (!Array.isArray(v)) throw new NSError(`${name} 需要数组，实际是 ${typeOf(v)}`); return v; };

def('len', (c, [x]) => { if (typeof x === 'string' || Array.isArray(x)) return x.length; if (x && typeof x === 'object') return Object.keys(x).length; if (x == null) return 0; throw new NSError('len 不支持 ' + typeOf(x)); });
def('push', (c, [a, v]) => { arr(a, 'push').push(v === undefined ? null : v); return v; });
def('pop', (c, [a]) => { const v = arr(a, 'pop').pop(); return v === undefined ? null : v; });
def('shift', (c, [a]) => { const v = arr(a, 'shift').shift(); return v === undefined ? null : v; }, ([a]) => Array.isArray(a) ? a.length >> 4 : 0);
def('unshift', (c, [a, v]) => { arr(a, 'unshift').unshift(v); return v; }, ([a]) => Array.isArray(a) ? a.length >> 4 : 0);
def('insert', (c, [a, i, v]) => { arr(a, 'insert').splice(num(i, 'insert'), 0, v); return v; }, ([a]) => Array.isArray(a) ? a.length >> 4 : 0);
def('remove', (c, [a, i]) => { const r = arr(a, 'remove').splice(num(i, 'remove'), 1); return r.length ? r[0] : null; }, ([a]) => Array.isArray(a) ? a.length >> 4 : 0);
def('slice', (c, [x, i, j]) => {
  if (typeof x === 'string') return x.substring(i == null ? 0 : i, j == null ? x.length : j);
  return arr(x, 'slice').slice(i == null ? 0 : i, j == null ? x.length : j);
}, ([x, i, j]) => { const n = (x && x.length) || 0; const lo = i == null ? 0 : Math.max(0, i), hi = j == null ? n : Math.min(n, j); return Math.max(0, hi - lo) >> 4; });
def('concat', (c, [a, b]) => arr(a, 'concat').concat(arr(b, 'concat')), ([a, b]) => ((a && a.length || 0) + (b && b.length || 0)) >> 4);
def('keys', (c, [m]) => { if (!m || typeof m !== 'object') throw new NSError('keys 需要映射'); return Object.keys(m); }, ([m]) => m && typeof m === 'object' ? Object.keys(m).length >> 3 : 0);
def('values', (c, [m]) => { if (!m || typeof m !== 'object') throw new NSError('values 需要映射'); return Object.values(m); }, ([m]) => m && typeof m === 'object' ? Object.keys(m).length >> 3 : 0);
def('has', (c, [m, k]) => { if (Array.isArray(m)) return typeof k === 'number' && k >= 0 && k < m.length; return m != null && typeof m === 'object' && Object.prototype.hasOwnProperty.call(m, toKey(k)); });
def('del', (c, [m, k]) => { if (m == null || typeof m !== 'object' || Array.isArray(m)) throw new NSError('del 需要映射'); const key = toKey(k); const had = key in m; delete m[key]; return had; });
def('copy', (c, [x]) => deepCopy(x), ([x]) => sizeOf(x) >> 3);
def('typeof', (c, [x]) => typeOf(x));
def('str', (c, [x]) => tostr(x), ([x]) => sizeOf(x) >> 5);
def('num', (c, [x]) => { if (typeof x === 'number') return x; if (typeof x === 'string') { const t = x.trim(); if (t === '' || isNaN(Number(t))) return null; return Number(t); } if (typeof x === 'boolean') return x ? 1 : 0; return null; });
def('int', (c, [x]) => Math.trunc(num(x, 'int')));
def('floor', (c, [x]) => Math.floor(num(x, 'floor')));
def('ceil', (c, [x]) => Math.ceil(num(x, 'ceil')));
def('round', (c, [x]) => Math.round(num(x, 'round')));
def('abs', (c, [x]) => Math.abs(num(x, 'abs')));
def('sign', (c, [x]) => Math.sign(num(x, 'sign')));
def('min', (c, [x, y]) => (num(x, 'min') < num(y, 'min') ? x : y));
def('max', (c, [x, y]) => (num(x, 'max') > num(y, 'max') ? x : y));
def('clamp', (c, [x, lo, hi]) => Math.min(Math.max(num(x, 'clamp'), lo), hi));
def('sqrt', (c, [x]) => Math.sqrt(num(x, 'sqrt')));
def('sin', (c, [x]) => Math.sin(num(x, 'sin')));
def('cos', (c, [x]) => Math.cos(num(x, 'cos')));
def('tan', (c, [x]) => Math.tan(num(x, 'tan')));
def('atan', (c, [x]) => Math.atan(num(x, 'atan')));
def('asin', (c, [x]) => Math.asin(num(x, 'asin')));
def('acos', (c, [x]) => Math.acos(num(x, 'acos')));
def('atan2', (c, [y, x]) => Math.atan2(num(y, 'atan2'), num(x, 'atan2')));
def('exp', (c, [x]) => Math.exp(num(x, 'exp')));
def('log', (c, [x]) => Math.log(num(x, 'log')));
def('pow', (c, [x, y]) => Math.pow(num(x, 'pow'), num(y, 'pow')));
def('mod', (c, [x, y]) => { const r = num(x, 'mod') % num(y, 'mod'); return r < 0 ? r + Math.abs(y) : r; });
def('band', (c, [x, y]) => (x & y) >>> 0);
def('bor', (c, [x, y]) => (x | y) >>> 0);
def('bxor', (c, [x, y]) => (x ^ y) >>> 0);
def('shl', (c, [x, y]) => (x << y) >>> 0);
def('shr', (c, [x, y]) => x >>> y);
def('rand', (c) => { let s = c.rng; s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; c.rng = s; return s / 4294967296; });
def('randint', (c, [n]) => { let s = c.rng; s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; c.rng = s; return Math.floor(s / 4294967296 * num(n, 'randint')); });
def('substr', (c, [s, i, n]) => str(s, 'substr').substr(i, n == null ? s.length : n), ([s, i, n]) => (n == null ? 4 : n) >> 4);
def('indexOf', (c, [s, x, from]) => { if (typeof s === 'string') return s.indexOf(str(x, 'indexOf'), from || 0); if (!Array.isArray(s)) throw new NSError('indexOf 需要字符串或数组'); return s.indexOf(x, from || 0); }, ([s]) => (s && s.length || 0) >> 4);
def('split', (c, [s, sep]) => str(s, 'split').split(str(sep, 'split')), ([s]) => (s && s.length || 0) >> 4);
def('join', (c, [a, sep]) => arr(a, 'join').map((x) => tostr(x)).join(sep == null ? '' : sep), ([a]) => (a && a.length || 0) >> 3);
def('upper', (c, [s]) => str(s, 'upper').toUpperCase());
def('lower', (c, [s]) => str(s, 'lower').toLowerCase());
def('trim', (c, [s]) => str(s, 'trim').trim());
def('startsWith', (c, [s, p]) => str(s, 'startsWith').startsWith(str(p, 'startsWith')));
def('endsWith', (c, [s, p]) => str(s, 'endsWith').endsWith(str(p, 'endsWith')));
def('contains', (c, [s, p]) => { if (typeof s === 'string') return s.includes(str(p, 'contains')); if (Array.isArray(s)) return s.includes(p); return false; }, ([s]) => (s && s.length || 0) >> 4);
def('replace', (c, [s, a, b]) => str(s, 'replace').split(str(a, 'replace')).join(str(b, 'replace')), ([s]) => (s && s.length || 0) >> 4);
def('chr', (c, [n]) => String.fromCharCode(num(n, 'chr')));
def('ord', (c, [s, i]) => { const v = str(s, 'ord').charCodeAt(i || 0); return Number.isNaN(v) ? -1 : v; });
def('repeat', (c, [s, n]) => str(s, 'repeat').repeat(Math.max(0, num(n, 'repeat'))), ([s, n]) => ((s && s.length || 0) * (n || 0)) >> 4);
def('fmt', (c, [x, d]) => num(x, 'fmt').toFixed(d == null ? 2 : d));
def('pad', (c, [s, n, ch]) => { s = tostr(s); return s.length >= n ? s : (ch || ' ').repeat(n - s.length) + s; });
def('padr', (c, [s, n, ch]) => { s = tostr(s); return s.length >= n ? s : s + (ch || ' ').repeat(n - s.length); });
def('json_parse', (c, [s]) => { try { return JSON.parse(str(s, 'json_parse'), (k, v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? Object.assign(Object.create(null), v) : v)); } catch (e) { return null; } }, ([s]) => (s && s.length || 0) >> 3);
def('json_stringify', (c, [v, pretty]) => JSON.stringify(v, null, pretty ? 2 : 0) ?? 'null', ([v]) => sizeOf(v) >> 2);
def('blen', (c, [s]) => { s = tostr(s); let n = 0; for (let i = 0; i < s.length; i++) { const k = s.charCodeAt(i); n += k < 128 ? 1 : k < 2048 ? 2 : 3; } return n; }, ([s]) => typeof s === 'string' ? s.length >> 4 : 0);
def('sort', (c, [a, desc]) => { arr(a, 'sort'); a.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)); if (desc) a.reverse(); return a; }, ([a]) => a ? (a.length * Math.log2(a.length + 2)) >> 3 : 0);
def('sort_by', (c, [a, field, desc]) => {
  arr(a, 'sort_by');
  a.sort((x, y) => { const p = x[field], q = y[field]; return p < q ? -1 : p > q ? 1 : 0; });
  if (desc) a.reverse(); return a;
}, ([a]) => a ? (a.length * Math.log2(a.length + 2)) >> 2 : 0);
def('reverse', (c, [a]) => arr(a, 'reverse').reverse(), ([a]) => a ? a.length >> 4 : 0);
def('range', (c, [n]) => { const a = []; for (let i = 0; i < n; i++) a.push(i); return a; }, ([n]) => (n || 0) >> 4);
def('text_w', (c, [s, size]) => { s = tostr(s); let w = 0; for (let i = 0; i < s.length; i++) { const k = s.charCodeAt(i); w += k < 128 ? (k === 32 ? 0.32 : /[ilI1.,:;|!']/.test(s[i]) ? 0.3 : /[mwMW@]/.test(s[i]) ? 0.85 : 0.56) : 1.0; } return w * (size || 14); });
def('native_names', () => Object.keys(NATIVES));
def('args', (c) => c.args);
def('ctx_self', (c) => hdl('ctx', c.cid));
def('now_ms', () => 0);

function hdl(kind, id) { const m = Object.create(null); m.$h = kind; m.id = id; return m; }
export { hdl };

// 显示指令构造（显示设备库，规模小，按次计费）
def('gx_rect', (c, [x, y, w, h, fill, r]) => { const m = Object.create(null); m.o = 'rect'; m.x = x; m.y = y; m.w = w; m.h = h; if (fill != null) m.fill = fill; if (r) m.r = r; return m; });
def('gx_text', (c, [x, y, s, size, color]) => { const m = Object.create(null); m.o = 'text'; m.x = x; m.y = y; m.s = tostr(s); if (size) m.size = size; if (color) m.color = color; return m; });
def('gx_icon', (c, [x, y, n, size, color]) => { const m = Object.create(null); m.o = 'icon'; m.x = x; m.y = y; m.n = n; m.size = size; if (color) m.color = color; return m; });
def('gx_group', (c, [x, y, w, h, kids]) => { const m = Object.create(null); m.o = 'g'; m.x = x; m.y = y; m.w = w; m.h = h; m.k = kids || []; return m; });
def('gx_line', (c, [x1, y1, x2, y2, color, sw]) => { const m = Object.create(null); m.o = 'line'; m.x1 = x1; m.y1 = y1; m.x2 = x2; m.y2 = y2; m.color = color; m.sw = sw || 1; return m; });
def('set', (c, [m, k, v]) => { if (m == null || typeof m !== 'object') throw new NSError('set 需要映射'); m[toKey(k)] = v; return m; });
def('mapof', (c, [a]) => { const m = Object.create(null); for (let i = 0; i + 1 < a.length; i += 2) m[a[i]] = a[i + 1]; return m; });
def('hash', (c, [s]) => { s = tostr(s); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }, ([s]) => typeof s === 'string' ? s.length >> 4 : 0);

// 特权：虚拟机管理（仅内核可用）
function priv(c) { if (!c.priv) throw new NSError('权限不足：该调用仅内核程序可用'); }
function target(c, h) {
  priv(c);
  if (!h || h.$h !== 'ctx') throw new NSError('需要进程句柄');
  const t = c.vm.ctxs.get(h.id);
  if (!t) return null;
  if (t.owner !== c.cid) throw new NSError('不能操作不属于本内核的进程');
  return t;
}
def('vm_new', (c, [text, args, flags]) => {
  priv(c);
  const isK = !!(flags && flags.kernel);
  if (isK && !c.priv) throw new NSError('权限不足');
  let t;
  try { t = c.vm.spawn(text, { owner: c.cid, args: deepCopy(args), priv: isK, kernel: isK, name: flags && flags.name, seed: flags && flags.seed }); }
  catch (e) { return mapof({ err: '载入程序失败：' + e.message }); }
  return hdl('ctx', t.cid);
}, ([text]) => typeof text === 'string' ? text.length >> 5 : 0);
def('vm_run', (c, [h, n]) => {
  const t = target(c, h);
  if (!t) return mapof({ status: 'dead', used: 0 });
  let st = c.pendingRun;
  if (!st || st.cid !== t.cid) st = c.pendingRun = { cid: t.cid, left: Math.max(0, Math.floor(n)), used: 0 };
  const lim = Math.min(st.left, Math.max(0, c.fuel));
  if (lim <= 0 && st.left > 0) return SUSPEND;
  const r = c.vm.run(t, lim);
  c.fuel -= r.used; c.inner += r.used;
  st.left -= r.used; st.used += r.used;
  if (r.status === 'slice' && st.left > 0) return SUSPEND;
  c.pendingRun = null;
  const m = Object.create(null);
  m.status = r.status; m.used = st.used;
  if (r.status === 'trap') { m.name = t.trap.name; m.args = t.trap.args; }
  else if (r.status === 'done') m.result = t.result;
  else if (r.status === 'error') { m.err = t.err ? t.err.msg : '未知错误'; m.line = t.err ? t.err.line : 0; m.fn = t.err ? t.err.fn : ''; m.file = t.err ? t.err.file : ''; }
  return m;
});
function mapof(o) { return newMap(o); }
def('vm_ret', (c, [h, v]) => { const t = target(c, h); if (!t) return false; return c.vm.ret(t, deepCopy(v)); }, ([h, v]) => sizeOf(v) >> 3);
def('vm_kill', (c, [h]) => { const t = target(c, h); if (t) c.vm.kill(t.cid); return !!t; });
def('vm_state', (c, [h]) => { const t = target(c, h); return t ? t.state : 'dead'; });
def('vm_stat', (c, [h]) => {
  const t = target(c, h); if (!t) return null;
  const m = Object.create(null);
  if (!(t.memTick >= 0) || c.vm.tick - t.memTick > 20) c.vm.memOf(t);
  m.state = t.state; m.own = t.own; m.inner = t.inner; m.debt = t.debt; m.mem = t.memCache + t.devMem; m.name = t.name; m.cid = t.cid;
  m.fn = t.prog.f[t.f].n; m.line = t.prog.f[t.f].ln[(t.pc / 3 | 0) - 1] || 0;
  if (t.err) m.err = t.err.msg + ' @' + t.err.fn + ':' + t.err.line;
  m.nchild = t.children.size; m.depth = t.frames.length;
  return m;
});
def('vm_mem', (c, [h]) => { const t = target(c, h); if (!t) return 0; const tc = t.treeCache; if (tc && c.vm.tick - tc.tick < 20) return tc.v; const v = c.vm.treeMem(t.cid); t.treeCache = { tick: c.vm.tick, v }; return v; });
def('vm_reset', (c, [h]) => { // 重置进程回到程序初始状态（用于重启）
  const t = target(c, h); if (!t) return false;
  for (const k of [...t.children]) c.vm.kill(k);
  const fresh = new Ctx(c.vm, t.cid, t.prog, { owner: t.owner, args: t.args, priv: t.priv, kernel: t.kernel, name: t.name });
  Object.assign(t, { stack: fresh.stack, frames: fresh.frames, globals: fresh.globals, f: 0, pc: 0, base: 0, state: 'ready', trap: null, err: null, result: null, own: 0, inner: 0, debt: 0, pay: 0, pendingRun: null });
  return true;
});
def('ctx_id', (c, [h]) => { if (!h || h.$h !== 'ctx') return -1; return h.id; });
def('ctx_in', (c, [x]) => { priv(c); const id = x && x.id != null ? x.id : x; return id !== c.cid && c.vm.inTree(c.cid, id); });
def('mk_handle', (c, [kind, id]) => hdl(kind, id));

def('burn', (c, [n]) => { c.fuel -= Math.max(0, Math.floor(typeof n === 'number' ? n : 0)); return null; });
def('sizeof', (c, [v]) => sizeOf(v));
def('vm_self_stat', (c) => { const m = Object.create(null); if (!(c.memTick >= 0) || c.vm.tick - c.memTick > 20) c.vm.memOf(c); m.own = c.own; m.inner = c.inner; m.mem = c.memCache + c.devMem; m.debt = c.debt; return m; });
def('gx_scan', (c, [cmds]) => {
  const embeds = []; let n = 0;
  const walk = (x, d) => {
    if (d > 40 || x === null || typeof x !== 'object') return;
    if (Array.isArray(x)) { for (const y of x) walk(y, d + 1); return; }
    n++;
    if ((x.o === 'embed' || x.o === 'view3d') && x.c && x.c.$h === 'ctx') embeds.push(x.c);
    if (Array.isArray(x.k)) for (const y of x.k) walk(y, d + 1);
  };
  walk(cmds, 0);
  const m = Object.create(null); m.n = n; m.embeds = embeds; return m;
}, ([cmds]) => sizeOf(cmds) >> 6);
