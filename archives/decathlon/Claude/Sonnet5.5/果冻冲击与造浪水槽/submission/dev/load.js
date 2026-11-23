// 在 node 中加载浏览器脚本（仅用于数值调试）
const fs = require('fs'), vm = require('vm'), path = require('path');
globalThis.GPUBufferUsage = {}; globalThis.GPUTextureUsage = {}; globalThis.GPUShaderStage = {};
globalThis.window = { devicePixelRatio: 1 };
const root = path.join(__dirname, '..', 'js');
module.exports = function load(files) {
  let code = '';
  for (const f of files) code += fs.readFileSync(path.join(root, f), 'utf8') + '\n;\n';
  // 'use strict' 的顶层 const/class 不会挂到全局，这里把整段包进一个函数并导出
  return code;
};
