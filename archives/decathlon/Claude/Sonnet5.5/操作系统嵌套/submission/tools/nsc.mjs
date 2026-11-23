// 命令行：node tools/nsc.mjs compile <src.ns> [out.nsx] | run <src.ns>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '../src/host/compiler.js';
import { VM, NATIVES, tostr } from '../src/host/vm.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function readNs(p) {
  const fp = path.join(ROOT, 'ns', p.replace(/^\//, ''));
  if (!fs.existsSync(fp)) return null;
  return { text: fs.readFileSync(fp, 'utf8'), sig: '' };
}
export function compileFile(srcPath, name) {
  const text = fs.readFileSync(srcPath, 'utf8');
  return compile(text, { name: name || srcPath, read: readNs, prelude: '/System/lib/sys.ns', natives: new Set(Object.keys(NATIVES)) });
}
const [cmd, file, out] = process.argv.slice(2);
if (cmd === 'compile') {
  const prog = compileFile(file);
  fs.writeFileSync(out || file + 'x', JSON.stringify(prog));
  console.log('ok', prog.f.length, 'funcs', prog.f.reduce((n, f) => n + f.c.length / 3, 0), 'instrs');
} else if (cmd === 'run') {
  const prog = compileFile(file);
  const vm = new VM();
  const ctx = vm.spawn(prog, { priv: true });
  let total = 0;
  for (let i = 0; i < 100000; i++) {
    const r = vm.run(ctx, 100000); total += r.used;
    if (r.status === 'trap') {
      const t = ctx.trap;
      if (t.name === 'print') { console.log(tostr(t.args[0])); vm.ret(ctx, null); }
      else if (t.name === 'time') vm.ret(ctx, 0);
      else if (t.name === 'exit') break;
      else { console.log('未处理系统调用', t.name); vm.ret(ctx, null); }
    } else if (r.status === 'done') break;
    else if (r.status === 'error') { console.log('错误：', ctx.err); break; }
  }
  console.log('— 共消耗', total, '单位');
}
