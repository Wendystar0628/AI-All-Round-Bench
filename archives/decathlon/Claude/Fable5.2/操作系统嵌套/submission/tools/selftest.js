const fs = require('fs'); const path = require('path');
const { stage0 } = require('./stage0.js'); const { runProgram } = require('./minihost.js');
const G = path.join(__dirname, '..', 'guest');
const read = p => { try { return fs.readFileSync(path.join(G, p), 'utf8'); } catch (e) { return null; } };
const csrc = read('/System/compiler.nx');
let t = Date.now();
const s0 = stage0(csrc, read, '/System/compiler.nx', '/System/compiler.nxb');
const bin1 = s0.files['/System/compiler.nxb'];
console.log('stage0 ok', bin1.length, 'bytes', Date.now() - t, 'ms', s0.log);
t = Date.now();
const files = { '/System/compiler.nx': csrc };
const r = runProgram(bin1, { files, args: { src: '/System/compiler.nx', out: '/out.nxb' } });
console.log('stage1 in VM:', r.ok, r.error || '', r.instr, 'instr', Date.now() - t, 'ms', r.out);
console.log('identical:', r.files && r.files['/out.nxb'] === bin1);
// 小程序测试
const prog = `
var total = 0;
function fib(n) { if (n < 2) { return n; } return fib(n - 1) + fib(n - 2); }
for (var i = 0; i < 10; i++) { total += i; }
var m = {a: 1, "b": [1,2,3]};
m.c = m.a + len(m.b);
var s = "";
var k = keys(m); for (var j = 0; j < len(k); j++) { s = s + k[j] + "=" + str(m[k[j]]) + ";"; }
function apply(f, x) { return f(x); }
sys("print", "total=" + total + " fib(20)=" + fib(20) + " " + s + " " + apply(fib, 10) + " " + (total > 40 ? "big" : "small") + " " + (null || "dflt") + " " + (1 && 2));
var arr = [5,3,9]; arr[3] = 1; sort(arr); sys("print", join(arr, ","));
var w = 0; while (true) { w++; if (w > 5) break; if (w == 2) continue; }
sys("print", "w=" + w + " " + -3 + " " + (0 - w) + " " + 7 % 3 + " " + !w);
`;
const files2 = { '/t.nx': prog };
const c = runProgram(bin1, { files: files2, args: { src: '/t.nx', out: '/t.nxb' } });
if (!c.ok) { console.log('compile fail', c.error); process.exit(1); }
t = Date.now();
const rr = runProgram(files2['/t.nxb']);
console.log(rr.ok, rr.error || '', rr.out, rr.instr, Date.now() - t, 'ms');
// 速度
const bench = `var x = 0; for (var i = 0; i < 3000000; i++) { x = x + i % 7; } sys("print", x);`;
const f3 = { '/b.nx': bench }; runProgram(bin1, { files: f3, args: { src: '/b.nx', out: '/b.nxb' } });
t = Date.now(); const rb = runProgram(f3['/b.nxb']); const dt = Date.now() - t;
console.log('bench', rb.out, rb.instr, 'instr', dt, 'ms', (rb.instr / dt / 1000).toFixed(1), 'M instr/s');
