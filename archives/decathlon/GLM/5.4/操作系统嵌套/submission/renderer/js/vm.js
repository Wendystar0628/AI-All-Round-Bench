// ===========================================================================
//  NSL 虚拟机 —— 宿主提供的「执行程序的环境」
//  · 字节码 + 显式帧栈，运行位置可完整序列化（暂停/单步/快照/分叉）
//  · 每条指令计 1 个逻辑工作量，按规模加权的操作额外计费
//  · 指令不直接接触宿主 DOM / 计时器：所有系统服务经 SYSCALL 交给内核
// ===========================================================================
(function () {
  const OP = {
    CONST: 1, LOAD: 2, STORE: 3, GLOAD: 4, GSTORE: 5, GETIDX: 6, SETIDX: 7, GETPROP: 8, SETPROP: 9,
    ADD: 10, SUB: 11, MUL: 12, DIV: 13, MOD: 14, NEG: 15, NOT: 16,
    LT: 17, GT: 18, LE: 19, GE: 20, EQ: 21, NE: 22,
    JMP: 23, JZ: 24, JNZ: 25, CALL: 26, RET: 27, POP: 28, DUP: 29, SYS: 30,
    ARRNEW: 31, MAPNEW: 32, METHOD: 33, THROW: 34, TRY: 35, ENDTRY: 36, DUP2: 37
  };

  function isArr(v) { return Array.isArray(v); }
  function truthy(v) { return !(v === null || v === undefined || v === false || v === 0 || v === ''); }
  function toNum(v) {
    if (typeof v === 'number') return v;
    if (v === true) return 1;
    if (v === false || v === null || v === undefined) return 0;
    if (typeof v === 'string') { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
    return 0;
  }
  function typeOf(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number') return 'number';
    if (typeof v === 'string') return 'string';
    if (typeof v === 'boolean') return 'boolean';
    if (Array.isArray(v)) return 'array';
    return 'map';
  }
  function sizeOf(v, seen) {
    if (typeof v === 'string') return 24 + v.length * 2;
    if (typeof v === 'number') return 8;
    if (v === null || v === undefined || typeof v === 'boolean') return 4;
    if (typeof v !== 'object') return 8;
    if (seen.has(v)) return 0;
    seen.add(v);
    let s = 40;
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) s += sizeOf(v[i], seen); }
    else { for (const k in v) s += 24 + sizeOf(v[k], seen); }
    return s;
  }

  function createProcess(prog, opts) {
    opts = opts || {};
    return {
      id: opts.id || 0,
      prog: prog,
      name: prog && prog.name ? prog.name : 'program',
      frames: [{ pc: 0, locals: {}, stack: [], handlers: [] }],
      globals: {},
      state: 'ready',           // ready | running | sys | exit | error
      sys: null, sysArgs: null,
      error: null, exitValue: null,
      used: 0,                  // 累计逻辑工作量
      lastUsed: 0,
      mem: 64,
      memLimit: opts.memLimit || 8 * 1024 * 1024,
      quota: opts.quota || 0,   // 内核使用的单进程执行上限
      tag: opts.tag || ''
    };
  }

  function recount(p) {
    const seen = new Set();
    let s = 128;
    s += sizeOf(p.globals, seen);
    for (const f of p.frames) {
      s += sizeOf(f.locals, seen);
      s += sizeOf(f.stack, seen);
    }
    p.mem = s;
  }
  function memAdd(p, n) {
    p.mem += n;
    if (p.mem > p.memLimit) {
      recount(p);
      if (p.mem > p.memLimit) { p.state = 'error'; p.error = '内存不足：进程超出内存配额'; return false; }
    }
    return true;
  }

  function throwValue(p, val) {
    while (p.frames.length > 0) {
      const f = p.frames[p.frames.length - 1];
      if (f.handlers.length > 0) {
        const h = f.handlers.pop();
        f.stack.length = h.stackLen;
        f.pc = h.pc;
        f.stack.push(val);
        return true;
      }
      p.frames.pop();
    }
    p.state = 'error';
    p.error = val;
    return false;
  }
  function fail(p, msg) { throwValue(p, msg); return false; }

  // ---- 方法调用 -----------------------------------------------------------
  const MATH = { __math: true };
  function callMethod(p, recv, name, args) {
    if (name === 'type') return typeOf(recv);
    if (name === 'toStr') return recv === null || recv === undefined ? 'null' : String(recv);
    if (recv && typeof recv === 'object' && recv.__math) {
      switch (name) {
        case 'max': return Math.max(toNum(args[0]), toNum(args[1]));
        case 'min': return Math.min(toNum(args[0]), toNum(args[1]));
        case 'abs': return Math.abs(toNum(args[0]));
        case 'floor': return Math.floor(toNum(args[0]));
        case 'ceil': return Math.ceil(toNum(args[0]));
        case 'round': return Math.round(toNum(args[0]));
        case 'sqrt': return Math.sqrt(toNum(args[0]));
        case 'sin': return Math.sin(toNum(args[0]));
        case 'cos': return Math.cos(toNum(args[0]));
        case 'tan': return Math.tan(toNum(args[0]));
        case 'atan': return Math.atan(toNum(args[0]));
        case 'atan2': return Math.atan2(toNum(args[0]), toNum(args[1]));
        case 'pow': return Math.pow(toNum(args[0]), toNum(args[1]));
        case 'clamp': return Math.min(Math.max(toNum(args[0]), toNum(args[1])), toNum(args[2]));
        default: return fail(p, 'Math 不支持 ' + name);
      }
    }
    const t = typeOf(recv);
    if (t === 'array') {
      switch (name) {
        case 'push': recv.push(args[0]); memAdd(p, 8); return recv.length;
        case 'pop': return recv.pop();
        case 'shift': return recv.shift();
        case 'unshift': recv.unshift(args[0]); return recv.length;
        case 'insert': recv.splice(toNum(args[0]), 0, args[0]); return recv.length;
        case 'removeAt': recv.splice(toNum(args[0]), 1); return recv.length;
        case 'indexOf': return recv.indexOf(args[0]);
        case 'contains': return recv.indexOf(args[0]) >= 0;
        case 'join': { const s = recv.map((x) => (x === null || x === undefined ? '' : String(x))).join(args[0] === undefined ? ',' : String(args[0])); memAdd(p, s.length); return s; }
        case 'slice': return recv.slice(toNum(args[0]), args[1] === undefined ? undefined : toNum(args[1]));
        case 'concat': { const r = recv.slice(); if (isArr(args[0])) for (const x of args[0]) r.push(x); memAdd(p, r.length * 8); return r; }
        case 'sort': recv.sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b)))); return recv;
        case 'reverse': recv.reverse(); return recv;
        case 'clear': recv.length = 0; return recv;
        case 'last': return recv[recv.length - 1];
        case 'removeValue': { const i = recv.indexOf(args[0]); if (i >= 0) recv.splice(i, 1); return recv; }
        default: return fail(p, '数组不支持方法 ' + name);
      }
    }
    if (t === 'string') {
      switch (name) {
        case 'charAt': return recv.charAt(toNum(args[0]));
        case 'charCodeAt': { const i = toNum(args[0]); return i >= 0 && i < recv.length ? recv.charCodeAt(i) : -1; }
        case 'indexOf': return recv.indexOf(String(args[0]));
        case 'lastIndexOf': return recv.lastIndexOf(String(args[0]));
        case 'substr': return recv.substr(toNum(args[0]), args[1] === undefined ? undefined : toNum(args[1]));
        case 'substring': return recv.substring(toNum(args[0]), args[1] === undefined ? undefined : toNum(args[1]));
        case 'slice': return recv.slice(toNum(args[0]), args[1] === undefined ? undefined : toNum(args[1]));
        case 'split': { const r = recv.split(args[0] === undefined ? '' : String(args[0])); memAdd(p, r.length * 8); return r; }
        case 'replace': { const s = recv.split(String(args[0])).join(String(args[1])); memAdd(p, s.length); return s; }
        case 'toUpperCase': return recv.toUpperCase();
        case 'toLowerCase': return recv.toLowerCase();
        case 'trim': return recv.trim();
        case 'startsWith': return recv.startsWith(String(args[0]));
        case 'endsWith': return recv.endsWith(String(args[0]));
        case 'repeat': { const s = recv.repeat(Math.max(0, toNum(args[0]))); memAdd(p, s.length); return s; }
        case 'toNumber': { const n = parseFloat(recv); return isNaN(n) ? 0 : n; }
        case 'padLeft': { let s = recv; while (s.length < toNum(args[0])) s = (args[1] === undefined ? ' ' : String(args[1])) + s; return s; }
        case 'toString': return recv;
        default: return fail(p, '字符串不支持方法 ' + name);
      }
    }
    if (t === 'number') {
      switch (name) {
        case 'floor': return Math.floor(recv);
        case 'ceil': return Math.ceil(recv);
        case 'round': return Math.round(recv);
        case 'abs': return Math.abs(recv);
        case 'sqrt': return Math.sqrt(recv);
        case 'sin': return Math.sin(recv);
        case 'cos': return Math.cos(recv);
        case 'tan': return Math.tan(recv);
        case 'atan': return Math.atan(recv);
        case 'atan2': return Math.atan2(recv, toNum(args[0]));
        case 'pow': return Math.pow(recv, toNum(args[0]));
        case 'min': return Math.min(recv, toNum(args[0]));
        case 'max': return Math.max(recv, toNum(args[0]));
        case 'toFixed': return recv.toFixed(toNum(args[0]));
        case 'toChar': return String.fromCharCode(recv);
        case 'toString': return String(recv);
        case 'toHex': { let s = Math.max(0, recv | 0).toString(16); while (s.length < toNum(args[0] || 0)) s = '0' + s; return s; }
        default: return fail(p, '数字不支持方法 ' + name);
      }
    }
    if (t === 'map') {
      switch (name) {
        case 'keys': return Object.keys(recv);
        case 'values': return Object.keys(recv).map((k) => recv[k]);
        case 'has': return Object.prototype.hasOwnProperty.call(recv, args[0]);
        case 'del': delete recv[args[0]]; return true;
        case 'size': return Object.keys(recv).length;
        case 'copy': { const r = {}; for (const k in recv) r[k] = recv[k]; return r; }
        default: return fail(p, '映射不支持方法 ' + name);
      }
    }
    return fail(p, '不能对 ' + t + ' 调用方法 ' + name);
  }

  function step(p, budget) {
    if (p.state === 'exit' || p.state === 'error') return { status: p.state, used: 0 };
    p.state = 'running';
    p.sys = null; p.sysArgs = null;
    const code = p.prog.code, consts = p.prog.consts, funcs = p.prog.funcs;
    let used = 0;
    while (used < budget) {
      const f = p.frames[p.frames.length - 1];
      if (!f) { p.state = 'exit'; break; }
      if (f.pc >= code.length) { fail(p, '程序计数器越界'); break; }
      const ins = code[f.pc++];
      const op = ins[0];
      const st = f.stack;
      used += 1;
      switch (op) {
        case OP.CONST: st.push(consts[ins[1]]); break;
        case OP.LOAD: {
          const k = consts[ins[1]];
          if (!(k in f.locals)) { fail(p, '未定义的变量 ' + k); break; }
          st.push(f.locals[k]); break;
        }
        case OP.STORE: f.locals[consts[ins[1]]] = st.pop(); break;
        case OP.GLOAD: {
          const k = consts[ins[1]];
          if (k === 'Math' && !(k in p.globals)) { st.push(MATH); break; }
          if (!(k in p.globals)) { fail(p, '未定义的变量 ' + k); break; }
          st.push(p.globals[k]); break;
        }
        case OP.GSTORE: p.globals[consts[ins[1]]] = st.pop(); break;
        case OP.GETIDX: {
          const i = st.pop(), o = st.pop();
          if (o === null || o === undefined) { fail(p, '不能读取空值的下标'); break; }
          if (isArr(o)) { const r = o[toNum(i)]; st.push(r === undefined ? null : r); }
          else if (typeof o === 'string') st.push(o.charAt(toNum(i)));
          else if (typeof o === 'object') { const r = o[String(i)]; st.push(r === undefined ? null : r); }
          else { fail(p, '不能对 ' + typeOf(o) + ' 使用下标'); }
          break;
        }
        case OP.SETIDX: {
          const v = st.pop(), i = st.pop(), o = st.pop();
          if (o === null || o === undefined) { fail(p, '不能写入空值的下标'); break; }
          if (isArr(o)) { o[toNum(i)] = v; if (!memAdd(p, 8)) break; }
          else if (typeof o === 'object') o[String(i)] = v;
          else fail(p, '不能对 ' + typeOf(o) + ' 赋值下标');
          break;
        }
        case OP.GETPROP: {
          const o = st.pop(), k = consts[ins[1]];
          if (o === null || o === undefined) { fail(p, '不能读取空值的属性 ' + k); break; }
          if (isArr(o)) {
            if (k === 'length') st.push(o.length);
            else if (k === 'first') st.push(o.length ? o[0] : null);
            else if (k === 'last') st.push(o.length ? o[o.length - 1] : null);
            else st.push(null);
          } else if (typeof o === 'string') {
            if (k === 'length') st.push(o.length);
            else st.push(null);
          } else if (typeof o === 'object') {
            const r = o[k];
            st.push(r === undefined ? null : r);
          } else if (typeof o === 'number' || typeof o === 'boolean') st.push(null);
          else fail(p, '不能读取 ' + typeOf(o) + ' 的属性');
          break;
        }
        case OP.SETPROP: {
          const v = st.pop(), o = st.pop(), k = consts[ins[1]];
          if (o === null || o === undefined || typeof o !== 'object') { fail(p, '不能写入 ' + typeOf(o) + ' 的属性'); break; }
          if (isArr(o)) { fail(p, '数组不支持属性赋值 ' + k); break; }
          o[k] = v;
          break;
        }
        case OP.ADD: {
          const b = st.pop(), a = st.pop();
          if (typeof a === 'string' || typeof b === 'string') {
            const s = (a === null || a === undefined ? '' : String(a)) + (b === null || b === undefined ? '' : String(b));
            used += Math.ceil(s.length / 16); memAdd(p, s.length); st.push(s);
          } else if (isArr(a) && isArr(b)) { const r = a.concat(b); memAdd(p, r.length * 8); st.push(r); }
          else st.push(toNum(a) + toNum(b));
          break;
        }
        case OP.SUB: { const b = st.pop(); st.push(toNum(st.pop()) - toNum(b)); break; }
        case OP.MUL: { const b = st.pop(); st.push(toNum(st.pop()) * toNum(b)); break; }
        case OP.DIV: { const b = toNum(st.pop()), a = toNum(st.pop()); st.push(b === 0 ? 0 : a / b); break; }
        case OP.MOD: { const b = toNum(st.pop()), a = toNum(st.pop()); st.push(b === 0 ? 0 : a % b); break; }
        case OP.NEG: st.push(-toNum(st.pop())); break;
        case OP.NOT: st.push(!truthy(st.pop())); break;
        case OP.LT: { const b = st.pop(), a = st.pop(); st.push(cmp(a, b) < 0); break; }
        case OP.GT: { const b = st.pop(), a = st.pop(); st.push(cmp(a, b) > 0); break; }
        case OP.LE: { const b = st.pop(), a = st.pop(); st.push(cmp(a, b) <= 0); break; }
        case OP.GE: { const b = st.pop(), a = st.pop(); st.push(cmp(a, b) >= 0); break; }
        case OP.EQ: { const b = st.pop(), a = st.pop(); st.push(eqv(a, b)); break; }
        case OP.NE: { const b = st.pop(), a = st.pop(); st.push(!eqv(a, b)); break; }
        case OP.JMP: f.pc = ins[1]; break;
        case OP.JZ: if (!truthy(st.pop())) f.pc = ins[1]; break;
        case OP.JNZ: if (truthy(st.pop())) f.pc = ins[1]; break;
        case OP.CALL: {
          const fn = funcs[consts[ins[1]]];
          const n = ins[2];
          if (!fn) { fail(p, '未定义的函数 ' + consts[ins[1]]); break; }
          const nf = { pc: fn.pc, locals: {}, stack: [], handlers: [] };
          for (let i = n - 1; i >= 0; i--) nf.locals[fn.params[i]] = st.pop();
          for (let i = n; i < fn.params.length; i++) nf.locals[fn.params[i]] = null;
          p.frames.push(nf);
          if (p.frames.length > 400) fail(p, '调用层数过深');
          break;
        }
        case OP.RET: {
          const v = st.length ? st.pop() : null;
          p.frames.pop();
          if (p.frames.length === 0) { p.state = 'exit'; p.exitValue = v; }
          else p.frames[p.frames.length - 1].stack.push(v);
          break;
        }
        case OP.POP: st.pop(); break;
        case OP.DUP: st.push(st[st.length - 1]); break;
        case OP.DUP2: { const a = st[st.length - 2]; st.push(a); st.push(st[st.length - 2]); break; }
        case OP.SYS: {
          const n = ins[2], args = [];
          for (let i = 0; i < n; i++) args.push(st.pop());
          args.reverse();
          p.sys = consts[ins[1]];
          p.sysArgs = args;
          p.state = 'sys';
          p.lastUsed = used; p.used += used;
          return { status: 'sys', sys: p.sys, args, used };
        }
        case OP.ARRNEW: {
          const n = ins[1], arr = new Array(n);
          for (let i = n - 1; i >= 0; i--) arr[i] = st.pop();
          used += Math.ceil(n / 2); memAdd(p, 40 + n * 8); st.push(arr); break;
        }
        case OP.MAPNEW: {
          const n = ins[1], m = {};
          for (let i = 0; i < n; i++) { const v = st.pop(), k = st.pop(); m[String(k)] = v; }
          used += n; memAdd(p, 40 + n * 24); st.push(m); break;
        }
        case OP.METHOD: {
          const n = ins[2], args = [];
          for (let i = 0; i < n; i++) args.push(st.pop());
          args.reverse();
          const recv = st.pop();
          used += 1;
          const r = callMethod(p, recv, consts[ins[1]], args);
          if (p.state === 'error') break;
          st.push(r === undefined ? null : r);
          break;
        }
        case OP.THROW: { const v = st.pop(); throwValue(p, v); break; }
        case OP.TRY: f.handlers.push({ pc: ins[1], stackLen: st.length }); break;
        case OP.ENDTRY: f.handlers.pop(); break;
        default: fail(p, '未知指令 ' + op); break;
      }
      if (p.state !== 'running') break;
    }
    p.lastUsed = used; p.used += used;
    return { status: p.state, used, error: p.error, value: p.exitValue };
  }

  function cmp(a, b) {
    if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
    const x = toNum(a), y = toNum(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  function eqv(a, b) {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    if (typeof a === 'number' || typeof b === 'number') return toNum(a) === toNum(b);
    return a === b;
  }

  function resume(p, value) {
    if (p.state !== 'sys') return false;
    const f = p.frames[p.frames.length - 1];
    if (!f) { p.state = 'exit'; return false; }
    f.stack.push(value === undefined ? null : value);
    p.state = 'running';
    p.sys = null; p.sysArgs = null;
    return true;
  }

  // 序列化 / 反序列化（快照、分叉）
  function serialize(p) {
    return {
      name: p.name, tag: p.tag, prog: p.prog,
      frames: p.frames, globals: p.globals,
      state: p.state, sys: p.sys, sysArgs: p.sysArgs,
      error: p.error, exitValue: p.exitValue,
      used: p.used, mem: p.mem, memLimit: p.memLimit, quota: p.quota
    };
  }
  function deserialize(o) {
    const p = createProcess(o.prog, { memLimit: o.memLimit, quota: o.quota, tag: o.tag });
    p.name = o.name; p.frames = o.frames; p.globals = o.globals;
    p.state = o.state; p.sys = o.sys; p.sysArgs = o.sysArgs;
    p.error = o.error; p.exitValue = o.exitValue;
    p.used = o.used; p.mem = o.mem; p.memLimit = o.memLimit; p.quota = o.quota;
    return p;
  }

  window.NSL = { OP, createProcess, step, resume, serialize, deserialize, recount, sizeOf, truthy, toNum, typeOf };
})();
