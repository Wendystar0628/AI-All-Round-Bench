'use strict';
// 测试用的最小宿主：直接运行一个可执行程序，提供文件与输出类系统调用。
const NVM = require('../src/host/vm.js');
function runProgram(binText, opts) {
  opts = opts || {};
  const files = opts.files || {}; const out = []; let instr = 0;
  const ctx = NVM.create(binText);
  const max = opts.max || 2e9;
  while (instr < max) {
    const r = NVM.run(ctx, 1000000);
    instr += r[1];
    if (r[0] === NVM.R.SYS) {
      const name = r[2], a = r[3];
      let v = null;
      if (name === 'args') v = opts.args || null;
      else if (name === 'read') v = typeof files[a[0]] === 'string' ? files[a[0]] : { error: '找不到文件 ' + a[0] };
      else if (name === 'write') { files[a[0]] = a[1]; v = true; }
      else if (name === 'print') { out.push(NVM.toStr(a[0])); v = true; }
      else if (name === 'exit') return { ok: true, out, instr, files, code: a[0] };
      else if (name === 'fail') return { ok: false, error: a[0], out, instr, files };
      else if (name === 'time') v = instr / 1000;
      else if (opts.sys) v = opts.sys(name, a);
      else return { ok: false, error: '未知系统调用 ' + name, out, instr };
      NVM.ret(ctx, v);
    } else if (r[0] === NVM.R.EXIT) return { ok: true, out, instr, files, code: r[2] };
    else if (r[0] === NVM.R.FAULT) return { ok: false, error: r[2], out, instr, files };
  }
  return { ok: false, error: '超出指令上限', out, instr };
}
module.exports = { runProgram };
