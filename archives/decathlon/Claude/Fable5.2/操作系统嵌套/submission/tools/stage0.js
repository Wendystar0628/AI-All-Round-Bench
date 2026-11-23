'use strict';
// 自举：compiler.nx 的写法同时是合法的 JavaScript，这里直接用宿主执行它一次，得到第一份可执行的编译器。
const NVM = require('../src/host/vm.js');
function stage0(compilerSrc, readFile, srcPath, outPath) {
  const files = {}; const log = [];
  const EXIT = { exit: true };
  const sys = (name, a, b) => {
    switch (name) {
      case 'args': return { src: srcPath, out: outPath };
      case 'read': { const t = readFile(a); return typeof t === 'string' ? t : { error: '找不到文件 ' + a }; }
      case 'write': files[a] = b; return true;
      case 'print': log.push(a); return true;
      case 'exit': throw EXIT;
      case 'fail': throw new Error(a);
      default: throw new Error('stage0: 未知系统调用 ' + name);
    }
  };
  const names = Object.keys(NVM.PURE);
  const fn = new Function('sys', ...names, compilerSrc);
  try { fn(sys, ...names.map(n => NVM.PURE[n])); } catch (e) { if (e !== EXIT) throw e; }
  return { files, log };
}
module.exports = { stage0 };
