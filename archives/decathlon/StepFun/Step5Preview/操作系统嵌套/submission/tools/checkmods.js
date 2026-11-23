// 检查所有 ES 模块能否被解析（node tools/checkmods.js）
import fs from 'fs';
import path from 'path';
const dir = path.join(process.cwd(), 'app', 'js');
const files = [];
const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.js')) files.push(p); } };
walk(dir);
let bad = 0;
for (const f of files) {
  try { await import('file:///' + f.replace(/\\/g, '/')); console.log('OK  ', path.relative(process.cwd(), f)); }
  catch (e) { bad++; console.log('FAIL', path.relative(process.cwd(), f), '->', e.message); }
}
process.exit(bad ? 1 : 0);
