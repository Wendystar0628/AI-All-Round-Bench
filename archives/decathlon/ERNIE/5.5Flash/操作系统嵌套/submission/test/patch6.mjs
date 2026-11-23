import fs from 'fs';
let e = fs.readFileSync('js/apps/editor.js', 'utf8');
if (!e.includes('export { HELP_TEXT }')) e += '\nexport { HELP_TEXT };\n';
fs.writeFileSync('js/apps/editor.js', e);
let s = fs.readFileSync('js/shell.js', 'utf8');
s = s.replace("import { EditorApp } from './apps/editor.js';", "import { EditorApp, HELP_TEXT } from './apps/editor.js';");
const a = "for (const [p, c] of Object.entries(DEMO_FILES)) fs.write(p, c, Date.now());";
if (s.includes(a) && !s.includes("fs.write('/System/help.md', HELP_TEXT, Date.now());\n    const root")) {
  s = s.replace(a, a + "\n    fs.write('/System/help.md', HELP_TEXT, Date.now());");
}
const b = "fs.write('/Demo/sample.sheet', JSON.stringify(SAMPLE_SHEET, null, 2), Date.now());";
if (!s.includes("fs.write('/System/help.md', HELP_TEXT, Date.now());\n    const child")) {
  // add help to child creation after the second sample.sheet write
  const idx = s.indexOf(b, s.indexOf('createChild'));
  if (idx >= 0) {
    const end = idx + b.length;
    s = s.slice(0, end) + "\n    fs.write('/System/help.md', HELP_TEXT, Date.now());" + s.slice(end);
  }
}
fs.writeFileSync('js/shell.js', s);
console.log('ok');