'use strict';
global.window = global;
require('../js/vm.js');
const VM = window.NOS.VM;
const src = 'var s = 0\nvar i = 1\nwhile i <= 3 {\n  s = s + i\n  i = i + 1\n}\nprint s';
const p = VM.compile(src);
console.log('code', JSON.stringify(p.code), 'consts', JSON.stringify(p.consts));
const proc = { pid:1, state:'ready', program:p, vm:{pc:0,sp:0,frames:null,stack:[],handlers:[]}, waitInfo:null };
let log = [];
const sys = {
  runtime: { procSyscall(pc,n,a){ console.log('SYSCALL', n, JSON.stringify(a)); return {value:'ok'}; } },
  trace(proc, at, op, sp, stack, frames) { log.push(at + ':' + op + ' sp=' + sp + ' base=' + (frames&&frames.length?frames[frames.length-1].base:'-') + ' top=' + JSON.stringify(stack.slice(Math.max(0,sp-3), sp))); }
};
const vm = new VM.VM();
for (let k = 0; k < 60 && proc.state !== 'ended' && proc.state !== 'error'; k++) {
  log = [];
  const ctx = { left: 1000, slice: 1000 };
  const r = vm.exec(sys, proc, ctx);
  console.log('--- exec', k, 'r=' + r, 'pc=' + proc.vm.pc, 'sp=' + proc.vm.sp, proc.error||'');
  console.log(log.join('\n'));
}
