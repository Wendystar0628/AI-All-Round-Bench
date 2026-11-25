// 评委（judges/）：评委登场的网页版（质感贯穿方案 3.4、4.3，样张三）。三位各一整屏宽的一段，排法分开她们：
//   GPT 6.2 Sol      中轴对称的「仪器铭牌」：一道笔直的观测缝里是冷的夜和远处一颗星；地平线在她眼睛的高度横贯全屏，
//                    刻度只在她两侧一小段，右端停着最远的一颗星；身后对称的幽灵大字 S O L，她挡住中间的 O；名字是拉开字距的 Didone 大写。
//   Claude Opus 5.5  一张书页：左边是版心（首字母 O 两行半深，碗里收着 CLAUDE 的小型大写，后接斜体的 pus 和小号的 5.5），
//                    自我介绍像一段题记、前引号挂在版心之外，页脚一个页码；版心和她之间一根竖直的订口线，顶上垂下一条锈色书签带；
//                    她站在右边的拱窗前，窗里是松烟青的天，一盏暖色的读书灯从左上来。
//   Gemini 4 Neon    构图往一边倾：她在左，身后圆天窗里是琥珀色的光；右边 NEON 四个字母落在高低不同的基线上，
//                    那个 O 被拍歪、滚到基线下面；一笔琥珀色的手写 hi there~；交接线绕成一条尾巴兜住那个 O，停在一颗星上。
// 三段之间用同一根 1px 的交接线连着往下走：GPT 的地平线在她身后转成竖直，成了 Claude 那一页的订口，订口的下端再卷成 Gemini 的尾巴。
// 每段下面是她点评的方向（编号、简称、题名，链到题目页）和一句写给观众的人设。每位一个锚点 #judge-<id>（题目页、型号页链到这里）。
// 不认识的评委（以后新加的）用 Claude 那一种书页排法。Gemini 的尾巴按字的位置画（src/client/judges.js）。
import { esc, pad2 } from '../context.mjs';
import { figure, glint } from '../parts.mjs';

/** 评委名拆成三段：系列名（最后一个带字母的词）、它前面的、它后面的。GPT 6.2 Sol → [GPT 6.2, Sol, ''] */
function nameParts(name) {
  const words = name.split(/\s+/);
  let k = words.length - 1;
  while (k > 0 && !/[A-Za-z]/.test(words[k])) k--;
  return { pre: words.slice(0, k).join(' '), series: words[k], post: words.slice(k + 1).join(' ') };
}

/** 列举：甲、乙和丙 / A, B and C */
function join(ctx, items) {
  if (items.length < 2) return items.join('');
  return items.slice(0, -1).join(ctx.t('judges.sep')) + ctx.t('judges.and') + items[items.length - 1];
}

const tr = (ctx, key, fallback) => { try { return ctx.t(key); } catch { return fallback; } };

/** 「评委 · 白模渲染 · 大型建模 · 硬表面」：一行三等小字 */
function roleLine(ctx, j) {
  return `<p class="jd-role">${[ctx.t('common.judge.role'), ...j.categories.map((c) => ctx.shortOf(c))].map(esc).join('<span aria-hidden="true"> · </span>')}</p>`;
}

/** 每段下面：人设一句、她点评的方向（编号、简称、题名）、同时参测的链接 */
function ledger(ctx, j) {
  const persona = tr(ctx, `judges.persona.${j.id}`, ctx.L(j.persona));
  const dirs = j.categories.map((c) => `<li><a href="${esc(ctx.href(c.lead.path))}"><span class="no">${pad2(c.no)}</span><span class="sh">${esc(ctx.shortOf(c))}</span><span class="tt">${esc(ctx.nameOf(c.lead))}</span></a></li>`).join('');
  const also = j.contestant ? `<p class="jd-also"><a class="ae-more" href="${esc(ctx.href(j.contestant.path))}">${esc(ctx.t('judges.contestant', { name: j.contestant.display_name }))}</a></p>` : '';
  return `<div class="jd-ledger">
    <p class="jd-persona">${esc(persona)}</p>
    <div class="jd-dirs"><p class="jd-dirs-k">${esc(ctx.t('judges.dirs'))}</p><ul>${dirs}</ul></div>
    ${also}
  </div>`;
}

function portrait(ctx, j) {
  return figure(ctx, j.portrait, { kind: 'judges', id: j.id, cls: 'jd-fig', full: true, alt: ctx.t('judges.portraitAlt', { name: j.name }) });
}

/** GPT：仪器铭牌，中轴对称 */
function gpt(ctx, j, intro) {
  const { pre, series, post } = nameParts(j.name);
  const ghost = [...series.toUpperCase()].map((ch) => `<span>${esc(ch)}</span>`).join('');
  const ticks = Array.from({ length: 13 }, (_, i) => `<i style="--k:${i - 6}"></i>`).join('');
  return `<div class="jd-scene">
      <i class="jd-slit" aria-hidden="true"><i class="far">${glint(7)}</i></i>
      <p class="jd-ghost" aria-hidden="true">${ghost}</p>
      <div class="jd-horizon" aria-hidden="true"><i class="line"></i><span class="ticks">${ticks}</span><span class="lab"><i>0°00′</i><b>${esc(ctx.t('judges.horizon'))}</b></span><span class="end">${glint(9)}</span></div>
      <i class="jd-drop" aria-hidden="true"></i>
      ${portrait(ctx, j)}
    </div>
    <div class="jd-plate">
      <p class="jd-pre" aria-hidden="true">${esc([pre, post].filter(Boolean).join(' · ').replace(/\s+/g, ' · '))}</p>
      <h2 class="jd-name"><span class="sr-only">${esc(j.name)}</span><span aria-hidden="true">${esc(series.toUpperCase())}</span></h2>
      <i class="jd-hair" aria-hidden="true"></i>
      ${roleLine(ctx, j)}
      <p class="jd-intro">${esc(intro)}</p>
    </div>`;
}

/** Claude：一张书页 */
function claude(ctx, j, intro) {
  const { pre, series, post } = nameParts(j.name);
  const first = series.slice(0, 1), rest = series.slice(1);
  return `<div class="jd-scene">
      <i class="jd-lamp" aria-hidden="true"></i>
      <span class="jd-arch" aria-hidden="true"></span>
      <i class="jd-gutter" aria-hidden="true"><i class="ribbon"></i></i>
      ${portrait(ctx, j)}
    </div>
    <div class="jd-page">
      <h2 class="jd-name"><span class="sr-only">${esc(j.name)}</span><span class="cap" aria-hidden="true"><b>${esc(first)}</b><small>${esc(pre.toUpperCase())}</small></span><span class="rest" aria-hidden="true">${esc(rest)}</span><sup aria-hidden="true">${esc(post)}</sup></h2>
      <i class="jd-hair" aria-hidden="true"></i>
      ${roleLine(ctx, j)}
      <blockquote class="jd-intro"><p>${esc(intro)}</p></blockquote>
      <p class="jd-folio" aria-hidden="true">— ii —</p>
    </div>`;
}

/** Gemini：往一边倾，跳着落下的字母，一条尾巴 */
function gemini(ctx, j, intro) {
  const { pre, series } = nameParts(j.name);
  const letters = [...series.toUpperCase()];
  const odd = letters.indexOf('O') >= 0 ? letters.indexOf('O') : letters.length - 2;
  const word = letters.map((ch, i) => `<span class="l${i === odd ? ' is-odd' : ''}" style="--k:${i}">${esc(ch)}</span>`).join('');
  return `<div class="jd-scene">
      <span class="jd-round" aria-hidden="true"></span>
      ${portrait(ctx, j)}
      <svg class="jd-tail" aria-hidden="true" focusable="false"><path d="" vector-effect="non-scaling-stroke"/></svg>
      <span class="jd-tail-star" aria-hidden="true">${glint(9)}</span>
    </div>
    <div class="jd-note">
      <p class="jd-pre" aria-hidden="true"><i>${esc(pre)}</i><span class="ae-script">${esc(ctx.t('judges.hello'))}</span></p>
      <h2 class="jd-name"><span class="sr-only">${esc(j.name)}</span><span class="word" aria-hidden="true">${word}</span></h2>
      ${roleLine(ctx, j)}
      <p class="jd-intro">${esc(intro)}</p>
    </div>`;
}

const LAYOUT = { gpt, claude, gemini };

function section(ctx, j, i) {
  const layout = LAYOUT[j.id] ?? claude;
  const kind = LAYOUT[j.id] ? j.id : 'claude';
  const intro = tr(ctx, `judges.intro.${j.id}`, ctx.L(j.persona));
  return `<section class="jd jd--${kind}" id="judge-${esc(j.id)}" aria-labelledby="jd-${esc(j.id)}-name" style="--i:${i}">
    <div class="jd-stage">${layout(ctx, j, intro).replace('class="jd-name"', `class="jd-name" id="jd-${esc(j.id)}-name"`)}</div>
    ${ledger(ctx, j)}
  </section>`;
}

export function render(ctx) {
  const list = ctx.data.judges;
  const reviewed = ctx.data.categories.some((c) => c.works.some((w) => w.comment));
  const players = list.filter((j) => j.contestant);
  const self = players.length ? `<p class="jdh-self">${esc(ctx.t('judges.self', { names: join(ctx, players.map((j) => j.name)) }))}</p>` : '';
  const body = `<header class="jdh">
      <p class="jdh-voice" aria-hidden="true">${esc(ctx.t('judges.voice'))}</p>
      <h1 class="jdh-title"><span class="ae-dcn">${esc(ctx.t('judges.title'))}</span></h1>
      <i class="jdh-hair ae-hair3" aria-hidden="true"></i>
      <p class="jdh-line">${esc(ctx.t(reviewed ? 'judges.line' : 'judges.linePending'))}</p>
      ${self}
    </header>
    <div class="jd-list">${list.map((j, i) => section(ctx, j, i)).join('')}</div>`;
  return { title: ctx.t('judges.title'), description: ctx.t('judges.description'), body, styles: ['/src/styles/pages/judges.css'], script: '/src/client/judges.js' };
}
