// 编译所有程序文件，检查语法（node tools/compilecheck.js）
import { compileSource } from '../app/js/lib/vm.js';
import fs from 'fs';
import path from 'path';

const dir = path.join(process.cwd(), 'app', 'programs');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.osprog'));
let bad = 0;
for (const f of files) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  try {
    const p = compileSource(src);
    console.log(`OK   ${f}  (${p.funcs.length} 函数, ${p.funcs.reduce((s, x) => s + x.code.length, 0)} 指令)`);
  } catch (e) {
    bad++;
    console.log(`FAIL ${f}: ${e.message}`);
  }
}
process.exit(bad ? 1 : 0);
