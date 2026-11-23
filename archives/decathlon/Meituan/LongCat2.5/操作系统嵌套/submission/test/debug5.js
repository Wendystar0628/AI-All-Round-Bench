'use strict';
global.window = global;
require('../js/vm.js');
const VM = window.NOS.VM;
const which = process.argv[2];
const srcs = {
  sum: 'var s = 0\nvar i = 1\nwhile i <= 3 {\n  s = s + i\n  i = i + 1\n}\nprint s',
  map: 'var m = {"x": 1}\nm["z"] = 5\nprint m["z"]',
  arr: 'var a = [10,20,30]\na[1] = 99\nprint a[1]',
  tc: 'var r = 0\ntry {\n  throw "boom"\n  r = 1\n} catch e {\n  r = 2\n  print e\n}\nprint r',
  pre: 'var i = 0\nwhile true {\n  i = i + 1\n}'
};
const src = srcs[which];
if (!src) { console.log('unknown'); process.exit(1); }
const p = VM.compile(src);
console.log('code', JSON.stringify(p.code));
console.log('consts', JSON.stringify(p.consts));
const proc = { pid:1, state:'ready', program:p, vm:{pc:0,sp:0,frames:null,stack:[],handlers:[]}, waitInfo:null };
const calls = [];
const sys = {
  runtime: { procSyscall(pc,n,a){ calls.push([n,...a]); return {value:'SY:'+n}; } },
  trace(proc, at, op, sp, stack, frames, ctx) {
    if (proc._tr < 80) { proc._tr++; console.log('  ', at + ':' + op, 'sp=' + sp, 'top=' + JSON.stringify(stack.slice(Math.max(0,sp-4), sp)), 'left=' + ctx.left); }
  }
};
proc._tr = 0;
const vm = new VM.VM();
let g = 0;
while (proc.state !== 'ended' && proc.state !== 'error' && g++ < 10) {
  proc._tr = 0;
  console.log('--- exec', g - 1);
  const ctx = { left: 300, slice: 300 };
  const r = vm.exec(sys, proc, ctx);
  console.log('r=' + r, 'pc=' + proc.vm.pc, 'sp=' + proc.vm.sp, 'state=' + proc.state, proc.error || '');
}
console.log('calls', JSON.stringify(calls));
