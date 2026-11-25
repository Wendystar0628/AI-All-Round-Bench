// 型号页（models/<id>/）：这个型号的一夜。设计见 docs/design.md「型号页」。
//   页首    选手登场的网页版（质感贯穿方案 3.2、4.5）：穹顶内壁上一轮被点亮的日（预渲的点画日面，下沿被暗角吃掉），
//           两道顶光从吊星落下，交叠在日的上半和她的头肩上；预渲的进光立绘站在日前、脚下化进雾；
//           身后的系列大词（ASTRA / OPUS / NEON）放在腰的高度，被日光染色——靠日的字母橙金、远的暗；
//           卫星层：一条倾斜的点线轨道绕过她，轨道上一颗行星珠，几颗小金三角和芒星，几粒往上飘的暖火星；
//           右上一枚小圆章用竖直的点线吊下来（这一屏唯一的「界面」）；名字是二等字。
//   目录    一条十卷星座：点星跳到本页那一卷，这个型号没做的卷是空心的。
//   节目单  十卷按展示顺序，每卷一段（锚点 #v01…）：迷你锁定的题名、点题短语；封面图版和全部小图；评语、取件票。没做的卷只占一行。
//   页尾    其他受测模型的小拱窗。
import { dateDots, esc, pad2 } from '../context.mjs';
import { seriesWord } from '../design.mjs';
import {
  blankPlate, cloudStamp, comment, coverPlate, figure, glint, miniLockup, modelName, sectionHead, shot, slip, star, starChart, ticket,
  volumeLabel,
} from '../parts.mjs';

const anchor = (cat) => `v${pad2(cat.no)}`;
const taskHref = (ctx, w) => `${ctx.href(w.task.path)}?m=${encodeURIComponent(w.model.id)}`;

/** 封面图版的显示宽度（model.css：桌面占右边约 3/5 栏，960 以下占满一栏），浏览器按它在缩略图和大图之间挑 */
const COVER_SIZES = '(max-width: 960px) calc(100vw - 40px), min(56vw, 980px)';

/* ---------- 页首：今夜主演 ---------- */

/** 右上那枚小圆章：竖直的点线吊下来，章里是观测台的标记，一圈微型字（今夜的日期、编号） */
function seal(ctx, m, i) {
  const ring = `AI AESTHETICS · ${m.tested ? dateDots(m.tested) : ''} · MODEL No. ${pad2(i + 1)} · `;
  return `<span class="md-seal" aria-hidden="true">
    <i class="md-seal-cord"></i>
    <svg viewBox="0 0 120 120" focusable="false">
      <defs><path id="md-seal-path" d="M60 60 m-44 0 a44 44 0 1 1 88 0 a44 44 0 1 1 -88 0"/></defs>
      <circle cx="60" cy="60" r="56" class="rim"/><circle cx="60" cy="60" r="35" class="rim2"/>
      <text class="ring"><textPath href="#md-seal-path" textLength="270">${esc(ring)}</textPath></text>
      <path d="M44 74 A16 16 0 0 1 76 74Z" class="dome"/><rect x="58.6" y="58" width="2.8" height="12" class="slit"/><path d="M40 74h40" class="ground"/>
      <path d="M60 36 l1.6 4.4 4.4 1.6 -4.4 1.6 -1.6 4.4 -1.6 -4.4 -4.4 -1.6 4.4 -1.6z" class="st"/>
    </svg>
  </span>`;
}

/** 卫星层：倾斜的点线轨道和一颗行星珠、几颗小金三角和芒星、几粒往上飘的暖火星。都挤在人周围，四周留暗 */
function satellites() {
  const sparks = [[22, 30, 1], [76, 22, 0.8], [70, 58, 0.6], [28, 64, 0.7]].map(([x, y, s], k) => `<span class="sat-st" style="left:${x}%;top:${y}%;--s:${s}">${k % 2 ? star(14) : glint(8)}</span>`).join('');
  const embers = Array.from({ length: 9 }, (_, k) => `<i class="ember" style="--x:${(30 + ((k * 37) % 42)).toFixed(0)}%;--d:${(k * 0.9).toFixed(1)}s;--y:${(40 + ((k * 23) % 40)).toFixed(0)}%"></i>`).join('');
  return `<div class="md-sats" aria-hidden="true">
    <svg class="md-orbit" viewBox="-500 -120 1000 240" preserveAspectRatio="none" focusable="false"><g transform="rotate(-9)"><ellipse rx="470" ry="96" class="path"/><circle cx="-388" cy="54" r="7" class="bead"/></g></svg>
    ${sparks}${embers}
  </div>`;
}

function stage(ctx, m) {
  const name = m.display_name ?? m.name;
  const index = ctx.data.models.indexOf(m);
  const word = seriesWord(m);
  const facts = [
    m.agent ? ctx.t('model.facts.agent', { agent: m.agent }) : '',
    m.tested ? ctx.t('model.facts.tested', { date: dateDots(m.tested) }) : '',
    ctx.t('model.facts.works', { n: m.works.length }),
  ].filter(Boolean);
  const eyebrow = ctx.lang === 'zh'
    ? `<span class="en" aria-hidden="true">STARRING</span><i aria-hidden="true"></i><span class="cn">${esc(ctx.t('model.starring'))}</span>`
    : '<span class="en">STARRING</span>';
  const judge = m.judge ? `<p class="md-judge"><a class="ae-more" href="${esc(ctx.href('judges/'))}#judge-${esc(m.judge.id)}">${esc(ctx.t('model.judge'))}</a></p>` : '';
  return `<section class="md-stage" aria-labelledby="md-name">
    <div class="md-room" aria-hidden="true">
      <i class="md-seam"></i>
      <i class="md-sun"></i>
      <i class="md-cone md-cone--l"></i><i class="md-cone md-cone--r"></i>
      ${word ? `<p class="md-word">${[...word].map((ch) => `<span>${esc(ch)}</span>`).join('')}</p>` : ''}
    </div>
    ${satellites()}
    ${figure(ctx, m.portrait, { kind: 'players', id: m.key, cls: 'md-who', full: true, eager: true, alt: ctx.t('model.portraitAlt', { name }) })}
    <i class="md-fog" aria-hidden="true"></i>
    <i class="ae-grain md-grain" aria-hidden="true"></i>
    ${seal(ctx, m, index)}
    <div class="md-bill">
      <p class="md-starring">${eyebrow}</p>
      <h1 class="md-name" id="md-name">${modelName(ctx, m)}</h1>
      <i class="md-hair ae-hair3" aria-hidden="true"></i>
      <p class="md-vendor">${ctx.logo(m.logo)}<span>${esc(m.vendor)}</span></p>
      <p class="md-facts">${facts.map(esc).join('<span aria-hidden="true">  ·  </span>')}</p>
      ${judge}
    </div>
  </section>`;
}

/** 页首下面的目录：一条十卷星座，星链到本页那一卷；这个型号没做的卷算云遮 */
function toc(ctx, m) {
  const done = new Set(m.works.map((w) => w.task.category));
  const count = (c) => m.works.filter((w) => w.task.category === c).length;
  return `<div class="md-toc">${starChart(ctx, { href: (c) => `#${anchor(c)}`, clouded: (c) => !done.has(c), count, label: ctx.t('model.toc') })}</div>`;
}

/* ---------- 今夜节目单 ---------- */

/** 一件作品：左边卷的小标、迷你锁定的题名、点题短语；右边封面图版和全部小图；下面评语、取件票 */
function work(ctx, w, first) {
  const t = w.task;
  const href = taskHref(ctx, w);
  const hid = `${anchor(t.category)}-${t.key}`;
  const busy = w.state === 'answering' ? slip(ctx, { text: ctx.t('model.work.answering'), sub: ctx.t('model.work.answeringNote'), cls: 'md-busy' }) : '';
  const strip = w.images.length > 1
    ? `<div class="md-strip" data-gallery="${esc(w.id)}" role="group" aria-label="${esc(ctx.t('model.work.strip', { task: ctx.nameOf(t) }))}">${
      w.images.map((image, i) => `<span class="md-strip-i" style="--r:${(image.width / image.height).toFixed(3)}">${shot(ctx, w, i)}</span>`).join('')}</div>`
    : '';
  return `<article class="md-work" aria-labelledby="${hid}">
    <header class="md-w-head">
      ${first ? volumeLabel(ctx, t.category) : ''}
      <h3 class="md-w-title" id="${hid}"><a href="${esc(href)}">${miniLockup(ctx, t)}</a></h3>
      ${t.tagline ? `<p class="md-w-tag">${esc(ctx.L(t.tagline))}</p>` : ''}
      ${busy}
      <div class="md-w-foot">
        ${comment(ctx, w)}
        ${ticket(ctx, w) || `<p class="md-packing">${esc(ctx.t('model.work.packing'))}</p>`}
        <a class="ae-more md-open" href="${esc(href)}">${esc(ctx.t('model.work.open'))}</a>
      </div>
    </header>
    <div class="md-w-art">
      <div class="md-w-cover">${w.cover ? coverPlate(ctx, w, { href, label: false, sizes: COVER_SIZES }) : blankPlate(ctx, t.category, { text: ctx.t('common.empty.noImages') })}</div>
      ${strip}
    </div>
  </article>`;
}

/** 一卷：这个型号在这个方向的作品；没做的卷只占一行，盖一枚网点的云遮印 */
function volume(ctx, m, cat) {
  const works = m.works.filter((w) => w.task.category === cat);
  if (!works.length) {
    const lead = cat.lead;
    return `<li class="md-vol is-none" id="${anchor(cat)}">
      <div class="md-none">${volumeLabel(ctx, cat)}<a class="md-none-t" href="${esc(ctx.href(lead.path))}">${miniLockup(ctx, lead)}</a>${cloudStamp(ctx, { sub: lead.upcoming ? ctx.t('model.none.upcoming') : null })}</div>
    </li>`;
  }
  return `<li class="md-vol" id="${anchor(cat)}" style="--lit:${cat.skin.lit}">${works.map((w, i) => work(ctx, w, i === 0)).join('')}</li>`;
}

function programme(ctx, m) {
  return `<section class="md-night" aria-labelledby="programme-title">
    ${sectionHead(ctx, { id: 'programme-title', title: ctx.t('model.programme.title'), en: ctx.t('model.programme.en'), line: ctx.t('model.programme.line') })}
    <ol class="md-vols">${ctx.data.categories.map((c) => volume(ctx, m, c)).join('')}</ol>
  </section>`;
}

/* ---------- 其他受测模型 ---------- */

function others(ctx, m) {
  const list = ctx.data.models.filter((x) => x !== m);
  if (!list.length) return '';
  const cards = list.map((x) => `<li>
    <a class="md-peer" href="${esc(ctx.href(x.path))}">
      <span class="md-peer-win" aria-hidden="true"><i class="sun"></i>${figure(ctx, x.portrait, { kind: 'players', id: x.key, cls: 'md-peer-img' })}</span>
      <span class="md-peer-name">${modelName(ctx, x)}</span>
      <span class="md-peer-vendor">${esc(x.vendor)}</span>
    </a>
  </li>`).join('');
  return `<section class="md-others" aria-labelledby="others-title">
    ${sectionHead(ctx, { id: 'others-title', title: ctx.t('model.others.title'), en: ctx.t('model.others.en'), line: ctx.t('model.others.line') })}
    <ul class="md-peers">${cards}</ul>
  </section>`;
}

export function render(ctx, route) {
  const m = ctx.data.model(route.key);
  return {
    title: m.display_name,
    description: ctx.t('model.description', { name: m.display_name, n: m.works.length }),
    body: stage(ctx, m) + toc(ctx, m) + programme(ctx, m) + others(ctx, m),
    styles: ['/src/styles/pages/model.css'],
    gallery: m.works.some((w) => w.images.length > 1),
  };
}
