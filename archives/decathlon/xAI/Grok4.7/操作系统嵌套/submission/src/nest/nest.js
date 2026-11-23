// Nest 语言：编译为字节码，在可快照的虚拟机里分步执行。
// 子系统内核、窗口管理、应用与编译器都是这份格式的程序。

const OPS = {
  PUSHN: 1, PUSHS: 2, PUSHB: 3, PUSHNULL: 4,
  LOAD: 5, STORE: 6,
  ADD: 7, SUB: 8, MUL: 9, DIV: 10, MOD: 11,
  EQ: 12, NE: 13, LT: 14, GT: 15, LE: 16, GE: 17,
  NOT: 18, NEG: 19,
  JMP: 20, JZ: 21, JNZ: 22,
  CALL: 23, RET: 24, POP: 25,
  MAKEARR: 26, MAKEOBJ: 27, GETI: 28, SETI: 29, DUP: 30,
};

const OPNAME = Object.fromEntries(Object.entries(OPS).map(([k, v]) => [v, k]));

const INTRINSICS = new Set([
  "len", "push", "pop", "keys", "has", "str", "num", "kind",
  "slice", "split", "join", "replace", "index_of", "lower", "upper", "trim",
  "floor", "ceil", "round", "abs", "min", "max", "sin", "cos", "tan", "sqrt", "pow", "atan2",
  "json_parse", "json_stringify", "clone", "chr", "ord",
]);

export function compile(source) {
  const tokens = tokenize(source);
  const parser = new Parser(tokens, source);
  const ast = parser.parseProgram();
  if (parser.errors.length) return { ok: false, errors: parser.errors, program: null };
  const program = emitProgram(ast);
  return { ok: true, errors: [], program };
}

export function makeProc(program, name = "proc") {
  const fn = program.functions.main;
  if (!fn) {
    return {
      name, status: "error", error: "程序没有 main", stack: [], frames: [],
      slots: [], ip: 0, fn: null, program, instr: 0, instrTick: 0, debt: 0, job: null,
      trap: null, result: null, mem: 0,
    };
  }
  return {
    name,
    status: "ready",
    error: null,
    stack: [],
    frames: [],
    slots: new Array(fn.locals).fill(null),
    ip: 0,
    fn,
    program,
    instr: 0,
    instrTick: 0,
    debt: 0,
    job: null,
    trap: null,
    result: null,
    mem: 64,
  };
}

export function resume(proc, value) {
  if (!proc || proc.status === "halt" || proc.status === "error") return;
  proc.stack.push(value === undefined ? null : value);
  proc.status = "ready";
  proc.trap = null;
  proc.wait = null;
}

export function step(proc, maxInstr) {
  if (!proc) return { reason: "error", cost: 0, message: "没有进程" };
  if (proc.status === "error" || proc.status === "halt" || proc.status === "waiting" || proc.status === "suspended" || proc.status === "trap") {
    return { reason: proc.status, cost: 0, message: proc.error || null };
  }
  let cost = 0;
  proc.status = "running";
  try {
    while (cost < maxInstr) {
      if (proc.debt > 0) {
        const pay = Math.min(proc.debt, maxInstr - cost);
        proc.debt -= pay;
        cost += pay;
        if (proc.debt > 0) break;
        finishJob(proc);
        continue;
      }
      const code = proc.fn.code;
      if (proc.ip >= code.length) {
        doRet(proc, null);
        cost += 1;
        if (proc.status !== "running") break;
        continue;
      }
      const ins = code[proc.ip++];
      const op = ins[0];
      cost += 1;
      switch (op) {
        case OPS.PUSHN: proc.stack.push(ins[1]); break;
        case OPS.PUSHS: proc.stack.push(ins[1]); break;
        case OPS.PUSHB: proc.stack.push(ins[1] ? true : false); break;
        case OPS.PUSHNULL: proc.stack.push(null); break;
        case OPS.LOAD: proc.stack.push(proc.slots[ins[1]]); break;
        case OPS.STORE: {
          const v = proc.stack.pop();
          proc.slots[ins[1]] = v;
          break;
        }
        case OPS.ADD: {
          const b = proc.stack.pop();
          const a = proc.stack.pop();
          if (typeof a === "string" || typeof b === "string") {
            const s = toStr(a) + toStr(b);
            cost += s.length;
            proc.stack.push(s);
          } else {
            proc.stack.push(mustNum(a) + mustNum(b));
          }
          break;
        }
        case OPS.SUB: binNum(proc, (a, b) => a - b); break;
        case OPS.MUL: binNum(proc, (a, b) => a * b); break;
        case OPS.DIV: {
          const b = mustNum(proc.stack.pop());
          const a = mustNum(proc.stack.pop());
          if (b === 0) throw new Error("除零");
          proc.stack.push(a / b);
          break;
        }
        case OPS.MOD: {
          const b = mustNum(proc.stack.pop());
          const a = mustNum(proc.stack.pop());
          if (b === 0) throw new Error("除零");
          proc.stack.push(a % b);
          break;
        }
        case OPS.EQ: {
          const b = proc.stack.pop(); const a = proc.stack.pop();
          proc.stack.push(eqVal(a, b));
          break;
        }
        case OPS.NE: {
          const b = proc.stack.pop(); const a = proc.stack.pop();
          proc.stack.push(!eqVal(a, b));
          break;
        }
        case OPS.LT: cmp(proc, (a, b) => a < b); break;
        case OPS.GT: cmp(proc, (a, b) => a > b); break;
        case OPS.LE: cmp(proc, (a, b) => a <= b); break;
        case OPS.GE: cmp(proc, (a, b) => a >= b); break;
        case OPS.NOT: proc.stack.push(!truthy(proc.stack.pop())); break;
        case OPS.NEG: proc.stack.push(-mustNum(proc.stack.pop())); break;
        case OPS.JMP: proc.ip = ins[1]; break;
        case OPS.JZ: {
          const v = proc.stack.pop();
          if (!truthy(v)) proc.ip = ins[1];
          break;
        }
        case OPS.JNZ: {
          const v = proc.stack.pop();
          if (truthy(v)) proc.ip = ins[1];
          break;
        }
        case OPS.DUP: {
          const s = proc.stack;
          if (!s.length) throw new Error("栈为空");
          s.push(s[s.length - 1]);
          break;
        }
        case OPS.POP: proc.stack.pop(); break;
        case OPS.MAKEARR: {
          const n = ins[1];
          const arr = new Array(n);
          for (let i = n - 1; i >= 0; i--) arr[i] = proc.stack.pop();
          cost += n;
          proc.stack.push(arr);
          break;
        }
        case OPS.MAKEOBJ: {
          const n = ins[1];
          const pairs = new Array(n);
          for (let i = n - 1; i >= 0; i--) {
            const v = proc.stack.pop();
            const k = proc.stack.pop();
            pairs[i] = [toStr(k), v];
          }
          const obj = Object.create(null);
          for (const [k, v] of pairs) obj[k] = v;
          cost += n;
          proc.stack.push(obj);
          break;
        }
        case OPS.GETI: {
          const key = proc.stack.pop();
          const obj = proc.stack.pop();
          proc.stack.push(getIndex(obj, key));
          break;
        }
        case OPS.SETI: {
          const v = proc.stack.pop();
          const key = proc.stack.pop();
          const obj = proc.stack.pop();
          setIndex(obj, key, v);
          break;
        }
        case OPS.CALL: {
          const name = ins[1];
          const argc = ins[2];
          const target = proc.program.functions[name];
          if (target) {
            if (proc.frames.length > 64) throw new Error("调用过深");
            const args = new Array(argc);
            for (let i = argc - 1; i >= 0; i--) args[i] = proc.stack.pop();
            proc.frames.push({ fn: proc.fn, ip: proc.ip, slots: proc.slots });
            proc.fn = target;
            proc.ip = 0;
            const slots = new Array(target.locals).fill(null);
            for (let i = 0; i < argc && i < slots.length; i++) slots[i] = args[i];
            proc.slots = slots;
          } else if (INTRINSICS.has(name)) {
            const extra = callIntrinsic(proc, name, argc);
            cost += extra;
          } else {
            const args = new Array(argc);
            for (let i = argc - 1; i >= 0; i--) args[i] = proc.stack.pop();
            proc.trap = { name, args };
            proc.status = "trap";
            proc.instr += cost;
            proc.instrTick += cost;
            touchMem(proc);
            return { reason: "trap", cost, name, args };
          }
          break;
        }
        case OPS.RET: {
          const v = proc.stack.length ? proc.stack.pop() : null;
          doRet(proc, v);
          if (proc.status !== "running") {
            proc.instr += cost;
            proc.instrTick += cost;
            touchMem(proc);
            return { reason: proc.status, cost, value: proc.result, message: proc.error };
          }
          break;
        }
        default:
          throw new Error("非法指令 " + op);
      }
    }
  } catch (e) {
    proc.status = "error";
    proc.error = lineMsg(proc, e.message || String(e));
    proc.instr += cost;
    proc.instrTick += cost;
    return { reason: "error", cost, message: proc.error };
  }
  proc.instr += cost;
  proc.instrTick += cost;
  touchMem(proc);
  if (proc.status === "running") proc.status = "ready";
  return { reason: "budget", cost };
}

function doRet(proc, value) {
  if (!proc.frames.length) {
    proc.status = "halt";
    proc.result = value;
    proc.stack = [];
    return;
  }
  const prev = proc.frames.pop();
  proc.fn = prev.fn;
  proc.ip = prev.ip;
  proc.slots = prev.slots;
  proc.stack.push(value);
  proc.status = "running";
}

function finishJob(proc) {
  const job = proc.job;
  proc.job = null;
  if (!job) return;
  if (job.type === "json_parse") {
    let v;
    try {
      v = revive(JSON.parse(job.src));
    } catch (e) {
      throw new Error("JSON 无法解析");
    }
    proc.stack.push(v);
  } else if (job.type === "clone") {
    proc.stack.push(cloneVal(job.value));
  } else if (job.type === "json_stringify") {
    proc.stack.push(job.text != null ? job.text : JSON.stringify(job.value));
  }
}

function callIntrinsic(proc, name, argc) {
  const args = new Array(argc);
  for (let i = argc - 1; i >= 0; i--) args[i] = proc.stack.pop();
  const a0 = args[0];
  switch (name) {
    case "len": {
      if (a0 == null) { proc.stack.push(0); return 0; }
      if (typeof a0 === "string" || Array.isArray(a0)) { proc.stack.push(a0.length); return 0; }
      if (typeof a0 === "object") { proc.stack.push(Object.keys(a0).length); return 0; }
      proc.stack.push(0);
      return 0;
    }
    case "push": {
      if (!Array.isArray(a0)) throw new Error("push 需要数组");
      a0.push(args[1] === undefined ? null : args[1]);
      proc.stack.push(a0.length);
      return 1;
    }
    case "pop": {
      if (!Array.isArray(a0)) throw new Error("pop 需要数组");
      const v = a0.length ? a0.pop() : null;
      proc.stack.push(v);
      return 1;
    }
    case "keys": {
      if (a0 == null || typeof a0 !== "object" || Array.isArray(a0)) { proc.stack.push([]); return 0; }
      proc.stack.push(Object.keys(a0));
      return Object.keys(a0).length;
    }
    case "has": {
      const key = toStr(args[1]);
      if (a0 == null || typeof a0 !== "object") { proc.stack.push(false); return 0; }
      proc.stack.push(Object.prototype.hasOwnProperty.call(a0, key));
      return 0;
    }
    case "str": proc.stack.push(toStr(a0)); return toStr(a0).length;
    case "num": {
      const n = typeof a0 === "number" ? a0 : Number(toStr(a0));
      proc.stack.push(Number.isFinite(n) ? n : null);
      return 0;
    }
    case "kind": proc.stack.push(kindOf(a0)); return 0;
    case "slice": {
      const i = args.length > 1 ? (mustNum(args[1]) | 0) : 0;
      const j = args.length > 2 ? (mustNum(args[2]) | 0) : (a0 && a0.length) || 0;
      if (typeof a0 === "string") {
        const s = a0.slice(i, j);
        proc.stack.push(s);
        return s.length;
      }
      if (Array.isArray(a0)) {
        const s = a0.slice(i, j);
        proc.stack.push(s);
        return s.length;
      }
      throw new Error("slice 需要字符串或数组");
    }
    case "split": {
      const s = toStr(a0);
      const sep = args.length > 1 ? toStr(args[1]) : "";
      const parts = sep === "" ? [...s] : s.split(sep);
      proc.stack.push(parts);
      return s.length;
    }
    case "join": {
      if (!Array.isArray(a0)) throw new Error("join 需要数组");
      const sep = args.length > 1 ? toStr(args[1]) : "";
      const s = a0.map(toStr).join(sep);
      proc.stack.push(s);
      return s.length;
    }
    case "replace": {
      const s = toStr(a0);
      const from = toStr(args[1]);
      const to = toStr(args[2]);
      const out = from === "" ? s : s.split(from).join(to);
      proc.stack.push(out);
      return s.length + out.length;
    }
    case "index_of": {
      const from = args.length > 2 ? (mustNum(args[2]) | 0) : 0;
      if (typeof a0 === "string") proc.stack.push(a0.indexOf(toStr(args[1]), from));
      else if (Array.isArray(a0)) proc.stack.push(a0.indexOf(args[1], from));
      else proc.stack.push(-1);
      return 0;
    }
    case "lower": { const s = toStr(a0).toLowerCase(); proc.stack.push(s); return s.length; }
    case "upper": { const s = toStr(a0).toUpperCase(); proc.stack.push(s); return s.length; }
    case "trim": { const s = toStr(a0).trim(); proc.stack.push(s); return s.length; }
    case "floor": proc.stack.push(Math.floor(mustNum(a0))); return 0;
    case "ceil": proc.stack.push(Math.ceil(mustNum(a0))); return 0;
    case "round": proc.stack.push(Math.round(mustNum(a0))); return 0;
    case "abs": proc.stack.push(Math.abs(mustNum(a0))); return 0;
    case "min": proc.stack.push(Math.min(mustNum(a0), mustNum(args[1]))); return 0;
    case "max": proc.stack.push(Math.max(mustNum(a0), mustNum(args[1]))); return 0;
    case "sin": proc.stack.push(Math.sin(mustNum(a0))); return 0;
    case "cos": proc.stack.push(Math.cos(mustNum(a0))); return 0;
    case "tan": proc.stack.push(Math.tan(mustNum(a0))); return 0;
    case "sqrt": proc.stack.push(Math.sqrt(mustNum(a0))); return 0;
    case "pow": proc.stack.push(Math.pow(mustNum(a0), mustNum(args[1]))); return 0;
    case "atan2": proc.stack.push(Math.atan2(mustNum(a0), mustNum(args[1]))); return 0;
    case "chr": proc.stack.push(String.fromCharCode(mustNum(a0) | 0)); return 1;
    case "ord": {
      const s = toStr(a0);
      proc.stack.push(s.length ? s.charCodeAt(0) : 0);
      return 0;
    }
    case "json_parse": {
      const src = toStr(a0);
      proc.job = { type: "json_parse", src };
      proc.debt += src.length + 8;
      return 0;
    }
    case "json_stringify": {
      let text;
      try { text = JSON.stringify(a0); }
      catch (e) { throw new Error("JSON 无法序列化"); }
      proc.job = { type: "json_stringify", value: a0, text };
      proc.debt += text.length + 8;
      return 0;
    }
    case "clone": {
      proc.job = { type: "clone", value: a0 };
      proc.debt += roughSize(a0) + 4;
      return 0;
    }
    default:
      throw new Error("未知内建 " + name);
  }
}

function binNum(proc, fn) {
  const b = mustNum(proc.stack.pop());
  const a = mustNum(proc.stack.pop());
  proc.stack.push(fn(a, b));
}

function cmp(proc, fn) {
  const b = proc.stack.pop();
  const a = proc.stack.pop();
  if (typeof a === "number" && typeof b === "number") proc.stack.push(fn(a, b));
  else if (typeof a === "string" && typeof b === "string") proc.stack.push(fn(a, b));
  else proc.stack.push(false);
}

function eqVal(a, b) {
  if (typeof a === "number" && typeof b === "number") return a === b;
  return a === b;
}

function truthy(v) {
  return !(v === null || v === false || v === 0 || v === "");
}

function mustNum(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("需要数字");
  return v;
}

export function toStr(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return JSON.stringify(v);
}

function kindOf(v) {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return "number";
  if (typeof v === "string") return "string";
  if (typeof v === "boolean") return "bool";
  if (typeof v === "object") return "object";
  return "null";
}

function getIndex(obj, key) {
  if (obj == null) return null;
  if (typeof obj === "string") {
    const i = typeof key === "number" ? key : Number(key);
    if (!Number.isFinite(i) || i < 0 || i >= obj.length) return null;
    return obj.charAt(i);
  }
  if (typeof obj !== "object") return null;
  const k = typeof key === "number" && Array.isArray(obj) ? key : (typeof key === "number" ? String(key) : toStr(key));
  if (Array.isArray(obj)) {
    const i = typeof key === "number" ? key : Number(key);
    if (!Number.isInteger(i) || i < 0 || i >= obj.length) return null;
    return obj[i] === undefined ? null : obj[i];
  }
  const sk = typeof key === "string" ? key : toStr(key);
  return Object.prototype.hasOwnProperty.call(obj, sk) ? obj[sk] : null;
}

function setIndex(obj, key, v) {
  if (Array.isArray(obj)) {
    const i = typeof key === "number" ? key : Number(key);
    if (!Number.isInteger(i) || i < 0 || i > 1000000) throw new Error("下标无效");
    obj[i] = v;
    return;
  }
  if (obj == null || typeof obj !== "object") throw new Error("不能写入该值");
  obj[typeof key === "string" ? key : toStr(key)] = v;
}

function lineMsg(proc, msg) {
  const ins = proc.fn && proc.fn.code && proc.fn.code[Math.max(0, proc.ip - 1)];
  const line = ins && ins[3];
  return line ? `${msg}（第 ${line} 行）` : msg;
}

function touchMem(proc) {
  // 轻量估计：栈、槽和帧。大对象在分配时已计入 debt。
  let n = 64 + proc.stack.length * 8 + (proc.slots ? proc.slots.length * 8 : 0);
  proc.mem = n + (proc._memBase || 0);
}

export function recountMem(proc) {
  const seen = new Set();
  let n = 64;
  const walk = (v) => {
    if (v === null || v === undefined) return 4;
    if (typeof v === "number" || typeof v === "boolean") return 8;
    if (typeof v === "string") return 8 + v.length * 2;
    if (typeof v !== "object") return 8;
    if (seen.has(v)) return 0;
    seen.add(v);
    if (Array.isArray(v)) {
      let s = 16;
      for (const x of v) s += walk(x);
      return s;
    }
    let s = 16;
    for (const k of Object.keys(v)) s += k.length * 2 + 8 + walk(v[k]);
    return s;
  };
  n += walk(proc.stack);
  n += walk(proc.slots);
  for (const f of proc.frames) n += walk(f.slots);
  if (proc.job) n += walk(proc.job);
  proc.mem = n;
  proc._memBase = n;
  return n;
}

export function cloneVal(v, seen = new Map()) {
  if (v === null || typeof v !== "object") return v;
  if (seen.has(v)) return seen.get(v);
  if (Array.isArray(v)) {
    const a = new Array(v.length);
    seen.set(v, a);
    for (let i = 0; i < v.length; i++) a[i] = cloneVal(v[i], seen);
    return a;
  }
  const o = Object.create(null);
  seen.set(v, o);
  for (const k of Object.keys(v)) o[k] = cloneVal(v[k], seen);
  return o;
}

function revive(v, seen = new Map()) {
  if (v === null || typeof v !== "object") return v;
  if (seen.has(v)) return seen.get(v);
  if (Array.isArray(v)) {
    const a = new Array(v.length);
    seen.set(v, a);
    for (let i = 0; i < v.length; i++) a[i] = revive(v[i], seen);
    return a;
  }
  const o = Object.create(null);
  seen.set(v, o);
  for (const k of Object.keys(v)) o[k] = revive(v[k], seen);
  return o;
}

export function snapshotProc(proc) {
  recountMem(proc);
  return {
    name: proc.name,
    status: proc.status === "running" ? "ready" : proc.status,
    error: proc.error,
    stack: cloneVal(proc.stack),
    slots: cloneVal(proc.slots),
    ip: proc.ip,
    fn: proc.fn ? proc.fn.name : null,
    frames: proc.frames.map((f) => ({
      fn: f.fn ? f.fn.name : null,
      ip: f.ip,
      slots: cloneVal(f.slots),
    })),
    instr: proc.instr,
    instrTick: proc.instrTick,
    debt: proc.debt,
    job: proc.job ? cloneVal(proc.job) : null,
    trap: proc.trap ? cloneVal(proc.trap) : null,
    result: cloneVal(proc.result),
    wait: proc.wait ? cloneVal(proc.wait) : null,
    mem: proc.mem,
    program: proc.program,
  };
}

export function restoreProc(snap) {
  const program = snap.program;
  const fn = snap.fn ? program.functions[snap.fn] : null;
  const proc = {
    name: snap.name,
    status: snap.status,
    error: snap.error,
    stack: cloneVal(snap.stack) || [],
    slots: cloneVal(snap.slots) || [],
    ip: snap.ip,
    fn,
    frames: (snap.frames || []).map((f) => ({
      fn: f.fn ? program.functions[f.fn] : null,
      ip: f.ip,
      slots: cloneVal(f.slots) || [],
    })),
    program,
    instr: snap.instr || 0,
    instrTick: snap.instrTick || 0,
    debt: snap.debt || 0,
    job: snap.job ? cloneVal(snap.job) : null,
    trap: snap.trap ? cloneVal(snap.trap) : null,
    result: cloneVal(snap.result),
    wait: snap.wait ? cloneVal(snap.wait) : null,
    mem: snap.mem || 0,
  };
  return proc;
}

function tokenize(source) {
  const tokens = [];
  const s = source;
  let i = 0;
  let line = 1;
  const push = (t, v) => tokens.push({ t, v, line });
  while (i < s.length) {
    const c = s[i];
    if (c === "\n") { line++; i++; continue; }
    if (c === " " || c === "\t" || c === "\r") { i++; continue; }
    if (c === "#" || (c === "/" && s[i + 1] === "/")) {
      while (i < s.length && s[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) {
        if (s[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }
    if (c === '"') {
      i++;
      let out = "";
      while (i < s.length && s[i] !== '"') {
        if (s[i] === "\\") {
          const n = s[i + 1];
          if (n === "n") out += "\n";
          else if (n === "t") out += "\t";
          else if (n === "r") out += "\r";
          else if (n === '"') out += '"';
          else if (n === "\\") out += "\\";
          else out += n || "";
          i += 2;
        } else {
          if (s[i] === "\n") line++;
          out += s[i];
          i++;
        }
      }
      i++;
      push("str", out);
      continue;
    }
    if (c >= "0" && c <= "9") {
      let j = i + 1;
      while (j < s.length && s[j] >= "0" && s[j] <= "9") j++;
      if (s[j] === "." && s[j + 1] >= "0" && s[j + 1] <= "9") {
        j++;
        while (j < s.length && s[j] >= "0" && s[j] <= "9") j++;
      }
      push("num", Number(s.slice(i, j)));
      i = j;
      continue;
    }
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < s.length && isIdent(s[j])) j++;
      const w = s.slice(i, j);
      if (w === "true" || w === "false") push("bool", w === "true");
      else if (w === "null") push("null", null);
      else push("id", w);
      i = j;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (["==", "!=", "<=", ">=", "&&", "||"].includes(two)) { push("op", two); i += 2; continue; }
    if ("+-*/%<>=!{}()[],.;:".includes(c)) { push("op", c); i++; continue; }
    throw new Error(`无法识别的字符 ${c}（第 ${line} 行）`);
  }
  push("eof", null);
  return tokens;
}

function isIdentStart(c) {
  return (c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || c === "_" || c.charCodeAt(0) > 127;
}
function isIdent(c) {
  return isIdentStart(c) || (c >= "0" && c <= "9");
}

class Parser {
  constructor(tokens, source) {
    this.tk = tokens;
    this.i = 0;
    this.errors = [];
    this.source = source;
  }
  peek() { return this.tk[this.i]; }
  eat(t, v) {
    const p = this.peek();
    if (p.t === t && (v === undefined || p.v === v)) { this.i++; return p; }
    return null;
  }
  expect(t, v) {
    const p = this.eat(t, v);
    if (!p) {
      const g = this.peek();
      this.fail(`期望 ${v || t}，得到 ${g.v || g.t}`);
      this.i++;
    }
    return p;
  }
  fail(msg) {
    const g = this.peek();
    this.errors.push(`${msg}（第 ${g.line} 行）`);
  }
  parseProgram() {
    const fns = [];
    while (this.peek().t !== "eof") {
      if (this.peek().t === "id" && this.peek().v === "fn") fns.push(this.parseFn());
      else { this.fail("顶层只能是函数"); this.i++; }
    }
    return fns;
  }
  parseFn() {
    const line = this.peek().line;
    this.expect("id", "fn");
    const name = this.expect("id");
    this.expect("op", "(");
    const params = [];
    if (!this.eat("op", ")")) {
      while (true) {
        const p = this.expect("id");
        if (p) params.push(p.v);
        if (this.eat("op", ")")) break;
        this.expect("op", ",");
      }
    }
    const body = this.parseBlock();
    return { k: "fn", name: name ? name.v : "?", params, body, line };
  }
  parseBlock() {
    this.expect("op", "{");
    const body = [];
    while (this.peek().t !== "eof" && !(this.peek().t === "op" && this.peek().v === "}")) {
      body.push(this.parseStmt());
    }
    this.expect("op", "}");
    return body;
  }
  parseStmt() {
    const p = this.peek();
    if (p.t === "id" && p.v === "let") return this.parseLet();
    if (p.t === "id" && p.v === "if") return this.parseIf();
    if (p.t === "id" && p.v === "while") return this.parseWhile();
    if (p.t === "id" && p.v === "return") return this.parseReturn();
    if (p.t === "id" && p.v === "fn") { this.fail("函数不能嵌套"); this.parseFn(); return { k: "expr", value: { k: "null" } }; }
    const expr = this.parseExpr();
    if (this.eat("op", "=")) {
      const value = this.parseExpr();
      this.expect("op", ";");
      return { k: "assign", target: expr, value };
    }
    this.expect("op", ";");
    return { k: "expr", value: expr };
  }
  parseLet() {
    this.expect("id", "let");
    const name = this.expect("id");
    this.expect("op", "=");
    const init = this.parseExpr();
    this.expect("op", ";");
    return { k: "let", name: name ? name.v : "?", init };
  }
  parseReturn() {
    this.expect("id", "return");
    if (this.eat("op", ";")) return { k: "return", value: { k: "null" } };
    const value = this.parseExpr();
    this.expect("op", ";");
    return { k: "return", value };
  }
  parseWhile() {
    this.expect("id", "while");
    this.expect("op", "(");
    const cond = this.parseExpr();
    this.expect("op", ")");
    const body = this.parseBlock();
    return { k: "while", cond, body };
  }
  parseIf() {
    this.expect("id", "if");
    this.expect("op", "(");
    const cond = this.parseExpr();
    this.expect("op", ")");
    const then = this.parseBlock();
    let els = null;
    if (this.eat("id", "else")) {
      if (this.peek().t === "id" && this.peek().v === "if") els = [this.parseIf()];
      else els = this.parseBlock();
    }
    return { k: "if", cond, then, else: els };
  }
  parseExpr() { return this.parsePrec(1); }
  parsePrec(min) {
    let left = this.parseUnary();
    while (true) {
      const p = this.peek();
      if (p.t !== "op") break;
      const prec = PREC[p.v];
      if (!prec || prec < min) break;
      this.i++;
      const right = this.parsePrec(prec + 1);
      left = { k: "bin", op: p.v, a: left, b: right };
    }
    return left;
  }
  parseUnary() {
    if (this.eat("op", "!")) return { k: "unary", op: "!", a: this.parseUnary() };
    if (this.eat("op", "-")) return { k: "unary", op: "-", a: this.parseUnary() };
    return this.parsePost();
  }
  parsePost() {
    let e = this.parsePrimary();
    while (true) {
      if (this.eat("op", "[")) {
        const ix = this.parseExpr();
        this.expect("op", "]");
        e = { k: "index", a: e, b: ix };
      } else if (this.eat("op", ".")) {
        const name = this.expect("id");
        e = { k: "member", a: e, name: name ? name.v : "" };
      } else break;
    }
    return e;
  }
  parsePrimary() {
    const p = this.peek();
    if (p.t === "num") { this.i++; return { k: "num", v: p.v, line: p.line }; }
    if (p.t === "str") { this.i++; return { k: "str", v: p.v, line: p.line }; }
    if (p.t === "bool") { this.i++; return { k: "bool", v: p.v, line: p.line }; }
    if (p.t === "null") { this.i++; return { k: "null", line: p.line }; }
    if (p.t === "id") {
      this.i++;
      if (this.eat("op", "(")) {
        const args = [];
        if (!this.eat("op", ")")) {
          while (true) {
            args.push(this.parseExpr());
            if (this.eat("op", ")")) break;
            this.expect("op", ",");
          }
        }
        return { k: "call", name: p.v, args, line: p.line };
      }
      return { k: "var", name: p.v, line: p.line };
    }
    if (this.eat("op", "(")) {
      const e = this.parseExpr();
      this.expect("op", ")");
      return e;
    }
    if (this.eat("op", "[")) {
      const items = [];
      if (!this.eat("op", "]")) {
        while (true) {
          items.push(this.parseExpr());
          if (this.eat("op", "]")) break;
          this.expect("op", ",");
        }
      }
      return { k: "arr", items };
    }
    if (this.eat("op", "{")) {
      const keys = [];
      const vals = [];
      if (!this.eat("op", "}")) {
        while (true) {
          let key;
          const k = this.peek();
          if (k.t === "str" || k.t === "id") { key = k.v; this.i++; }
          else { this.fail("对象键无效"); key = "?"; this.i++; }
          this.expect("op", ":");
          keys.push(key);
          vals.push(this.parseExpr());
          if (this.eat("op", "}")) break;
          this.expect("op", ",");
        }
      }
      return { k: "obj", keys, vals };
    }
    this.fail("表达式无效");
    this.i++;
    return { k: "null" };
  }
}

const PREC = { "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 3, ">": 3, "<=": 3, ">=": 3, "+": 4, "-": 4, "*": 5, "/": 5, "%": 5 };

function emitProgram(fns) {
  const program = { functions: Object.create(null), entry: "main" };
  const names = new Set(fns.map((f) => f.name));
  for (const fn of fns) {
    if (program.functions[fn.name]) throw new Error("函数重名 " + fn.name);
    program.functions[fn.name] = emitFn(fn, names);
  }
  return program;
}

function emitFn(fn) {
  const slots = Object.create(null);
  fn.params.forEach((p, i) => { slots[p] = i; });
  let next = fn.params.length;
  const code = [];
  const emit = (op, a, b, line) => { code.push(line ? [op, a, b, line] : [op, a, b]); return code.length - 1; };
  const here = () => code.length;
  function emitExpr(e) {
    const line = e.line;
    switch (e.k) {
      case "num": emit(OPS.PUSHN, e.v, 0, line); break;
      case "str": emit(OPS.PUSHS, e.v, 0, line); break;
      case "bool": emit(OPS.PUSHB, e.v ? 1 : 0, 0, line); break;
      case "null": emit(OPS.PUSHNULL, 0, 0, line); break;
      case "var": {
        if (!(e.name in slots)) throw new Error(`未定义变量 ${e.name}（第 ${line || "?"} 行）`);
        emit(OPS.LOAD, slots[e.name], 0, line);
        break;
      }
      case "unary":
        emitExpr(e.a);
        emit(e.op === "!" ? OPS.NOT : OPS.NEG, 0, 0, line);
        break;
      case "bin":
        if (e.op === "&&") {
          emitExpr(e.a);
          emit(OPS.DUP, 0, 0, line);
          const jz = emit(OPS.JZ, 0, 0, line);
          emit(OPS.POP, 0, 0, line);
          emitExpr(e.b);
          code[jz][1] = here();
        } else if (e.op === "||") {
          emitExpr(e.a);
          emit(OPS.DUP, 0, 0, line);
          const jnz = emit(OPS.JNZ, 0, 0, line);
          emit(OPS.POP, 0, 0, line);
          emitExpr(e.b);
          code[jnz][1] = here();
        } else {
          emitExpr(e.a);
          emitExpr(e.b);
          const map = { "+": OPS.ADD, "-": OPS.SUB, "*": OPS.MUL, "/": OPS.DIV, "%": OPS.MOD, "==": OPS.EQ, "!=": OPS.NE, "<": OPS.LT, ">": OPS.GT, "<=": OPS.LE, ">=": OPS.GE };
          emit(map[e.op], 0, 0, line);
        }
        break;
      case "call":
        for (const a of e.args) emitExpr(a);
        emit(OPS.CALL, e.name, e.args.length, line);
        break;
      case "index":
        emitExpr(e.a); emitExpr(e.b); emit(OPS.GETI, 0, 0, line); break;
      case "member":
        emitExpr(e.a); emit(OPS.PUSHS, e.name, 0, line); emit(OPS.GETI, 0, 0, line); break;
      case "arr":
        for (const it of e.items) emitExpr(it);
        emit(OPS.MAKEARR, e.items.length, 0, line);
        break;
      case "obj":
        for (let i = 0; i < e.keys.length; i++) {
          emit(OPS.PUSHS, e.keys[i], 0, line);
          emitExpr(e.vals[i]);
        }
        emit(OPS.MAKEOBJ, e.keys.length, 0, line);
        break;
      default:
        emit(OPS.PUSHNULL, 0, 0, line);
    }
  }
  function emitStmt(st) {
    if (st.k === "let") {
      if (st.name in slots) throw new Error("变量重复 " + fn.name + "." + st.name);
      slots[st.name] = next++;
      emitExpr(st.init);
      emit(OPS.STORE, slots[st.name]);
      return;
    }
    if (st.k === "assign") {
      const t = st.target;
      if (t.k === "var") {
        if (!(t.name in slots)) throw new Error("未定义变量 " + t.name);
        emitExpr(st.value);
        emit(OPS.STORE, slots[t.name]);
      } else if (t.k === "index") {
        emitExpr(t.a); emitExpr(t.b); emitExpr(st.value); emit(OPS.SETI);
      } else if (t.k === "member") {
        emitExpr(t.a); emit(OPS.PUSHS, t.name); emitExpr(st.value); emit(OPS.SETI);
      } else throw new Error("不能赋值");
      return;
    }
    if (st.k === "expr") { emitExpr(st.value); emit(OPS.POP); return; }
    if (st.k === "return") { emitExpr(st.value); emit(OPS.RET); return; }
    if (st.k === "while") {
      const start = here();
      emitExpr(st.cond);
      const jz = emit(OPS.JZ, 0);
      for (const s of st.body) emitStmt(s);
      emit(OPS.JMP, start);
      code[jz][1] = here();
      return;
    }
    if (st.k === "if") {
      emitExpr(st.cond);
      const jz = emit(OPS.JZ, 0);
      for (const s of st.then) emitStmt(s);
      if (st.else) {
        const jmp = emit(OPS.JMP, 0);
        code[jz][1] = here();
        for (const s of st.else) emitStmt(s);
        code[jmp][1] = here();
      } else code[jz][1] = here();
    }
  }
  for (const st of fn.body) emitStmt(st);
  emit(OPS.PUSHNULL);
  emit(OPS.RET);
  return { name: fn.name, params: fn.params.slice(), locals: next, code };
}

export function disasm(program) {
  const out = [];
  for (const name of Object.keys(program.functions)) {
    out.push("fn " + name);
    const code = program.functions[name].code;
    code.forEach((ins, i) => {
      out.push(`  ${i}: ${OPNAME[ins[0]] || ins[0]} ${ins[1] ?? ""} ${ins[2] ?? ""}`.trimEnd());
    });
  }
  return out.join("\n");
}

export { OPS, OPNAME, revive };
