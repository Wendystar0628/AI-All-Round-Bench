// 观测者票选（votes/）：观测者的票。设计见 docs/votes.md 第四节。
//   这一页是母版的夜，一盏吊星。
//   页首    标题（展示字 900，主角字放大，一颗星芒），身后一行斜体幽灵字；一句写给观测者的说明；
//           一行演职员表式的小字：总票数 · 投票的观测者数 · 截至几点几分。
//   总得票  一行一位设计师，按总票数从高到低；一根按卷分段的横条，每一段是那一卷的布色（parts.mjs voteTotals）。
//   星表    一张纸面的总表：十卷为列、设计师为行，每格票数和一颗星点（parts.mjs voteMatrix）；窄屏换成一人一张纸卡。
// 页面在构建时按发布时的快照（votes.json）画好，没有脚本时就是快照，写「截至发布时」；
// 脚本（src/client/votes.js）取到票箱的计票后换成实时的数，票箱连不上时留着快照并注明。
// 名次只来自观测者。暂停公示时这一页只写那句公示。
import { dateDots, esc } from '../context.mjs';
import { displayText, glint, hangingStar, sectionHead, voteMatrix, voteTotals, votesConfig } from '../parts.mjs';

/** 快照的时间：构建时只写日期（东八区），具体到几点几分由脚本按观测者自己的时区写 */
const snapshotDate = (iso) => {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) ? dateDots(new Date(t + 8 * 3600e3).toISOString()) : '';
};

/** 标题：展示字 900，主角字（votes.json 的 titleHero）放大，一颗星芒停在主角字的右上角（跟着主角字走，标题改了也不用挪） */
function title(ctx) {
  const text = ctx.t('votes.title'), hero = ctx.t('votes.titleHero');
  if (ctx.lang !== 'zh') return `<span class="vt-title-en">${esc(text)}</span>`;
  return displayText(text, hero).replace(/(class="ae-dcn is-hero">[^<]*)<\/span>/, `$1<span class="vt-glint" aria-hidden="true">${glint(12)}</span></span>`);
}

/** 演职员表式的一行：总票数 · 投票的观测者数 · 截至发布时（日期）。没有快照时只等脚本来填 */
function facts(ctx) {
  const s = ctx.data.votes.snapshot;
  const total = s ? Object.values(s.tasks).reduce((sum, row) => sum + Object.values(row).reduce((a, b) => a + b, 0), 0) : 0;
  const date = s ? snapshotDate(s.updated) : '';
  const items = s && total
    ? [ctx.t('votes.facts.votes', { n: total }), ctx.t('votes.facts.voters', { n: s.voters }), date ? ctx.t('votes.facts.asOfPublishAt', { time: date }) : ctx.t('votes.facts.asOfPublish')]
    : [];
  return `<p class="vt-facts" data-vote-facts aria-label="${esc(ctx.t('votes.facts.label'))}"${items.length ? '' : ' hidden'}>${items.map((x) => `<span>${esc(x)}</span>`).join('<i aria-hidden="true">·</i>')}</p>`;
}

/** 一句状态：没有快照、或快照里一票都没有时「还没有观测者投票。」；有快照时「这里是发布时的票数。」（脚本按票箱的情况改写） */
function stateLine(ctx) {
  const s = ctx.data.votes.snapshot;
  const any = s && Object.values(s.tasks).some((row) => Object.values(row).some(Boolean));
  return `<p class="vt-state" data-vote-state>${esc(ctx.t(any ? 'votes.state.static' : 'votes.state.none'))}</p>`;
}

export function render(ctx) {
  const t = ctx.t;
  const head = `<header class="vt-head">
      <p class="vt-voice" aria-hidden="true">${esc(t('votes.voice'))}</p>
      <h1 class="vt-title" id="vt-title" aria-label="${esc(t('votes.title'))}">${title(ctx)}</h1>
      <i class="vt-hair ae-hair3" aria-hidden="true"></i>
      ${ctx.data.notice ? '' : `<p class="vt-lead">${esc(t('votes.lead'))}</p>${facts(ctx)}${stateLine(ctx)}`}
    </header>`;
  const body = ctx.data.notice
    ? `<p class="vt-notice">${esc(ctx.L(ctx.data.notice))}</p>`
    : `<section class="vt-sec" aria-labelledby="vt-totals-title">
        ${sectionHead(ctx, { id: 'vt-totals-title', title: t('votes.totals.title'), en: t('votes.totals.en'), line: t('votes.totals.line') })}
        ${voteTotals(ctx)}
      </section>
      <section class="vt-sec" aria-labelledby="vt-matrix-title">
        ${sectionHead(ctx, { id: 'vt-matrix-title', title: t('votes.matrix.title'), en: t('votes.matrix.en'), line: t('votes.matrix.line') })}
        ${voteMatrix(ctx)}
      </section>
      ${votesConfig(ctx)}`;
  return {
    title: t('votes.title'),
    description: t('votes.description'),
    body: `<article class="vt" aria-labelledby="vt-title">
      <i class="vt-pool" aria-hidden="true"></i>
      <div class="vt-lamp" aria-hidden="true">${hangingStar({ size: 22, drop: 420, glow: true })}</div>
      ${head}
      ${body}
    </article>`,
    styles: ['/src/styles/pages/votes.css'],
    script: '/src/client/votes.js',
  };
}
