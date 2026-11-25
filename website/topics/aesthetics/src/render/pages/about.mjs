// 关于（about/）：只剩阅读，排成全站最安静的书页（质感贯穿方案 4.3）。设计见 docs/design.md「关于」。
//   页首        「关于这一夜」、一句话、本页目录；一盏灯从左上照着这一页。
//   这一夜      #night     一段散文；页边一列演职员表式的数目（卷目、受测模型、作品、评委、更新）。
//   下载        #downloads 下到的是什么、怎么打开。
//   出处        #credits   字体、厂商图标、作品、图形。
// 一栏正文，小节标题是二等字的缩小版（宋体 700 + 小型大写的英文一档），页边放数目和小注。评委都搬到了评委页。
import { fontNames } from '../../../scripts/fonts.mjs';
import { dateDots, esc } from '../context.mjs';
import { modelBadge } from '../parts.mjs';

/** 列举：甲、乙和丙 / A, B and C。中文里「和」挨着西文的那一边空一格 */
function join(ctx, items) {
  if (items.length < 2) return items.join('');
  const rest = items.slice(0, -1).join(ctx.t('about.sep')), last = items[items.length - 1];
  let and = ctx.t('about.and');
  if (ctx.lang === 'zh') {
    const latin = /[A-Za-z0-9)]/;
    and = `${latin.test(rest.slice(-1)) ? ' ' : ''}${and}${latin.test(last[0]) ? ' ' : ''}`;
  }
  return rest + and + last;
}

/** 一节：页边是小节标题和小注，正文一栏 */
function section(ctx, id, { title, en, body, margin = '' }) {
  const eyebrow = ctx.lang === 'zh' && en ? `<span class="en" aria-hidden="true">${esc(en)}</span>` : '';
  return `<section class="ab-sec" id="${id}" aria-labelledby="${id}-title">
    <header class="ab-margin">
      <h2 class="ab-h" id="${id}-title"><span class="cn">${esc(title)}</span>${eyebrow}</h2>
      ${margin}
    </header>
    <div class="ab-text">${body}</div>
  </section>`;
}

function head(ctx) {
  const index = ['night', 'downloads', 'credits'].map((k, i) => `<li><a href="#${k}"><i>${['i', 'ii', 'iii'][i]}.</i>${esc(ctx.t(`about.index.${k}`))}</a></li>`).join('');
  return `<header class="ab-head">
    <i class="ab-pool" aria-hidden="true"></i>
    <p class="ab-voice" aria-hidden="true">${esc(ctx.t('about.voice'))}</p>
    <h1 class="ab-title"><span class="ae-dcn">${esc(ctx.t('about.title'))}</span></h1>
    <i class="ab-hair ae-hair3" aria-hidden="true"></i>
    <p class="ab-lead">${esc(ctx.t('about.lead'))}</p>
    <nav class="ab-index" aria-label="${esc(ctx.t('about.index.label'))}"><ol>${index}</ol></nav>
  </header>`;
}

function night(ctx) {
  const d = ctx.data;
  const off = d.categories.filter((c) => !c.download).map((c) => ctx.nameOf(c));
  const paras = [
    ctx.t('about.night.p1'),
    ctx.t('about.night.p2'),
    ctx.t('about.night.p3'),
    off.length ? ctx.t('about.night.p4', { off: join(ctx, off) }) : ctx.t('about.night.p4All'),
  ].map((p) => `<p>${esc(p)}</p>`).join('');
  const judgesLink = d.judges.length ? `<p class="ab-more"><a class="ae-more" href="${esc(ctx.href('judges/'))}">${esc(ctx.t('about.night.judgesLink'))}</a></p>` : '';

  const upcoming = d.categories.filter((c) => c.upcoming).length;
  const fact = (key, value) => `<div class="ab-fact"><dt>${esc(ctx.t(`about.night.facts.${key}`))}</dt><dd>${value}</dd></div>`;
  const facts = [
    fact('volumes', esc(ctx.t('about.night.facts.volumesValue', { n: d.counts.categories }) + (upcoming ? ctx.t('about.night.facts.volumesUpcoming', { n: upcoming }) : ''))),
    d.models.length ? fact('observers', `<span class="ab-fact-models">${d.models.map((m) => modelBadge(ctx, m, { size: 's' })).join('')}</span>`) : '',
    fact('works', esc(ctx.t('about.night.facts.worksValue', { n: d.counts.works }))),
    d.judges.length ? fact('judges', d.judges.map((j) => `<a class="nw" href="${esc(ctx.href('judges/'))}#judge-${esc(j.id)}">${esc(j.name)}</a>`).join('<br>')) : '',
    d.updated ? fact('updated', esc(dateDots(d.updated))) : '',
  ].join('');
  return section(ctx, 'night', {
    title: ctx.t('about.night.title'), en: ctx.t('about.night.en'),
    body: `<div class="ab-prose">${paras}</div>${judgesLink}`,
    margin: `<dl class="ab-facts" aria-label="${esc(ctx.t('about.night.facts.label'))}">${facts}</dl>`,
  });
}

function downloads(ctx) {
  const off = ctx.data.categories.filter((c) => !c.download).map((c) => ctx.nameOf(c));
  const items = ['html', 'webzip'].map((k) => `<li class="ab-dl">
    <p class="ab-dl-tag" aria-hidden="true">${esc(ctx.t(`about.downloads.${k}.tag`))}</p>
    <div><h3 class="ab-dl-title">${esc(ctx.t(`about.downloads.${k}.title`))}</h3>
    <p class="ab-dl-text">${esc(ctx.t(`about.downloads.${k}.text`)).replace('{cmd}', '<code>python -m http.server</code>')}</p></div>
  </li>`).join('');
  return section(ctx, 'downloads', {
    title: ctx.t('about.downloads.title'), en: ctx.t('about.downloads.en'),
    body: `<p class="ab-line">${esc(ctx.t('about.downloads.line'))}</p><ul class="ab-dls">${items}</ul>${off.length ? `<p class="ab-dl-off">${esc(ctx.t('about.downloads.off', { names: join(ctx, off) }))}</p>` : ''}`,
  });
}

/** 出处。字体按 scripts/fonts.mjs 的 FAMILIES 列 */
function credits(ctx) {
  const rows = ['fonts', 'icons', 'works', 'graphics'].map((k) => `<div class="ab-credit"><dt>${esc(ctx.t(`about.credits.${k}.role`))}</dt><dd>${esc(ctx.t(`about.credits.${k}.text`, { list: fontNames(ctx.lang) }))}</dd></div>`).join('');
  return section(ctx, 'credits', { title: ctx.t('about.credits.title'), en: ctx.t('about.credits.en'), body: `<dl class="ab-credit-list">${rows}</dl>` });
}

export function render(ctx) {
  return {
    title: ctx.t('about.title'),
    description: ctx.t('about.description'),
    body: `<article class="ab">${head(ctx)}${night(ctx)}${downloads(ctx)}${credits(ctx)}</article>`,
    styles: ['/src/styles/pages/about.css'],
  };
}
