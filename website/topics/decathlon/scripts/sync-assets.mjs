// Copies the design assets into the site. Idempotent: a file is copied only when
// it is missing or differs; stale copies inside the managed folders are removed.
// Never touches anything outside the folders listed here. Sources (relative to the
// project root, the folder above website/):
//
//   topics/十项全能/设计/stellar-ui-skill/assets/fonts         -> public/fonts
//   topics/十项全能/设计/decor/<type>/*.svg                    -> public/decor/<type>/
//   platform/厂商图标/mark/*.svg                                 -> public/logos/mark/
//   topics/十项全能/设计/icons/categories/*.svg                -> public/icons/categories/
//   topics/十项全能/设计/stellar-ui-skill/assets/{stellar.css,fx.js,tokens.json,stars/*.svg}
//                                                         -> src/vendor/stellar/  (code: bundled by Vite)
//
// Nothing from the README figures (topics/十项全能/assets/readme) is used.
import { readdirSync, statSync, mkdirSync, copyFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bench = resolve(site, '..', '..', '..');
const design = join(bench, 'topics/十项全能/设计');
const skill = join(bench, 'topics/十项全能/设计/stellar-ui-skill/assets');
const vendorMarks = join(bench, 'platform/厂商图标/mark');

// [source dir, target dir, filter(name, isDir) ]
const svgOnly = (name, dir) => dir || name.endsWith('.svg');
const jobs = [
  [join(skill, 'fonts'), join(site, 'public', 'fonts'), (n, d) => d || /\.(ttf|txt|woff2?)$/.test(n)],
  [join(design, 'decor'), join(site, 'public', 'decor'), (n, d) => (d ? n !== 'tools' : n.endsWith('.svg'))],
  [vendorMarks, join(site, 'public', 'logos', 'mark'), svgOnly],
  [join(design, 'icons', 'categories'), join(site, 'public', 'icons', 'categories'), svgOnly],
  [skill, join(site, 'src', 'vendor', 'stellar'), (n, d) => (d ? n === 'stars' : ['stellar.css', 'fx.js', 'tokens.json'].includes(n) || n.endsWith('.svg'))],
];

let copied = 0;
let kept = 0;
let removed = 0;

function same(a, b) {
  if (!existsSync(b)) return false;
  const sa = statSync(a);
  const sb = statSync(b);
  if (sa.size !== sb.size) return false;
  return readFileSync(a).equals(readFileSync(b));
}

function sync(src, dst, filter, top = true) {
  mkdirSync(dst, { recursive: true });
  const wanted = new Set();
  for (const name of readdirSync(src)) {
    const from = join(src, name);
    const isDir = statSync(from).isDirectory();
    if (!filter(name, isDir, top)) continue;
    wanted.add(name);
    const to = join(dst, name);
    if (isDir) sync(from, to, filter, false);
    else if (same(from, to)) kept++;
    else {
      copyFileSync(from, to);
      copied++;
    }
  }
  for (const name of readdirSync(dst)) {
    if (wanted.has(name)) continue;
    rmSync(join(dst, name), { recursive: true, force: true });
    removed++;
  }
}

const missing = jobs.filter(([src]) => !existsSync(src)).map(([src]) => relative(bench, src));
if (missing.length) {
  console.error(`[sync] 素材目录不存在：${missing.join('、')}`);
  process.exit(1);
}
for (const [src, dst, filter] of jobs) sync(src, dst, filter);
console.log(`[sync] assets: ${copied} copied, ${kept} unchanged, ${removed} removed`);
