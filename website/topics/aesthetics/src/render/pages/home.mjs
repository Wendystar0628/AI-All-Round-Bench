// 首页：一屏，不滚动。就是片头主题页那张标题卡，再加一条能点的十卷星座（质感贯穿方案 4.2，样张四）。
//   吊星从页顶垂下、点亮，身上一圈窄暖晕；
//   字标「AI审美全能」（logo/wordmark：铜版宋，「审」的屋顶开一道观测缝，锈橙星落在缝里，全屏唯一的锈橙），直接落在夜上、背后不垫东西；
//   短发丝线、AI AESTHETICS；一道倾斜的椭圆轨道套住那句话，轨道上一颗小珠；
//   一张开卷票（首屏唯一的主按钮），进卷目页；
//   十卷星座：一道低低的弧悬在地平线上方，每一颗都是一个入口；
//   地平线和小天文台，观测缝亮着朝向吊星；地平线下一行演职员表式的小字。
// 原来往下滚才看到的书摞、受测模型、评委都分到了子页（卷目、受测模型、评委），页头的四项导航直达。设计见 docs/design.md「首页」。
import { dateDots, esc } from '../context.mjs';
import { ICP, factsLine } from '../shell.mjs';
import { hangingStar, obsCard, starChart, wordmark } from '../parts.mjs';

/** 地平线上的小天文台：一座暗的圆顶剪影，观测缝亮着，一道很淡的光朝上指着吊星 */
function observatory() {
  return `<svg class="hm-dome" viewBox="0 0 120 150" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="hm-beam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ECCE96" stop-opacity=".22"/><stop offset="1" stop-color="#ECCE96" stop-opacity="0"/></linearGradient>
    </defs>
    <path d="M58 104 L62 104 L67 0 L53 0Z" fill="url(#hm-beam)"/>
    <path d="M36 150 A24 24 0 0 1 84 150Z" fill="#06070A"/>
    <path d="M30 148h60v2H30z" fill="#06070A"/>
    <path d="M40 140 A22 22 0 0 1 52 129" fill="none" stroke="rgba(214,190,150,.22)" stroke-width="1"/>
    <rect x="58.4" y="128" width="3.2" height="18" fill="#ECCE96" opacity=".85"/>
  </svg>`;
}

/** 一道倾斜的椭圆轨道（只有一根 1px 的线），轨道上停一颗小珠 */
function orbit() {
  const rx = 330, ry = 34, a = -0.5;
  const bx = (rx * Math.cos(a)).toFixed(1), by = (ry * Math.sin(a)).toFixed(1);
  return `<svg class="hm-orbit-ring" viewBox="-340 -44 680 88" aria-hidden="true" focusable="false">
    <g transform="rotate(-4.6)"><ellipse class="ring" cx="0" cy="0" rx="${rx}" ry="${ry}" pathLength="1"/><circle class="bead" cx="${bx}" cy="${by}" r="3.4"/></g>
  </svg>`;
}

export function render(ctx) {
  const facts = factsLine(ctx, 'home.facts');
  if (ctx.data.updated) facts.push(ctx.t('home.facts.updated', { date: dateDots(ctx.data.updated) }));
  const card = obsCard(ctx, {
    href: ctx.href('volumes/'), title: ctx.t('home.cta'), sub: ctx.t('home.ctaSub'), stub: ctx.t('home.ctaStub'),
    stubEn: ctx.lang === 'zh' ? 'OPEN' : '', cls: 'hm-cta',
  });
  // 天、灯、颗粒、字按 DOM 顺序叠在 .hm 这一层里（颗粒才混得到底色上）；整套构图在一块按视口高度缩放的「台」上
  const body = `<section class="hm" aria-labelledby="hm-title">
    <i class="hm-sky" aria-hidden="true"></i>
    <div class="hm-stage">
      <i class="ae-grain hm-grain" aria-hidden="true"></i>
      <div class="hm-lamp" aria-hidden="true"><i class="hm-thread"></i><span class="hm-hang">${hangingStar({ size: 30, drop: 46, glow: true })}<i class="hm-flare"></i></span></div>
      <div class="hm-card">
        <h1 id="hm-title" class="hm-mark">${wordmark(ctx)}</h1>
        <i class="hm-hair" aria-hidden="true"></i>
        <p class="hm-en" aria-hidden="true">AI AESTHETICS</p>
        <div class="hm-orbit">${orbit()}<p class="hm-about">${esc(ctx.t('home.about'))}</p></div>
        ${card}
      </div>
      <div class="hm-chart">${starChart(ctx, { arc: true })}</div>
      <div class="hm-ground">
        <i class="hm-horizon" aria-hidden="true"></i>
        ${observatory()}
        <p class="hm-facts">${facts.map(esc).join('<span aria-hidden="true">  ·  </span>')}</p>
        <a class="hm-icp" href="${ICP.url}" rel="noopener">${ICP.text}</a>
      </div>
    </div>
  </section>`;
  return { title: '', description: ctx.t('home.description'), body, styles: ['/src/styles/pages/home.css'], bare: true };
}
