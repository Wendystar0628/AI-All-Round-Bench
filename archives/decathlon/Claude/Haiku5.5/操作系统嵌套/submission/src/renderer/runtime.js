/* 生成文件：由 tools/bundle-runtime.js 从 src/runtime 打包，请勿手改 */
(function () {
const defs = {};
const cache = {};
function req(name) {
  const key = name.replace(/^\.\//, '').replace(/\.js$/, '');
  if (cache[key]) return cache[key].exports;
  if (!defs[key]) throw new Error('模块不存在: ' + name);
  const m = { exports: {} };
  cache[key] = m;
  defs[key](m, m.exports, req);
  return m.exports;
}
defs["nos-stdlib"] = function (module, exports, require) {
'use strict';
/*
 * Nest Script 标准库：所有程序共用的原生函数。
 * 每个函数形如 (args, vm) => value。涉及数据规模的操作按字符数向 vm 计费（约 256 字符 1 单位）。
 * 随机数来自所属系统的随机状态（vm.env.rand），因此快照可以复现。
 */
(function (root) {
  const N = (typeof module !== 'undefined' && module.exports) ? require('./nos-vm.js') : root.NOS;
  const { tostr, typeName, isMap, hasOwn, sizeOf, cloneValue } = N;

  function need(args, n, name) {
    if (args.length !== n) throw new N.NosError(`${name} 需要 ${n} 个参数，收到 ${args.length} 个`);
  }
  function num(v, name) {
    if (typeof v !== 'number') throw new N.NosError(`${name} 需要数字，收到 ${typeName(v)}`);
    return v;
  }
  function str(v, name) {
    if (typeof v !== 'string') throw new N.NosError(`${name} 需要字符串，收到 ${typeName(v)}`);
    return v;
  }
  function bill(vm, n) {
    if (vm && vm.charge && n > 0) vm.charge(Math.ceil(n / 256));
  }

  function makeStdlib() {
    const lib = {};
    const def = (name, fn) => { lib[name] = fn; };

    def('len', (a, vm) => {
      need(a, 1, 'len');
      const v = a[0];
      if (typeof v === 'string' || Array.isArray(v)) return v.length;
      if (isMap(v)) return Object.keys(v).length;
      throw new N.NosError('len 不能用于 ' + typeName(v));
    });
    def('type', (a) => { need(a, 1, 'type'); return typeName(a[0]); });
    def('str', (a, vm) => { need(a, 1, 'str'); const s = tostr(a[0]); bill(vm, s.length); return s; });
    def('num', (a) => {
      need(a, 1, 'num');
      const v = a[0];
      if (typeof v === 'number') return v;
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v);
      return 0;
    });
    def('isnum', (a) => { need(a, 1, 'isnum'); return typeof a[0] === 'number' && isFinite(a[0]); });

    // 数组
    def('push', (a) => { need(a, 2, 'push'); if (!Array.isArray(a[0])) throw new N.NosError('push 的第一个参数必须是数组'); a[0].push(a[1]); return a[0].length; });
    def('pop', (a) => {
      need(a, 1, 'pop');
      if (!Array.isArray(a[0])) throw new N.NosError('pop 的参数必须是数组');
      if (!a[0].length) return null;
      return a[0].pop();
    });
    def('slice', (a, vm) => {
      if (a.length < 2 || a.length > 3) throw new N.NosError('slice 需要 2 或 3 个参数');
      const x = a[0];
      if (!Array.isArray(x) && typeof x !== 'string') throw new N.NosError('slice 只能用于数组或字符串');
      const from = Math.max(0, Math.floor(num(a[1], 'slice')));
      const to = a.length === 3 ? Math.floor(num(a[2], 'slice')) : x.length;
      const r = x.slice(from, to);
      bill(vm, Array.isArray(r) ? r.length * 4 : r.length);
      return r;
    });
    def('concat', (a, vm) => {
      need(a, 2, 'concat');
      if (!Array.isArray(a[0]) || !Array.isArray(a[1])) throw new N.NosError('concat 需要两个数组');
      const r = a[0].concat(a[1]);
      bill(vm, r.length * 4);
      return r;
    });
    def('indexOf', (a, vm) => {
      need(a, 2, 'indexOf');
      if (typeof a[0] === 'string') {
        bill(vm, a[0].length);
        return a[0].indexOf(str(a[1], 'indexOf'));
      }
      if (Array.isArray(a[0])) return a[0].indexOf(a[1]);
      throw new N.NosError('indexOf 只能用于字符串或数组');
    });
    def('sort', (a, vm) => {
      need(a, 1, 'sort');
      if (!Array.isArray(a[0])) throw new N.NosError('sort 的参数必须是数组');
      const r = a[0].slice().sort((x, y) => {
        if (typeof x === 'number' && typeof y === 'number') return x - y;
        return tostr(x) < tostr(y) ? -1 : tostr(x) > tostr(y) ? 1 : 0;
      });
      bill(vm, r.length * 8);
      return r;
    });
    def('reverse', (a) => { need(a, 1, 'reverse'); return a[0].slice().reverse(); });

    // 映射
    def('keys', (a) => { need(a, 1, 'keys'); if (!isMap(a[0])) throw new N.NosError('keys 需要映射'); return Object.keys(a[0]); });
    def('has', (a) => { need(a, 2, 'has'); return isMap(a[0]) && hasOwn(a[0], String(a[1])); });
    def('del', (a) => {
      need(a, 2, 'del');
      if (isMap(a[0])) { delete a[0][String(a[1])]; return true; }
      if (Array.isArray(a[0])) { const i = a[1]; if (typeof i === 'number' && i >= 0 && i < a[0].length) a[0].splice(i, 1); return true; }
      throw new N.NosError('del 需要映射或数组');
    });

    // 字符串
    def('substr', (a, vm) => {
      need(a, 3, 'substr');
      const s = str(a[0], 'substr');
      const r = s.substr(Math.max(0, Math.floor(num(a[1], 'substr'))), Math.max(0, Math.floor(num(a[2], 'substr'))));
      bill(vm, r.length);
      return r;
    });
    def('split', (a, vm) => {
      need(a, 2, 'split');
      const r = str(a[0], 'split').split(str(a[1], 'split'));
      bill(vm, a[0].length);
      return r;
    });
    def('join', (a, vm) => {
      need(a, 2, 'join');
      if (!Array.isArray(a[0])) throw new N.NosError('join 需要数组');
      const r = a[0].map(tostr).join(str(a[1], 'join'));
      bill(vm, r.length);
      return r;
    });
    def('chr', (a) => { need(a, 1, 'chr'); return String.fromCharCode(Math.floor(num(a[0], 'chr'))); });
    def('ord', (a) => { need(a, 1, 'ord'); const s = str(a[0], 'ord'); return s.length ? s.charCodeAt(0) : 0; });
    def('upper', (a) => { need(a, 1, 'upper'); return str(a[0], 'upper').toUpperCase(); });
    def('lower', (a) => { need(a, 1, 'lower'); return str(a[0], 'lower').toLowerCase(); });
    def('trim', (a) => { need(a, 1, 'trim'); return str(a[0], 'trim').trim(); });
    def('starts', (a) => { need(a, 2, 'starts'); return str(a[0], 'starts').startsWith(str(a[1], 'starts')); });
    def('ends', (a) => { need(a, 2, 'ends'); return str(a[0], 'ends').endsWith(str(a[1], 'ends')); });
    def('repeat', (a, vm) => {
      need(a, 2, 'repeat');
      const n = Math.max(0, Math.min(100000, Math.floor(num(a[1], 'repeat'))));
      const r = str(a[0], 'repeat').repeat(n);
      bill(vm, r.length);
      return r;
    });
    def('replace', (a, vm) => {
      need(a, 3, 'replace');
      const s = str(a[0], 'replace');
      const from = str(a[1], 'replace');
      const r = from === '' ? s : s.split(from).join(str(a[2], 'replace'));
      bill(vm, s.length);
      return r;
    });
    def('fmt', (a) => {
      need(a, 2, 'fmt');
      const d = Math.max(0, Math.min(10, Math.floor(num(a[1], 'fmt'))));
      return num(a[0], 'fmt').toFixed(d);
    });

    // 数学
    const m1 = (name, f) => def(name, (a) => { need(a, 1, name); return f(num(a[0], name)); });
    m1('floor', Math.floor);
    m1('ceil', Math.ceil);
    m1('round', Math.round);
    m1('abs', Math.abs);
    m1('sqrt', (x) => Math.sqrt(Math.max(0, x)));
    m1('sin', Math.sin);
    m1('cos', Math.cos);
    m1('exp', Math.exp);
    m1('log', (x) => Math.log(Math.max(1e-300, x)));
    def('atan2', (a) => { need(a, 2, 'atan2'); return Math.atan2(num(a[0], 'atan2'), num(a[1], 'atan2')); });
    def('pow', (a) => { need(a, 2, 'pow'); return Math.pow(num(a[0], 'pow'), num(a[1], 'pow')); });
    def('min', (a) => { if (!a.length) throw new N.NosError('min 需要参数'); return Math.min(...a.map((x) => num(x, 'min'))); });
    def('max', (a) => { if (!a.length) throw new N.NosError('max 需要参数'); return Math.max(...a.map((x) => num(x, 'max'))); });
    def('clamp', (a) => {
      need(a, 3, 'clamp');
      return Math.min(num(a[2], 'clamp'), Math.max(num(a[1], 'clamp'), num(a[0], 'clamp')));
    });
    def('rand', (a, vm) => {
      need(a, 0, 'rand');
      return vm.env.rand ? vm.env.rand() : Math.random();
    });

    // 数据
    def('json', (a, vm) => {
      need(a, 1, 'json');
      const s = JSON.stringify(a[0]);
      const r = s === undefined ? 'null' : s;
      bill(vm, r.length);
      return r;
    });
    def('parse', (a, vm) => {
      need(a, 1, 'parse');
      const s = str(a[0], 'parse');
      bill(vm, s.length);
      try { return JSON.parse(s); } catch (e) { throw new N.NosError('parse 失败：' + e.message); }
    });
    def('clone', (a, vm) => {
      need(a, 1, 'clone');
      bill(vm, sizeOf(a[0]));
      return cloneValue(a[0]);
    });
    def('print', (a, vm) => {
      vm.log(a.map(tostr).join(' '));
      return null;
    });
    def('assert', (a) => {
      if (!a[0]) throw new N.NosError(a.length > 1 ? tostr(a[1]) : '断言失败');
      return null;
    });
    return lib;
  }

  const api = { makeStdlib };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NOS.stdlib = api;
})(typeof window !== 'undefined' ? window : globalThis);

};
defs["nos-vm"] = function (module, exports, require) {
'use strict';
/*
 * Nest Script (嵌套脚本, 扩展名 .ns) 的字节码虚拟机。
 *
 * 设计要点：
 *  - 指令是 JSON 数组，镜像 (image) 可以直接存进文件系统；虚拟机状态全部是可复制的数据，
 *    因此暂停、快照、恢复、分叉都只是复制这些数据。
 *  - 执行由"计量表" (meter) 限制：每条指令扣 1 单位，原生函数可以额外扣减。
 *    预算用完时虚拟机停在指令边界上，之后可以从同一位置继续。
 *  - 以 sys_ 开头的调用不在虚拟机内执行，而是陷入 (trap) 给所属的内核处理；
 *    以 priv_ 开头的调用只允许内核虚拟机使用。
 */

const NOS = (function () {
  class NosError extends Error {
    constructor(message) {
      super(message);
      this.nosMessage = message;
    }
  }

  const MAX_FRAMES = 1500;

  function fail(msg) {
    throw new NosError(msg);
  }

  function truthy(v) {
    return !(v === null || v === false || v === 0 || v === '' || v === undefined);
  }

  function hasOwn(o, k) {
    return Object.prototype.hasOwnProperty.call(o, k);
  }

  function isMap(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function typeName(v) {
    if (v === null || v === undefined) return 'nil';
    if (typeof v === 'boolean') return 'bool';
    if (typeof v === 'number') return 'number';
    if (typeof v === 'string') return 'string';
    if (Array.isArray(v)) return 'array';
    return 'map';
  }

  function tostr(v) {
    if (v === null || v === undefined) return 'nil';
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return JSON.stringify(v);
  }

  function binop(op, a, b) {
    switch (op) {
      case '+':
        if (typeof a === 'number' && typeof b === 'number') return a + b;
        if (typeof a === 'string' || typeof b === 'string') return tostr(a) + tostr(b);
        fail('+ 只能用于数字或字符串');
        break;
      case '-':
        if (typeof a === 'number' && typeof b === 'number') return a - b;
        fail('- 只能用于数字');
        break;
      case '*':
        if (typeof a === 'number' && typeof b === 'number') return a * b;
        fail('* 只能用于数字');
        break;
      case '/':
        if (typeof a === 'number' && typeof b === 'number') {
          if (b === 0) fail('除数为零');
          return a / b;
        }
        fail('/ 只能用于数字');
        break;
      case '%':
        if (typeof a === 'number' && typeof b === 'number') {
          if (b === 0) fail('除数为零');
          return a % b;
        }
        fail('% 只能用于数字');
        break;
      case '==':
        return a === b;
      case '!=':
        return a !== b;
      case '<':
      case '<=':
      case '>':
      case '>=': {
        if (!((typeof a === 'number' && typeof b === 'number') || (typeof a === 'string' && typeof b === 'string'))) {
          fail(op + ' 只能比较两个数字或两个字符串');
        }
        if (op === '<') return a < b;
        if (op === '<=') return a <= b;
        if (op === '>') return a > b;
        return a >= b;
      }
      default:
        fail('未知运算符 ' + op);
    }
    return null;
  }

  function getIndex(o, k) {
    if (Array.isArray(o)) {
      if (typeof k !== 'number') fail('数组下标必须是数字，而不是 ' + typeName(k));
      const v = o[k];
      return v === undefined ? null : v;
    }
    if (typeof o === 'string') {
      if (typeof k !== 'number') fail('字符串下标必须是数字');
      return k >= 0 && k < o.length ? o.charAt(k) : null;
    }
    if (isMap(o)) {
      if (typeof k !== 'string' && typeof k !== 'number') fail('映射的键必须是字符串或数字');
      const key = String(k);
      return hasOwn(o, key) ? o[key] : null;
    }
    fail('不能对 ' + typeName(o) + ' 取下标');
    return null;
  }

  function setIndex(o, k, v) {
    if (Array.isArray(o)) {
      if (typeof k !== 'number' || k < 0 || k > o.length || Math.floor(k) !== k) fail('数组下标越界或不是整数: ' + tostr(k));
      o[k] = v;
      return;
    }
    if (isMap(o)) {
      if (typeof k !== 'string' && typeof k !== 'number') fail('映射的键必须是字符串或数字');
      const key = String(k);
      if (key === '__proto__') fail('非法的键 ' + key);
      o[key] = v;
      return;
    }
    fail('不能给 ' + typeName(o) + ' 赋值下标');
  }

  // 深复制 JSON 形态的数据（数组、映射、基本类型）。
  function cloneValue(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) {
      const out = new Array(v.length);
      for (let i = 0; i < v.length; i++) out[i] = cloneValue(v[i]);
      return out;
    }
    const out = {};
    for (const k of Object.keys(v)) out[k] = cloneValue(v[k]);
    return out;
  }

  // 估算数据规模（字符数，按 1 个单位计 256 个字符），用于计费。
  function sizeOf(v) {
    if (v === null || v === undefined) return 1;
    if (typeof v === 'string') return v.length;
    if (typeof v !== 'object') return 1;
    let n = 0;
    if (Array.isArray(v)) {
      for (const x of v) n += sizeOf(x) + 1;
    } else {
      for (const k of Object.keys(v)) n += k.length + sizeOf(v[k]) + 1;
    }
    return n;
  }

  class Machine {
    /*
     * image: { code, lines, funcs: {name: {entry, np, ns}}, src? }
     * opts:  { args, natives, privs, priv, env, name }
     *   natives: 普通原生函数 name -> (args, vm) => value
     *   privs:   内核专用原生函数（仅 priv 为真时可调用）
     *   env:     宿主环境对象，原生函数通过 vm.env 访问（例如随机数、计费）
     */
    constructor(image, opts) {
      opts = opts || {};
      this.image = image;
      this.code = image.code;
      this.lines = image.lines || [];
      this.funcs = image.funcs;
      this.natives = opts.natives || {};
      this.privs = opts.privs || {};
      this.priv = !!opts.priv;
      this.env = opts.env || {};
      this.name = opts.name || 'program';
      this.G = {};
      this.stack = [];
      this.frames = [];
      this.L = [];
      this.pc = typeof image.init === 'number' ? image.init : 0;
      this.status = 'ready';
      this.trap = null;
      this.result = null;
      this.error = null;
      this.args = opts.args || [];
      this.logs = [];
      this.meter = null;
      this.errPc = -1;
    }

    charge(n) {
      if (this.meter) this.meter.left -= n;
    }

    log(text) {
      this.logs.push(text);
      if (this.logs.length > 200) this.logs.splice(0, this.logs.length - 200);
    }

    lineOf(pc) {
      const l = this.lines[pc];
      return typeof l === 'number' ? l : 0;
    }

    fail(e, pc) {
      this.status = 'error';
      const message = e instanceof NosError ? e.nosMessage : (e && e.message) || String(e);
      this.error = { message, line: this.lineOf(pc), pc };
    }

    resume(value) {
      if (this.status !== 'trap') return;
      this.stack.push(value === undefined ? null : value);
      this.trap = null;
      this.status = 'ready';
    }

    // 执行到预算用完、陷入、退出或出错为止。返回新的状态字符串。
    run(meter) {
      if (this.status !== 'ready') return this.status;
      this.meter = meter;
      const code = this.code;
      const stack = this.stack;
      let pc = this.pc;
      try {
        for (;;) {
          if (meter.left <= 0) {
            this.pc = pc;
            return 'quantum';
          }
          const ins = code[pc++];
          meter.left -= 1;
          switch (ins[0]) {
            case 'c':
              stack.push(ins[1]);
              break;
            case 'l':
              stack.push(this.L[ins[1]]);
              break;
            case 's':
              this.L[ins[1]] = stack.pop();
              break;
            case 'g': {
              const v = this.G[ins[1]];
              stack.push(v === undefined ? null : v);
              break;
            }
            case 'G':
              this.G[ins[1]] = stack.pop();
              break;
            case 'p':
              stack.pop();
              break;
            case 'j':
              pc = ins[1];
              break;
            case 'jf':
              if (!truthy(stack.pop())) pc = ins[1];
              break;
            case 'jfk':
              if (!truthy(stack[stack.length - 1])) pc = ins[1];
              else stack.pop();
              break;
            case 'jtk':
              if (truthy(stack[stack.length - 1])) pc = ins[1];
              else stack.pop();
              break;
            case 'bin': {
              const b = stack.pop();
              const a = stack.pop();
              stack.push(binop(ins[1], a, b));
              break;
            }
            case 'un': {
              const a = stack.pop();
              if (ins[1] === '!') stack.push(!truthy(a));
              else if (typeof a === 'number') stack.push(-a);
              else fail('负号只能用于数字');
              break;
            }
            case 'arr': {
              const n = ins[1];
              const arr = n ? stack.splice(stack.length - n, n) : [];
              stack.push(arr);
              break;
            }
            case 'map': {
              const keys = ins[1];
              const n = keys.length;
              const vals = n ? stack.splice(stack.length - n, n) : [];
              const o = {};
              for (let i = 0; i < n; i++) setIndex(o, keys[i], vals[i]);
              stack.push(o);
              break;
            }
            case 'idx': {
              const k = stack.pop();
              const o = stack.pop();
              stack.push(getIndex(o, k));
              break;
            }
            case 'sidx': {
              const v = stack.pop();
              const k = stack.pop();
              const o = stack.pop();
              setIndex(o, k, v);
              break;
            }
            case 'argv':
              stack.push(this.args);
              break;
            case 'call': {
              const name = ins[1];
              const n = ins[2];
              const args = n ? stack.splice(stack.length - n, n) : [];
              const fn = hasOwn(this.funcs, name) ? this.funcs[name] : null;
              if (fn) {
                if (args.length !== fn.np) fail(`函数 ${name} 需要 ${fn.np} 个参数，收到 ${args.length} 个`);
                if (this.frames.length >= MAX_FRAMES) fail('调用栈溢出');
                this.frames.push({ pc, L: this.L });
                const L = new Array(fn.ns);
                for (let i = 0; i < fn.ns; i++) L[i] = i < args.length ? args[i] : null;
                this.L = L;
                pc = fn.entry;
                break;
              }
              if (hasOwn(this.natives, name)) {
                const r = this.natives[name](args, this);
                stack.push(r === undefined ? null : r);
                break;
              }
              if (name.startsWith('priv_')) {
                if (!this.priv) fail(`只有内核可以调用 ${name}`);
                if (!hasOwn(this.privs, name)) fail(`未定义的内核调用 ${name}`);
                const r = this.privs[name](args, this);
                stack.push(r === undefined ? null : r);
                break;
              }
              if (name.startsWith('sys_')) {
                if (this.priv) fail(`内核程序不能使用系统调用 ${name}`);
                this.pc = pc;
                this.trap = { name, args };
                this.status = 'trap';
                return 'trap';
              }
              fail(`未定义的函数 ${name}`);
              break;
            }
            case 'ret': {
              const v = stack.pop();
              const f = this.frames.pop();
              if (!f) {
                this.result = v === undefined ? null : v;
                this.status = 'exit';
                this.pc = pc;
                return 'exit';
              }
              this.L = f.L;
              pc = f.pc;
              stack.push(v);
              break;
            }
            case 'halt': {
              this.result = stack.length ? stack.pop() : null;
              this.status = 'exit';
              this.pc = pc;
              return 'exit';
            }
            default:
              fail('未知指令 ' + ins[0]);
          }
        }
      } catch (e) {
        this.errPc = pc - 1;
        this.fail(e, pc - 1);
        this.pc = pc;
        return 'error';
      }
    }

    snapshot() {
      return {
        pc: this.pc,
        stack: cloneValue(this.stack),
        frames: cloneValue(this.frames),
        L: cloneValue(this.L),
        G: cloneValue(this.G),
        status: this.status,
        trap: cloneValue(this.trap),
        result: cloneValue(this.result),
        error: cloneValue(this.error),
        args: cloneValue(this.args),
        logs: this.logs.slice(),
      };
    }

    restore(s) {
      this.pc = s.pc;
      this.stack = cloneValue(s.stack);
      this.frames = cloneValue(s.frames);
      this.L = cloneValue(s.L);
      this.G = cloneValue(s.G);
      this.status = s.status;
      this.trap = cloneValue(s.trap);
      this.result = cloneValue(s.result);
      this.error = cloneValue(s.error);
      this.args = cloneValue(s.args);
      this.logs = s.logs.slice();
      return this;
    }
  }

  return { Machine, NosError, truthy, tostr, binop, getIndex, setIndex, cloneValue, sizeOf, typeName, isMap, hasOwn };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = NOS;
} else {
  window.NOS = NOS;
}

};
defs["sim-natives"] = function (module, exports, require) {
'use strict';
/*
 * 飞行物理库（进程可调用的原生计算）。
 *
 * 直升机是一个简化的刚体：位置、速度、偏航/俯仰/横滚角与角速度，旋翼转速，
 * 总距与周期变距由飞控程序写入（经内核的消息），地面与障碍物的接触由地形网格和长方体给出。
 * 每个固定子步（1/120 秒）按规模计费；预算不足时停在已完成的子步上，之后从那里继续。
 *
 * 事件日志：输入（控制、风、航向、故障、目标）按虚拟时间记录；回放时按同样的时刻重新施加，结果相同。
 */

const G = 9.81;
const SUB = 1 / 120;          // 固定子步（秒）
const COST_STEP = 40;         // 每个子步计费（单位）
const CHECK_EVERY = 1;        // 检查点间隔（秒）

const scenes = new Map();     // 场景键 -> 预处理后的场景

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

// 解析场景文本（JSON），预计算地形采样参数。
function prepareScene(obj) {
  const t = obj.terrain;
  const n = t.n;
  return {
    name: obj.name,
    env: obj.env || {},
    terrain: { x0: t.x0, z0: t.z0, size: t.size, n, h: t.heights, step: t.size / (n - 1) },
    pads: obj.helipads || [],
    boxes: obj.obstacles || [],
    trees: obj.trees || [],
    heli: obj.heli || {},
    start: obj.start,
    record: obj.record || { events: [], duration: 15 },
    camera: obj.camera || {},
    parts: obj.parts || {},
  };
}

function terrainH(sc, x, z) {
  const T = sc.terrain;
  let fx = (x - T.x0) / T.step;
  let fz = (z - T.z0) / T.step;
  const maxI = T.n - 1;
  fx = clamp(fx, 0, maxI - 0.0001);
  fz = clamp(fz, 0, maxI - 0.0001);
  const i = Math.floor(fx), j = Math.floor(fz);
  const u = fx - i, v = fz - j;
  const h = T.h;
  const a = h[j * T.n + i], b = h[j * T.n + i + 1];
  const c = h[(j + 1) * T.n + i], d = h[(j + 1) * T.n + i + 1];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function inBox(sc, x, y, z, r) {
  for (const b of sc.boxes) {
    const ex = b.sx / 2 + r, ey = b.sy / 2 + r, ez = b.sz / 2 + r;
    const dx = x - b.x, dz = z - b.z;
    // 绕竖直轴旋转的长方体
    const c = Math.cos(-(b.rot || 0)), s = Math.sin(-(b.rot || 0));
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) < ex && Math.abs(lz) < ez && y < b.y + b.sy + r && y > b.y - r) return b;
  }
  return null;
}

// 旋翼推力方向（机体向上）与前向、右向
function axes(st) {
  const sy = Math.sin(st.yaw), cy = Math.cos(st.yaw);
  const sp = Math.sin(st.pitch), cp = Math.cos(st.pitch);
  const sr = Math.sin(st.roll), cr = Math.cos(st.roll);
  const right = [cy, 0, -sy];
  const upP = [-sp * sy, cp, -sp * cy];
  const up = [cr * upP[0] + sr * right[0], cr * upP[1] + sr * right[1], cr * upP[2] + sr * right[2]];
  return { right, up };
}

function ctlOf(st) {
  return st.ctl;
}

// 一个子步的物理推进（就地修改 st）
function substep(st, sc) {
  const dt = SUB;
  const m = 1;
  const alive = !st.crashed;
  const ctl = ctlOf(st);
  // 旋翼转速
  const engineOk = !st.engineOut;
  const omegaT = engineOk && st.rotorHealth > 0 ? 1 : (st.crashed ? 0 : 0.0);
  st.omega += (omegaT - st.omega) * Math.min(1, dt * (st.crashed ? 0.8 : 1.6));
  if (st.omega < 0) st.omega = 0;

  const c = alive ? clamp(ctl.c, 0, 1) : 0;
  // 总推力：悬停约在总距 0.5
  const thrustMax = m * G / (0.35 + 0.65 * 0.5);
  const T = thrustMax * st.omega * st.omega * (0.35 + 0.65 * c) * st.rotorHealth;

  // 姿态目标
  const lon = alive ? clamp(ctl.lon, -1, 1) : 0;
  const lat = alive ? clamp(ctl.lat, -1, 1) : 0;
  const thT = lon * 0.35, phT = lat * 0.35;
  const k = st.crashed ? 0 : 1;
  st.pitchRate += (k * 14 * (thT - st.pitch) - 7 * st.pitchRate + 0.55 * st.pitch) * dt;
  st.rollRate += (k * 14 * (phT - st.roll) - 7 * st.rollRate + 0.55 * st.roll) * dt;
  st.pitch += st.pitchRate * dt;
  st.roll += st.rollRate * dt;
  st.pitch = clamp(st.pitch, -1.4, 1.4);
  st.roll = clamp(st.roll, -1.4, 1.4);

  // 偏航：尾桨控制，故障时尾桨无效并产生偏转力矩
  let tail = alive ? clamp(ctl.tail, -1, 1) : 0;
  if (st.tailFault) tail = 0;
  const spin = st.tailFault ? 6.0 : 0;
  st.yawRate += ((tail * 2.2 - 1.2 * st.yawRate) + spin - 0.4 * st.yawRate * (st.tailFault ? 0 : 1)) * dt * (st.crashed ? 0.3 : 1);
  st.yaw += st.yawRate * dt;

  // 力：推力、重力、阻力（相对空气的速度）
  const ax_ = axes(st);
  const w = st.wind;
  const rvx = st.vx - w[0], rvy = st.vy, rvz = st.vz - w[1];
  const drag = 0.22;
  let ax = (T * ax_.up[0] - drag * rvx) / m;
  let ay = (T * ax_.up[1] - m * G - drag * rvy) / m;
  let az = (T * ax_.up[2] - drag * rvz) / m;
  if (st.crashed) { ax = -drag * st.vx / m * 0; ay = -G; az = 0; }

  st.vx += ax * dt;
  st.vy += ay * dt;
  st.vz += az * dt;
  st.x += st.vx * dt;
  st.y += st.vy * dt;
  st.z += st.vz * dt;

  // 地面接触（起落架高度 0.6 m）
  const gh = terrainH(sc, st.x, st.z);
  const skid = 0.6;
  if (st.y < gh + skid) {
    const impact = -st.vy;
    const tilt = Math.max(Math.abs(st.pitch), Math.abs(st.roll));
    st.y = gh + skid;
    if (!st.crashed) {
      if (impact > 2.6 || tilt > 0.6 || Math.abs(st.yawRate) > 2.6 && impact > 0.8 || st.rotorHealth < 1 && impact > 1.2) {
        crash(st, sc, 'ground');
      } else {
        st.vy = Math.max(0, st.vy) * 0;
        st.vx *= Math.max(0, 1 - 6 * dt);
        st.vz *= Math.max(0, 1 - 6 * dt);
        st.onGround = true;
      }
    } else {
      st.vy = -st.vy * 0.25;
      st.vx *= 0.85;
      st.vz *= 0.85;
      if (Math.abs(st.vy) < 0.15) st.vy = 0;
    }
  } else {
    st.onGround = false;
  }
  if (st.crashed && st.y <= gh + 0.3) {
    st.vy = 0;
    st.vx *= 0.9;
    st.vz *= 0.9;
  }

  // 障碍物（长方体）
  if (!st.crashed) {
    const hit = inBox(sc, st.x, st.y, st.z, 1.4);
    if (hit) {
      crash(st, sc, 'box:' + (hit.id || 'obstacle'));
    }
  }

  // 尾桨故障导致的失控：偏航很快时立即视为坠毁
  if (!st.crashed && Math.abs(st.yawRate) > 4.5) {
    crash(st, sc, 'spin');
  }

  st.t += dt;
  // 速度太大的爆炸式坠毁后限制数值
  if (st.crashed && !st.crashPos) st.crashPos = [st.x, st.y, st.z];
}

function crash(st, sc, why) {
  if (st.crashed) return;
  st.crashed = true;
  st.crashT = st.t;
  st.crashWhy = why;
  st.crashPos = [st.x, Math.max(st.y, terrainH(sc, st.x, st.z)), st.z];
  st.crashVel = [st.vx, st.vy, st.vz];
  st.rotorHealth = Math.min(st.rotorHealth, 0.25);
}

function applyEvent(st, ev) {
  // ev: [t, kind, value]
  const kind = ev[1];
  const v = ev[2];
  if (kind === 'ctl') {
    st.ctl = { c: Number(v.c), lon: Number(v.lon), lat: Number(v.lat), tail: Number(v.tail) };
  } else if (kind === 'wind') {
    st.wind = [Number(v[0]), Number(v[1])];
  } else if (kind === 'target') {
    st.target = [Number(v[0]), Number(v[1])];
  } else if (kind === 'fault') {
    if (v === 'tail') st.tailFault = true;
    else if (v === 'engine') st.engineOut = true;
    else if (v === 'rotor') st.rotorHealth = Math.min(st.rotorHealth, 0.6);
    else if (v === 'clear') { st.tailFault = false; st.engineOut = false; }
  } else if (kind === 'engine') {
    st.engineOut = !!v;
  }
}

function newState(sc) {
  const s = sc.start;
  return {
    t: 0,
    x: s.pos[0], y: s.pos[1], z: s.pos[2],
    vx: 0, vy: 0, vz: 0,
    yaw: s.yaw || 0, pitch: 0, roll: 0,
    yawRate: 0, pitchRate: 0, rollRate: 0,
    omega: 0,
    ctl: { c: 0, lon: 0, lat: 0, tail: 0 },
    wind: [...(sc.env.wind || [0, 0])],
    target: s.target ? [...s.target] : [0, 0],
    tailFault: false, engineOut: false, rotorHealth: 1,
    crashed: false, crashT: -1, crashWhy: '', crashPos: null, crashVel: null,
    onGround: true,
    ei: 0,          // 下一个待施加的预设事件
    log: [],        // 已施加的输入事件（回放用）
    cps: [],        // 检查点 [{t, st}]
    lastCp: -1,
  };
}

// 施加事件（实时输入与预设事件共用）：记录到日志
function inject(st, ev) {
  applyEvent(st, ev);
  st.log.push(ev);
}

// 推进到目标时刻（预算与子步数限制）。返回执行的子步数。
function runTo(st, sc, target, vm) {
  let steps = 0;
  const ev = st.evs || sc.record.events;
  const budget = vm && vm.meter ? vm.meter : null;
  while (st.t + 1e-9 < target) {
    if (budget && budget.left < COST_STEP) break;
    // 预设事件按时刻施加（只在预设模式下使用）
    while (st.ei < ev.length && ev[st.ei][0] <= st.t + 1e-9) {
      if (st.preset) { applyEvent(st, ev[st.ei]); st.log.push(ev[st.ei]); }
      st.ei++;
    }
    substep(st, sc);
    steps++;
    if (budget) budget.left -= COST_STEP;
    if (st.t - st.lastCp >= CHECK_EVERY - 1e-9) {
      st.lastCp = st.t;
      st.cps.push({ t: st.t, st: snapshotState(st) });
    }
  }
  return steps;
}

function snapshotState(st) {
  const out = {};
  for (const k of Object.keys(st)) {
    if (k === 'cps' || k === 'log' || k === 'evs') continue;
    const v = st[k];
    out[k] = Array.isArray(v) ? v.slice() : (v && typeof v === 'object' ? { ...v } : v);
  }
  return out;
}

// 读取某时刻之前最近的检查点并复制
function seekState(st, sc, target) {
  let base = null;
  for (const cp of st.cps) if (cp.t <= target + 1e-9) base = cp;
  const fresh = base ? base.st : null;
  const next = fresh ? restoreFrom(fresh) : newStateFromScene(sc);
  next.cps = st.cps.filter((c) => c.t <= (base ? base.t : -1) + 1e-9);
  next.lastCp = next.cps.length ? next.cps[next.cps.length - 1].t : -1;
  // 检查点之后的输入日志保留（回放时按时刻重施）
  next.log = st.log.filter((e) => e[0] <= (base ? base.t : 0) + 1e-9);
  next.preset = st.preset;
  next.evs = st.evs;
  next.ei = 0;
  const ev = st.evs || sc.record.events;
  while (next.ei < ev.length && ev[next.ei][0] <= next.t + 1e-9) next.ei++;
  return next;
}

function restoreFrom(s) {
  const r = {};
  for (const k of Object.keys(s)) r[k] = Array.isArray(s[k]) ? s[k].slice() : (s[k] && typeof s[k] === 'object' ? { ...s[k] } : s[k]);
  r.cps = [];
  r.log = [];
  return r;
}

function newStateFromScene(sc) {
  const st = newState(sc);
  st.preset = false;
  return st;
}

// 传感器：飞控程序读取的带时间戳的测量值（不含真值以外的信息）
function sense(st, sc) {
  const gh = terrainH(sc, st.x, st.z);
  return {
    t: st.t,
    alt: st.y - gh,
    x: st.x, y: st.y, z: st.z,
    vx: st.vx, vy: st.vy, vz: st.vz,
    pitch: st.pitch, roll: st.roll, yaw: st.yaw,
    yawRate: st.yawRate,
    rotor: st.omega * st.rotorHealth,
    tgtX: st.target[0], tgtZ: st.target[1],
    crashed: st.crashed,
    onGround: st.onGround,
  };
}

// 渲染用状态：三维视图需要的最小数据
function renderState(st, sc) {
  const gh = terrainH(sc, st.x, st.z);
  return {
    t: st.t,
    p: [st.x, st.y, st.z],
    yaw: st.yaw, pitch: st.pitch, roll: st.roll,
    rotor: st.omega * st.rotorHealth,
    crashed: st.crashed,
    crashT: st.crashT,
    crashPos: st.crashPos,
    crashVel: st.crashVel,
    crashWhy: st.crashWhy,
    gh,
    wind: st.wind,
    tailFault: st.tailFault,
    engineOut: st.engineOut,
    yawRate: st.yawRate,
    alt: st.y - gh,
    vy: st.vy,
    speed: Math.hypot(st.vx, st.vy, st.vz),
    ctl: { ...st.ctl },
    target: st.target,
    rotorHealth: st.rotorHealth,
  };
}

// 场景按文本缓存（字符串按引用传递，不复制），进程快照恢复后仍可直接使用
function sceneOf(text) {
  let sc = scenes.get(text);
  if (!sc) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error('场景文件格式错误：' + e.message); }
    if (!obj || !obj.terrain || !obj.start) throw new Error('场景缺少地形或起点');
    sc = prepareScene(obj);
    scenes.set(text, sc);
  }
  return sc;
}

function makeNatives() {
  return {
    // 检查场景并返回摘要（名称、时长、停机坪、是否带预置记录）
    sim_scene(a) {
      const sc = sceneOf(String(a[0]));
      return { name: sc.name, duration: sc.record.duration || 15, pads: sc.pads, hasRecord: sc.record.events.length > 0, boxes: sc.boxes.length, camera: sc.camera, env: sc.env, heli: sc.heli };
    },
    // 新建模拟状态。preset=true 时按场景预置的记录施加输入（默认演出）。
    sim_new(a) {
      const sc = sceneOf(String(a[0]));
      const st = newState(sc);
      st.preset = !!a[1];
      if (Array.isArray(a[2])) st.evs = a[2];
      return st;
    },
    // 推进到目标时刻；返回本次执行的子步数（预算不足时可能少于应有值）
    sim_run(a, vm) {
      const sc = sceneOf(String(a[0]));
      return runTo(a[1], sc, Number(a[2]), vm);
    },
    // 施加一条实时输入（记录到日志）
    sim_input(a) {
      inject(a[0], a[1]);
      return true;
    },
    // 回到目标时刻之前最近的检查点，返回复制的新状态（输入日志随之截断）
    sim_seek(a) {
      const sc = sceneOf(String(a[0]));
      return seekState(a[1], sc, Number(a[2]));
    },
    sim_sense(a) {
      return sense(a[1], sceneOf(String(a[0])));
    },
    sim_render(a) {
      return renderState(a[1], sceneOf(String(a[0])));
    },
    sim_log(a) {
      return a[0].log.slice();
    },
    sim_ground(a) {
      return terrainH(sceneOf(String(a[0])), Number(a[1]), Number(a[2]));
    },
  };
}

module.exports = { makeNatives, prepareScene, terrainH, substep, newState, runTo, applyEvent, scenes, sceneOf, SUB, G };

};
defs["universe"] = function (module, exports, require) {
'use strict';
/*
 * 系统树（宇宙）模型。
 *
 * 每个系统 (Sys) 包含：一份内核程序（存放在父系统的 /Kernels/ 下）、若干用户进程、
 * 自己的磁盘（键值存储，文件系统由内核程序在其上实现）、显示面、收件箱和虚拟时钟。
 * 宿主只提供：执行虚拟机、计量预算、磁盘配额、显示提交、外部输入和几项设备服务。
 *
 * 预算：每个逻辑步内，根系统拿到 cfg.budget 单位的预算；内核把它分给自己的进程与直属子系统（承载进程）。
 * 子系统的承载进程在父系统的调度中运行，子系统内部的消耗都从同一份计量中扣除，因此逐级受限。
 */
const NOS = require('./nos-vm.js');
const { makeStdlib } = require('./nos-stdlib.js');

const DT = 1 / 60;            // 固定逻辑步（父系统时间，秒）
const STEP_SEC = 0.1;         // 单步的固定时间长度（秒）
const COMPILE_BUDGET = 5e7;   // 编译器单次运行的上限（保护性）

function fnv(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

function cloneJSON(v) {
  return v === undefined ? null : JSON.parse(JSON.stringify(v));
}

function pathSize(text) {
  return text ? text.length : 0;
}

class Sys {
  constructor(u, id, parent) {
    this.u = u;
    this.id = id;
    this.parent = parent || null;
    this.kids = [];
    this.cfg = { budget: 60000, storQuota: 64 * 1024 * 1024 };
    this.rate = 1;
    this.clock = 0;
    this.paused = false;
    this.stepUsed = 0;
    this.lastUsed = 0;
    this.stat = { total: 0, self: 0, procs: 0, kids: 0 };
    this.disk = {};
    this.diskBytes = 0;
    this.kernelSrc = '';
    this.kernel = null;
    this.kernelErr = null;
    this.cpu = [];
    this.surf = {};
    this.surfV = 0;
    this.res = {};
    this.inbox = [];
    this.rngState = 0x2545f491;
    this.compilerImage = null;
    this.compilerKey = '';
    this.grantLog = [];
    this.stepping = false;
    this.grave = [];
  }

  get name() {
    return this.id;
  }

  frozen() {
    if (this.paused && !this.stepping) return true;
    return this.parent ? this.parent.frozen() : false;
  }

  rand() {
    // xorshift32，状态随系统保存，因此快照可以复现随机序列
    let x = this.rngState;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    this.rngState = x;
    return x / 4294967296;
  }

  setDisk(key, value) {
    const old = this.disk[key];
    const next = this.diskBytes - pathSize(old) + pathSize(value);
    if (value !== undefined && next > this.cfg.storQuota) {
      return '存储配额不足（需要 ' + Math.ceil(next / 1024) + ' KB，配额 ' + Math.ceil(this.cfg.storQuota / 1024) + ' KB）';
    }
    this.disk[key] = value;
    this.diskBytes = next;
    this.diskDirty = true;
    return true;
  }

  delDisk(key) {
    if (key in this.disk) {
      this.diskBytes -= pathSize(this.disk[key]);
      delete this.disk[key];
      this.diskDirty = true;
    }
  }

  // 按本系统的编译器编译源码；结果缓存（编译器与源码都相同则复用）。
  compile(src) {
    if (!this.compilerImage) return { ok: false, error: '系统缺少编译器（/System/compiler.nobj）' };
    const key = this.compilerKey + ':' + fnv(src) + ':' + src.length;
    const hit = this.u.compileCache.get(key);
    if (hit) return { ok: true, image: hit, cost: 0 };
    const m = new NOS.Machine(this.compilerImage, { natives: this.u.stdlib, env: {} });
    m.args = [src];
    const meter = { left: COMPILE_BUDGET };
    const st = m.run(meter);
    if (st !== 'exit') {
      const e = m.error || { message: '编译器异常', line: 0 };
      return { ok: false, error: e.message };
    }
    const r = m.result;
    if (!r || typeof r !== 'object' || !r.code) {
      return { ok: false, error: '编译器没有返回镜像' };
    }
    this.u.compileCache.set(key, r);
    return { ok: true, image: r, cost: COMPILE_BUDGET - meter.left };
  }

  kernelImage() {
    return this.compile(this.kernelSrc);
  }

  // 启动或重启内核：载入内核源文件并重新开始运行。进程与显示清空，磁盘保留。
  bootKernel(kernelSrc) {
    if (kernelSrc !== undefined) this.kernelSrc = kernelSrc;
    this.cpu = [];
    this.surf = {};
    this.inbox = [];
    this.kernelErr = null;
    this.clock = 0;
    const r = this.kernelImage();
    if (!r.ok) {
      this.kernelErr = { message: '内核无法编译：' + r.error, line: 0 };
      this.kernel = null;
      return false;
    }
    this.kernel = new NOS.Machine(r.image, { natives: this.u.stdlib, privs: this.u.kernelPrivs(this), priv: true, env: this.processEnv() });
    return true;
  }

  processEnv() {
    return {
      rand: () => this.rand(),
      measure: (text, size) => this.u.host.measure(text, size),
      sys: this,
    };
  }

  // 运行内核（及其承载的全部后代）。meter 为父系统拨付的计量。
  runKernel(meter, force) {
    if (!this.kernel || this.kernelErr) return 'stopped';
    if (!force && this.frozen()) return 'frozen';
    const before = meter.left;
    const st = this.kernel.run(meter);
    // 内核空闲时剩余的预算退还给父系统（空闲不计费）
    if (this.kernel.idleLeft !== undefined) {
      meter.left = this.kernel.idleLeft;
      this.kernel.idleLeft = undefined;
      this.idled = true;
    }
    this.stat.total += before - meter.left;
    if (st === 'error') {
      this.kernelErr = { message: this.kernel.error.message, line: this.kernel.error.line };
      this.u.emit({ type: 'kernel-error', sys: this.id, error: this.kernelErr });
    } else if (st === 'exit') {
      this.kernelErr = { message: '内核已经退出', line: 0 };
    }
    return st;
  }

  // 运行一个直属子系统的承载份额：返回实际消耗的单位。
  runChildSlice(child, sub, q) {
    if (child.kernelErr || !child.kernel) return { reason: 'frozen', used: 0 };
    if (child.frozen()) return { reason: 'frozen', used: 0 };
    const allow = Math.min(q, sub.left, child.cfg.budget - child.stepUsed);
    if (allow <= 0) return { reason: 'budget', used: 0 };
    const m = { left: allow };
    child.idled = false;
    child.runKernel(m, false);
    const used = allow - m.left;
    child.stepUsed += used;
    child.lastUsed += used;
    sub.left -= used;
    if (child.kernelErr) return { reason: 'frozen', used };
    return { reason: child.idled ? 'idle' : 'quantum', used };
  }

  info() {
    return {
      id: this.id,
      parentId: this.parent ? this.parent.id : null,
      name: this.id,
      state: this.kernelErr ? 'error' : this.frozen() ? (this.paused ? 'paused' : 'suspended') : 'running',
      paused: this.paused,
      rate: this.rate,
      clock: this.clock,
      budget: this.cfg.budget,
      storQuota: this.cfg.storQuota,
      diskBytes: this.diskBytes,
      lastUsed: this.lastUsed,
      stat: { ...this.stat, self: this.stat.total - this.stat.procs - this.stat.kids },
      kernelErr: this.kernelErr,
    };
  }

  // ---- 快照 ----
  toJSON() {
    return {
      id: this.id,
      rate: this.rate,
      clock: this.clock,
      paused: this.paused,
      cfg: { ...this.cfg },
      stat: { ...this.stat },
      rng: this.rngState,
      surfV: this.surfV,
      grave: cloneJSON(this.grave),
      disk: cloneJSON(this.disk),
      diskBytes: this.diskBytes,
      kernelSrc: this.kernelSrc,
      kernelErr: this.kernelErr,
      kernel: this.kernel ? this.kernel.snapshot() : null,
      cpu: this.cpu.map((p, pid) => {
        if (!p) return null;
        if (p.carrier) return { pid, carrier: p.carrier };
        return { pid, image: p.image, machine: p.snapshot(), name: p.name };
      }),
      surf: cloneJSON(this.surf),
      res: cloneJSON(this.res),
      inbox: cloneJSON(this.inbox),
      kids: this.kids.map((k) => k.toJSON()),
    };
  }
}

class Universe {
  // host: { measure(text,size), emit(event), web(sys, op, arg), dialog(...) }
  constructor(host) {
    this.host = host || {};
    this.systems = new Map();
    this.compileCache = new Map();
    this.stdlib = makeStdlib();
    this.processNatives = Object.assign({}, this.stdlib, require('./sim-natives.js').makeNatives());
    this.processNatives.measure = (a, vm) => (vm.env.measure ? vm.env.measure(String(a[0]), Number(a[1]) || 12) : String(a[0]).length * (Number(a[1]) || 12) * 0.6);
    this.stepNo = 0;
    this.seq = 0;
    this.root = null;
    this.drag = null;
    this.template = {};     // 路径 -> 文本（子系统的初始文件）
    this.rootTemplate = {}; // 只给根系统的文件
    this.events = [];
  }

  emit(ev) {
    this.events.push(ev);
    if (this.events.length > 200) this.events.splice(0, this.events.length - 200);
    if (this.host.emit) this.host.emit(ev);
  }

  get(id) {
    return this.systems.get(id) || null;
  }

  nextId() {
    this.seq += 1;
    return 'inner-' + this.seq;
  }

  preorder(fn, sys = this.root) {
    if (!sys) return;
    fn(sys);
    for (const k of sys.kids) this.preorder(fn, k);
  }

  // 创建系统并写入初始磁盘（模板文件）。磁盘与内核由调用者决定。
  newSys(id, parent, files) {
    const s = new Sys(this, id, parent);
    this.systems.set(id, s);
    if (parent) parent.kids.push(s);
    const idx = { '/': { t: 'd', s: 0, m: 0 } };
    for (const path of Object.keys(files)) {
      const parts = path.split('/').filter(Boolean);
      let dir = '';
      for (let i = 0; i < parts.length - 1; i++) {
        dir += '/' + parts[i];
        if (!idx[dir]) idx[dir] = { t: 'd', s: 0, m: 0 };
      }
      idx[path] = { t: 'f', s: files[path].length, m: 0 };
      s.setDisk('f:' + path, files[path]);
    }
    for (const d of ['/Documents', '/Downloads', '/Trash', '/Demo', '/System', '/Kernels', '/Snapshots']) {
      if (!idx[d]) idx[d] = { t: 'd', s: 0, m: 0 };
    }
    s.setDisk('fsidx', JSON.stringify(idx));
    s.compilerImage = this.compilerFromDisk(s);
    s.compilerKey = s.compilerImage ? fnv(s.disk['f:/System/compiler.nobj'] || '') : '';
    return s;
  }

  compilerFromDisk(s) {
    const text = s.disk['f:/System/compiler.nobj'];
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  makeRoot(rootFiles, kernelSrc) {
    const files = Object.assign({}, this.template, rootFiles);
    const r = this.newSys('outer', null, files);
    r.cfg = { budget: 120000, storQuota: 96 * 1024 * 1024 };
    this.root = r;
    r.bootKernel(kernelSrc);
    return r;
  }

  // 创建子系统：内核源文件由调用者（父系统内核）已经写入父磁盘，这里只创建实例并启动。
  makeChild(parent, id, kernelSrc, files) {
    const c = this.newSys(id, parent, files || this.template);
    c.cfg = { budget: 60000, storQuota: 48 * 1024 * 1024 };
    c.bootKernel(kernelSrc);
    return c;
  }

  // 删除子系统及其后代。
  removeSys(s) {
    for (const k of [...s.kids]) this.removeSys(k);
    this.systems.delete(s.id);
    if (s.parent) s.parent.kids = s.parent.kids.filter((x) => x !== s);
    s.kernel = null;
    s.cpu = [];
  }

  // 一个逻辑步：推进时间，再让根系统的内核运行（它会把预算逐级拨付下去）。
  tick() {
    this.stepNo += 1;
    this.preorder((s) => {
      s.stepUsed = 0;
      s.lastUsed = 0;
      if (!s.frozen()) s.clock += DT * s.rate;
    });
    const meter = { left: this.root.cfg.budget };
    this.root.runKernel(meter, false);
    this.root.lastUsed = this.root.cfg.budget - meter.left;
  }

  // 单步：父系统执行一个固定逻辑时间步，覆盖暂停的直属子系统及其后代。
  singleStep(child) {
    if (!child.parent || child.parent.frozen()) return { ok: false, error: '父系统或其祖先处于暂停，不能单步' };
    child.stepUsed = 0;
    const frozenBelow = (s) => {
      for (let x = s; x && x !== child; x = x.parent) if (x.paused) return true;
      return false;
    };
    this.preorder((s) => { if (!frozenBelow(s)) s.clock += STEP_SEC * s.rate; }, child);
    const meter = { left: child.cfg.budget };
    child.stepping = true;
    try {
      child.runKernel(meter, true);
    } finally {
      child.stepping = false;
    }
    const used = child.cfg.budget - meter.left;
    child.parent.stat.kids += used;
    child.parent.stat.total += used;
    child.stepUsed = used;
    return { ok: true, used };
  }

  setPaused(sys, v) {
    sys.paused = !!v;
    if (sys.parent && sys.parent.kernel) {
      sys.parent.inbox.push({ to: 'kernel', type: 'kid', id: sys.id, state: sys.paused ? 'frozen' : 'ready' });
    }
  }

  // ---- 内核特权调用 ----
  kernelPrivs(sys) {
    const u = this;
    return {
      priv_clock: () => sys.clock,
      priv_step: () => u.stepNo,
      priv_idle: (a, vm) => {
        if (vm.meter) { vm.idleLeft = vm.meter.left; vm.meter.left = 0; }
        return null;
      },
      priv_run: (a, vm) => {
        const pid = a[0];
        const q = a[1];
        const p = sys.cpu[pid];
        if (!p) return { reason: 'none', used: 0 };
        const meter = vm.meter;
        const sub = { left: Math.min(q, meter.left) };
        if (p.carrier) {
          const child = u.get(p.carrier);
          if (!child) return { reason: 'none', used: 0 };
          const r = sys.runChildSlice(child, sub, q);
          meter.left -= r.used;
          sys.stat.kids += r.used;
          return r;
        }
        const before = sub.left;
        const st = p.run(sub);
        const used = before - sub.left;
        meter.left -= used;
        sys.stat.procs += used;
        if (st === 'quantum') return { reason: 'quantum', used };
        if (st === 'trap') return { reason: 'trap', used, name: p.trap.name, args: p.trap.args };
        if (st === 'exit') return { reason: 'exit', used, result: p.result };
        return { reason: 'error', used, error: p.error };
      },
      priv_resume: (a) => {
        const p = sys.cpu[a[0]];
        if (p && !p.carrier) p.resume(a[1]);
        return null;
      },
      priv_proc_new: (a, vm) => {
        const pid = a[0];
        const r = sys.compile(a[1]);
        if (vm.meter) vm.meter.left -= r.cost || 0;
        if (!r.ok) return { ok: false, error: r.error };
        const m = new NOS.Machine(r.image, { natives: u.processNatives, env: sys.processEnv(), args: a[2] || [], name: pid });
        m.image = r.image;
        sys.cpu[pid] = m;
        return { ok: true };
      },
      priv_logs: (a) => {
        const p = sys.cpu[a[0]];
        if (p && p.logs) return p.logs.slice(-60);
        for (let i = sys.grave.length - 1; i >= 0; i--) {
          if (sys.grave[i].pid === a[0]) return sys.grave[i].logs.slice(-60);
        }
        return [];
      },
      priv_proc_free: (a) => {
        const p = sys.cpu[a[0]];
        if (p && p.logs && p.logs.length) {
          sys.grave.push({ pid: a[0], name: p.name, logs: p.logs.slice(-40) });
          if (sys.grave.length > 60) sys.grave.splice(0, sys.grave.length - 60);
        }
        sys.cpu[a[0]] = null;
        return null;
      },
      priv_carrier_new: (a) => {
        sys.cpu[a[0]] = { carrier: a[1] };
        return null;
      },
      priv_disk_get: (a, vm) => {
        const v = sys.disk[a[0]];
        if (v === undefined) return null;
        if (vm.charge) vm.charge(Math.ceil(v.length / 256));
        return v;
      },
      priv_disk_put: (a, vm) => {
        const r = sys.setDisk(a[0], a[1]);
        if (vm.charge) vm.charge(Math.ceil(String(a[1] || '').length / 256));
        return r;
      },
      priv_disk_del: (a) => { sys.delDisk(a[0]); return null; },
      priv_disk_move: (a, vm) => {
        const v = sys.disk[a[0]];
        if (v === undefined) return false;
        sys.delDisk(a[0]);
        sys.setDisk(a[1], v);
        if (vm.charge) vm.charge(Math.ceil(v.length / 1024));
        return true;
      },
      priv_submit: (a, vm) => {
        const nodes = cloneJSON(a[1] || []);
        sys.surfV += 1;
        sys.surf[a[0]] = { v: sys.surfV, nodes };
        if (vm.charge) vm.charge(1 + Math.ceil(nodes.length / 8));
        u.host.dirty && u.host.dirty();
        return null;
      },
      priv_inbox_pop: () => (sys.inbox.length ? sys.inbox.shift() : null),
      priv_post: (a) => {
        const t = u.get(a[0]);
        if (!t) return false;
        t.inbox.push(cloneJSON(a[1]));
        return true;
      },
      priv_drag_begin: (a) => { u.drag = { sys: sys.id, payload: a[0] }; u.host.dragBegin && u.host.dragBegin(u.drag); return null; },
      priv_drag_end: () => { u.drag = null; u.host.dragEnd && u.host.dragEnd(); return null; },
      priv_kids: () => sys.kids.map((k) => k.id),
      priv_kid_info: () => sys.kids.map((k) => k.info()),
      priv_child_new: (a) => {
        const src = a[0];
        const id = u.nextId();
        const r = sys.compile(src);
        if (!r.ok) return { ok: false, value: null, error: '子系统内核无法编译：' + r.error };
        const files = Object.assign({}, u.template);
        const c = u.makeChild(sys, id, src, files);
        if (c.kernelErr) return { ok: false, value: null, error: c.kernelErr.message };
        return { ok: true, value: id, error: null };
      },
      priv_child_ctl: (a) => {
        const [id, action, arg] = a;
        const c = u.get(id);
        if (!c || c.parent !== sys) return { ok: false, value: null, error: '找不到子系统 ' + id };
        if (action === 'pause') { u.setPaused(c, true); return { ok: true, value: true, error: null }; }
        if (action === 'resume') { u.setPaused(c, false); return { ok: true, value: true, error: null }; }
        if (action === 'step') { const r = u.singleStep(c); return { ok: r.ok, value: r.used || 0, error: r.error || null }; }
        if (action === 'rate') {
          const v = Number(arg);
          if (!(v > 0 && v <= 8)) return { ok: false, value: null, error: '速率必须在 0 到 8 之间' };
          c.rate = v;
          return { ok: true, value: v, error: null };
        }
        if (action === 'budget') {
          const v = Math.max(0, Math.min(2000000, Math.floor(Number(arg))));
          c.cfg.budget = v;
          return { ok: true, value: v, error: null };
        }
        if (action === 'storage') {
          const v = Math.max(64 * 1024, Math.floor(Number(arg)));
          c.cfg.storQuota = v;
          return { ok: true, value: v, error: null };
        }
        if (action === 'restart') {
          const src = sys.disk['f:/Kernels/' + id + '.ns'];
          if (src === undefined) return { ok: false, value: null, error: '找不到内核源文件' };
          u.restartSubtree(c, src);
          u.setPaused(c, false);
          return { ok: true, value: id, error: null };
        }
        if (action === 'close') {
          u.removeSys(c);
          return { ok: true, value: id, error: null };
        }
        return { ok: false, value: null, error: '未知的操作 ' + action };
      },
      priv_child_snapshot: (a) => JSON.stringify(u.snapshotSys(u.get(a[0]))),
      priv_child_restore: (a) => {
        let snap;
        try { snap = JSON.parse(a[0]); } catch (e) { return { ok: false, value: null, error: '快照文件已损坏' }; }
        const r = u.restoreSys(sys, snap, !!a[1]);
        if (!r.ok) return { ok: false, value: null, error: r.error };
        return { ok: true, value: r.id, error: null };
      },
      priv_sysinfo: () => ({ ...sys.info(), disk: sys.diskBytes, kids: sys.kids.map((k) => k.id), frozen: sys.frozen() }),
      priv_budget_set: (a) => {
        const k = a[0];
        const v = Number(a[1]);
        if (!isFinite(v) || v < 0) return { ok: false, value: null, error: '数值无效' };
        if (k === 'budget') sys.cfg.budget = Math.floor(v);
        else if (k === 'storQuota') sys.cfg.storQuota = Math.floor(v);
        else return { ok: false, value: null, error: '未知的配额项' };
        return { ok: true, value: v, error: null };
      },
      priv_ancestors: () => {
        const out = [];
        for (let p = sys.parent; p; p = p.parent) out.push({ id: p.id, name: p.id });
        return out;
      },
      priv_frozen: (a) => {
        const t = u.get(a[0]);
        return t ? t.frozen() : true;
      },
      priv_res_put: (a) => { sys.res[a[0]] = cloneJSON(a[1]); return true; },
      priv_web: (a) => (u.host.web ? u.host.web(sys, a[0], a[1]) : null),
      priv_host: (a) => (u.host.dialog ? u.host.dialog(sys, a[0], a[1], a[2]) : null),
    };
  }

  // ---- 子树重启：重新载入内核源文件，按保留的结构从初始状态重新启动 ----
  restartSubtree(s, src) {
    const kids = [...s.kids];
    s.bootKernel(src);
    s.rngState = 0x2545f491;
    s.stat = { total: 0, self: 0, procs: 0, kids: 0 };
    for (const k of kids) {
      const ksrc = s.disk['f:/Kernels/' + k.id + '.ns'];
      if (ksrc !== undefined) this.restartSubtree(k, ksrc);
    }
  }

  // ---- 快照 / 恢复 / 分叉 ----
  snapshotSys(s) {
    if (!s) return null;
    const snap = s.toJSON();
    snap.format = 'nested-os-snapshot';
    snap.version = 1;
    return snap;
  }

  restoreSys(parent, snap, fork) {
    if (!snap || snap.format !== 'nested-os-snapshot') return { ok: false, error: '不是有效的快照' };
    let data = snap;
    if (fork) {
      data = this.remapIds(snap, new Map());
    } else {
      // 恢复到原实例：先关闭同名的现有实例（包括其后代）
      const old = this.get(snap.id);
      if (old) this.removeSys(old);
      this.forEachId(snap, (id) => { const o = this.get(id); if (o) this.removeSys(o); });
    }
    const build = (d, par) => {
      const s = new Sys(this, d.id, par);
      this.systems.set(d.id, s);
      if (par) par.kids.push(s);
      s.rate = d.rate;
      s.clock = d.clock;
      s.paused = d.paused;
      s.cfg = { ...d.cfg };
      s.stat = { ...d.stat };
      s.rngState = d.rng;
      s.surfV = d.surfV;
      s.grave = cloneJSON(d.grave || []);
      s.disk = cloneJSON(d.disk);
      s.diskBytes = d.diskBytes;
      s.res = cloneJSON(d.res || {});
      s.surf = cloneJSON(d.surf || {});
      s.inbox = cloneJSON(d.inbox || []);
      s.compilerImage = this.compilerFromDisk(s);
      s.compilerKey = s.compilerImage ? fnv(s.disk['f:/System/compiler.nobj'] || '') : '';
      s.kernelSrc = d.kernelSrc;
      s.kernelErr = d.kernelErr;
      const kr = s.kernelImage();
      if (kr.ok && d.kernel) {
        s.kernel = new NOS.Machine(kr.image, { natives: this.stdlib, privs: this.kernelPrivs(s), priv: true, env: s.processEnv() });
        s.kernel.restore(d.kernel);
      }
      s.cpu = d.cpu.map((p) => {
        if (!p) return null;
        if (p.carrier) return { carrier: p.carrier };
        const m = new NOS.Machine(p.image, { natives: this.processNatives, env: s.processEnv(), name: p.name });
        m.image = p.image;
        m.restore(p.machine);
        return m;
      });
      for (const kd of d.kids) build(kd, s);
      return s;
    };
    const top = build(data, parent);
    // 让父系统的内核承载恢复后的子系统
    if (parent.kernel) parent.inbox.push({ to: 'kernel', type: 'kid-added', id: top.id });
    return { ok: true, id: top.id };
  }

  forEachId(d, fn) {
    fn(d.id);
    for (const k of d.kids) this.forEachId(k, fn);
  }

  // 分叉：把快照中的全部实例标识换成新的标识（字符串值与键同时替换）
  remapIds(snap, map) {
    const ids = [];
    this.forEachId(snap, (id) => ids.push(id));
    for (const id of ids) map.set(id, this.nextId());
    const walk = (v) => {
      if (typeof v === 'string') return map.has(v) ? map.get(v) : v;
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object') {
        const o = {};
        for (const k of Object.keys(v)) {
          const nk = map.has(k) ? map.get(k) : k;
          o[nk] = walk(v[k]);
        }
        return o;
      }
      return v;
    };
    return walk(snap);
  }

  // 根系统的磁盘（用于宿主持久化）
  rootDiskJSON() {
    return this.root ? JSON.stringify(this.root.disk) : '{}';
  }
}

module.exports = { Universe, Sys, DT, STEP_SEC, fnv };

};
window.RT = { require: req };
})();
