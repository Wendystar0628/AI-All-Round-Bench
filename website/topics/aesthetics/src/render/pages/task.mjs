// 题目页（一题一页）：一页是一卷。设计见 docs/design.md「题目页」。
//   页首就是视频的介绍页（质感贯穿方案 3.5、4.4；特质与配色增补第五节）：满版的代表画面（视频模板渲出的画面层静图，不带字），
//   按视频的舞台摆：静图、题名锁定（和视频同一份，摆法同 VX.ae.lockupPlace）、点题短语和正文那一栏都在同一块 1920×1080 的「台」上，
//   锁定的几何线才接得上静图里的落点。点题短语（中文、细斜线、斜体英文）、主要内容、看点（i. ii. iii.）是三等字；
//   一张观测卡躺在画面的光里，票根是这一题世界色最深的一档。页首是这一题自己的颜色（世界色），往下慢慢沉回夜（.tk-sink）。
//   亮底的题（ink 是墨）字和页头换墨色。代表画面的静图还没有时，画缺省画面：这一卷的星座在夜空里，上方吊着那颗星。
//   英文页、或这一题还没有锁定时，不按台摆：卷的小标和题名写在左上，字照常排。
//   作品：受测模型页签（?m=<型号id> 选定一位，没有脚本时依次排开），每个型号一块：打孔钮和取件票、图墙（纸边、接触阴影）、评语。
//         观测者票选（docs/votes.md 第三节）也嵌在这块作品区里：页签那一排上方是本卷票选，右端停着这一卷的观测票，
//         投过的设计师页签上有一个打穿的小孔；这些都靠脚本（src/client/votes.js），没有脚本时不出现。
//   页尾：上一卷 / 下一卷的书脊卡（和卷目页同一本书），一条横着的十卷星座。
import { esc, pad2 } from '../context.mjs';
import { AEOrn, hasConstellation, lockupItem, stillOf } from '../design.mjs';
import {
  ballot, cloudStamp, cloudedWindow, comment, coverPlate, hangingStar, judgeName, lockup, miniLockup, modelBadge, modelName, obsCard,
  punch, rankTable, sectionHead, slip, starChart, ticket, volumeLabel, voteMark, votesConfig, wall,
} from '../parts.mjs';

/* ---------- 页首：这一卷的介绍页 ---------- */

/** 满版的画面：代表画面的静图；没有时是缺省画面（这一卷的星座在夜空里，上方吊着那颗星，一片灯光落在墙上） */
function scene(ctx, entry, cat) {
  const still = stillOf(entry.key);
  if (still) return `<img class="tk-still" src="${esc(still)}" alt="" decoding="async" fetchpriority="high">`;
  const S = 600, P = 40;
  const figure = hasConstellation(cat.skin.key)
    ? AEOrn.constellation(cat.skin.key, P, P, S - 2 * P, S - 2 * P, { line: 'currentColor', star: 'currentColor', lw: 1, la: 0.62, sizes: [16, 11, 7] })
    : '';
  return `<div class="tk-default">
    <i class="tk-pool"></i>
    <div class="tk-emblem">
      <svg class="tk-const" viewBox="0 0 ${S} ${S}" focusable="false">${figure}</svg>
      <span class="tk-hang">${hangingStar({ size: 30, drop: 150, glow: true })}</span>
    </div>
  </div>`;
}

/** 点题短语：中文在前、一道细斜线、斜体英文在后，共一条基线（英文页只写英文） */
function tagline(ctx, entry) {
  if (!entry.tagline) return '';
  const zh = entry.tagline.zh, en = entry.tagline.en;
  if (ctx.lang === 'en' || !zh) return `<p class="tk-tagline"><em>${esc(en || zh)}</em></p>`;
  return `<p class="tk-tagline"><span>${esc(zh)}</span>${en ? `<i class="sl" aria-hidden="true">/</i><em lang="en">${esc(en)}</em>` : ''}</p>`;
}

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi'];

function head(ctx, entry, cat) {
  const t = ctx.t;
  const framed = ctx.lang === 'zh' && Boolean(lockupItem(entry.key));   // 按台摆：锁定自带编号小标
  const prov = entry.upcoming ? slip(ctx, { text: t('task.head.provisional'), cls: 'tk-prov' }) : '';
  const summary = entry.summary ? `<p class="tk-summary">${esc(ctx.L(entry.summary))}</p>` : '';
  const points = entry.highlights.length
    ? `<ol class="tk-points" aria-label="${esc(t('task.head.points'))}">${entry.highlights.map((h, i) => `<li><i aria-hidden="true">${ROMAN[i] ?? i + 1}.</i><span>${esc(ctx.L(h))}</span></li>`).join('')}</ol>`
    : '';
  const j = cat.judge;
  const judge = j
    ? `<p class="tk-judge"><span class="k">${esc(t('task.head.judge'))}</span><a href="${esc(ctx.href('judges/'))}#judge-${esc(j.id)}" title="${esc(t('task.head.judgeTitle'))}">${judgeName(ctx, j)}</a></p>`
    : '';
  const n = entry.works.length;
  const card = n
    ? obsCard(ctx, {
      href: '#works', cat, title: t('task.head.enter'), sub: t('task.head.enterSub', { n }),
      stub: ctx.lang === 'zh' && cat.skin.verb ? cat.skin.verb : t('task.head.enterStub'),
      stubEn: ctx.lang === 'zh' ? `ENTER · ${pad2(cat.no)}` : '', cls: 'tk-card',
    })
    : cloudStamp(ctx, { sub: entry.upcoming ? t('task.head.upcoming') : null, cls: 'tk-stamp' });
  const title = `<div class="tk-title-row"><h1 class="tk-title" id="tk-title">${lockup(ctx, entry)}</h1>${framed ? '' : prov}</div>`;
  return `<header class="tk-head${framed ? ' is-framed' : ''}" aria-labelledby="tk-title">
    <div class="tk-stage">
      ${scene(ctx, entry, cat)}
      <i class="ae-grain tk-grain" aria-hidden="true"></i>
      <i class="tk-smudge" aria-hidden="true"></i>
      ${framed ? title : ''}
    </div>
    <div class="tk-copy">
      ${framed ? prov : volumeLabel(ctx, cat) + title}
      ${tagline(ctx, entry)}
      ${summary}${points}${judge}
    </div>
    ${card}
  </header>
  <i class="tk-sink" aria-hidden="true"></i>`;
}

/* ---------- 作品：受测模型页签 + 每个型号一块 ---------- */

function tab(ctx, w) {
  const m = w.model;
  return `<a class="tk-tab" href="#m-${esc(m.id)}" id="tk-tab-${esc(m.id)}" data-tab="${esc(m.id)}">
    ${coverPlate(ctx, w, { label: false, alt: '' })}
    ${modelBadge(ctx, m, { href: false, size: 's' })}
    ${voteMark(ctx, w)}
  </a>`;
}

function panel(ctx, w, next) {
  const m = w.model;
  const t = ctx.t;
  const stills = w.images.length ? `<span>${esc(t('task.panel.stills', { n: w.images.length }))}</span>` : '';
  const live = w.state === 'answering' ? slip(ctx, { text: t('task.panel.answering'), sub: t('task.panel.answeringSub'), cls: 'tk-live' }) : '';
  const nextLink = next
    ? `<a class="tk-link" href="#m-${esc(next.model.id)}" data-goto="${esc(next.model.id)}"><span class="k">${esc(t('task.panel.next'))}</span>${modelName(ctx, next.model)}</a>`
    : '';
  return `<section class="tk-panel" id="m-${esc(m.id)}" data-panel="${esc(m.id)}" aria-label="${esc(t('task.panel.label', { model: m.display_name }))}">
    <header class="tk-panel-head">
      <div class="tk-who">
        ${modelBadge(ctx, m, { size: 'l', vendor: true })}
        <p class="tk-meta"><span>${esc(t('task.panel.agent', { agent: m.agent }))}</span>${stills}</p>
        ${live}
      </div>
      <div class="tk-get">${punch(ctx, w)}${ticket(ctx, w) || `<p class="tk-packing">${esc(t('task.panel.packing'))}</p>`}</div>
    </header>
    ${wall(ctx, w, { lead: true, eager: false })}
    <footer class="tk-panel-foot">
      ${comment(ctx, w)}
      <p class="tk-links"><a class="tk-link" href="${esc(ctx.href(m.path))}">${esc(t('task.panel.night'))}</a>${nextLink}</p>
    </footer>
  </section>`;
}

function works(ctx, entry, cat) {
  const list = entry.works;
  const t = ctx.t;
  // 说明的后半句「点开图版看大图」只在至少一件作品有图时写
  const headHTML = sectionHead(ctx, {
    id: 'works-title', title: t('task.works.title'), en: t('task.works.en'),
    line: list.length ? t('task.works.line') + (list.some((w) => w.images.length) ? t('task.works.lineOpen') : '') : null,
  });
  if (!list.length) {
    return `<section class="tk-works" id="works" aria-labelledby="works-title">${headHTML}
      <div class="tk-none">${cloudedWindow(ctx, cat, { sub: t(entry.upcoming ? 'task.works.upcoming' : 'task.works.none') })}</div>
    </section>`;
  }
  // 左栏是小节标题和页签那一排；右栏上面是本卷票选，下面是停在页签那一排右端的观测票（两栏等高，星表展开时不推动页签）
  return `<section class="tk-works" id="works" aria-labelledby="works-title" data-tabs>
    <div class="tk-works-top" id="rank">
      <div class="tk-works-main">
        ${headHTML}
        <nav class="tk-tabs" aria-label="${esc(t('task.works.tabs'))}">${list.map((w) => tab(ctx, w)).join('')}</nav>
      </div>
      <div class="tk-works-side">${rankTable(ctx, entry)}${ballot(ctx, entry)}</div>
    </div>
    <div class="tk-panels">${list.map((w, i) => panel(ctx, w, list[i + 1])).join('')}</div>
    ${entry.votable.length ? votesConfig(ctx) : ''}
  </section>`;
}

/* ---------- 页尾：上一卷 / 下一卷、十卷星座 ---------- */

/** 书脊卡：和卷目页同一本书——这一卷的布色，编号、简称，题名是锁定的迷你形态（亮布用墨、暗布用纸白） */
function volume(ctx, c, dir) {
  if (!c) return `<span class="tk-vol tk-vol--${dir} is-none" aria-hidden="true"></span>`;
  const s = c.skin;
  return `<a class="tk-vol tk-vol--${dir} is-${s.tone}${c.clouded ? ' is-clouded' : ''}" href="${esc(ctx.href(c.lead.path))}" rel="${dir}" style="--cloth:${s.world};--cloth-deep:${s.worldDeep};--ink:${s.ink};--lit:${s.lit}">
    <span class="tk-vol-dir">${esc(ctx.t(`task.pager.${dir}`))}</span>
    <span class="tk-vol-body">
      <span class="no">${pad2(c.no)}</span>
      <span class="cat">${esc(ctx.shortOf(c))}</span>
      <span class="ttl">${miniLockup(ctx, c.lead, { form: s.tone === 'light' ? 'mini-ink' : 'mini' })}</span>
      ${c.clouded ? cloudStamp(ctx, { cls: 'tk-vol-stamp is-rect' }) : ''}
    </span>
  </a>`;
}

function pager(ctx, cat) {
  const cats = ctx.data.categories;
  const i = cats.indexOf(cat);
  return `<div class="tk-pager">
    <nav class="tk-vols" aria-label="${esc(ctx.t('task.pager.label'))}">${volume(ctx, cats[i - 1], 'prev')}${volume(ctx, cats[i + 1], 'next')}</nav>
    <div class="tk-chart">${starChart(ctx, { current: cat, label: ctx.t('task.pager.chart') })}</div>
  </div>`;
}

export function render(ctx, route) {
  const entry = ctx.data.entry(route.key);
  const cat = entry.category;
  const { skin } = cat;
  return {
    title: `${ctx.nameOf(entry)} · ${ctx.nameOf(cat)}`,
    description: ctx.L(entry.summary) || undefined,
    body: `<article class="tk" data-skin="${esc(cat.key)}" data-tone="${skin.tone}" style="--world:${skin.world};--world-deep:${skin.worldDeep};--world-pale:${skin.worldPale};--lit:${skin.lit};--ink:${skin.ink};--light:${skin.light};--mark:${skin.tone === 'light' ? skin.worldDeep : skin.lit}">
      ${skin.tone === 'light' ? `<style>body{--page-ink:${skin.ink}}</style>` : ''}
      ${head(ctx, entry, cat)}${works(ctx, entry, cat)}${pager(ctx, cat)}
    </article>`,
    styles: ['/src/styles/pages/task.css'],
    script: '/src/client/task.js',
    gallery: entry.works.some((w) => w.images.length),
  };
}
