import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
const a = `      if (it.action) el.dataset.action = it.action;`;
const b = `      if (it.action) el.dataset.action = it.action;
      if (it.action === 'new-system' && !el.dataset.appId) el.dataset.appId = 'sysmgr';`;
if (s.includes(a)) { s = s.replace(a, b); console.log('ok'); } else console.log('miss');
fs.writeFileSync('js/shell.js', s);