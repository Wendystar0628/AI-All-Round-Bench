'use strict';
global.window = global;
require('../js/vm.js');
const VM = window.NOS.VM;
const src = process.argv[2] || 'var a=[10,20,30]\nprint a[1]';
const p = VM.compile(src);
console.log('code', JSON.stringify(p.code));
console.log('consts', JSON.stringify(p.consts));
const proc = { pid:1, state:'ready', program:p, vm:{pc:0,sp:0,frames:null,stack:[],handlers:[]}, waitInfo:null };
const sys = { runtime: { procSyscall(pc,n,a){ console.log('SYSCALL', n, JSON.stringify(a)); return {value:'ok'}; } } };
const vm = new VM.VM();
let g = 0;
while (proc.state !== 'ended' && proc.state !== 'error' && g++ < 40) {
  const ctx = { left: 1000, slice: 1000 };
  const r = vm.exec(sys, proc, ctx);
  console.log('step', g, 'r=' + r, 'pc=' + proc.vm.pc, 'sp=' + proc.vm.sp, 'state=' + proc.state,
    'stack=' + JSON.stringify(proc.vm.stack.slice(0,10)), proc.error || '');
}
