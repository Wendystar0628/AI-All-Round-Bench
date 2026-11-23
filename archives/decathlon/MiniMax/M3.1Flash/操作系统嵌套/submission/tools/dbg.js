require('../src/core/nsl-core.js');
const fs = require('fs');
const path = require('path');
const NSL = globalThis.NSL;
const compilerSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'nsl', 'compiler.nsl'), 'utf8');
const p = NSL.compileSource(compilerSrc);
const ctx = { globals: {}, budget: 50000000, log: () => {}, now: () => 0, rngState: 1 };
const r = NSL.callFunction(p, 'compileProgram', ['var x = 1;'], ctx);
const g = ctx.globals;
for (const k of ['OP_CONST', 'OP_NIL', 'OP_POP', 'OP_DUP', 'OP_DUP2', 'OP_GETG', 'OP_SETG', 'OP_GETL', 'OP_SETL', 'OP_NEWARR', 'OP_AGET', 'OP_ASET', 'OP_ADD', 'OP_JMP', 'OP_CALL', 'OP_BUILTIN']) {
  console.log(k, '=', JSON.stringify(g[k]));
}
console.log('global count', Object.keys(g).length);
