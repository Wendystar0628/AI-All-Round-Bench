import { compileSource, VM, disasm } from '../app/js/lib/vm.js';
const src = 'let a = [1,2,3]; a[1] = 9; let m = {"k": 1}; m.k = m.k + a[1]; print(m.k);';
const prog = compileSource(src);
console.log(disasm(prog));
const vm = new VM(prog, {});
const out = [];
let g = 0;
while (!vm.done && g++ < 1000) {
  const r = vm.run(500, (n, args) => { out.push(args[0]); return { value: null }; });
  if (r.status === 'error') { console.log('ERR', r.error); break; }
}
console.log('out', out, 'globals', JSON.stringify(vm.globals));
