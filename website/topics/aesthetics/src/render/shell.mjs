// 页面骨架：<head>（语言跳转的前置脚本、字体占位、样式）、页头、页脚、厂商图标、看图器。
// 页面模块只交 { title, description, body, styles, script, gallery, bare } 给 documentHTML()；bare 为真时不画页脚（首页一屏）。
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fontNames } from '../../scripts/fonts.mjs';
import { dateDots, esc, pad2 } from './context.mjs';
import { hangingStar, lightbox, notice, wordmark } from './parts.mjs';

const logoDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'logos');
export const REPO = 'https://github.com/Wendystar0628/AI-All-Round-Bench';
export const ICP = { text: '蜀ICP备2025171371号-1', url: 'https://beian.miit.gov.cn/' };

/** 页头导航：像一本书的目录，罗马数字 + 中文 + 小号英文。题目页属于「卷目」，型号页属于「设计师」 */
export const NAV = [
  { key: 'volumes', no: 'I', path: 'volumes/', pages: ['volumes', 'task'] },
  { key: 'observers', no: 'II', path: 'models/', pages: ['observers', 'model'] },
  { key: 'judges', no: 'III', path: 'judges/', pages: ['judges'] },
  { key: 'votes', no: 'IV', path: 'votes/', pages: ['votes'] },
  { key: 'about', no: 'V', path: 'about/', pages: ['about'] },
];

/** 语言：中文在根路径、英文在 en/；选择记在 localStorage 的 octa.lang（总站和各专题共用）。
 *  第一次访问按浏览器语言；从站内点过来、或地址带 ?stay 时不跳。顺带记下这是不是本次访问的第一页（首页的开场动效只在第一页放）。 */
function preScript(ctx) {
  return `(function(){var d=document.documentElement,here=${JSON.stringify(ctx.lang)},alt=${JSON.stringify(ctx.alt)},q;d.className=d.className.replace('no-js','js');
try{q=new URLSearchParams(location.search)}catch(e){q=null}
try{var p=localStorage.getItem('octa.lang'),inside=false;try{inside=!!document.referrer&&new URL(document.referrer).origin===location.origin}catch(e){}
if(p!=='zh'&&p!=='en'){p=/^zh/i.test(navigator.language||'')?'zh':'en';localStorage.setItem('octa.lang',p)}
if(p!==here&&!inside&&!(q&&q.has('stay')))location.replace(alt+location.search+location.hash)}catch(e){}
try{if(!sessionStorage.getItem('ae.seen')){d.classList.add('is-first');sessionStorage.setItem('ae.seen','1')}}catch(e){}})();`;
}

/** 语言切换「中 / EN」：页头、目录页和页脚各一处 */
export function langSwitch(ctx, cls) {
  const zh = ctx.lang === 'zh' ? ctx.hrefIn('zh', ctx.route.path) : ctx.alt;
  const en = ctx.lang === 'en' ? ctx.hrefIn('en', ctx.route.path) : ctx.alt;
  return `<div class="${cls}" role="group" aria-label="${esc(ctx.t('common.lang.label'))}">
      <a href="${esc(zh)}" hreflang="zh-CN" lang="zh-CN" data-lang-switch="zh"${ctx.lang === 'zh' ? ' aria-current="true"' : ''}>中</a><span aria-hidden="true">/</span><a href="${esc(en)}" hreflang="en" lang="en" data-lang-switch="en"${ctx.lang === 'en' ? ' aria-current="true"' : ''}>EN</a>
    </div>`;
}

/** 导航的四项：一个链接里是罗马数字、中文和小号英文（英文页只写英文）。drop 为真时（页头），「卷目」带一张悬停展开的十卷目录 */
function navItems(ctx, cls, drop = false) {
  const page = ctx.route.page;
  return NAV.map((n) => {
    const cur = n.pages.includes(page) ? ` aria-current="${page === n.pages[0] ? 'page' : 'true'}"` : '';
    const en = ctx.lang === 'zh' ? `<small aria-hidden="true">${esc(ctx.t(`common.nav.${n.key}En`))}</small>` : '';
    const a = `<a class="${cls}" href="${esc(ctx.href(n.path))}"${cur}><i class="r" aria-hidden="true">${n.no}</i><span class="cn">${esc(ctx.t(`common.nav.${n.key}`))}</span>${en}</a>`;
    return drop && n.key === 'volumes' ? `<div class="ae-nav-vol">${a}${volumeDrop(ctx)}</div>` : a;
  }).join('');
}

/** 「卷目」悬停或键盘聚焦时展开的十卷目录：每行 编号（这一卷的点亮色）· 题名 · 方向简称，点了直达那一卷；正在看的那一卷标出来 */
function volumeDrop(ctx) {
  const cats = ctx.data.categories ?? [];
  if (!cats.length) return '';
  const here = ctx.route.page === 'task' ? ctx.route.key : null;
  const rows = cats.map((c) => {
    const e = c.lead;
    const cur = e.key === here ? ' aria-current="page"' : '';
    const state = c.upcoming ? ' is-upcoming' : c.clouded ? ' is-clouded' : '';
    return `<a class="ae-vd-item${state}" href="${esc(ctx.href(e.path))}" style="--lit:${esc(c.skin.lit)}"${cur}><i class="no" aria-hidden="true">${pad2(c.no)}</i><span class="t">${esc(ctx.nameOf(e))}</span><small class="c">${esc(ctx.shortOf(c))}</small></a>`;
  }).join('');
  return `<div class="ae-vd"><div class="ae-vd-card">
      <p class="ae-vd-head" aria-hidden="true"><span>${esc(ctx.t('common.nav.dropHead'))}</span><i></i><span class="en">TEN VOLUMES</span></p>
      ${rows}
    </div></div>`;
}

/** 左上：「AI全能测评 ╱ AI审美全能」。后半中文页是字标的小字号形态（logo/wordmark），英文页是 Bodoni 的 AI Aesthetics；点了回首页 */
function brand(ctx) {
  const name = ctx.lang === 'zh'
    ? wordmark(ctx, { form: 'small' })
    : '<span class="ai">AI</span> <span class="en">Aesthetics</span>';
  return `<div class="ae-brand">
      <a class="ae-hub" href="${ctx.hub}" title="${esc(ctx.t('common.shell.hubTitle'))}">${esc(ctx.t('common.shell.hub'))}</a>
      <i class="ae-brand-slash" aria-hidden="true"></i>
      <a class="ae-home" href="${esc(ctx.href(''))}" title="${esc(ctx.t('common.shell.homeTitle'))}">${name}</a>
    </div>`;
}

/** 页头的 GitHub 链接：题面、作答归档和全部代码都在仓库里 */
function repoLink(ctx, cls) {
  const mark = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';
  return `<a class="${cls}" href="${REPO}" rel="noopener" target="_blank">${mark}<span>${esc(ctx.t('common.footer.repo'))}</span></a>`;
}

function header(ctx) {
  return `<header class="ae-head">
    ${brand(ctx)}
    <nav class="ae-nav" aria-label="${esc(ctx.t('common.nav.label'))}">${navItems(ctx, 'ae-nav-item', true)}</nav>
    ${repoLink(ctx, 'ae-repo')}
    ${langSwitch(ctx, 'ae-lang')}
    <details class="ae-menu">
      <summary class="ae-menu-btn"><span class="open">${esc(ctx.t('common.shell.menu'))}</span><span class="close">${esc(ctx.t('common.shell.menuClose'))}</span></summary>
      <div class="ae-menu-sheet">
        <nav class="ae-menu-nav" aria-label="${esc(ctx.t('common.nav.label'))}">${navItems(ctx, 'ae-menu-item')}</nav>
        ${repoLink(ctx, 'ae-repo ae-menu-repo')}
        ${langSwitch(ctx, 'ae-lang ae-menu-lang')}
      </div>
    </details>
  </header>`;
}

/** 演职员表式的一行数目：为 0 的不写（正式发布暂停公示时没有型号和作品） */
export function factsLine(ctx, ns) {
  const { counts, updated } = ctx.data;
  return [
    ctx.t(`${ns}.categories`, { n: counts.categories }),
    counts.models ? ctx.t(`${ns}.models`, { n: counts.models }) : '',
    counts.judges ? ctx.t(`${ns}.judges`, { n: counts.judges }) : '',
    counts.works ? ctx.t(`${ns}.works`, { n: counts.works }) : '',
  ].filter(Boolean);
}

/** 页脚：海报最底下的那一行。长页面读到底也能去别的地方、换语言、回总站，不用滚回页顶 */
function footer(ctx) {
  const facts = factsLine(ctx, 'common.footer');
  if (ctx.data.updated) facts.unshift(ctx.t('common.footer.updated', { date: dateDots(ctx.data.updated) }));
  const links = [
    ...NAV.map((n) => [ctx.href(n.path), ctx.t(`common.nav.${n.key}`)]),
    [ctx.hub, ctx.t('common.footer.hub')],
  ].map(([href, text]) => `<a href="${esc(href)}">${esc(text)}</a>`).join('');
  return `<footer class="ae-foot">
    <div class="ae-foot-mark">${hangingStar({ size: 20, drop: 30, glow: true, cls: 'ae-foot-star' })}${wordmark(ctx, { en: true, form: 'small' })}</div>
    <p class="ae-foot-line">${esc(ctx.t('common.footer.line'))}</p>
    <nav class="ae-foot-links" aria-label="${esc(ctx.t('common.footer.linksLabel'))}">${links}<a href="${REPO}" rel="noopener">${esc(ctx.t('common.footer.repo'))}</a></nav>
    ${langSwitch(ctx, 'ae-lang ae-foot-lang')}
    <p class="ae-foot-facts">${facts.map(esc).join('<span aria-hidden="true">  ·  </span>')}</p>
    <p class="ae-foot-note">${esc(ctx.t('common.footer.fonts', { list: fontNames(ctx.lang) }))}<br>${esc(ctx.t('common.footer.logos'))}</p>
    <p class="ae-foot-note"><a class="ae-foot-icp" href="${ICP.url}" rel="noopener">${ICP.text}</a></p>
  </footer>`;
}

/** 本页用到的厂商图标，各放一份 <symbol>（单色，颜色跟文字）。图标文件缺了（新厂商还没收进 assets/厂商图标/mark）就不画这一个，照常出页 */
const warned = new Set();
function logoSprite(names) {
  const symbols = [...names].sort().flatMap((name) => {
    const file = join(logoDir, `${name}.svg`);
    if (!existsSync(file)) {
      if (!warned.has(name)) console.warn(`[site] 厂商图标缺文件：assets/厂商图标/mark/${name}.svg，页面上先不画这个图标`);
      warned.add(name);
      return [];
    }
    const svg = readFileSync(file, 'utf8');
    const box = svg.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 24 24';
    const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title>[\s\S]*?<\/title>/, '');
    return [`<symbol id="ae-logo-${esc(name)}" viewBox="${box}"><g fill="currentColor" fill-rule="evenodd">${inner}</g></symbol>`];
  });
  return symbols.length ? `<svg class="ae-sprite" aria-hidden="true" focusable="false">${symbols.join('')}</svg>` : '';
}

/**
 * 拼一整页。page = { title, description, body, styles: ['/src/styles/pages/home.css'], script: '/src/client/home.js', gallery, bare }
 * title 只写本页的名字（首页不写），这里补上站名。
 */
export function documentHTML(ctx, page) {
  const site = ctx.t('common.site.name');
  const title = page.title ? `${page.title} │ ${site}` : site;
  const body = page.body;                     // 先画正文，图标才收齐
  const top = header(ctx);
  const bottom = page.bare ? '' : footer(ctx);
  const styles = ['/src/styles/site.css', ...(page.styles ?? [])].map((s) => `<link rel="stylesheet" href="${s}">`).join('\n  ');
  return `<!doctype html>
<html lang="${ctx.lang === 'en' ? 'en' : 'zh-CN'}" class="no-js">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(page.description || ctx.t('home.description'))}">
  <meta name="color-scheme" content="dark">
  <meta name="theme-color" content="#0B0D11">
  <link rel="icon" type="image/svg+xml" href="/src/vendor/design/logo/favicon.svg">
  <link rel="alternate" hreflang="zh-CN" href="${esc(ctx.hrefIn('zh', ctx.route.path))}">
  <link rel="alternate" hreflang="en" href="${esc(ctx.hrefIn('en', ctx.route.path))}">
  <script>${preScript(ctx)}</script>
  <!--@fonts-->
  ${styles}
</head>
<body data-page="${esc(ctx.route.page)}"${ctx.data.notice ? ' class="has-notice"' : ''}>
  <a class="ae-skip" href="#main">${esc(ctx.t('common.shell.skip'))}</a>
  ${top}
  ${notice(ctx)}
  <main id="main" tabindex="-1">${body}</main>
  ${bottom}
  ${page.gallery ? lightbox(ctx) : ''}
  ${logoSprite(ctx.logos)}
  <script type="module" src="${page.script ?? '/src/client/site.js'}"></script>
</body>
</html>
`;
}
