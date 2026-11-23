'use strict';
// 一次性修补：启动时若模板版本变化，刷新系统程序与示例文件（用户文件保留）。
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'src', 'renderer', 'host.js');
let s = fs.readFileSync(file, 'utf8');
const pairs = [
  [`    if (saved) {
      const disk = JSON.parse(saved);
      root.disk = {};
      root.diskBytes = 0;
      for (const k of Object.keys(disk)) root.setDisk(k, disk[k]);
      root.compilerImage = U.compilerFromDisk(root);
      root.compilerKey = root.compilerImage ? fnv(root.disk['f:/System/compiler.nobj'] || '') : '';
      root.bootKernel(root.disk['f:/System/kernel.ns']);
    }`, `    if (saved) {
      const disk = JSON.parse(saved);
      root.disk = {};
      root.diskBytes = 0;
      for (const k of Object.keys(disk)) root.setDisk(k, disk[k]);
      refreshTemplate(root, files);
      root.compilerImage = U.compilerFromDisk(root);
      root.compilerKey = root.compilerImage ? fnv(root.disk['f:/System/compiler.nobj'] || '') : '';
      root.bootKernel(root.disk['f:/System/kernel.ns']);
    }`],
  [`  async function bootSystem(fresh) {`, `  // 模板版本变化时，用项目里的系统程序与示例文件覆盖磁盘中的同名文件（其余用户文件保留）。
  const REFRESH_PREFIXES = ['/System/', '/Demo/', '/Programs/', '/Flight/', '/Documents/welcome.txt'];
  function templateHash(files) {
    let text = '';
    for (const p of Object.keys(files).sort()) text += p + '\n' + files[p].length + '\n' + files[p].slice(0, 4096);
    return fnv(text);
  }
  function refreshTemplate(root, files) {
    const hash = templateHash(files);
    if (root.disk['cfg:template'] === hash) return;
    const idx = JSON.parse(root.disk['fsidx'] || '{}');
    for (const p of Object.keys(files)) {
      if (!REFRESH_PREFIXES.some((pre) => p.startsWith(pre))) continue;
      const parts = p.split('/').filter(Boolean);
      let dir = '';
      for (let i = 0; i < parts.length - 1; i++) {
        dir += '/' + parts[i];
        if (!idx[dir]) idx[dir] = { t: 'd', s: 0, m: 0 };
      }
      idx[p] = { t: 'f', s: files[p].length, m: 0 };
      root.setDisk('f:' + p, files[p]);
    }
    root.setDisk('fsidx', JSON.stringify(idx));
    root.setDisk('cfg:template', hash);
  }

  async function bootSystem(fresh) {`],
];
for (const [a, b] of pairs) {
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error('anchor ' + n + ': ' + a.slice(0, 60));
  s = s.replace(a, () => b);
}
fs.writeFileSync(file, s);
console.log('host patched');
