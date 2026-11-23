import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
s = s.replace("const nList = h('div', {});", "const nList = h('div', { 'data-testid': 'widget-notifications' });");
fs.writeFileSync('js/shell.js', s);
console.log('ok');