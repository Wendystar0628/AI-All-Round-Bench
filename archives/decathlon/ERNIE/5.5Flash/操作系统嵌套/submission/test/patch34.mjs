import fs from 'fs';
let s = fs.readFileSync('js/apps/sysmgr.js', 'utf8');
const a = `'内核错误：' + (sys.errorLog?.slice(-1)[0]?.msg || '内核程序异常')`;
const b = `'内核错误：' + (sys.kernelError || sys.errorLog?.slice(-1)[0]?.msg || '内核程序异常')`;
if (s.includes(a)) { s = s.replace(a, b); console.log('ok'); } else console.log('miss');
fs.writeFileSync('js/apps/sysmgr.js', s);