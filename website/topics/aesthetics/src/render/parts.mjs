// 公共部件：都是返回 HTML 字符串的纯函数，第一个参数是 ctx（context.mjs）。样式在 src/styles/parts.css，
// 会动的部分（看图、复制链接）在 src/client/ 里按 data-* 属性接上。用法和长相见 docs/design.md「公共部件」。
//
// 文字分三等（质感贯穿方案 2.1）：一等是设计过的字（题名锁定、字标，用设计系统的同一份文件）；
// 二等是排过的名字（型号名、评委名、小节标题，只借两三样手法）；三等是正文、说明、标签，一律干净。
// 纸物件（票、纸签、图版白边）用同一张纸纹和短而实的接触阴影，不用 UI 卡片投影。
import { esc, fmtBytes, pad2 } from './context.mjs';
import { AE, AEOrn, COLOR, HERO, LOCKUP_URL, hasConstellation, hasGlyph, linkOf, litPortrait, lockupItem, lockupPlace } from './design.mjs';

const f2 = (n) => (+n).toFixed(2);
const ratioOf = (image) => image.width / image.height;

/* ---------- 一等字：题名锁定、字标 ---------- */

/**
 * 设计系统的字形（高反差宋）：有字形的画字形路径，字号跟着外层的 font-size 走（SVG 高约 1.02em）。
 * 没有字形、或者字形和题名对不上（题名改了、字形还没重新生成）时，退回展示字体（AE Display CN，Noto Serif SC 900）的纯文字。
 *   glyph(ctx, 'autumn-observatory', '秋庭观星画室')
 */
export function glyph(ctx, key, text) {
  if (!hasGlyph(key, text)) return `<span class="ae-dcn">${esc(text)}</span>`;
  const t = AE.title(key, 100);
  return `<span class="ae-glyph" role="img" aria-label="${esc(text)}">${t.html.replace(/ aria-label="[^"]*"/, ' aria-hidden="true" focusable="false"')}</span>`;
}

/**
 * 字标「AI审美全能」（设计系统 logo/wordmark/，AE.wordmarkSVG）：铜版宋的汉字纸白、AI 浅金，「审」的屋顶开一道观测缝，锈橙星落在缝里。
 * form：'display' 大字（首页、≥48px），'small' 小字号（页头、页脚：发丝加粗、不开缝、星放大一点）。字号跟着外层的 font-size 走。
 * en 为真时下面跟一根短发丝线和 AI AESTHETICS。
 */
export function wordmark(ctx, { en = false, form = 'display' } = {}) {
  const t = AE.wordmarkSVG(form === 'small' ? 24 : 100, { id: ctx.uid('wm'), form });
  const svg = t.html.replace(/ aria-label="[^"]*"/, ' aria-hidden="true" focusable="false"');
  return `<span class="ae-wordmark" role="img" aria-label="${esc(ctx.t('common.site.name'))}"><span class="ae-glyph">${svg}</span>${
    en ? '<i class="ae-wordmark-hair" aria-hidden="true"></i><span class="ae-wordmark-en" aria-hidden="true">AI AESTHETICS</span>' : ''}</span>`;
}

/** 一句标题里把主角件（一个字或一个词）单独包出来：[前, 主角, 后]；没有主角件时 [全句, '', ''] */
function splitHero(text, hero) {
  const at = hero ? text.indexOf(hero) : -1;
  return at < 0 ? [text, '', ''] : [text.slice(0, at), hero, text.slice(at + hero.length)];
}

/**
 * 展示字的纯文字（AE Display CN）：主角件放大。「十卷星图」的「星」这类二等标题也用它。
 * 每一段都带 ae-dcn（scripts/fonts.mjs 只从这个 class 的元素里收 900 字重的字）。
 *   displayText('十卷星图', '星')
 */
export function displayText(text, hero, { cls = '' } = {}) {
  const [a, h, b] = splitHero(text, hero);
  const seg = (s, c) => (s ? `<span class="ae-dcn${c}">${esc(s)}</span>` : '');
  return `<span class="ae-display${cls ? ` ${cls}` : ''}">${seg(a, '')}${seg(h, ' is-hero')}${seg(b, '')}</span>`;
}

/** 网页用锁定的 WebP 图层（同名、同尺寸，约为 PNG 的五分之一） */
const lkFile = (f) => LOCKUP_URL + esc(AE.lockupWebp ? AE.lockupWebp(f) : f);

/**
 * 题名锁定，全量（题目页页首）：用设计系统的锁定清单（design.mjs lockupItem）原样摆出来——
 * 图层按清单从后往前叠（层数不定：底板、背景巨字、主体元素、细线、字、英文、星芒……），字后的几何线插在第一张要读的图层
 * （text、hero、en）前面，字前的几何线、矢量星芒在最上面；编号小标按清单的位置贴上（一行）。网页用 WebP 图层。
 * 摆法和视频介绍页一样（design.mjs lockupPlace，舞台坐标），几何线伸进代表画面接到丁给的落点（linkOf）。
 * 几何线碰到字就断开：两层几何线共用一张遮罩，遮罩里的洞（.lk-holes）由页面脚本按字实际占的地方填（task.js，和视频一样外面留一圈）。
 * 页面给 --px（一个舞台像素在网页上多大）就能缩放。
 * 这一题的锁定还没有时，用设计系统的题名字形占位；英文页用 Didone 写英文题名。
 */
export function lockup(ctx, entry) {
  const P = ctx.lang === 'zh' ? lockupPlace(entry.key) : null;
  if (P) {
    const it = P.item, id = ctx.uid('lk');
    const toL = ([x, y]) => [(x - P.x) / P.k, (y - P.y) / P.k];
    const at = linkOf(entry.key);
    const geo = { id, to: at ? toL(at) : null };
    // 遮罩盖住整块台（锁定坐标）：白底全露，洞是黑的
    const [x0, y0] = toL([0, 0]), [x1, y1] = toL([1920, 1080]);
    const mask = `<defs><mask id="${id}m" maskUnits="userSpaceOnUse" x="${f2(x0)}" y="${f2(y0)}" width="${f2(x1 - x0)}" height="${f2(y1 - y0)}"><rect x="${f2(x0)}" y="${f2(y0)}" width="${f2(x1 - x0)}" height="${f2(y1 - y0)}" fill="#fff"/><g class="lk-holes" fill="#000"></g></mask></defs>`;
    const geoLayer = (z) => `<g class="lk-geo" mask="url(#${id}m)">${AE.lockupGeoSVG(entry.key, z, geo)}</g>`;
    let body = mask, back = false;
    for (const l of it.layers) {
      if (!back && AE.LOCKUP_READ.includes(l.role)) { body += geoLayer('back'); back = true; }
      body += `<image class="lk-${esc(l.role)}" href="${lkFile(l.file)}" x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" preserveAspectRatio="none"/>`;
    }
    body += geoLayer('front');
    if (it.star) body += `<g class="lk-star">${AE.glintSVG(it.star.x, it.star.y, it.star.s, { ...it.star, id: `${id}s` })}</g>`;
    const tag = it.tag ? `<span class="ae-lk-tag${(it.tag.tone ?? (it.ground === 'light' ? 'ink' : '')) === 'ink' ? ' is-ink' : ''}" style="left:${f2((it.tag.x / it.w) * 100)}%;top:${f2((it.tag.y / it.h) * 100)}%" aria-hidden="true">${volumeLabel(ctx, entry.category)}</span>` : '';
    return `<span class="ae-lk" role="img" aria-label="${esc(entry.name)}" style="--lx:${f2(P.x)};--ly:${f2(P.y)};--lk:${P.k.toFixed(4)};--lw:${it.w};--lh:${it.h}"><svg class="ae-lk-art" viewBox="0 0 ${it.w} ${it.h}" aria-hidden="true" focusable="false">${body}</svg>${tag}</span>`;
  }
  if (ctx.lang === 'en') return `<span class="ae-lockup-en">${esc(ctx.nameOf(entry))}</span>`;
  return glyph(ctx, entry.key, entry.name);
}

/**
 * 题名锁定，迷你和烫印形态（同一份清单的 forms）：
 *   mini        暗底上：主角字一点箔 + 题名纸白（型号页节目单）
 *   mini-ink    纸上：主角字一点箔 + 题名墨色（星座的悬停纸签）
 *   stamp       书脊上的烫印（主角卷：箔压进布里）
 *   stamp-blind 书脊上的素压（其余几卷：只比布亮一点）
 * 这一题的锁定还没有时，把主角件（令牌里的 hero，不在题名里时用 design.mjs HERO）点上箔色，其余是宋体 700 的题名。
 */
export function miniLockup(ctx, entry, { cls = '', form = 'mini' } = {}) {
  const c = `ae-mini${cls ? ` ${cls}` : ''}`;
  const fm = ctx.lang === 'zh' ? lockupItem(entry.key)?.forms?.[form] : null;
  if (fm) return `<img class="${c} ae-mini-img is-${form}" src="${lkFile(fm.file)}" width="${fm.w}" height="${fm.h}" alt="${esc(entry.name)}" decoding="async">`;
  if (ctx.lang === 'en') return `<span class="${c} is-en">${esc(ctx.nameOf(entry))}</span>`;
  const sk = entry.category?.skin?.hero;
  const [a, h, b] = splitHero(entry.name, sk && entry.name.includes(sk) ? sk : HERO[entry.key]);
  return `<span class="${c} is-text is-${form}">${esc(a)}${h ? `<b class="ae-foil">${esc(h)}</b>` : ''}${esc(b)}</span>`;
}

/* ---------- 二等字：小节标题、名字 ---------- */

/**
 * 小节标题：二等字的缩小版——宋体 700 + 小型大写的英文一档（只在中文页）+ 一根三截发丝线。
 *   sectionHead(ctx, { id, title: '这一卷的作品', en: 'WORKS', line: '…' })
 */
export function sectionHead(ctx, { id, title, en, line, level = 2 }) {
  const eyebrow = ctx.lang === 'zh' && en ? `<span class="en" aria-hidden="true">${esc(en)}</span>` : '';
  return `<header class="ae-sec">
    <h${level} class="ae-sec-title"${id ? ` id="${esc(id)}"` : ''}><span class="cn">${esc(title)}</span>${eyebrow}</h${level}>
    <i class="ae-hair3" aria-hidden="true"></i>
    ${line ? `<p class="ae-sec-line">${esc(line)}</p>` : ''}
  </header>`;
}

/** 卷的小标：Didone 斜体编号 + 一小段发丝 + 宋体方向名 + 英文小型大写（中文页）。题目页页首、型号页节目单用 */
export function volumeLabel(ctx, cat, { href } = {}) {
  const en = ctx.lang === 'zh' ? `<span class="en" aria-hidden="true">${esc(cat.skin.catEn ?? cat.name_en.toUpperCase())}</span>` : '';
  const inner = `<span class="no">${pad2(cat.no)}</span><i class="dash" aria-hidden="true"></i><span class="cn">${esc(ctx.nameOf(cat))}</span>${en}`;
  return href ? `<a class="ae-vol" href="${esc(href)}">${inner}</a>` : `<span class="ae-vol">${inner}</span>`;
}

/** 型号名：照数据的 display_name「名字 (推理强度)」，推理强度那一段换成斜体小一档、坐在帽线上（字还是同一串） */
export function modelName(ctx, m) {
  const name = m.display_name ?? m.name;
  const cut = name.lastIndexOf(' (');
  if (cut < 0 || !name.endsWith(')')) return `<span class="ae-mname"><span class="nm">${esc(name)}</span></span>`;
  return `<span class="ae-mname"><span class="nm">${esc(name.slice(0, cut))}</span> <span class="eff">${esc(name.slice(cut + 1))}</span></span>`;
}

/**
 * 型号标识：厂商图标 + 型号名。href 给了就是链接（默认链到型号页，传 false 不链）。
 *   modelBadge(ctx, model)            modelBadge(ctx, model, { size: 'l', vendor: true, href: false })
 */
export function modelBadge(ctx, m, { href, size = 'm', vendor = false } = {}) {
  const link = href === false ? null : href ?? ctx.href(m.path);
  const inner = `${ctx.logo(m.logo)}<span class="ae-model-text">${modelName(ctx, m)}${vendor ? `<span class="ae-model-vendor">${esc(m.vendor)}</span>` : ''}</span>`;
  return link ? `<a class="ae-model ae-model--${size}" href="${esc(link)}">${inner}</a>` : `<span class="ae-model ae-model--${size}">${inner}</span>`;
}

/**
 * 评委名的排法（她在评委登场里那种排法的缩小版）：GPT 拉开字距的大写，Claude 斜体，Gemini 斜体小字。
 * 评语、题目页的评委一行都用它。
 */
export function judgeName(ctx, j) {
  return `<span class="ae-jname ae-jname--${esc(j.id)}">${esc(j.name)}</span>`;
}

/* ---------- 星 ---------- */

/** 一颗四角星；颜色默认跟文字 */
export function star(size = 12, color = 'currentColor') {
  return `<svg class="ae-star" viewBox="0 0 ${size} ${f2(size * 1.16)}" width="${size}" height="${f2(size * 1.16)}" aria-hidden="true" focusable="false"><path d="${AEOrn.star4(size / 2, size * 0.58, size, size * 1.16)}" fill="${color}"/></svg>`;
}

/** 芒星：细长的十字芒 + 一圈窄暖晕（星座里当前那一颗、锁定里那一颗星芒）。size 是芒的半长 */
export function glint(size = 12) {
  const s = size, w = s * 2.6, h = s * 2;
  const cx = w / 2, cy = h / 2;
  const ray = (dx, dy, len, wd) => `<path d="M${f2(cx - dx * len)} ${f2(cy - dy * len)} L${f2(cx + dy * wd)} ${f2(cy - dx * wd)} L${f2(cx + dx * len)} ${f2(cy + dy * len)} L${f2(cx - dy * wd)} ${f2(cy + dx * wd)}Z"/>`;
  return `<svg class="ae-glint" viewBox="0 0 ${f2(w)} ${f2(h)}" width="${f2(w)}" height="${f2(h)}" aria-hidden="true" focusable="false">
    <circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(s * 0.62)}" class="halo"/>
    <g class="rays">${ray(1, 0, s * 1.3, s * 0.08)}${ray(0, 1, s * 0.95, s * 0.08)}</g>
    <circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(s * 0.16)}" class="core"/>
  </svg>`;
}

/**
 * 一个方向的星座徽记（观测卡上的「本卷星座的黄铜线」），线和星都用 currentColor。size 是边长 px。
 * 没有星座的方向（以后新加的）画一颗四角星。
 */
export function constellation(cat, size = 32) {
  const key = cat?.skin?.key;
  if (!hasConstellation(key)) return `<span class="ae-const" aria-hidden="true">${star(Math.round(size * 0.4))}</span>`;
  const pad = size * 0.08, w = size - pad * 2;
  const s = Math.max(2.4, size * 0.12);
  const body = AEOrn.constellation(key, pad, pad, w, w, {
    line: 'currentColor', star: 'currentColor', la: 0.7, lw: 1, sizes: [s, s * 0.75, s * 0.55],
  });
  return `<svg class="ae-const" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true" focusable="false">${body}</svg>`;
}

/**
 * 吊星：细线、黄铜挂环、切面星和一团窄暖晕（全系列唯一的灯）。返回一个 SVG，线从 SVG 顶边垂下来。
 *   hangingStar({ size: 56, drop: 180, glow: true })   drop：线的长度（星心离顶边）
 */
export function hangingStar({ size = 56, drop = 160, glow = true, cls = 'ae-hang' } = {}) {
  const w = Math.max(size * 4.2, 160), cx = w / 2, h = drop + size * 2.4;
  const g = AEOrn.hanging({ x: cx, top: 0, y: drop, size, lit: 1, sway: 0, glow: glow ? size * 1.4 : 0, thread: 0.55 });
  return `<svg class="${cls}" viewBox="0 0 ${f2(w)} ${f2(h)}" width="${f2(w)}" height="${f2(h)}" aria-hidden="true" focusable="false">${g}</svg>`;
}

/* ---------- 十卷星座（视频底部进度条的网页版，也是网站的卷目） ---------- */

/**
 * 十卷星座：十颗星串在一根 1px 的线上，星下写这一卷的简称、星上写两位卷号；每颗是一个入口。每颗星是它那一题的点亮色（极小）。
 * 当前那一颗是芒星；没有作品的是空心小圈、字更淡、那一段是点线。悬停或聚焦一颗星，它变成芒星，上方浮出一张小纸签：
 * 迷你锁定和作品件数。arc 为真时排成一道低低的弧（首页），否则是一条直线（题目页页尾、型号页目录）。
 *   starChart(ctx, { current: cat })                                  链到各题目页
 *   starChart(ctx, { arc: true, tags: true })                          首页
 *   starChart(ctx, { href: (c) => '#v01', clouded: (c) => … })         型号页：链到本页那一卷，没做的卷算云遮
 */
export function starChart(ctx, { current = null, arc = false, tags = true, href = (c) => ctx.href(c.lead.path), clouded = (c) => c.clouded, count = (c) => c.works.length, label } = {}) {
  const cats = ctx.data.categories;
  const n = cats.length;
  const lift = (i) => (arc ? 1 - ((2 * (i + 0.5)) / n - 1) ** 2 : 0);          // 弧上第 i 颗的高度（0–1）
  const items = cats.map((c, i) => {
    const here = c === current;
    const cloud = clouded(c);
    const text = `${pad2(c.no)} ${ctx.shortOf(c)} · ${ctx.nameOf(c.lead)}`;
    const k = count(c);
    const tag = tags
      ? `<span class="ae-ch-tag" aria-hidden="true"><span class="k">${pad2(c.no)} · ${esc(ctx.shortOf(c))}</span>${miniLockup(ctx, c.lead, { form: 'mini-ink' })}<span class="n">${
        cloud ? esc(c.lead.upcoming ? ctx.t('common.chart.upcoming') : ctx.t('common.empty.cloudedLong')) : esc(ctx.t('common.chart.works', { n: k }))}</span></span>`
      : '';
    return `<li class="ae-ch-item${cloud ? ' is-clouded' : ''}${here ? ' is-here' : ''}" style="--i:${i};--lift:${f2(lift(i))};--lit:${c.skin.lit}">
      <a href="${esc(href(c))}"${here ? ' aria-current="page"' : ''}>
        <span class="no" aria-hidden="true">${pad2(c.no)}</span>
        <span class="pt" aria-hidden="true"><i class="dot"></i>${glint(9)}</span>
        <span class="nm" aria-hidden="true">${esc(ctx.shortOf(c))}</span>
        ${tag}<span class="sr-only">${esc(text)}</span>
      </a>
    </li>`;
  }).join('');
  // 线：弧用一条二次曲线（不随宽度变粗），直线按卷分段，没有作品的那段是点线；右端断开
  let line;
  if (arc) {
    line = `<svg class="ae-ch-line" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M-20 100 Q500 -100 1020 100" vector-effect="non-scaling-stroke"/></svg>`;
  } else {
    const segs = cats.map((c, i) => `<i class="seg${clouded(c) ? ' is-clouded' : ''}" style="--i:${i}"></i>`).join('');
    line = `<span class="ae-ch-line" aria-hidden="true">${segs}</span>`;
  }
  return `<nav class="ae-chart${arc ? ' ae-chart--arc' : ' ae-chart--line'}" aria-label="${esc(label ?? ctx.t('common.chart.label'))}" style="--n:${n}">${line}<ol>${items}</ol></nav>`;
}

/* ---------- 图 ---------- */

const imgAlt = (ctx, w, i) => ctx.t('common.plate.alt', { task: ctx.nameOf(w.task), model: w.model.display_name, n: i + 1 });

/**
 * 一张图的 <img>：缩略图，带宽高（不跳版）、懒加载。eager 为真时立刻加载（只给首屏里的图）。
 * sizes 给了就带上 srcset（缩略图、大图两档），浏览器按显示宽度挑：给显示得比缩略图宽的图用（图墙占满一行的封面）
 */
export function img(ctx, image, { alt = '', eager = false, cls = '', full = false, sizes = '' } = {}) {
  const src = full ? image.src : image.thumb;
  const [w, h] = full ? [image.width, image.height] : [image.thumb_width, image.thumb_height];
  const set = sizes && !full ? ` srcset="${esc(ctx.media(image.thumb))} ${image.thumb_width}w, ${esc(ctx.media(image.src))} ${image.width}w" sizes="${esc(sizes)}"` : '';
  return `<img${cls ? ` class="${cls}"` : ''} src="${esc(ctx.media(src))}"${set} width="${w}" height="${h}" alt="${esc(alt)}" decoding="async"${eager ? ' fetchpriority="high"' : ' loading="lazy"'}>`;
}

/**
 * 能点开看大图的一张图版：<a data-shot> 指向大图，里面是缩略图。放进 [data-gallery] 容器里，
 * 看图器（src/client/lightbox.js）按容器分组翻页；没有脚本时点开就是大图本身。
 */
export function shot(ctx, w, i, { eager = false, cls = '', sizes = '' } = {}) {
  const image = w.images[i];
  const caption = ctx.t('common.plate.caption', { no: pad2(w.task.category.no), task: ctx.nameOf(w.task), model: w.model.display_name });
  return `<a class="ae-shot${cls ? ` ${cls}` : ''}" href="${esc(ctx.media(image.src))}" data-shot="${esc(`${w.id}/${pad2(i + 1)}`)}" data-w="${image.width}" data-h="${image.height}" data-thumb="${esc(ctx.media(image.thumb))}" data-caption="${esc(caption)}">${img(ctx, image, { alt: imgAlt(ctx, w, i), eager, sizes })}</a>`;
}

/**
 * 一行放几张：张数平均分到几行里（7 张排 4+3，8 张排 4+4，5 张排 3+2），不留一张孤零零的尾巴。
 * 一行最多 4 张横图；竖图窄，一行最多 5 张。返回每行的图序号
 */
function rowsOf(indices, images) {
  if (!indices.length) return [];
  const wide = indices.reduce((s, i) => s + ratioOf(images[i]), 0) / indices.length >= 1;
  const k = Math.ceil(indices.length / (wide ? 4 : 5));
  const rows = [];
  let at = 0;
  for (let r = 0; r < k; r++) {
    const n = Math.floor(indices.length / k) + (r < indices.length % k ? 1 : 0);
    rows.push(indices.slice(at, at + n));
    at += n;
  }
  return rows;
}

/**
 * 作品图墙：一件作品的全部图，每张是一张贴在墙上的图版（纸边、接触阴影）。lead 为真时封面单独占满一行（只给横图），
 * 其余按原比例排成等高、两端对齐的行；手机上改成按 150px 行高自然换行。每张图下有图版编号；整面墙是一个看图分组。
 *   wall(ctx, work)   wall(ctx, work, { lead: true, eager: false })
 */
export function wall(ctx, w, { lead = false, eager = lead } = {}) {
  if (!w.images.length) return blankPlate(ctx, w.task.category, { text: ctx.t('common.empty.noImages') });
  const hasLead = lead && ratioOf(w.images[0]) >= 1;
  const item = (i) => `<figure class="ae-wall-item${hasLead && i === 0 ? ' is-lead' : ''}" style="--r:${f2(ratioOf(w.images[i]))}">${
    shot(ctx, w, i, { eager: eager && hasLead && i === 0, sizes: hasLead && i === 0 ? '(max-width: 1760px) 100vw, 1680px' : '' })}<figcaption class="ae-wall-no">${pad2(i + 1)}</figcaption></figure>`;
  const rest = [...w.images.keys()].slice(hasLead ? 1 : 0);
  const rows = rowsOf(rest, w.images).map((row) => {
    const sum = row.reduce((s, i) => s + ratioOf(w.images[i]), 0);
    const pad = sum < 2.4 ? `<i class="ae-wall-pad" style="--r:${f2(2.4 - sum)}" aria-hidden="true"></i>` : '';
    return `<div class="ae-wall-row">${row.map(item).join('')}${pad}</div>`;
  });
  return `<div class="ae-wall" data-gallery="${esc(w.id)}">${hasLead ? item(0) : ''}${rows.join('')}</div>`;
}

/** 空图版的纸心：一块 16:9 的空纸，淡墨描这一卷的星座（图还没挂上）；text 给了就在星座下面写一行小字 */
const blankPaper = (cat, text) => `<span class="ae-blank-in">${constellation(cat, 56)}${text ? `<span class="t">${esc(text)}</span>` : ''}</span>`;

/**
 * 封面图版：作品的第一张，纸边，链到题目页（不开看图器）。图框固定 16:9，图按原比例放在里面
 * （竖图左右露出纸色），每卷高度一样；没有图时纸心是空的。
 *   coverPlate(ctx, work, { href: ctx.href(work.task.path) + '?m=' + work.model.id })
 */
export function coverPlate(ctx, w, { href, eager = false, label = true, sizes = '', alt } = {}) {
  const body = w.cover ? img(ctx, w.cover, { alt: alt ?? imgAlt(ctx, w, 0), eager, sizes }) : blankPaper(w.task.category, ctx.t('common.empty.noImagesShort'));
  const tag = href ? 'a' : 'span';
  return `<${tag} class="ae-plate"${href ? ` href="${esc(href)}"` : ''}><span class="ae-plate-paper ae-sheet">${body}</span>${
    label ? `<span class="ae-plate-label">${modelName(ctx, w.model)}</span>` : ''}</${tag}>`;
}

/* ---------- 票 ---------- */

/** 票面上的微型印刷：一行拉开字距的小型大写、细线、3×2 点阵（远看是一块干净的纸） */
const dots32 = '<i class="ae-dots" aria-hidden="true"></i>';

/**
 * 观测卡（入口票，一屏只放一张）：票面是奶油纸和微型印刷（OBSERVATORY · ADMISSION、ADMIT ONE、No. 大号斜体数字、
 * 本卷星座的黄铜线、细线、3×2 点阵、一行极小的 NIGHT OF THE TEN VOLUMES），票根是题材色的深色实底，写一个动作。
 * 首页的开卷票不带编号和星座（cat 不给）。
 *   obsCard(ctx, { href: '#works', cat, title, sub, stub })
 */
export function obsCard(ctx, { href, cat = null, title, sub, stub, stubEn = '', cls = '' }) {
  const deep = cat ? cat.skin.worldDeep : '#35302C';         // 母版页（首页）上的票根是一块暖的深灰，不用锈红
  const no = cat ? `<span class="ae-card-no"><i>No.</i><b>${pad2(cat.no)}</b><small>/${pad2(ctx.data.categories.length)}</small></span>` : '';
  const figure = cat ? `<span class="ae-card-const">${constellation(cat, 44)}</span>` : '';
  const ink = cat && cat.skin.tone === 'light' ? `;--card-ink:${cat.skin.ink}` : '';   // 票面的微型印刷用这一题的墨（纸本身不变）
  return `<a class="ae-card${cat ? ' has-no' : ''}${cls ? ` ${cls}` : ''}" href="${esc(href)}" style="--stub:${deep}${ink}">
    <span class="face ae-sheet">
      <span class="ae-card-top" aria-hidden="true">${cat ? `<span>${esc(ctx.t('common.card.admission'))}</span>` : '<i class="hair"></i>'}<span>${esc(ctx.t('common.card.admit'))}</span></span>
      <span class="ae-card-body">${no}<span class="ae-card-text"><span class="t1">${esc(title)}</span>${sub ? `<span class="t2">${esc(sub)}</span>` : ''}</span>${figure}</span>
      <span class="ae-card-foot" aria-hidden="true"><span>${esc(ctx.t('common.card.night'))} · 2026</span>${dots32}</span>
    </span>
    <span class="perf" aria-hidden="true"></span>
    <span class="stub"><b>${esc(stub)}</b>${stubEn ? `<small aria-hidden="true">${esc(stubEn)}</small>` : ''}<i class="punch" aria-hidden="true"></i></span>
  </a>`;
}

/**
 * 取件票（下载）：票面写「下载作品」、格式和大小、一句说明，票根写动作；整张票是一个 <a download>。
 * 方向不提供下载（白模渲染、PV设计）时是一张压暗的「仅展映」票，不是链接；方向提供下载但包还没打好时返回空串。
 */
export function ticket(ctx, w) {
  const cat = w.task.category;
  const style = `--stub:${cat.skin.deep}`;
  const top = `<span class="ae-card-top" aria-hidden="true"><span>No. ${pad2(cat.no)} · ${esc(w.model.short ?? w.model.name)}</span><span>${esc(ctx.t('common.card.admit'))}</span></span>`;
  if (!cat.download) {
    return `<div class="ae-ticket is-off" style="${style}">
      <span class="face ae-sheet">${top}<span class="t1">${esc(ctx.t('common.ticket.offTitle'))}</span><span class="t3">${esc(ctx.t('common.ticket.offNote'))}</span></span>
      <span class="perf" aria-hidden="true"></span>
      <span class="stub"><b>${esc(ctx.t('common.ticket.offStub'))}</b>${ctx.lang === 'zh' ? '<small aria-hidden="true">SCREENING ONLY</small>' : ''}</span>
    </div>`;
  }
  const d = w.download;
  if (!d) return '';
  return `<a class="ae-ticket" style="${style}" href="${esc(ctx.media(d.href))}" download="${esc(d.file)}" data-ticket>
    <span class="face ae-sheet">${top}<span class="t1">${esc(ctx.t('common.ticket.title'))}</span><span class="t2"><b>${esc(d.kind.toUpperCase())}</b> · ${fmtBytes(d.bytes)}</span><span class="t3">${esc(ctx.L(d.note))}</span>${dots32}</span>
    <span class="perf" aria-hidden="true"></span>
    <span class="stub"><b>${esc(ctx.t('common.ticket.stub'))}</b>${ctx.lang === 'zh' ? '<small aria-hidden="true">DOWNLOAD</small>' : ''}<i class="punch" aria-hidden="true"></i></span>
  </a>`;
}

/* ---------- 空状态 ---------- */

/** 一张纸签（默认「云遮 · 未观测」）：贴在还没有的东西上 */
export function slip(ctx, { text, sub, cls = '' } = {}) {
  return `<span class="ae-slip ae-sheet${cls ? ` ${cls}` : ''}"><span class="t">${esc(text ?? ctx.t('common.empty.cloudedLong'))}</span>${sub ? `<span class="s">${esc(sub)}</span>` : ''}</span>`;
}

/** 云遮印：一枚单色网点的圆章，直接盖在书脊、节目单那一行上（没有作品的卷），不贴纸签 */
export function cloudStamp(ctx, { sub, cls = '' } = {}) {
  return `<span class="ae-stamp${cls ? ` ${cls}` : ''}"><span class="t">${esc(ctx.t('common.empty.clouded'))}</span>${sub ? `<span class="s">${esc(sub)}</span>` : ''}</span>`;
}

/** 图还没挂上：一张图版大小的空纸，淡墨描这一卷的星座；text 给了就在右下角贴一张纸签 */
export function blankPlate(ctx, cat, { text, cls = '' } = {}) {
  return `<div class="ae-blank${cls ? ` ${cls}` : ''}"><span class="ae-plate-paper ae-sheet">${blankPaper(cat)}</span>${text ? slip(ctx, { text, cls: 'ae-blank-slip' }) : ''}</div>`;
}

/** 云遮，未观测（一件作品都还没有的卷）：一扇夜窗，窗里一层网点的云，星座只描边，盖一枚云遮印 */
export function cloudedWindow(ctx, cat, { sub, cls = '' } = {}) {
  return `<div class="ae-cloud${cls ? ` ${cls}` : ''}"><span class="ae-cloud-sky" aria-hidden="true">${constellation(cat, 160)}</span>${cloudStamp(ctx, { sub, cls: 'ae-cloud-stamp' })}</div>`;
}

/** 评语：评委名按她的排法、一根三截线、评语（三等字，常规字重、行距宽），说完一个 ▽。没有评语时写「点评稍后公布」 */
export function comment(ctx, w) {
  const j = w.task.category.judge;
  const who = j ? `<span class="who">${judgeName(ctx, j)}<span class="role">${esc(ctx.t('common.judge.role'))}</span></span>` : '';
  if (w.comment) return `<blockquote class="ae-comment">${who}<p class="tx">${esc(ctx.L(w.comment))}<span class="end" aria-hidden="true">▽</span></p></blockquote>`;
  return `<div class="ae-comment is-pending">${who}<p class="tx">${esc(ctx.t('common.empty.comment'))}</p></div>`;
}

/* ---------- 人 ---------- */

/**
 * 立绘全身（透明底）。kind / id 给了就先找预渲的进光立绘（design.mjs litPortrait），找到了用它（class 带 is-lit）；
 * 没有时用数据里的立绘（class 带 is-raw，CSS 先压暗、染灯色、脚下化进雾）。没有立绘时是一颗小吊星。
 * 图上带 --hy（头顶在整张图高度里的比例），排版时拿它把几个人的头对齐。
 *   figure(ctx, model.portrait, { kind: 'players', id: model.key, alt, cls, full: true })   评委：{ kind: 'judges', id: judge.id }
 */
export function figure(ctx, image, { kind, id, alt = '', eager = false, cls = 'ae-portrait', full = false } = {}) {
  if (!image) return `<span class="${cls} is-none" aria-hidden="true">${hangingStar({ size: 40, drop: 60, glow: true })}</span>`;
  const lit = kind && id ? litPortrait(kind, id) : null;
  const hy = image.head ? image.head.y : 0.05;
  const src = lit ?? ctx.media(full ? image.src : image.thumb);
  const [w, h] = full || lit ? [image.width, image.height] : [image.thumb_width, image.thumb_height];
  return `<img class="${cls} ${lit ? 'is-lit' : 'is-raw'}" src="${esc(src)}" width="${w}" height="${h}" alt="${esc(alt)}" decoding="async"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} style="--hy:${hy}">`;
}

/* ---------- 看图器 ---------- */

/** 看图器的骨架（每页一份，页面有 [data-gallery] 时由页面骨架放进来；文案在这里，脚本在 src/client/lightbox.js） */
export function lightbox(ctx) {
  const t = (k) => esc(ctx.t(`common.lightbox.${k}`));
  const b = (cls, key, inner, extra = '') => `<button type="button" class="lb-btn ${cls}" aria-label="${t(key)}" title="${t(`${key}Tip`)}"${extra}>${inner}</button>`;
  return `<div class="lb" data-lightbox role="dialog" aria-modal="true" aria-label="${t('label')}" hidden>
    <div class="lb-stage" data-lb-stage><img class="lb-img" alt="" draggable="false"></div>
    ${b('lb-prev', 'prev', '<svg viewBox="0 0 24 48" aria-hidden="true"><path d="M18 4 6 24l12 20" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>')}
    ${b('lb-next', 'next', '<svg viewBox="0 0 24 48" aria-hidden="true"><path d="M6 4l12 20L6 44" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>')}
    <div class="lb-bar">
      <p class="lb-cap"><span class="lb-count" aria-live="polite"></span><span class="lb-text"></span></p>
      <div class="lb-tools">
        ${b('lb-zoom', 'zoom', '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M15.5 15.5 21 21M7.5 10.5h6" stroke="currentColor" stroke-width="1.5"/><path class="lb-zoom-plus" d="M10.5 7.5v6" stroke="currentColor" stroke-width="1.5"/></svg>', ' aria-pressed="false"')}
        ${b('lb-share', 'share', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L11.8 5.8M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.4-1.4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>')}
        <a class="lb-btn lb-orig" target="_blank" rel="noopener" aria-label="${t('original')}" title="${t('originalTip')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 4h7v7M20 4l-9 9M18 14v5H5V6h5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></a>
        ${b('lb-close', 'close', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19" stroke="currentColor" stroke-width="1.5"/></svg>')}
      </div>
    </div>
    <p class="lb-toast" role="status" data-copied="${t('copied')}"></p>
  </div>`;
}

/* ---------- 公示 ---------- */

/** 正式发布暂停公示时（topic.notice）固定在页底的一条纸带；平时返回空串 */
export function notice(ctx) {
  const n = ctx.data.notice;
  return n ? `<p class="ae-notice ae-sheet" role="status">${esc(ctx.L(n))}</p>` : '';
}

/** 「十卷星图」的标题：二等字，展示字体（AE Display CN），「星」放大（样张六） */
export function volumesTitle(ctx) {
  const text = ctx.t('volumes.title');
  return ctx.lang === 'zh' ? displayText(text, '星') : `<span class="vl-title-en">${esc(text)}</span>`;
}
