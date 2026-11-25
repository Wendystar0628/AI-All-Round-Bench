// 设计系统的运行时，在 Node 里构建页面时用：把同步来的 logo/glyphs.js、logo/wordmark/wordmark.js、ornaments/ornaments.js、ae.js
// 放进一个 vm 沙箱执行，取出 AE（题名字形、字标）和 AEOrn（四角星、吊星、星座）；
// 再从 tokens.json 取颜色和十个方向的皮（题材色、票根实底、票根动作、英文类别、明暗基调）。
// 这些文件都是 scripts/sync.mjs 从 专题/审美全能/设计/ 拷来的副本，这里只读、不改。
//
// 还在做的三样东西（锁定、进光立绘、代表画面静图）同步进来以后，这里的 lockupItem / litPortrait / stillOf 找得到就用，
// 找不到时页面用各自的退路（docs/design.md 8.5）。
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const vendor = join(dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'design');
const VENDOR_URL = '/src/vendor/design/';

const sandbox = { URLSearchParams };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of ['logo/glyphs.js', 'logo/wordmark/wordmark.js', 'ornaments/ornaments.js', 'logo/lockups/lockups.js', 'ae.js']) {
  if (!existsSync(join(vendor, file))) continue;          // 锁定的清单交出以前没有
  vm.runInContext(readFileSync(join(vendor, file), 'utf8'), sandbox, { filename: file });
}

export const AE = sandbox.AE;
export const AEOrn = sandbox.AEOrn;
export const GLYPHS = sandbox.AE_GLYPHS;

const tokens = JSON.parse(readFileSync(join(vendor, 'tokens.json'), 'utf8'));

/** 令牌色，名字同 tokens.css 去掉 --ae- 前缀（star、brass、rust-solid、ember、rust-stub……）。CSS 里用 var(--ae-…)，这里给 SVG 属性用 */
export const COLOR = {};
(function flatten(group) {
  for (const [name, v] of Object.entries(group)) {
    if (v && typeof v === 'object' && !('value' in v)) flatten(v);
    else if (v?.value) COLOR[name] = v.value;
  }
})({ ground: tokens.color.ground, theme: tokens.color.theme, auxiliary: tokens.color.auxiliary });

/** 颜色的相对亮度（0–1）：判断这一题能读的字是纸白还是墨 */
const luminance = (hex) => {
  const v = String(hex ?? '').replace('#', '');
  if (v.length !== 6) return 0;
  const c = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

/**
 * 一个方向的皮（特质与配色增补第五节）：颜色一律取 tokens.json 的 directions[]（甲登记，字段见
 * 调研/审美全能/模板设计/质感贯穿/配色字段.md），网站不另写色值。directions 按题 key 登记（题面待定的两个方向登记的是暂写的 key）：
 * 先按这个方向页面上那道题的 key 找；对不上时（题面定稿后 key 变了）按方向的中文名找；都对不上（以后新加的方向）用母版的夜色。
 *   world / worldDeep / worldPale  世界色三档：书脊的布、题目页页首；最深一档给票根和书脊暗面
 *   lit                            点亮色：全屏唯一饱和的那一处（书签带、当前星、选中页签的短线、评语记号）
 *   ink                            这一题能读的字：暗底题是它的纸白，亮底题是它的墨
 *   light                          光色；tone 由 ink 的明度推出：'light' 时这一题是亮底（字用墨）
 */
const directions = tokens.directions;
export function skinOf(taskKey, categoryName) {
  const d = directions.find((x) => x.key === taskKey) ?? directions.find((x) => x.cat === categoryName);
  const ink = d?.ink ?? COLOR.text ?? '#E6E2DD';
  return {
    key: d ? d.key : null,                                 // 星座徽记用的 key
    world: d?.world ?? '#232733',
    worldDeep: d?.worldDeep ?? d?.deep ?? '#14161C',
    worldPale: d?.worldPale ?? '#3A3E4A',
    lit: d?.lit ?? d?.accent ?? COLOR.brass,
    ink,
    light: d?.light ?? COLOR['lamp-light'] ?? '#F3D6B0',
    material: d?.material ?? null,
    traits: d?.traits ?? [],
    tone: luminance(ink) > 0.4 ? 'dark' : 'light',        // dark：暗底、字是纸白；light：亮底、字是墨
    hero: d?.hero ?? null,                                 // 题名锁定的主角件
    accent: d?.lit ?? d?.accent ?? COLOR.brass,            // 旧名：等于 lit
    deep: d?.worldDeep ?? d?.deep ?? '#14161C',            // 旧名：等于 worldDeep（票根实底）
    verb: d ? d.verb : null,                               // 票根上的动作（入画、点火……），只在中文页用
    catEn: d ? d.catEn : null,                             // 英文类别（TOON RENDERING）
    ground: d ? d.ground : 'dark',                         // 介绍页的明暗：dark / mid / light
  };
}

/**
 * 题名有没有现成的字形：字形按题 key 登记（专题/审美全能/设计/logo/build_glyphs.py 生成），
 * 还要和要画的题名一字不差——题名改了而字形没重新生成时，退回纯文字，不画旧名字。
 */
export const hasGlyph = (key, text) => Boolean(key && GLYPHS.titles[key] && GLYPHS.titles[key].text === text);
/** 按字找字形（「十卷星图」这类不按题 key 登记的标题）：返回登记的 key 或 null */
export const glyphKeyOf = (text) => Object.keys(GLYPHS.titles).find((k) => GLYPHS.titles[k].text === text) ?? null;
export const hasConstellation = (key) => Boolean(key && AEOrn.CONST[key]);

/**
 * 题名锁定的主角件（质感贯穿方案 2.5）：锁定交出以前，迷你形态和纯文字的退路用它把这一个字或词点上箔色。
 * 锁定同步进来以后（lockupItem 找得到这一题），一律用锁定本身。
 */
export const HERO = {
  'autumn-observatory': '星', 'mygo-pv': '雫', 'greenhouse-render': '室', 'nvidia-b200-web': 'B200', 'sky-citadel': '穹',
  'pelican-22-styles': '二十二', 'water-park': '晴', 'harbor-mecha': '甲', 'floating-isles-game-ui': '岛', 'anime-game-logo': 'Logo',
};

/**
 * 题名锁定（logo/lockups/：清单 lockups.js 的 AE_LOCKUPS 和图层 PNG，视频和网站共用同一份）：
 * 返回这一题的清单项 { w, h, box, layers, star, tag, forms, geo }，还没有这一题时 null。网页原样摆它，不再模仿一遍。
 */
export const LOCKUP_URL = `${VENDOR_URL}logo/lockups/`;
export function lockupItem(taskKey) {
  try { return AE.lockupItem?.(taskKey) ?? null; } catch { return null; }
}

/**
 * 预渲的进光立绘（丙用视频的进光算法渲好，清单 portraits/portraits.json）：选手按参测登记的 key（GPT/6.2Astra）
 * 在 players 里，站在日前；评委按 id（gpt）在 judges 里，各在自己的灯下。透明底，和数据里的立绘同尺寸、同构图（头部框照用）。
 * 返回网址或 null（还没有时页面用数据里的立绘，CSS 先压暗、染一层灯色、脚下化进雾）。
 */
const PORTRAITS = existsSync(join(vendor, 'portraits', 'portraits.json'))
  ? JSON.parse(readFileSync(join(vendor, 'portraits', 'portraits.json'), 'utf8'))
  : {};
export function litPortrait(kind, key) {
  const row = PORTRAITS[kind]?.[key];
  return row && existsSync(join(vendor, 'portraits', row.file)) ? `${VENDOR_URL}portraits/${row.file}` : null;
}

/**
 * 题名几何线伸进画面接到哪一点（舞台坐标 1920×1080）：丁导出静图时一并写 stills/links.json（{ 题key: [x, y] }）；
 * 没有这个文件时用丁交回的落点表（质感返工/丁-落点.md）。代表画面按配色重导以后，以 links.json 为准。
 */
const LINKS_FALLBACK = {
  'autumn-observatory': [1452, 462], 'mygo-pv': [1180, 770], 'greenhouse-render': [1099, 416], 'nvidia-b200-web': [1206, 525],
  'sky-citadel': [1266, 544], 'pelican-22-styles': [854, 980], 'water-park': [1848, 366], 'harbor-mecha': [1060, 800],
  'floating-isles-game-ui': [1290, 590], 'anime-game-logo': [1438, 416],
};
const LINKS = existsSync(join(vendor, 'stills', 'links.json')) ? JSON.parse(readFileSync(join(vendor, 'stills', 'links.json'), 'utf8')) : {};
export const linkOf = (taskKey) => LINKS[taskKey] ?? LINKS_FALLBACK[taskKey] ?? null;

/**
 * 题名锁定在介绍页上摆在哪里（和视频的 VX.ae.lockupPlace 同一种算法，静图里的落点才接得上）：
 * 字块左边对齐正文栏（舞台 x 100），收底的基线落在 y 422；要读的几层（text、hero、en）连同编号小标（AE.lockupTop），
 * 太高的按比例缩小，顶不高过 y 58（主体元素可以比它们高）。返回 { k, x, y }：锁定坐标 u 落在舞台上的 x + k·u。
 */
export function lockupPlace(taskKey) {
  const it = lockupItem(taskKey);
  if (!it) return null;
  const k = Math.min(1, (422 - 58) / (it.baseline - AE.lockupTop(it)));
  return { k, x: 100 - it.box[0] * k, y: 422 - it.baseline * k, item: it };
}

/** 代表画面的静图（视频模板渲出的画面层，1920×1080，不带字）：stills/<题key>.webp。没有时页首画缺省画面 */
export function stillOf(taskKey) {
  for (const ext of ['webp', 'jpg', 'png']) {
    if (existsSync(join(vendor, 'stills', `${taskKey}.${ext}`))) return `${VENDOR_URL}stills/${taskKey}.${ext}`;
  }
  return null;
}

/** 三位评委各站在一扇形状不同的窗前（评委登场）：GPT 一道笔直的观测缝，Claude 一扇拱窗，Gemini 一只圆天窗 */
const JUDGE_WINDOWS = { gpt: 'slit', claude: 'arch', gemini: 'round' };
export const judgeWindow = (id) => JUDGE_WINDOWS[id] ?? 'arch';

/** 选手身后的系列大词：型号简称去掉数字（6.2Astra → ASTRA、Opus5.5 → OPUS、4Neon → NEON）；取不出来时不画 */
export const seriesWord = (m) => (m.short ?? '').replace(/[\d.\s]+/g, ' ').trim().split(' ').filter(Boolean).pop()?.toUpperCase() ?? '';
