'use strict';
// 一次性修补：显示组合记录网页视图元素，供浏览器的前进/后退/刷新调用。
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'src', 'renderer', 'display.js');
let s = fs.readFileSync(file, 'utf8');
const pairs = [
  [`  let universe = null;\n  let hooks = {};`, `  let universe = null;\n  let hooks = {};\n  const webs = new Map();`],
  [`    } else if (n.t === 'web') {
      el._owner = sys;
      el._pid = n.pid;
      el._tab = n.tab;`, `    } else if (n.t === 'web') {
      el._owner = sys;
      el._pid = n.pid;
      el._tab = n.tab;
      el._wkey = sys.id + ':' + n.tab;
      webs.set(el._wkey, el);`],
  [`        if (el._type === '3d' && hooks.onView3d) hooks.onView3d(el, 'remove');
        el.remove();`, `        if (el._type === '3d' && hooks.onView3d) hooks.onView3d(el, 'remove');
        if (el._type === 'web' && el._wkey) webs.delete(el._wkey);
        el.remove();`],
  [`  global.NOSDisplay = { setUniverse, syncRoot, reconcile, syncSurface };`,
   `  // 网页视图的导航操作（由自动化与浏览器程序通过内核转交）
  global.NOSWeb = {
    op(sys, op, tab) {
      const el = webs.get(sys.id + ':' + tab);
      if (!el) return false;
      try {
        if (op === 'back') el.goBack();
        else if (op === 'forward') el.goForward();
        else if (op === 'reload') el.reload();
        else if (op === 'stop') el.stop();
      } catch (e) { console.warn('web op failed', op, e); }
      return true;
    },
  };

  global.NOSDisplay = { setUniverse, syncRoot, reconcile, syncSurface };`],
];
for (const [a, b] of pairs) {
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error('anchor ' + n + ': ' + a.slice(0, 70));
  s = s.replace(a, () => b);
}
fs.writeFileSync(file, s);
console.log('display patched');
