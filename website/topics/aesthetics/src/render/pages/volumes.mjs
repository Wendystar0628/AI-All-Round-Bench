// 卷目（volumes/）：十卷星图，一摞书（质感贯穿方案 3.3、4.3；特质与配色增补第五节，样张六）。
//   左墙：「十卷星图」二等标题（「星」放大，一颗星芒），身后压一行斜体幽灵字；一句「灯熄之前，十卷都还来得及翻完。」和一句说明；
//         下面是当前那一卷：封面图版、迷你锁定、一行编号 · 方向 · 件数 · 评委、点题短语。
//   右边：十卷叠成一摞，搁在一条暗木桌沿上；吊星挂在书摞右上方，光从右上角照下来，离灯远的书沉进夜里。
//   十本书各用自己那个世界的布色（令牌的 world），亮的、暗的、中间调交替着摞起来，像一架真的书；
//   书脊上的题名是锁定的迷你形态：铅印的纸白或墨，只有主角那个字用这一卷自己的材质烫上去。
//   悬停或聚焦哪一卷，哪一卷就抽出来一点、更亮，垂下它自己颜色（点亮色）的书签带，左边换成它。
//   没有作品的卷：题名只是淡淡压进布里，盖一枚网点的「云遮」印。
import { esc, pad2 } from '../context.mjs';
import {
  blankPlate, cloudStamp, cloudedWindow, coverPlate, glint, hangingStar, judgeName, miniLockup, volumesTitle,
} from '../parts.mjs';

/** 带种子的随机数：书摞的参差每次构建都一样 */
function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 一卷的颜色：布、布的暗面、点亮色、字；亮布用墨（mini-ink），暗布用纸白（mini） */
const tones = (cat) => {
  const s = cat.skin;
  return `--cloth:${s.world};--cloth-deep:${s.worldDeep};--lit:${s.lit};--ink:${s.ink}`;
};

function spine(ctx, cat, i, n) {
  const r = rng(301 + i * 13);
  const dx = Math.round(r() * 30 - 6);               // 手叠的错落
  const cut = Math.round(r() * 46);                  // 长短参差
  const thick = Math.round(50 + r() * 14);           // 厚薄参差
  const glow = (1 - i / (n - 1)) * 0.8 + 0.2;        // 灯在右上：上面几卷亮，往下沉进夜里
  const lead = cat.lead;
  const tone = cat.skin.tone;
  const side = cat.clouded
    ? cloudStamp(ctx, { cls: 'sp-stamp is-rect' })
    : `<span class="sp-n">${esc(ctx.t('volumes.works', { n: cat.works.length }))}</span>`;
  return `<li class="sp-li is-${tone}${cat.clouded ? ' is-clouded' : ''}" style="--dx:${dx}px;--cut:${cut}px;--th:${thick}px;--glow:${glow.toFixed(2)};${tones(cat)}">
    <a class="sp${i === 0 ? ' is-active' : ''}" href="${esc(ctx.href(lead.path))}" data-vol="${i}">
      <span class="sp-no">${pad2(cat.no)}</span>
      <span class="sp-cat">${esc(ctx.shortOf(cat))}</span>
      <span class="sp-title">${miniLockup(ctx, lead, { form: tone === 'light' ? 'mini-ink' : 'mini' })}</span>
      ${side}
      <i class="sp-ribbon" aria-hidden="true"></i>
    </a>
  </li>`;
}

/**
 * 左边：一卷一块，平时只露当前这一卷（脚本按悬停和聚焦切换；没有脚本时只露第一卷）。
 *   有作品、有图：第一位型号的封面一大张（点了进题目页并选定那个型号）
 *   有作品、还没有图：一张空图版
 *   一件作品都没有：一扇云遮的夜窗
 */
function preview(ctx, cat, i) {
  const lead = cat.lead;
  const href = ctx.href(lead.path);
  let plates;
  if (cat.clouded) {
    plates = cloudedWindow(ctx, cat, { sub: lead.upcoming ? ctx.t('volumes.upcoming') : null, cls: 'vp-cloud' });
  } else if (!cat.works.some((w) => w.cover)) {
    plates = blankPlate(ctx, cat, { text: ctx.t('volumes.noImages'), cls: 'vp-blank' });
  } else {
    const first = cat.works.find((w) => w.cover) ?? cat.works[0];
    plates = `<div class="vp-plates"><div class="vp-lead">${coverPlate(ctx, first, { href: `${href}?m=${encodeURIComponent(first.model.id)}`, label: false })}</div></div>`;
  }
  const meta = [
    `<span class="no">${pad2(cat.no)}</span>`,
    esc(ctx.nameOf(cat)),
    esc(cat.clouded ? ctx.t(lead.upcoming ? 'volumes.upcoming' : 'volumes.noneNote') : ctx.t('volumes.works', { n: cat.works.length })),
    cat.judge ? ctx.t('volumes.judge', { name: '\u0000' }).split('\u0000').map(esc).join(judgeName(ctx, cat.judge)) : '',
  ].filter(Boolean).join('<span aria-hidden="true"> · </span>');
  return `<div class="vp" data-vp="${i}"${i ? ' hidden' : ''} style="${tones(cat)}">
    ${plates}
    <div class="vp-cap">
      <p class="vp-title"><a href="${esc(href)}">${miniLockup(ctx, lead, { form: 'mini' })}</a></p>
      <p class="vp-meta">${meta}</p>
      ${lead.tagline ? `<p class="vp-tag">${esc(ctx.L(lead.tagline))}</p>` : ''}
    </div>
  </div>`;
}

export function render(ctx) {
  const cats = ctx.data.categories;
  const body = `<section class="vl" aria-labelledby="vl-title">
    <i class="vl-pool" aria-hidden="true"></i>
    <div class="vl-side">
      <header class="vl-head">
        <p class="vl-voice" aria-hidden="true">${esc(ctx.t('volumes.voice'))}</p>
        <h1 class="vl-title" id="vl-title" aria-label="${esc(ctx.t('volumes.title'))}">${volumesTitle(ctx)}<span class="vl-glint" aria-hidden="true">${glint(12)}</span></h1>
        <p class="vl-lead">${esc(ctx.t('volumes.lead'))}</p>
        <p class="vl-note">${esc(ctx.t('volumes.note'))}</p>
      </header>
      <div class="vl-preview" data-preview aria-label="${esc(ctx.t('volumes.previewLabel'))}" role="region">${cats.map((c, i) => preview(ctx, c, i)).join('')}</div>
    </div>
    <div class="vl-stack">
      <div class="vl-lamp" aria-hidden="true">${hangingStar({ size: 22, drop: 150, glow: true })}</div>
      <ol class="vl-list" aria-label="${esc(ctx.t('volumes.listLabel'))}">${cats.map((c, i) => spine(ctx, c, i, cats.length)).join('')}</ol>
      <i class="vl-table" aria-hidden="true"></i>
    </div>
  </section>`;
  return {
    title: ctx.t('volumes.title'),
    description: ctx.t('volumes.description'),
    body,
    styles: ['/src/styles/pages/volumes.css'],
    script: '/src/client/volumes.js',
  };
}
