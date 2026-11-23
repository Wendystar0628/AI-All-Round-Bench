// Deterministic, Resumable, Serializable Bytecode VM for Nested OS Script (NOS)
// Supports:
//  - Exact logical instruction & data-size-proportional work accounting
//  - Resumable pending work (paid by progress, commits only when paid)
//  - Memory quota accounting & OutOfMemory exception
//  - Nested execution via vm_create / vm_run / vm_reply / vm_throw / vm_burn
//  - 100% JSON-serializable state for exact subtree snapshots & forking

import { OP } from './opcodes.js';

export function estimateValueBytes(val, depth = 0) {
  if (val === null || val === undefined) return 8;
  const t = typeof val;
  if (t === 'number' || t === 'boolean') return 16;
  if (t === 'string') return 32 + val.length * 2;
  if (depth > 24) return 64;
  if (Array.isArray(val)) {
    let sum = 48;
    const len = val.length;
    for (let i = 0; i < len; i++) {
      sum += estimateValueBytes(val[i], depth + 1);
    }
    return sum;
  }
  if (t === 'object') {
    if (val.__vm) {
      return 256 + (val.memBytes || 0);
    }
    if (val.__fn !== undefined || val.__builtin !== undefined) return 32;
    let sum = 64;
    const keys = Object.keys(val);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k === 'bootPrecompiled' || k === 'precompiled') continue;
      sum += 24 + k.length * 2 + estimateValueBytes(val[k], depth + 1);
    }
    return sum;
  }
  return 16;
}

export function deepCloneValue(val, stats) {
  if (val === null || val === undefined) return null;
  const t = typeof val;
  if (t === 'number' || t === 'boolean') {
    if (stats) stats.ops += 1;
    return val;
  }
  if (t === 'string') {
    if (stats) stats.ops += 1 + Math.ceil(val.length / 32);
    return val;
  }
  if (Array.isArray(val)) {
    const out = new Array(val.length);
    if (stats) stats.ops += 2;
    for (let i = 0; i < val.length; i++) {
      out[i] = deepCloneValue(val[i], stats);
    }
    return out;
  }
  if (t === 'object') {
    const out = {};
    const keys = Object.keys(val);
    if (stats) stats.ops += 2 + keys.length;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      out[k] = deepCloneValue(val[k], stats);
    }
    return out;
  }
  return null;
}

function valueEqual(a, b, stats) {
  if (a === b) {
    if (stats) stats.ops += 1;
    return true;
  }
  if (a === null || b === null || a === undefined || b === undefined) return a == b;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'string') {
    if (stats) stats.ops += 1 + Math.ceil(Math.min(a.length, b.length) / 32);
    return a === b;
  }
  if (typeof a === 'object') {
    if (a.__fn !== undefined && b.__fn !== undefined) return a.__fn === b.__fn;
    if (a.__builtin !== undefined && b.__builtin !== undefined) return a.__builtin === b.__builtin;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      if (stats) stats.ops += 2;
      for (let i = 0; i < a.length; i++) {
        if (!valueEqual(a[i], b[i], stats)) return false;
      }
      return true;
    }
  }
  return false;
}

function toStr(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v.__fn !== undefined) return `<fn#${v.__fn}>`;
  if (v.__builtin !== undefined) return `<builtin:${v.__builtin}>`;
  try {
    return JSON.stringify(v);
  } catch {
    return '<object>';
  }
}

export function createVM(module, initGlobals = null) {
  if (!module || !Array.isArray(module.funcs) || module.funcs.length === 0) {
    throw new Error('无效的字节码模块');
  }
  const mainFn = module.funcs[0];
  const globals = new Array(module.globals.length).fill(null);
  if (initGlobals && typeof initGlobals === 'object') {
    for (let i = 0; i < module.globals.length; i++) {
      const gname = module.globals[i];
      if (Object.prototype.hasOwnProperty.call(initGlobals, gname)) {
        globals[i] = deepCloneValue(initGlobals[gname]);
      }
    }
  }
  const ctx = {
    __vm: true,
    module,
    globals,
    stack: [],
    frames: [
      {
        fnIdx: 0,
        pc: 0,
        locals: new Array(mainFn.locals).fill(null),
      },
    ],
    tryStack: [],
    state: 'ready', // ready | syscall | exited | error
    stepsTotal: 0,
    selfStepsTotal: 0,
    childStepsTotal: 0,
    memBytes: 0,
    memCheckCounter: 0,
    pendingOp: null, // { total, remaining, ready }
    lastSyscall: null, // { name, args }
    error: null,
    exitValue: null,
  };
  ctx.memBytes = computeVMMemBytes(ctx);
  return ctx;
}

export function computeVMMemBytes(ctx) {
  if (!ctx) return 0;
  let bytes = 512;
  if (ctx.module) {
    bytes += (ctx.module.consts ? ctx.module.consts.length * 24 : 0);
    if (ctx.module.funcs) {
      for (let i = 0; i < ctx.module.funcs.length; i++) {
        bytes += 64 + ctx.module.funcs[i].code.length * 4;
      }
    }
  }
  bytes += estimateValueBytes(ctx.globals, 0);
  bytes += estimateValueBytes(ctx.stack, 0);
  for (let i = 0; i < ctx.frames.length; i++) {
    bytes += 64 + estimateValueBytes(ctx.frames[i].locals, 0);
  }
  return bytes;
}

export function replySyscall(ctx, value) {
  if (!ctx || ctx.state !== 'syscall') return false;
  ctx.stack.push(value === undefined ? null : value);
  ctx.lastSyscall = null;
  ctx.state = 'ready';
  return true;
}

export function throwIntoVM(ctx, errMessage) {
  if (!ctx || (ctx.state !== 'syscall' && ctx.state !== 'ready')) return false;
  ctx.lastSyscall = null;
  ctx.state = 'ready';
  if (!unwindException(ctx, String(errMessage || '错误'))) {
    ctx.state = 'error';
    ctx.error = String(errMessage || '错误');
  }
  return true;
}

function unwindException(ctx, errVal) {
  if (ctx.tryStack.length === 0) return false;
  const handler = ctx.tryStack.pop();
  ctx.frames.length = handler.frameDepth;
  ctx.stack.length = handler.stackDepth;
  const frame = ctx.frames[ctx.frames.length - 1];
  frame.pc = handler.catchTarget;
  ctx.stack.push(errVal);
  return true;
}

function hashStr32(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16);
}

// Execute VM for at most `budget` logical operations.
// Returns { status, stepsUsed, selfSteps, childSteps, pendingWork, memBytes, name, args, value, error }
export function runVM(ctx, budget, memLimit = 0) {
  if (!ctx || !ctx.__vm) {
    return { status: 'error', stepsUsed: 0, selfSteps: 0, childSteps: 0, pendingWork: 0, memBytes: 0, error: '无效的 VM 上下文' };
  }
  if (ctx.state === 'exited') {
    return { status: 'exited', stepsUsed: 0, selfSteps: 0, childSteps: 0, pendingWork: 0, memBytes: ctx.memBytes, value: ctx.exitValue };
  }
  if (ctx.state === 'error') {
    return { status: 'error', stepsUsed: 0, selfSteps: 0, childSteps: 0, pendingWork: 0, memBytes: ctx.memBytes, error: ctx.error };
  }
  if (ctx.state === 'syscall') {
    return {
      status: 'syscall',
      stepsUsed: 0,
      selfSteps: 0,
      childSteps: 0,
      pendingWork: ctx.pendingOp ? ctx.pendingOp.remaining : 0,
      memBytes: ctx.memBytes,
      name: ctx.lastSyscall ? ctx.lastSyscall.name : '',
      args: ctx.lastSyscall ? ctx.lastSyscall.args : [],
    };
  }

  let rem = Math.max(0, Math.floor(budget));
  let selfSteps = 0;
  let childSteps = 0;

  const module = ctx.module;
  const consts = module.consts;
  const funcs = module.funcs;
  const globals = ctx.globals;
  const stack = ctx.stack;
  const frames = ctx.frames;

  // Pay down any pending resumable work first
  if (ctx.pendingOp && ctx.pendingOp.remaining > 0) {
    const pay = Math.min(rem, ctx.pendingOp.remaining);
    rem -= pay;
    selfSteps += pay;
    ctx.pendingOp.remaining -= pay;
    if (ctx.pendingOp.remaining > 0) {
      ctx.stepsTotal += selfSteps;
      ctx.selfStepsTotal += selfSteps;
      return {
        status: 'preempted',
        stepsUsed: selfSteps,
        selfSteps,
        childSteps: 0,
        pendingWork: ctx.pendingOp.remaining,
        memBytes: ctx.memBytes,
      };
    }
    ctx.pendingOp.ready = true;
  }

  function chargeExtra(extraCost, frame, opStartPc) {
    if (extraCost <= 0) return true;
    if (ctx.pendingOp && ctx.pendingOp.ready) {
      ctx.pendingOp = null;
      return true;
    }
    if (extraCost <= rem) {
      rem -= extraCost;
      selfSteps += extraCost;
      return true;
    }
    // Partial payment: save progress and pause before committing side effect
    const paid = rem;
    selfSteps += paid;
    rem = 0;
    ctx.pendingOp = {
      total: extraCost,
      remaining: extraCost - paid,
      ready: false,
    };
    frame.pc = opStartPc;
    return false;
  }

  function raiseError(msg) {
    if (unwindException(ctx, msg)) {
      return true;
    }
    ctx.state = 'error';
    ctx.error = msg;
    return false;
  }

  function checkMem(deltaBytes) {
    ctx.memBytes += deltaBytes;
    if (ctx.memBytes < 512) ctx.memBytes = 512;
    if (memLimit > 0 && ctx.memBytes > memLimit) {
      ctx.memBytes = computeVMMemBytes(ctx);
      if (ctx.memBytes > memLimit) {
        return false;
      }
    }
    return true;
  }

  while (rem > 0 && frames.length > 0) {
    const frame = frames[frames.length - 1];
    const fn = funcs[frame.fnIdx];
    const code = fn.code;
    if (frame.pc >= code.length) {
      // Implicit return null
      frames.pop();
      if (frames.length === 0) {
        ctx.state = 'exited';
        ctx.exitValue = null;
        break;
      }
      stack.push(null);
      continue;
    }

    const opStartPc = frame.pc;
    const op = code[frame.pc++];
    rem -= 1;
    selfSteps += 1;

    switch (op) {
      case OP.NOP:
        break;
      case OP.CONST:
        stack.push(consts[code[frame.pc++]]);
        break;
      case OP.NULL:
        stack.push(null);
        break;
      case OP.TRUE:
        stack.push(true);
        break;
      case OP.FALSE:
        stack.push(false);
        break;
      case OP.POP:
        stack.pop();
        break;
      case OP.DUP:
        stack.push(stack[stack.length - 1]);
        break;
      case OP.LOAD_L:
        stack.push(frame.locals[code[frame.pc++]]);
        break;
      case OP.STORE_L: {
        const idx = code[frame.pc++];
        frame.locals[idx] = stack[stack.length - 1];
        break;
      }
      case OP.LOAD_G:
        stack.push(globals[code[frame.pc++]]);
        break;
      case OP.STORE_G: {
        const idx = code[frame.pc++];
        globals[idx] = stack[stack.length - 1];
        break;
      }
      case OP.ADD: {
        const b = stack[stack.length - 1];
        const a = stack[stack.length - 2];
        if (typeof a === 'number' && typeof b === 'number') {
          stack.length -= 2;
          stack.push(a + b);
        } else {
          const sa = toStr(a);
          const sb = toStr(b);
          const extra = Math.floor((sa.length + sb.length) / 32);
          if (!chargeExtra(extra, frame, opStartPc)) break;
          const out = sa + sb;
          if (!checkMem(out.length * 2)) {
            stack.length -= 2;
            if (!raiseError('内存配额不足 (OutOfMemory)')) break;
            continue;
          }
          stack.length -= 2;
          stack.push(out);
        }
        break;
      }
      case OP.SUB: {
        const b = stack.pop();
        const a = stack.pop();
        stack.push(Number(a) - Number(b));
        break;
      }
      case OP.MUL: {
        const b = stack.pop();
        const a = stack.pop();
        stack.push(Number(a) * Number(b));
        break;
      }
      case OP.DIV: {
        const b = Number(stack.pop());
        const a = Number(stack.pop());
        if (b === 0) {
          if (!raiseError('运行时错误：除数为零')) break;
          continue;
        }
        stack.push(a / b);
        break;
      }
      case OP.MOD: {
        const b = Number(stack.pop());
        const a = Number(stack.pop());
        if (b === 0) {
          if (!raiseError('运行时错误：取模除数为零')) break;
          continue;
        }
        stack.push(a % b);
        break;
      }
      case OP.NEG: {
        stack[stack.length - 1] = -Number(stack[stack.length - 1]);
        break;
      }
      case OP.NOT: {
        stack[stack.length - 1] = !stack[stack.length - 1];
        break;
      }
      case OP.EQ: {
        const b = stack.pop();
        const a = stack.pop();
        const stats = { ops: 0 };
        const eq = valueEqual(a, b, stats);
        if (stats.ops > 2) {
          const extra = Math.min(rem, stats.ops - 1);
          rem -= extra;
          selfSteps += extra;
        }
        stack.push(eq);
        break;
      }
      case OP.NEQ: {
        const b = stack.pop();
        const a = stack.pop();
        const stats = { ops: 0 };
        const eq = valueEqual(a, b, stats);
        if (stats.ops > 2) {
          const extra = Math.min(rem, stats.ops - 1);
          rem -= extra;
          selfSteps += extra;
        }
        stack.push(!eq);
        break;
      }
      case OP.LT: {
        const b = stack.pop();
        const a = stack.pop();
        stack.push(a < b);
        break;
      }
      case OP.LE: {
        const b = stack.pop();
        const a = stack.pop();
        stack.push(a <= b);
        break;
      }
      case OP.GT: {
        const b = stack.pop();
        const a = stack.pop();
        stack.push(a > b);
        break;
      }
      case OP.GE: {
        const b = stack.pop();
        const a = stack.pop();
        stack.push(a >= b);
        break;
      }
      case OP.JMP:
        frame.pc = code[frame.pc];
        break;
      case OP.JMP_FALSE: {
        const target = code[frame.pc++];
        if (!stack.pop()) frame.pc = target;
        break;
      }
      case OP.JMP_FALSE_PEEK: {
        const target = code[frame.pc++];
        if (!stack[stack.length - 1]) frame.pc = target;
        break;
      }
      case OP.JMP_TRUE_PEEK: {
        const target = code[frame.pc++];
        if (stack[stack.length - 1]) frame.pc = target;
        break;
      }
      case OP.MAKE_ARR: {
        const count = code[frame.pc++];
        const extra = Math.floor(count / 8);
        if (!chargeExtra(extra, frame, opStartPc)) break;
        const arr = new Array(count);
        for (let i = count - 1; i >= 0; i--) arr[i] = stack.pop();
        if (!checkMem(48 + count * 16)) {
          if (!raiseError('内存配额不足 (OutOfMemory)')) break;
          continue;
        }
        stack.push(arr);
        break;
      }
      case OP.MAKE_OBJ: {
        const pairCount = code[frame.pc++];
        const extra = Math.floor(pairCount / 4);
        if (!chargeExtra(extra, frame, opStartPc)) break;
        const obj = {};
        const pairs = new Array(pairCount * 2);
        for (let i = pairCount * 2 - 1; i >= 0; i--) pairs[i] = stack.pop();
        for (let i = 0; i < pairCount * 2; i += 2) {
          obj[String(pairs[i])] = pairs[i + 1];
        }
        if (!checkMem(64 + pairCount * 40)) {
          if (!raiseError('内存配额不足 (OutOfMemory)')) break;
          continue;
        }
        stack.push(obj);
        break;
      }
      case OP.GET_PROP: {
        const key = stack.pop();
        const obj = stack.pop();
        if (obj === null || obj === undefined) {
          stack.push(null);
        } else if (typeof obj === 'string') {
          const idx = Number(key);
          stack.push(idx >= 0 && idx < obj.length ? obj[idx] : null);
        } else if (Array.isArray(obj)) {
          const idx = Number(key);
          stack.push(idx >= 0 && idx < obj.length ? obj[idx] : null);
        } else if (typeof obj === 'object') {
          const k = String(key);
          if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
            stack.push(null);
          } else {
            const v = obj[k];
            stack.push(v === undefined ? null : v);
          }
        } else {
          stack.push(null);
        }
        break;
      }
      case OP.SET_PROP: {
        const val = stack.pop();
        const key = stack.pop();
        const obj = stack.pop();
        if (obj && typeof obj === 'object') {
          if (Array.isArray(obj)) {
            const idx = Number(key);
            if (idx >= 0 && idx < 1000000) {
              obj[idx] = val;
            }
          } else {
            const k = String(key);
            if (k !== '__proto__' && k !== 'constructor' && k !== 'prototype') {
              obj[k] = val;
            }
          }
        }
        stack.push(val);
        break;
      }
      case OP.LOAD_FN:
        stack.push({ __fn: code[frame.pc++] });
        break;
      case OP.LOAD_BUILTIN:
        stack.push({ __builtin: consts[code[frame.pc++]] });
        break;
      case OP.TRY_PUSH: {
        const catchTarget = code[frame.pc++];
        ctx.tryStack.push({
          frameDepth: frames.length,
          stackDepth: stack.length,
          catchTarget,
        });
        break;
      }
      case OP.TRY_POP:
        if (ctx.tryStack.length > 0) ctx.tryStack.pop();
        break;
      case OP.THROW: {
        const err = toStr(stack.pop());
        if (!raiseError(err)) break;
        continue;
      }
      case OP.SYSCALL: {
        const argc = code[frame.pc++];
        const args = new Array(argc);
        for (let i = argc - 1; i >= 0; i--) args[i] = stack.pop();
        const name = String(stack.pop());
        ctx.state = 'syscall';
        ctx.lastSyscall = { name, args };
        ctx.stepsTotal += selfSteps + childSteps;
        ctx.selfStepsTotal += selfSteps;
        ctx.childStepsTotal += childSteps;
        return {
          status: 'syscall',
          stepsUsed: selfSteps + childSteps,
          selfSteps,
          childSteps,
          pendingWork: ctx.pendingOp ? ctx.pendingOp.remaining : 0,
          memBytes: ctx.memBytes,
          name,
          args,
        };
      }
      case OP.RET: {
        const retVal = stack.pop();
        frames.pop();
        if (frames.length === 0) {
          ctx.state = 'exited';
          ctx.exitValue = retVal;
          break;
        }
        stack.push(retVal);
        break;
      }
      case OP.CALL: {
        const argc = code[frame.pc++];
        const calleeIdx = stack.length - 1 - argc;
        const callee = stack[calleeIdx];
        if (callee && callee.__fn !== undefined) {
          const targetFn = funcs[callee.__fn];
          if (!targetFn) {
            stack.length = calleeIdx;
            if (!raiseError('运行时错误：无效的函数索引')) break;
            continue;
          }
          if (frames.length > 200) {
            stack.length = calleeIdx;
            if (!raiseError('运行时错误：调用栈溢出')) break;
            continue;
          }
          const locals = new Array(targetFn.locals).fill(null);
          const copyCount = Math.min(argc, targetFn.params);
          for (let i = 0; i < copyCount; i++) {
            locals[i] = stack[calleeIdx + 1 + i];
          }
          stack.length = calleeIdx;
          frames.push({ fnIdx: callee.__fn, pc: 0, locals });
          break;
        }
        if (callee && callee.__builtin !== undefined) {
          const bname = callee.__builtin;

          // Ultra-fast paths for hottest zero-allocation builtins
          if (bname === 'len') {
            const x = argc > 0 ? stack[calleeIdx + 1] : null;
            stack.length = calleeIdx;
            if (x === null || x === undefined) stack.push(0);
            else if (typeof x === 'string' || Array.isArray(x)) stack.push(x.length);
            else if (typeof x === 'object') stack.push(Object.keys(x).length);
            else stack.push(0);
            break;
          }
          if (bname === 'char_code') {
            const s = stack[calleeIdx + 1];
            const i = Number(stack[calleeIdx + 2] || 0);
            stack.length = calleeIdx;
            stack.push(typeof s === 'string' && i >= 0 && i < s.length ? s.charCodeAt(i) : -1);
            break;
          }
          if (bname === 'substr') {
            const s = toStr(stack[calleeIdx + 1]);
            const start = Number(stack[calleeIdx + 2] || 0);
            const cnt = argc >= 3 && stack[calleeIdx + 3] !== null && stack[calleeIdx + 3] !== undefined
              ? Number(stack[calleeIdx + 3]) : s.length - start;
            stack.length = calleeIdx;
            stack.push(s.slice(start, start + Math.max(0, cnt)));
            break;
          }
          if (bname === 'has') {
            const o = stack[calleeIdx + 1];
            const k = stack[calleeIdx + 2];
            stack.length = calleeIdx;
            stack.push(Boolean(o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, String(k))));
            break;
          }
          if (bname === 'push') {
            const arr = stack[calleeIdx + 1];
            const val = argc >= 2 ? stack[calleeIdx + 2] : null;
            stack.length = calleeIdx;
            if (Array.isArray(arr)) {
              arr.push(val === undefined ? null : val);
              const added = typeof val === 'string' ? 32 + val.length * 2 : (val && typeof val === 'object' ? 64 : 16);
              if (!checkMem(added)) {
                if (!raiseError('内存配额不足 (OutOfMemory)')) break;
                continue;
              }
              stack.push(arr.length);
            } else {
              stack.push(0);
            }
            break;
          }
          if (bname === 'pop') {
            const arr = stack[calleeIdx + 1];
            stack.length = calleeIdx;
            stack.push(Array.isArray(arr) && arr.length > 0 ? arr.pop() : null);
            break;
          }
          if (bname === 'str') {
            const v = stack[calleeIdx + 1];
            stack.length = calleeIdx;
            stack.push(toStr(v));
            break;
          }
          if (bname === 'num') {
            const v = Number(stack[calleeIdx + 1]);
            stack.length = calleeIdx;
            stack.push(Number.isNaN(v) ? 0 : v);
            break;
          }

          const args = stack.slice(calleeIdx + 1, calleeIdx + 1 + argc);

          // Special nested VM builtins
          if (bname === 'vm_run') {
            const childCtx = args[0];
            const reqBudget = Math.max(0, Math.floor(Number(args[1] || 0)));
            const childMemLimit = Math.max(0, Math.floor(Number(args[2] || 0)));
            const effBudget = Math.min(reqBudget, rem);
            const res = runVM(childCtx, effBudget, childMemLimit);
            rem -= res.stepsUsed;
            childSteps += res.stepsUsed;
            stack.length = calleeIdx;
            stack.push(res);
            break;
          }
          if (bname === 'vm_burn') {
            const want = Math.max(0, Math.floor(Number(args[0] || 0)));
            const burned = Math.min(want, rem);
            rem -= burned;
            selfSteps += burned;
            stack.length = calleeIdx;
            stack.push(burned);
            break;
          }

          // Estimate extra data-proportional cost BEFORE committing side effects
          let extra = 0;
          if (bname === 'clone') {
            extra = Math.max(1, Math.floor(estimateValueBytes(args[0], 0) / 64));
          } else if (bname === 'json_encode') {
            extra = Math.max(2, Math.floor(estimateValueBytes(args[0], 0) / 48));
          } else if (bname === 'json_decode') {
            const s = typeof args[0] === 'string' ? args[0] : '';
            extra = Math.max(2, Math.floor(s.length / 24));
          } else if (bname === 'join') {
            extra = Array.isArray(args[0]) ? Math.floor(args[0].length / 4) : 0;
          } else if (bname === 'split' || bname === 'replace' || bname === 'lower' || bname === 'upper' || bname === 'trim' || bname === 'index_of') {
            extra = typeof args[0] === 'string' ? Math.floor(args[0].length / 32) : 0;
          } else if (bname === 'slice' || bname === 'concat') {
            const n0 = args[0] && args[0].length ? args[0].length : 0;
            const n1 = args[1] && args[1].length ? args[1].length : 0;
            extra = Math.floor((n0 + n1) / 16);
          } else if (bname === 'sort_by') {
            const n = Array.isArray(args[0]) ? args[0].length : 0;
            extra = Math.floor(n * Math.log2(n + 2));
          } else if (bname === 'mem_size') {
            extra = 4;
          }

          if (extra > 0 && !chargeExtra(extra, frame, opStartPc)) {
            break;
          }

          let result = null;
          let errMsg = null;
          try {
            result = execBuiltin(bname, args);
          } catch (e) {
            errMsg = e && e.message ? e.message : String(e);
          }
          stack.length = calleeIdx;
          if (errMsg !== null) {
            if (!raiseError(errMsg)) break;
            continue;
          }
          if (bname === 'push' || bname === 'clone' || bname === 'json_decode' || bname === 'json_encode' || bname === 'concat' || bname === 'slice' || bname === 'split' || bname === 'join') {
            const added = bname === 'push' ? estimateValueBytes(args[1], 0) : estimateValueBytes(result, 0);
            if (!checkMem(added)) {
              if (!raiseError('内存配额不足 (OutOfMemory)')) break;
              continue;
            }
          }
          stack.push(result === undefined ? null : result);
          break;
        }
        stack.length = calleeIdx;
        if (!raiseError('运行时错误：目标不可调用')) break;
        continue;
      }
      default:
        if (!raiseError(`运行时错误：未知指令 ${op}`)) break;
        continue;
    }

    if (ctx.state === 'error' || ctx.state === 'exited') break;
    if (ctx.pendingOp && ctx.pendingOp.remaining > 0) break;
  }

  ctx.stepsTotal += selfSteps + childSteps;
  ctx.selfStepsTotal += selfSteps;
  ctx.childStepsTotal += childSteps;

  if (ctx.state === 'exited') {
    return {
      status: 'exited',
      stepsUsed: selfSteps + childSteps,
      selfSteps,
      childSteps,
      pendingWork: 0,
      memBytes: ctx.memBytes,
      value: ctx.exitValue,
    };
  }
  if (ctx.state === 'error') {
    return {
      status: 'error',
      stepsUsed: selfSteps + childSteps,
      selfSteps,
      childSteps,
      pendingWork: ctx.pendingOp ? ctx.pendingOp.remaining : 0,
      memBytes: ctx.memBytes,
      error: ctx.error,
    };
  }
  return {
    status: 'preempted',
    stepsUsed: selfSteps + childSteps,
    selfSteps,
    childSteps,
    pendingWork: ctx.pendingOp ? ctx.pendingOp.remaining : 0,
    memBytes: ctx.memBytes,
  };
}

function execBuiltin(name, args) {
  switch (name) {
    case 'len': {
      const x = args[0];
      if (x === null || x === undefined) return 0;
      if (typeof x === 'string' || Array.isArray(x)) return x.length;
      if (typeof x === 'object') return Object.keys(x).length;
      return 0;
    }
    case 'keys':
      return args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]) ? Object.keys(args[0]) : [];
    case 'has':
      return Boolean(args[0] && typeof args[0] === 'object' && Object.prototype.hasOwnProperty.call(args[0], String(args[1])));
    case 'del': {
      const obj = args[0];
      const k = args[1];
      if (Array.isArray(obj)) {
        const idx = Number(k);
        if (idx >= 0 && idx < obj.length) obj.splice(idx, 1);
      } else if (obj && typeof obj === 'object') {
        delete obj[String(k)];
      }
      return null;
    }
    case 'push': {
      if (Array.isArray(args[0])) {
        args[0].push(args[1] === undefined ? null : args[1]);
        return args[0].length;
      }
      return 0;
    }
    case 'pop':
      return Array.isArray(args[0]) && args[0].length > 0 ? args[0].pop() : null;
    case 'slice': {
      const x = args[0];
      const s = Number(args[1] || 0);
      const e = args[2] === undefined || args[2] === null ? undefined : Number(args[2]);
      if (Array.isArray(x) || typeof x === 'string') return x.slice(s, e);
      return [];
    }
    case 'concat': {
      const a = Array.isArray(args[0]) ? args[0] : [];
      const b = Array.isArray(args[1]) ? args[1] : [];
      return a.concat(b);
    }
    case 'substr': {
      const s = toStr(args[0]);
      const start = Number(args[1] || 0);
      const count = args[2] === undefined || args[2] === null ? s.length - start : Number(args[2]);
      return s.slice(start, start + Math.max(0, count));
    }
    case 'index_of': {
      const s = args[0];
      if (typeof s === 'string') return s.indexOf(toStr(args[1]), Number(args[2] || 0));
      if (Array.isArray(s)) return s.indexOf(args[1]);
      return -1;
    }
    case 'split':
      return toStr(args[0]).split(toStr(args[1]));
    case 'join':
      return Array.isArray(args[0]) ? args[0].map(toStr).join(toStr(args[1] === undefined ? '' : args[1])) : '';
    case 'replace':
      return toStr(args[0]).split(toStr(args[1])).join(toStr(args[2] === undefined ? '' : args[2]));
    case 'trim':
      return toStr(args[0]).trim();
    case 'lower':
      return toStr(args[0]).toLowerCase();
    case 'upper':
      return toStr(args[0]).toUpperCase();
    case 'char_code': {
      const s = toStr(args[0]);
      const i = Number(args[1] || 0);
      return i >= 0 && i < s.length ? s.charCodeAt(i) : -1;
    }
    case 'from_char_code':
      return String.fromCharCode(Number(args[0] || 0));
    case 'str':
      return toStr(args[0]);
    case 'num': {
      const n = Number(args[0]);
      return Number.isNaN(n) ? 0 : n;
    }
    case 'int': {
      const n = parseInt(args[0], 10);
      return Number.isNaN(n) ? 0 : n;
    }
    case 'type': {
      const v = args[0];
      if (v === null || v === undefined) return 'null';
      if (Array.isArray(v)) return 'array';
      if (typeof v === 'object') {
        if (v.__fn !== undefined || v.__builtin !== undefined) return 'function';
        if (v.__vm) return 'vm';
        return 'object';
      }
      return typeof v;
    }
    case 'abs': return Math.abs(Number(args[0] || 0));
    case 'floor': return Math.floor(Number(args[0] || 0));
    case 'ceil': return Math.ceil(Number(args[0] || 0));
    case 'round': return Math.round(Number(args[0] || 0));
    case 'min': return Math.min(Number(args[0] || 0), Number(args[1] || 0));
    case 'max': return Math.max(Number(args[0] || 0), Number(args[1] || 0));
    case 'sqrt': return Math.sqrt(Math.max(0, Number(args[0] || 0)));
    case 'pow': return Math.pow(Number(args[0] || 0), Number(args[1] || 0));
    case 'sin': return Math.sin(Number(args[0] || 0));
    case 'cos': return Math.cos(Number(args[0] || 0));
    case 'tan': return Math.tan(Number(args[0] || 0));
    case 'asin': return Math.asin(Math.max(-1, Math.min(1, Number(args[0] || 0))));
    case 'acos': return Math.acos(Math.max(-1, Math.min(1, Number(args[0] || 0))));
    case 'atan2': return Math.atan2(Number(args[0] || 0), Number(args[1] || 0));
    case 'clamp': {
      const v = Number(args[0] || 0);
      const lo = Number(args[1] || 0);
      const hi = Number(args[2] || 1);
      return v < lo ? lo : (v > hi ? hi : v);
    }
    case 'exp': return Math.exp(Number(args[0] || 0));
    case 'log': return Math.log(Math.max(1e-12, Number(args[0] || 1)));
    case 'clone':
      return deepCloneValue(args[0]);
    case 'json_encode':
      return JSON.stringify(args[0]);
    case 'json_decode':
      return JSON.parse(toStr(args[0]));
    case 'mem_size':
      return estimateValueBytes(args[0], 0);
    case 'vm_create':
      return createVM(args[0], args[1] || null);
    case 'vm_reply':
      return replySyscall(args[0], args[1]);
    case 'vm_throw':
      return throwIntoVM(args[0], args[1]);
    case 'vm_info': {
      const c = args[0];
      if (!c || !c.__vm) return null;
      return {
        state: c.state,
        memBytes: computeVMMemBytes(c),
        pendingWork: c.pendingOp ? c.pendingOp.remaining : 0,
        stepsTotal: c.stepsTotal,
        selfStepsTotal: c.selfStepsTotal,
        childStepsTotal: c.childStepsTotal,
        error: c.error,
      };
    }
    case 'sort_by': {
      // sort_by(arr, keyName, dir) -> returns sorted shallow copy
      const arr = Array.isArray(args[0]) ? args[0].slice() : [];
      const key = args[1];
      const desc = Number(args[2] || 1) < 0;
      arr.sort((a, b) => {
        const va = key !== null && key !== undefined && a && typeof a === 'object' ? a[key] : a;
        const vb = key !== null && key !== undefined && b && typeof b === 'object' ? b[key] : b;
        let cmp = 0;
        if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
        else cmp = toStr(va).localeCompare(toStr(vb), 'zh-CN');
        return desc ? -cmp : cmp;
      });
      return arr;
    }
    case 'rand_next': {
      // Deterministic LCG step: rand_next(seedObj) mutates seedObj.s and returns [0, 1)
      const sObj = args[0];
      if (sObj && typeof sObj === 'object') {
        const next = (Math.imul(Number(sObj.s || 123456789), 1664525) + 1013904223) >>> 0;
        sObj.s = next;
        return next / 4294967296;
      }
      return 0.5;
    }
    case 'hash_str':
      return hashStr32(toStr(args[0]));
    default:
      throw new Error(`未知内置函数: ${name}`);
  }
}
