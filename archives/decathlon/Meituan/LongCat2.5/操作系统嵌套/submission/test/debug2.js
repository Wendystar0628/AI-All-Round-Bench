'use strict';
global.window = global;
require('../js/vm.js');
const VM = window.NOS.VM;
function dis(p) {
  const names = Object.keys(VM.OP).filter(k => isNaN(parseInt(k)));
  let s = [];
  let i = 0;
  while (i < p.code.length) {
    const op = p.code[i];
    const nm = names.find(k => VM.OP[k] === op) || ('?' + op);
    s.push(i + ':' + nm + (nm==='CONST' ? '(' + JSON.stringify(p.consts[p.code[i+1]]) + ')' : '') +
      (['LOAD','STORE','JMP','JMPF','JMPT','TRYBEGIN'].includes(nm) ? '(' + p.code[i+1] + ')' : '') +
      (nm==='SYSCALL' ? '(' + p.consts[p.code[i+1]] + ',' + p.code[i+2] + ')' : '') +
      (['CALL'].includes(nm) ? '(' + p.code[i+1] + ',' + p.code[i+2] + ')' : '') +
      (['BUILDARR','BUILDMAP'].includes(nm) ? '(' + p.code[i+1] + ')' : '') +
      (['MEMBER','SETMEMBER'].includes(nm) ? '(' + p.consts[p.code[i+1]] + ')' : ''));
    i += 1;
    if (['CONST','LOAD','STORE','JMP','JMPF','JMPT','MEMBER','SETMEMBER','TRYBEGIN'].includes(nm)) i += 1;
    else if (['SYSCALL','CALL','BUILDARR','BUILDMAP'].includes(nm)) i += 2;
  }
  return s.join(' ');
}
console.log(dis(VM.compile('var a=[10,20,30]\nprint a[1]')));
console.log();
console.log(dis(VM.compile('var m = {}\nm.k = 7\nprint m.k')));
console.log();
console.log(dis(VM.compile('var s = 0\nvar i = 1\nwhile i <= 3 {\n  s = s + i\n  i = i + 1\n}\nprint s')));
