// 字体。网站自己定字体映射（不读设计系统的 fonts.css）：家族名和设计系统的令牌一致（--ae-font-song 是 "AE Song" ……），
// 文件来自设计系统的 fonts/（中文另见下面 NOTO 一条），由 scripts/sync.mjs 拷进 src/vendor/design/fonts/。
//
//   中文：思源宋体的同一设计 Noto Serif SC（可变字重 200–900，SIL OFL 1.1，没有保留字名）。思源宋体本身带保留字名
//        “Source”，子集化算修改版要改字体内部名；网页直接用 Noto Serif SC 做子集，就没有这个问题（字体方案第三节）。
//        正文 400、标签与名字 600、页面标题 700；高反差的展示字（字标、题名的纯文字退路、「十卷星图」）用 900。
//   西文：Libre Bodoni（可变字重 400–700，正体和斜体两个文件）。为正文字号画的 Bodoni，发丝结实，小字和大字号的竖发丝都看得见；
//        全大写拉开字距的小号标签也用它。
//   手写：Tangerine Bold，只给一笔点缀（Gemini 的 hi there~）。
//
// 页面 <head> 里有一个 <!--@fonts--> 占位：
//   开发时换成 devFontsHTML()：直接用同步来的原文件（本机装了的先用本机的）；
//   构建时按成品里实际出现的字把每款字体子集化成 WOFF2（文件名带内容哈希），再把 @font-face 写进每一页。
// 每款字体切成两份，用 unicode-range 声明，浏览器只下载页面用得到的那份：
//   「基本」拉丁、标点、箭头、几何形状等（U+0000–02FF、U+2000–27BF），按全站用字做一份，中英文页共用；
//   「扩展」汉字等其余字符，只给有汉字的家族做，按语言各做一份。
// 可变的中文按字重各切一个静态实例（axes 钉住 wght），比带整套可变数据的子集小得多；Libre Bodoni 保留可变轴。
// 只从带某个 class 的元素里收字的家族（ONLY_IN）：这些元素里只放纯文字，嵌套的子元素也要带同一个 class。
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';

const require = createRequire(import.meta.url);

/**
 * 字体文件从哪里来（相对仓库根，或绝对路径），按顺序找第一个存在的。
 * Noto Serif SC 先找设计系统的 fonts/，没有时用本机装的那一份（Windows 自带的 NotoSerifSC-VF.ttf 就是 Google 的发行版）。
 */
export const FONT_FILES = {
  'NotoSerifSC-VF.ttf': [
    'topics/审美全能/设计/fonts/NotoSerifSC-VF.ttf',
    'C:/Windows/Fonts/NotoSerifSC-VF.ttf',
    `${process.env.LOCALAPPDATA ?? ''}/Microsoft/Windows/Fonts/NotoSerifSC-VF.ttf`,
  ],
  'LibreBodoni-Variable.ttf': ['topics/审美全能/设计/fonts/LibreBodoni-Variable.ttf'],
  'LibreBodoni-Italic-Variable.ttf': ['topics/审美全能/设计/fonts/LibreBodoni-Italic-Variable.ttf'],
  'Tangerine-Bold.ttf': ['topics/审美全能/设计/fonts/Tangerine-Bold.ttf'],
};

/**
 * 进成品的字体。weight 是 @font-face 的 font-weight；axes 给了就按它切静态实例。
 * dev 是开发时那条 @font-face 的字重范围（可变字体整份用，浏览器按 font-weight 调轴）。
 */
export const FACES = [
  { family: 'AE Song', weight: '400', file: 'NotoSerifSC-VF.ttf', axes: { wght: 400 }, local: 'Noto Serif SC' },
  { family: 'AE Song', weight: '600', file: 'NotoSerifSC-VF.ttf', axes: { wght: 600 }, local: 'Noto Serif SC' },
  { family: 'AE Song', weight: '700', file: 'NotoSerifSC-VF.ttf', axes: { wght: 700 }, local: 'Noto Serif SC' },
  { family: 'AE Display CN', weight: '900', file: 'NotoSerifSC-VF.ttf', axes: { wght: 900 }, local: 'Noto Serif SC' },
  { family: 'AE Didone', weight: '400 700', file: 'LibreBodoni-Variable.ttf' },
  { family: 'AE Didone', weight: '400 700', style: 'italic', file: 'LibreBodoni-Italic-Variable.ttf' },
  { family: 'AE Script', weight: '700', file: 'Tangerine-Bold.ttf' },
];

/** 出处里列的字体（页脚、关于页），按语言 */
export const FAMILIES = [
  { zh: '思源宋体（网页用同一设计的 Noto Serif SC）', en: 'Source Han Serif (as Noto Serif SC on the web)' },
  { zh: 'Libre Bodoni', en: 'Libre Bodoni' },
  { zh: 'Tangerine', en: 'Tangerine' },
];
export const fontNames = (lang) => FAMILIES.map((f) => f[lang]).join(lang === 'en' ? ', ' : '、');

const CJK = new Set(['AE Song', 'AE Display CN']);          // 有汉字的家族才做「扩展」那份
const ONLY_IN = { 'AE Display CN': 'ae-dcn', 'AE Script': 'ae-script' };

const BASIC = (cp) => cp <= 0x02ff || (cp >= 0x2000 && cp <= 0x27bf);
const RANGES = { basic: 'U+0000-02FF,U+2000-27BF', ext: 'U+0300-1FFF,U+27C0-10FFFF' };
const LANGS = ['zh', 'en'];

/** 字体文件在仓库里的来源：找不到返回 null */
export function fontSource(bench, file) {
  for (const p of FONT_FILES[file] ?? []) {
    const abs = /^[A-Za-z]:|^\//.test(p) ? p : join(bench, p);
    if (existsSync(abs)) return abs;
  }
  return null;
}

/** 开发时：直接用同步来的原文件（可变字体整份），本机装了的先用本机的 */
export function devFontsHTML() {
  const seen = new Set();
  const rules = FACES.map((f) => {
    const key = `${f.family}|${f.style ?? 'normal'}|${f.file}`;
    if (f.family === 'AE Song') {
      if (seen.has(key)) return '';
      seen.add(key);
    }
    const weight = f.family === 'AE Song' ? '400 700' : f.weight;
    const src = [f.local ? `local("${f.local}")` : '', `url("/src/vendor/design/fonts/${f.file}")`].filter(Boolean).join(',');
    return `@font-face{font-family:"${f.family}";font-style:${f.style ?? 'normal'};font-weight:${weight};font-display:swap;src:${src}}`;
  }).filter(Boolean);
  return `<style>${rules.join('\n')}</style>`;
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (m, k) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[k]);

/** 子集化并把 @font-face 写进 outDir 里的每一页。要在数据（作品下载包也有 html）拷进成品之前跑 */
export async function subsetFonts({ root, outDir, base }) {
  const subsetFont = require('subset-font');
  const fontsDir = join(root, 'src', 'vendor', 'design', 'fonts');
  const files = walk(outDir).filter((f) => /\.(html|js|css)$/.test(f));
  const langOf = (f) => (relative(outDir, f).replace(/\\/g, '/').startsWith('en/') ? 'en' : 'zh');

  // 收字：样式和脚本两种语言共用；页面按语言分开收
  const text = { shared: '', zh: '', en: '' };
  const only = { zh: {}, en: {} };
  const pages = [];
  for (const f of files) {
    const raw = readFileSync(f, 'utf8');
    if (!f.endsWith('.html')) { text.shared += decode(raw); continue; }
    const lang = langOf(f);
    pages.push({ file: f, lang });
    text[lang] += decode(raw);
    for (const [family, cls] of Object.entries(ONLY_IN)) {
      const re = new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([^<]*)<`, 'g');
      for (const m of raw.matchAll(re)) only[lang][family] = (only[lang][family] ?? '') + decode(m[1]);
    }
  }
  const charsOf = (s) => [...new Set([...s].filter((ch) => ch.codePointAt(0) >= 0x20))];
  const textOf = (family, lang) => (family in ONLY_IN ? only[lang][family] ?? '' : text.shared + text[lang]);

  const target = join(outDir, 'assets', 'fonts');
  mkdirSync(target, { recursive: true });
  const rules = { zh: [], en: [] };
  const sources = new Map();
  let bytes = 0, count = 0;
  const write = async (face, list, part) => {
    if (!sources.has(face.file)) sources.set(face.file, readFileSync(join(fontsDir, face.file)));
    // 不做排版特性的字形闭包：页面不用 font-feature-settings，默认字形不受影响，子集小得多
    const woff2 = await subsetFont(sources.get(face.file), list.join(''), {
      targetFormat: 'woff2', noLayoutClosure: true, ...(face.axes ? { variationAxes: face.axes } : {}),
    });
    const hash = createHash('sha256').update(woff2).digest('hex').slice(0, 10);
    const slug = `${face.family.replace(/^AE /, '').replace(/\s+/g, '-').toLowerCase()}-${face.weight.replace(/\s+/g, '-')}${face.style === 'italic' ? 'i' : ''}-${part}`;
    const name = `${slug}.${hash}.woff2`;
    writeFileSync(join(target, name), woff2);
    bytes += woff2.length;
    count++;
    return `@font-face{font-family:"${face.family}";font-style:${face.style ?? 'normal'};font-weight:${face.weight};font-display:swap;src:url(${base}assets/fonts/${name}) format("woff2");unicode-range:${RANGES[part.startsWith('ext') ? 'ext' : 'basic']}}`;
  };

  for (const face of FACES) {
    const basic = charsOf(LANGS.map((l) => textOf(face.family, l)).join('')).filter((c) => BASIC(c.codePointAt(0)));
    if (basic.length) {
      const rule = await write(face, basic, 'basic');
      for (const l of LANGS) rules[l].push(rule);
    }
    if (!CJK.has(face.family)) continue;
    for (const l of LANGS) {
      const ext = charsOf(textOf(face.family, l)).filter((c) => !BASIC(c.codePointAt(0)));
      if (ext.length) rules[l].push(await write(face, ext, `ext-${l}`));
    }
  }
  for (const { file, lang } of pages) writeFileSync(file, readFileSync(file, 'utf8').replace('<!--@fonts-->', `<style>${rules[lang].join('\n')}</style>`));
  console.log(`[fonts] ${count} 个字体子集，共 ${(bytes / 1024).toFixed(0)} KB，写进 ${pages.length} 页（${relative(root, target)}）`);
}
