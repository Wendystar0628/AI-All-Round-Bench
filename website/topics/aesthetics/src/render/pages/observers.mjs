// 受测模型（models/）：参加这一夜的型号，每位一扇拱窗（质感贯穿方案 4.3）。
// 窗里是那轮日（预渲的点画日面），立绘站在日前，脚下化进雾，窗台以下裁掉；各人的头对齐在同一高度。
// 窗下是二等的名字：Bodoni 常规的型号名、斜体小一档的推理强度、三截发丝线、厂商的小型大写；再一行小字。
// 一句「按登记顺序，不分先后」。点进型号页。
import { esc } from '../context.mjs';
import { figure, modelName } from '../parts.mjs';

function card(ctx, m, i) {
  const judge = m.judge ? `<span class="ob-judge">${esc(ctx.t('observers.judge'))}</span>` : '';
  return `<li class="ob-li" style="--i:${i}">
    <a class="ob" href="${esc(ctx.href(m.path))}">
      <span class="ob-win" aria-hidden="true">
        <i class="ob-sun"></i>
        ${figure(ctx, m.portrait, { kind: 'players', id: m.key, cls: 'ob-fig', full: true, eager: true })}
        <i class="ob-fog"></i>
      </span>
      <span class="ob-name">${modelName(ctx, m)}</span>
      <i class="ob-hair ae-hair3" aria-hidden="true"></i>
      <span class="ob-vendor">${ctx.logo(m.logo)}<span>${esc(m.vendor)}</span>${judge}</span>
      <span class="ob-meta">${esc(ctx.t('observers.works', { n: m.works.length }))}<span aria-hidden="true"> · </span>${esc(ctx.t('observers.agent', { agent: m.agent }))}</span>
    </a>
  </li>`;
}

export function render(ctx) {
  const models = ctx.data.models;
  const list = models.length
    ? `<ul class="ob-list" style="--n:${models.length}">${models.map((m, i) => card(ctx, m, i)).join('')}</ul>`
    : `<p class="ob-none">${esc(ctx.t('observers.none'))}</p>`;
  const body = `<section class="obs" aria-labelledby="obs-title">
    <i class="obs-pool" aria-hidden="true"></i>
    <header class="obs-head">
      <p class="obs-voice" aria-hidden="true">${esc(ctx.t('observers.voice'))}</p>
      <h1 class="obs-title" id="obs-title"><span class="ae-dcn">${esc(ctx.t('observers.title'))}</span></h1>
      <i class="obs-hair ae-hair3" aria-hidden="true"></i>
      <p class="obs-line">${esc(ctx.t('observers.line'))}</p>
    </header>
    ${list}
  </section>`;
  return { title: ctx.t('observers.title'), description: ctx.t('observers.description'), body, styles: ['/src/styles/pages/observers.css'] };
}
