'use strict';
// 构建预置镜像：用自举得到的编译器编译全部预置程序，连同源文件一起打包为 dist/image.json。
const fs = require('fs'); const path = require('path');
const NVM = require('../src/host/vm.js');
const { stage0 } = require('./stage0.js');
const ROOT = path.join(__dirname, '..');
function walk(dir, base, out) {
  for (const n of fs.readdirSync(dir)) {
    const full = path.join(dir, n), rel = base + '/' + n;
    if (fs.statSync(full).isDirectory()) { out[rel] = null; walk(full, rel, out); }
    else out[rel] = fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
  }
  return out;
}
function build(opts) {
  opts = opts || {};
  const files = walk(path.join(ROOT, 'guest'), '', {});
  if (opts.override) Object.assign(files, opts.override);
  const read = p => typeof files[p] === 'string' ? files[p] : null;
  const csrc = read('/System/compiler.nx');
  const s0 = stage0(csrc, read, '/System/compiler.nx', '/System/compiler.nxb');
  const cbin = s0.files['/System/compiler.nxb'];
  files['/System/compiler.nxb'] = cbin;
  files['/System/cache'] = null; files['/System/kernels'] = null;
  const chash = NVM.hash(cbin);
  const progs = Object.keys(files).filter(p => typeof files[p] === 'string' && p.endsWith('.nx') && !p.startsWith('/System/lib/') && p !== '/System/compiler.nx');
  const report = [];
  for (const p of progs) {
    const out = '/System/cache/' + NVM.hash(files[p]) + '.nxb';
    let r;
    try { r = stage0(csrc, read, p, out); } catch (e) { throw new Error('编译 ' + p + ' 失败：' + e.message); }
    const bin = r.files[out];
    const bad = NVM.checkProgram(bin);
    if (bad) throw new Error('装载 ' + p + ' 失败：' + bad);
    const deps = JSON.parse(r.files[out + '.dep']); deps.push(['/System/compiler.nxb', chash]);
    files[out] = bin; files[out + '.dep'] = JSON.stringify(deps);
    report.push(p + ' → ' + bin.length);
  }
  return { files, report };
}
if (require.main === module) {
  const t = Date.now();
  const { files, report } = build();
  // 根系统额外文件
  const extra = walk(path.join(ROOT, 'rootfs'), '', {});
  fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'dist', 'image.json'), JSON.stringify({ version: 1, files, rootExtra: extra }));
  let total = 0; for (const k in files) if (typeof files[k] === 'string') total += files[k].length;
  console.log(report.join('\n'));
  console.log('镜像文件数', Object.keys(files).length, '总大小', total, '用时', Date.now() - t, 'ms');
}
module.exports = { build };
