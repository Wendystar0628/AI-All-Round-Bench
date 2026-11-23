// Node 测试加载器：模拟 window 并按顺序载入逻辑脚本
global.window = global; global.G = global.G || {};
const fs = require('fs'), path = require('path'), vm = require('vm');
module.exports = function (files) {
  for (const f of files) {
    const p = path.join(__dirname, '..', 'js', f);
    vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: p });
  }
  return global.G;
};
