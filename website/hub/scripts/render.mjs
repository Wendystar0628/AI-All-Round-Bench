// The two pages of the hub (zh at /, en at /en/), shared by the build and the dev server.
// Static parts (names, intro, footer links) are written here from site.config.mjs; the topic
// cards are drawn in the browser by src/hub.js from data/topics.json. Every URL in the page is
// relative, so the output works wherever it is served (the hub itself sits at the site root).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HUB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BENCH = resolve(HUB, '..', '..');
// vendor marks are shared by the whole platform; the font is the hub's own (fonts/), no topic's design system
export const LOGO_DIR = join(BENCH, 'platform/厂商图标/mark');
export const FONT_DIR = join(HUB, 'fonts');
export const PAGES = { zh: { path: '', root: './', alt: './en/' }, en: { path: 'en/', root: '../', alt: '../' } };

export async function loadConfig() {
  // fresh import so edits show up on the next dev request
  const url = pathToFileURL(join(HUB, 'site.config.mjs')).href + `?t=${Date.now()}`;
  return (await import(url)).default;
}

/** Logo names that have a colour version (<name>-color.svg); the others are drawn as a single-colour mask. */
export function colorLogos() {
  try {
    return readdirSync(LOGO_DIR).filter((f) => f.endsWith('-color.svg')).map((f) => f.slice(0, -'-color.svg'.length)).sort();
  } catch {
    return [];
  }
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// JSON inside <script>: no "</script>" breakout
const jsonScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

// the four-point star (tip on each axis, sides curving in), 22 x 22
export const STAR = 'M11 0Q11.72 10.28 22 11Q11.72 11.72 11 22Q10.28 11.72 0 11Q10.28 10.28 11 0Z';

// ---------- the two corner patches of star chart (drawn once at build, the same every time) ----------

const n1 = (v) => Math.round(v * 10) / 10;
function star(x, y, R, waist) {
  const k = (waist / Math.SQRT2 - 0.25) * 2 * R;
  return `M${n1(x)} ${n1(y - R)}q${n1(k)} ${n1(R - k)} ${n1(R)} ${n1(R)}q${n1(k - R)} ${n1(k)} ${n1(-R)} ${n1(R)}q${n1(-k)} ${n1(k - R)} ${n1(-R)} ${n1(-R)}q${n1(R - k)} ${n1(-k)} ${n1(R)} ${n1(-R)}z`;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// magnitude classes: share of the stars, tip radius, waist
const CLASSES = [
  { share: 0.05, r: 3.4, w: 0.3 },
  { share: 0.13, r: 2.3, w: 0.34 },
  { share: 0.32, r: 1.6, w: 0.4 },
  { share: 0.5, r: 1.1, w: 0.44 },
];
/** a patch w x h anchored at a corner (cx, cy): stars thicker towards the corner, declination arcs round it,
 *  and two short figures joining a few of the brighter stars */
function patch(w, h, cx, cy, count, seed) {
  const r = rng(seed);
  const stars = [];
  for (let guard = 0; stars.length < count && guard < count * 60; guard++) {
    const fx = r() ** 1.35;
    const fy = r() ** 1.35;
    const x = cx ? w - fx * w : fx * w;
    const y = cy ? h - fy * h : fy * h;
    if (stars.some((s) => Math.hypot(s.x - x, s.y - y) < 16)) continue;
    let pick = r();
    const c = CLASSES.find((k) => (pick -= k.share) < 0) ?? CLASSES[3];
    stars.push({ x, y, ...c });
  }
  const arcs = [0.42, 0.6, 0.8].map((f) => {
    const R = f * Math.max(w, h);
    const a = { x: cx ? w - R : R, y: cy ? h : 0 };
    const b = { x: cx ? w : 0, y: cy ? h - R : R };
    return `<path class="c-arc" d="M${n1(a.x)} ${n1(a.y)}A${n1(R)} ${n1(R)} 0 0 ${cx === cy ? 1 : 0} ${n1(b.x)} ${n1(b.y)}"/>`;
  });
  const bright = stars.filter((s) => s.r >= 1.6);
  const figure = (from) => {
    const path = [from];
    while (path.length < 5) {
      const last = path[path.length - 1];
      const next = bright.filter((s) => !path.includes(s)).sort((a, b) => Math.hypot(a.x - last.x, a.y - last.y) - Math.hypot(b.x - last.x, b.y - last.y))[0];
      if (!next || Math.hypot(next.x - last.x, next.y - last.y) > w * 0.22) break;
      path.push(next);
    }
    return path.length > 2 ? `<path class="c-line" d="M${path.map((s) => `${n1(s.x)} ${n1(s.y)}`).join('L')}"/>` : '';
  };
  const lines = bright.length > 6 ? [figure(bright[1]), figure(bright[Math.floor(bright.length / 2)])] : [];
  const marks = stars.map((s) => `<path class="c-star" d="${star(s.x, s.y, s.r, s.w)}"/>`).join('');
  return `${arcs.join('')}${lines.join('')}${marks}`;
}
const CORNER_TR = patch(704, 480, 1, 0, 64, 20261122);
const CORNER_BL = patch(480, 320, 0, 1, 34, 1122);

/**
 * @param {'zh'|'en'} lang
 * @param {object} cfg   site.config.mjs
 * @param {object} [v]   cache-busting versions { css, js, icon } (build only)
 */
export function renderPage(lang, cfg, v = {}) {
  const { root, alt } = PAGES[lang];
  const T = cfg.text[lang];
  const en = lang === 'en';
  const name = en ? cfg.name_en : cfg.name;
  const intro = en ? cfg.intro_en : cfg.intro;
  const q = (k) => (v[k] ? `?v=${v[k]}` : '');
  // Before the first paint: the theme the visitor chose (localStorage "theme", shared with the topic sites; ?theme= wins),
  // the entrance (only when motion is welcome; a timer lifts it if the script never runs), the request for the topic
  // cards (started here so they are in before the plate opens), and the language:
  // first visit goes to the language chosen before (localStorage octa.lang), else the browser's;
  // not when arriving from inside the site or with ?stay
  const pre = `(function(){var d=document.documentElement,here=${JSON.stringify(lang)},alt=${JSON.stringify(alt)},q;try{q=new URLSearchParams(location.search)}catch(e){q=null}
try{var a=q&&q.get('theme'),t=localStorage.getItem('theme');if(a==='light'||a==='dark')d.setAttribute('data-theme',a);else if(t==='light'||t==='dark')d.setAttribute('data-theme',t)}catch(e){}
try{if(matchMedia('(prefers-reduced-motion: no-preference)').matches&&!(q&&q.has('still'))){d.classList.add('is-entering');window.__hubT0=performance.now();setTimeout(function(){d.classList.remove('is-entering')},4000)}}catch(e){}
try{window.__hubData=fetch(${JSON.stringify(root + 'data/topics.json')},{cache:'no-cache'});window.__hubData.catch(function(){})}catch(e){}
try{var p=localStorage.getItem('octa.lang'),inside=false;try{inside=!!document.referrer&&new URL(document.referrer).origin===location.origin}catch(e){}
if(p!=='zh'&&p!=='en'){p=/^zh/i.test(navigator.language||'')?'zh':'en';localStorage.setItem('octa.lang',p)}
if(p!==here&&!inside&&!(q&&q.has('stay')))location.replace(alt+location.search+location.hash)}catch(e){}})();`;
  const runtime = { lang, text: T, colorLogos: colorLogos() };
  const langLink = (l, label, href) =>
    `<a class="chip" href="${href}" hreflang="${l === 'en' ? 'en' : 'zh-CN'}" lang="${l === 'en' ? 'en' : 'zh-CN'}" data-lang-switch="${l}"${l === lang ? ' aria-current="true"' : ''}>${label}</a>`;
  // the wordmark: a solid ink line and a violet outlined line
  const [solid, hollow] = en ? cfg.wordmark_en : [cfg.name, cfg.name_en];
  const wordmark = en
    ? `<h1 class="wm" aria-label="${esc(name)}"><span class="wm-solid" aria-hidden="true">${esc(solid)}</span><span class="wm-hollow" aria-hidden="true">${esc(hollow)}</span></h1>
        <p class="wm-other" lang="zh-CN">${esc(cfg.name)}</p>`
    : `<h1 class="wm"><span class="wm-solid">${esc(solid)}</span></h1>
        <p class="wm-hollow" lang="en">${esc(hollow)}</p>`;

  return `<!doctype html>
<html lang="${en ? 'en' : 'zh-CN'}" data-lang="${lang}" data-root="${root}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(name)}</title>
    <meta name="description" content="${esc(intro)}" />
    <meta name="color-scheme" content="light dark" />
    <meta name="theme-color" content="#f2f1f6" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#121019" media="(prefers-color-scheme: dark)" />
    <link rel="icon" type="image/svg+xml" href="${root}favicon.svg${q('icon')}" />
    <link rel="alternate" hreflang="zh-CN" href="/" />
    <link rel="alternate" hreflang="en" href="/en/" />
    <script>${pre}</script>
    <link rel="preload" href="${root}fonts/Saira.ttf" as="font" type="font/ttf" crossorigin />
    <link rel="stylesheet" href="${root}hub.css${q('css')}" />
    <script type="application/json" id="hub-data">${jsonScript(runtime)}</script>
    <script type="module" src="${root}hub.js${q('js')}"></script>
  </head>
  <body>
    <a class="skip" href="#topics">${esc(T.skip)}</a>
    <div class="strip" aria-hidden="true"><i></i><i></i><i></i></div>
    <svg class="corner corner-tr" viewBox="0 0 704 480" preserveAspectRatio="xMaxYMin slice" aria-hidden="true" focusable="false">${CORNER_TR}</svg>
    <svg class="corner corner-bl" viewBox="0 0 480 320" preserveAspectRatio="xMinYMax slice" aria-hidden="true" focusable="false">${CORNER_BL}</svg>
    <header class="mast">
      <div class="bar">
        <span class="brand" aria-hidden="true"><svg viewBox="0 0 32 32"><path class="brand-block" d="M0 0H32V24L24 32H0Z"/><path class="brand-star" transform="translate(5 5)" d="${STAR}"/></svg></span>
        <p class="fields" data-slot="fields"></p>
        <div class="tools">
          <button class="chip theme-toggle" type="button" data-theme-toggle><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25"/><path d="M8 1.75a6.25 6.25 0 0 1 0 12.5Z"/></svg><span>${esc(T.theme)}</span></button>
          <nav class="lang" aria-label="${esc(T.langLabel)}">${langLink('zh', '中', en ? alt : root)}${langLink('en', 'EN', en ? root : alt)}</nav>
        </div>
      </div>
      <div class="hero">
        <div class="wm-block">
        ${wordmark}
        </div>
        <p class="hero-intro">${esc(intro)}</p>
      </div>
    </header>
    <main id="topics" tabindex="-1">
      <h2 class="sr-only">${esc(T.topics)}</h2>
      <div class="ruler" aria-hidden="true"><svg class="ruler-star" viewBox="0 0 22 22"><path d="${STAR}"/></svg></div>
      <div class="atlas">
        <div class="atlas-shadow" aria-hidden="true"></div>
        <div class="plate">
          <svg class="plate-sky" aria-hidden="true" focusable="false"></svg>
          <ol class="topics" data-slot="topics" aria-busy="true"></ol>
        </div>
      </div>
    </main>
    <footer class="foot">
      <p class="foot-name">${esc(name)}<span class="foot-date" data-slot="updated"></span></p>
      <p class="foot-links"><a href="${esc(cfg.repo)}" target="_blank" rel="noopener">${esc(T.repo)}</a><a href="${esc(cfg.videos)}" target="_blank" rel="noopener">${esc(T.videos)}</a><a href="${esc(cfg.icp?.url)}" target="_blank" rel="noopener">${esc(cfg.icp?.text)}</a></p>
    </footer>
  </body>
</html>
`;
}

/** Folder the page data comes from (site project contract, website/README.md). ONESHOT_SITE_DATA_DIR when set;
 *  else dev: data-local/ when it has topics.json, else data/. Build never reads data-local/. */
export function dataDir({ dev }) {
  const fixed = process.env.ONESHOT_SITE_DATA_DIR?.trim();
  if (fixed) return resolve(HUB, fixed);
  const local = join(HUB, 'data-local');
  if (dev && existsSync(join(local, 'topics.json'))) return local;
  return join(HUB, 'data');
}

export const read = (f) => readFileSync(f);
