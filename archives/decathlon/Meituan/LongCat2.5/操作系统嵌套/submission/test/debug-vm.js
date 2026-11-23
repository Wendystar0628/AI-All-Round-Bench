'use strict';
global.window = global;
require('../js/vm.js');
const VM = window.NOS.VM;
function run(label, src) {
  const calls = [];
  try {
    const p = VM.compile(src);
    const proc = { pid:1, state:'ready', program:p, vm:{pc:0,sp:0,frames:null,stack:[],handlers:[]}, waitInfo:null };
    const sys = { runtime: { procSyscall(pc,n,a){ calls.push([n,...a]); return { value:'SY:'+n }; } } };
    const vm = new VM.VM(); let g=0;
    while (proc.state!=='ended' && proc.state!=='error' && g++<200) {
      if (proc.state==='waiting') proc.state='ready';
      vm.exec(sys, proc, {left:100000, slice:100000});
    }
    console.log('---', label, 'state', proc.state, 'err', proc.error);
    console.log('calls', JSON.stringify(calls));
    if (proc.vm.frames && proc.vm.frames.length) console.log('stack', JSON.stringify(proc.vm.stack.slice(0,8)));
  } catch(e) { console.log('---', label, 'THROW', e.message); }
}
run('while', 'var s = 0\nvar i = 1\nwhile i <= 3 {\n  s = s + i\n  i = i + 1\n}\nprint s');
run('arrset', 'var a = [10,20,30]\na[1] = 99\nprint a[1]');
run('maplit', 'var m = {"x": 1}\nm["z"] = 5\nprint m["z"]');
run('trycatch', 'try {\n  throw "boom"\n} catch e {\n  print e\n}\nprint "done"');
run('substr', 'var s = "abcdef"\nprint substr(s, 2, 5)');
run('member', 'var m = {}\nm.k = 7\nprint m.k');
run('func', 'func add(a,b){ return a+b }\nprint add(2,3)');
