'use strict';
// 一次性修补：图表工作台的主窗口与投送视图尺寸分开保存。
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'assets', 'system', 'apps', 'charts.ns');
let s = fs.readFileSync(file, 'utf8');
const pairs = [
  ['var VW = 860;\nvar VH = 580;', 'var MW = 860;\nvar MH = 580;'],
  ['func render(sid, w, h) {\n    VW = w;\n    VH = h;\n', 'func render(sid, w, h) {\n'],
  ['    if (m.view != nil && m.view != "win" && has(views, m.view)) {\n        VW = views[m.view].w;\n        VH = views[m.view].h;\n    } else {\n        VW = VW;\n    }\n    var w = VW;',
   '    var w = MW;\n    if (m.view != nil && m.view != "win" && has(views, m.view)) {\n        w = views[m.view].w;\n    }'],
  ['    render("win-" + str(WID), VW, VH);', '    render("win-" + str(WID), MW, MH);'],
  ['            if (m.view == "win") {\n                VW = m.w;\n                VH = m.h;\n            } else {',
   '            if (m.view == "win") {\n                MW = m.w;\n                MH = m.h;\n            } else {'],
];
for (const [a, b] of pairs) {
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error('anchor ' + n + ': ' + a.slice(0, 60));
  s = s.replace(a, () => b);
}
fs.writeFileSync(file, s);
console.log('charts patched');
