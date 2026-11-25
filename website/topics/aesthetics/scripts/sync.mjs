// 把网站用到的设计素材同步一份副本到 src/vendor/（不进 git）。只拷要用的文件；内容没变的不重拷，
// src/vendor/ 里多出来的删掉。来源（相对仓库根）：
//
//   专题/审美全能/设计/tokens.css             -> src/vendor/design/tokens.css   去掉开头的字体 @import：
//                                                 字体由网站自己声明（scripts/fonts.mjs）
//   专题/审美全能/设计/{tokens.json, ae.js}   -> src/vendor/design/
//   专题/审美全能/设计/textures/textures.css  -> src/vendor/design/textures/
//   专题/审美全能/设计/ornaments/ornaments.js -> src/vendor/design/ornaments/
//   专题/审美全能/设计/logo/{glyphs.js, favicon.svg} -> src/vendor/design/logo/   favicon.svg 是标签栏图标
//   专题/审美全能/设计/logo/wordmark/wordmark.js -> src/vendor/design/logo/wordmark/   字标的矢量字形（页面在构建时画成内联 SVG）
//   scripts/fonts.mjs FONT_FILES 里的字体文件  -> src/vendor/design/fonts/
//   平台/厂商图标/mark/*.svg                  -> src/vendor/logos/
//
// 下面三个目录有了才拷（还在做的东西；没有时页面用各自的退路，见 docs/design.md 8.5）：
//   专题/审美全能/设计/logo/lockups/  -> src/vendor/design/logo/lockups/   十个题名锁定（视频和网站共用的同一份：清单 lockups.js 和网页用的 WebP 图层，不拷 PNG 和 build/）
//   专题/审美全能/设计/portraits/     -> src/vendor/design/portraits/      预渲的进光立绘：清单 portraits.json 和 players/、judges/ 里的图
//                                                                         （同目录的 build.mjs、render.html 是生成工具，不拷）
//   专题/审美全能/设计/stills/        -> src/vendor/design/stills/         代表画面的静图（画面层，不带字）
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FONT_FILES, fontSource } from './fonts.mjs';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bench = resolve(site, '..', '..', '..');
const design = join(bench, '专题', '审美全能', '设计');
const marks = join(bench, '平台', '厂商图标', 'mark');
const vendor = join(site, 'src', 'vendor');

const dropFontImport = (buf) => Buffer.from(buf.toString('utf8').replace(/^@import url\("fonts\/fonts\.css"\);\s*/m, ''));

/** [来源, 目标（相对 src/vendor）, 改写] */
const files = [
  [join(design, 'tokens.css'), 'design/tokens.css', dropFontImport],
  [join(design, 'tokens.json'), 'design/tokens.json'],
  [join(design, 'ae.js'), 'design/ae.js'],
  [join(design, 'textures', 'textures.css'), 'design/textures/textures.css'],
  [join(design, 'ornaments', 'ornaments.js'), 'design/ornaments/ornaments.js'],
  [join(design, 'logo', 'glyphs.js'), 'design/logo/glyphs.js'],
  [join(design, 'logo', 'wordmark', 'wordmark.js'), 'design/logo/wordmark/wordmark.js'],
  [join(design, 'logo', 'favicon.svg'), 'design/logo/favicon.svg'],
];
const lostFonts = [];
for (const file of Object.keys(FONT_FILES)) {
  const src = fontSource(bench, file);
  if (src) files.push([src, `design/fonts/${file}`]);
  else lostFonts.push(file);
}
/** [来源目录, 目标目录, 要不要这个文件]；optional 的目录没有时跳过 */
const folders = [
  [marks, 'logos', (n) => n.endsWith('.svg')],
  [join(design, 'logo', 'lockups'), 'design/logo/lockups', (n) => n.endsWith('.webp') || n === 'lockups.js', true],
  [join(design, 'portraits'), 'design/portraits', (n, dir) => (dir ? /\.(webp|png)$/i.test(n) : n === 'portraits.json'), true],
  [join(design, 'stills'), 'design/stills', (n) => /\.(webp|png|jpe?g|json)$/i.test(n), true],
];

const missing = [...files.map((f) => f[0]), ...folders.filter((f) => !f[3]).map((f) => f[0])].filter((p) => !existsSync(p));
if (missing.length || lostFonts.length) {
  console.error(`[sync] 找不到素材：${[...missing.map((p) => relative(bench, p)), ...lostFonts].join('、')}`);
  process.exit(1);
}

const wanted = new Map();   // 目标相对路径 -> 内容
for (const [src, dst, change] of files) wanted.set(dst, change ? change(readFileSync(src)) : readFileSync(src));
/** 收一个目录：keep(文件名, 所在子目录) 决定要不要；子目录 build/ 是生成素材的工具，不收 */
function collect(src, dst, keep, sub = '') {
  for (const name of readdirSync(src)) {
    const p = join(src, name);
    if (statSync(p).isDirectory()) { if (name !== 'build') collect(p, `${dst}/${name}`, keep, sub ? `${sub}/${name}` : name); }
    else if (keep(name, sub)) wanted.set(`${dst}/${name}`, readFileSync(p));
  }
}
for (const [src, dst, keep] of folders) if (existsSync(src)) collect(src, dst, keep);

let copied = 0, kept = 0, removed = 0;
for (const [rel, data] of wanted) {
  const to = join(vendor, rel);
  if (existsSync(to) && statSync(to).size === data.length && readFileSync(to).equals(data)) { kept++; continue; }
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, data);
  copied++;
}
function prune(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = relative(vendor, p).replace(/\\/g, '/');
    if (statSync(p).isDirectory()) {
      prune(p);
      if (!readdirSync(p).length) rmSync(p, { recursive: true });
    } else if (!wanted.has(rel)) {
      rmSync(p);
      removed++;
    }
  }
}
prune(vendor);
console.log(`[sync] 设计素材：${copied} 个更新，${kept} 个没变，${removed} 个删除`);
