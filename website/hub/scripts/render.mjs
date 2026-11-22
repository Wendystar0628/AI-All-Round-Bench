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
export const LOGO_DIR = join(BENCH, '平台/厂商图标/mark');
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
  const other = en ? cfg.name : cfg.name_en;
  const intro = en ? cfg.intro_en : cfg.intro;
  const q = (k) => (v[k] ? `?v=${v[k]}` : '');
  // first visit: the language the visitor chose before (shared with the topic sites: localStorage octa.lang),
  // else the browser's; not when arriving from inside the site or with ?stay
  const pre = `(function(){var here=${JSON.stringify(lang)},alt=${JSON.stringify(alt)},q;try{q=new URLSearchParams(location.search)}catch(e){q=null}
try{var p=localStorage.getItem('octa.lang'),inside=false;try{inside=!!document.referrer&&new URL(document.referrer).origin===location.origin}catch(e){}
if(p!=='zh'&&p!=='en'){p=/^zh/i.test(navigator.language||'')?'zh':'en';localStorage.setItem('octa.lang',p)}
if(p!==here&&!inside&&!(q&&q.has('stay')))location.replace(alt+location.search+location.hash)}catch(e){}})();`;
  const runtime = { lang, text: T, colorLogos: colorLogos() };
  const langLink = (l, label, href) =>
    `<a href="${href}" hreflang="${l === 'en' ? 'en' : 'zh-CN'}" lang="${l === 'en' ? 'en' : 'zh-CN'}" data-lang-switch="${l}"${l === lang ? ' aria-current="true"' : ''}>${label}</a>`;

  return `<!doctype html>
<html lang="${en ? 'en' : 'zh-CN'}" data-lang="${lang}" data-root="${root}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(name)}</title>
    <meta name="description" content="${esc(intro)}" />
    <meta name="color-scheme" content="light" />
    <meta name="theme-color" content="#f4f5f7" />
    <link rel="icon" type="image/svg+xml" href="${root}favicon.svg${q('icon')}" />
    <link rel="alternate" hreflang="zh-CN" href="/" />
    <link rel="alternate" hreflang="en" href="/en/" />
    <script>${pre}</script>
    <link rel="stylesheet" href="${root}hub.css${q('css')}" />
    <script type="application/json" id="hub-data">${jsonScript(runtime)}</script>
    <script type="module" src="${root}hub.js${q('js')}"></script>
  </head>
  <body>
    <a class="skip" href="#topics">${esc(T.skip)}</a>
    <header class="mast">
      <div class="mast-bar">
        <span class="mast-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="currentColor"/><path d="M8 23V17M13 23V11M18 23V14M23 23V8" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg></span>
        <nav class="lang" aria-label="${esc(T.langLabel)}">${langLink('zh', '中', en ? alt : root)}<span aria-hidden="true">/</span>${langLink('en', 'EN', en ? root : alt)}</nav>
      </div>
      <h1 class="mast-name">${esc(name)}</h1>
      <p class="mast-other" lang="${en ? 'zh-CN' : 'en'}">${esc(other)}</p>
      <p class="mast-intro">${esc(intro)}</p>
      <div class="ruler" aria-hidden="true"></div>
    </header>
    <main id="topics" tabindex="-1">
      <h2 class="sr-only">${esc(T.topics)}</h2>
      <ol class="topics" data-slot="topics" aria-busy="true"></ol>
    </main>
    <footer class="foot">
      <p class="foot-name">${esc(name)}<span class="foot-date" data-slot="updated"></span></p>
      <p class="foot-links"><a href="${esc(cfg.repo)}" target="_blank" rel="noopener">${esc(T.repo)}</a><a href="${esc(cfg.icp?.url)}" target="_blank" rel="noopener">${esc(cfg.icp?.text)}</a></p>
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
