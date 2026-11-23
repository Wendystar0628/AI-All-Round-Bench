// 字形数据构建脚本（开发期使用，交付物不依赖它）
// 用法: node tools/build-fonts.js <node_modules 目录>
// 来源: hanzi-writer-data (Arphic Public License) 与 Noto Sans SC (SIL OFL 1.1)
const fs = require('fs');
const path = require('path');
const nm = process.argv[2];
const opentype = require(path.join(nm, 'opentype.js'));
const OUT = path.join(__dirname, '..', 'data');

const ALPH = [];
for (let c = 35; c <= 126; c++) if (c !== 92) ALPH.push(String.fromCharCode(c)); // 91 个安全字符
function enc(n) {
  let v = Math.round(n) + 3000;
  if (v < 0 || v >= 91 * 91) throw new Error('range ' + n);
  return ALPH[(v / 91) | 0] + ALPH[v % 91];
}
function writeChunks(name, meta, records, maxBytes) {
  // 分块写出，每块一个 <script>，以 MF_FONT_PART(name, idx, str) 注册
  let parts = [], cur = '';
  for (const r of records) { if (cur.length + r.length > maxBytes && cur.length) { parts.push(cur); cur = ''; } cur += r; }
  if (cur.length) parts.push(cur);
  const files = [];
  parts.forEach((p, i) => {
    const fn = `font_${name}_${i}.js`;
    fs.writeFileSync(path.join(OUT, fn), `MF_FONT_PART(${JSON.stringify(name)},${i},${JSON.stringify(p)});\n`);
    files.push(fn);
  });
  meta.parts = parts.length;
  fs.writeFileSync(path.join(OUT, `font_${name}_meta.js`), `MF_FONT_META(${JSON.stringify(name)},${JSON.stringify(meta)});\n`);
  console.log(name, 'records', records.length, 'parts', parts.length, 'bytes', parts.reduce((a, b) => a + Buffer.byteLength(b), 0));
  return files;
}
function loadFont(file) {
  const buf = fs.readFileSync(file);
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}
function glyphRecord(ch, g) {
  let s = ch + enc(g.advanceWidth || 0);
  for (const c of g.path.commands) {
    if (c.type === 'M') s += 'M' + enc(c.x) + enc(-c.y);
    else if (c.type === 'L') s += 'L' + enc(c.x) + enc(-c.y);
    else if (c.type === 'Q') s += 'Q' + enc(c.x1) + enc(-c.y1) + enc(c.x) + enc(-c.y);
    else if (c.type === 'C') s += 'C' + enc(c.x1) + enc(-c.y1) + enc(c.x2) + enc(-c.y2) + enc(c.x) + enc(-c.y);
    else if (c.type === 'Z') s += 'Z';
  }
  return s + '!';
}
function fontRecords(font, filter, seen) {
  const recs = [];
  const cmap = font.tables.cmap.glyphIndexMap;
  for (const k of Object.keys(cmap).map(Number).sort((a, b) => a - b)) {
    if (k < 32 || k === 0x21 || k === 0x22 || k === 0x5c) { if (k !== 0x21 && k !== 0x22 && k !== 0x5c) continue; }
    if (filter && !filter(k)) continue;
    const ch = String.fromCodePoint(k);
    if (seen.has(ch)) continue;
    const g = font.glyphs.get(cmap[k]);
    if (!g) continue;
    seen.add(ch);
    recs.push(glyphRecord(ch, g));
  }
  return recs;
}
const fsDir = path.join(nm, '@fontsource', 'noto-sans-sc', 'files');

// ---------- 思源黑体 Heavy ----------
{
  const f = loadFont(path.join(fsDir, 'noto-sans-sc-chinese-simplified-900-normal.woff'));
  const fl = loadFont(path.join(fsDir, 'noto-sans-sc-latin-900-normal.woff'));
  const seen = new Set();
  const recs = fontRecords(fl, null, seen).concat(fontRecords(f, null, seen));
  writeChunks('hei', { label: '思源黑体 Heavy', upm: f.unitsPerEm, asc: 880, desc: 120, strokes: false,
    license: 'Noto Sans SC · SIL OFL 1.1', count: recs.length }, recs, 2600000);
}
// ---------- 锻楷（含笔画）----------
{
  const hz = path.join(nm, 'hanzi-writer-data');
  const files = fs.readdirSync(hz).filter(f => f.endsWith('.json') && f !== 'package.json' && f !== 'all.json');
  const recs = [];
  const seen = new Set();
  for (const fn of files) {
    const ch = fn.slice(0, -5);
    if ([...ch].length !== 1) continue;
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(hz, fn), 'utf8')); } catch (e) { continue; }
    if (!d.strokes || !d.medians) continue;
    let s = ch;
    d.strokes.forEach((p, si) => {
      const tk = p.trim().split(/\s+/);
      let i = 0;
      while (i < tk.length) {
        const c = tk[i++];
        const n = c === 'M' || c === 'L' ? 2 : c === 'Q' ? 4 : c === 'C' ? 6 : c === 'Z' ? 0 : -1;
        if (n < 0) throw new Error('cmd ' + c + ' in ' + ch);
        s += c;
        for (let k = 0; k < n; k += 2) { s += enc(+tk[i]) + enc(-(+tk[i + 1])); i += 2; }
      }
    });
    s += ' ';
    d.medians.forEach((m, mi) => { if (mi > 0) s += ' '; for (const pt of m) s += enc(pt[0]) + enc(-pt[1]); });
    s += '!';
    seen.add(ch);
    recs.push(s);
  }
  recs.sort();
  // 楷体的拉丁字母与标点取自思源黑体 Medium
  const fl = loadFont(path.join(fsDir, 'noto-sans-sc-latin-500-normal.woff'));
  const fc = loadFont(path.join(fsDir, 'noto-sans-sc-chinese-simplified-500-normal.woff'));
  const extra = fontRecords(fl, null, seen).concat(fontRecords(fc, k => (k >= 0x2000 && k < 0x2e80) || (k >= 0x3000 && k < 0x3040) || (k >= 0xff00 && k < 0xfff0), seen));
  writeChunks('kai', { label: '锻楷（含笔画）', upm: 1024, asc: 900, desc: 124, strokes: true, auxUpm: fl.unitsPerEm,
    license: 'Make Me a Hanzi / Arphic PL KaitiM · Arphic Public License；拉丁与标点取自 Noto Sans SC · OFL', count: recs.length }, recs, 2600000);
  fs.writeFileSync(path.join(OUT, 'font_kai_aux.js'), `MF_FONT_PART("kai_aux",0,${JSON.stringify(extra.join(''))});\nMF_FONT_META("kai_aux",${JSON.stringify({ upm: fl.unitsPerEm, count: extra.length, parts: 1 })});\n`);
  console.log('kai aux', extra.length);
}
