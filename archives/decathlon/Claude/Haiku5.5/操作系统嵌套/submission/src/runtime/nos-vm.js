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
