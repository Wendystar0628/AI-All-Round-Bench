import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
const a = `      if (sys.isRoot) {
        sys.apps.workbooks = [];
        sys.rootWorkbooks = new Map();
      }`;
const b = `      if (sys.isRoot) {
        if (!sys.apps.workbooks) sys.apps.workbooks = [];
      }`;
if (s.includes(a)) { s = s.replace(a, b); console.log('ok'); } else console.log('miss');
fs.writeFileSync('js/shell.js', s);