// 每画一页新建一个 ctx：语言、文案、链接和媒体地址、本页用到的厂商图标。页面和部件只经过它拿这些东西。
//
//   ctx.lang                 'zh' | 'en'
//   ctx.t('home.hero.cta', {n})   界面文案，src/i18n/<lang>/<命名空间>.json；英文缺的退回中文。
//                            值可以写成 {one, other}，按 vars.n（或 vars.count）选单复数
//   ctx.raw('votes')         原样的文案子树（英文缺的退回中文），写进页面给浏览器脚本用
//   ctx.L({zh, en})          数据里的双语字段；ctx.nameOf(x) 取 name / name_en；ctx.shortOf(cat) 取方向的简称
//   ctx.href('tasks/x/')     站内链接（自动加站内根路径和 en/）；ctx.alt 是本页另一种语言的地址
//   ctx.media('media/…')     数据目录里文件的地址：<根>data/<路径>?v=<版本>
//   ctx.logo('openai')       厂商图标：返回 <svg><use>，图形本身由页面骨架在页尾放一份
//   ctx.uid('t')             本页唯一的 id（SVG 渐变、题名字形用）
//   ctx.votesApi             票箱接口：<源>/api/votes/v1/<专题>/，源是构建时的 ONESHOT_VOTES_API（开发服务器为空，即同源）
//   ctx.data                 data.mjs 派生的数据
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const i18nDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'i18n');

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** 日期写成 2026.11.24 */
export const dateDots = (d) => (d ? String(d).slice(0, 10).replace(/-/g, '.') : '');

/** 两位编号：方向、图版（01、02……） */
export const pad2 = (n) => String(n).padStart(2, '0');

/** 下载包大小：不到 1 MB 写 KB，否则一位小数的 MB */
export function fmtBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function loadStrings(lang) {
  const out = {};
  const dir = join(i18nDir, lang);
  for (const ns of ['common', 'home', 'volumes', 'observers', 'judges', 'votes', 'about', 'task', 'model']) {
    const file = join(dir, `${ns}.json`);
    out[ns] = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  }
  return out;
}

export function makeContext({ data, lang, base, route, votesOrigin = '' }) {
  const strings = { zh: loadStrings('zh'), en: lang === 'en' ? loadStrings('en') : null };
  const rules = new Intl.PluralRules(lang === 'en' ? 'en' : 'zh-CN');
  const get = (obj, path) => path.split('.').reduce((o, p) => (o == null ? undefined : o[p]), obj);
  const pick = (v, n) => (v && typeof v === 'object' && typeof v.other === 'string' ? (Number.isFinite(+n) ? v[rules.select(+n)] ?? v.other : v.other) : v);

  const t = (key, vars = {}) => {
    const n = vars.n ?? vars.count;
    let v = lang === 'en' ? pick(get(strings.en, key), n) : undefined;
    if (typeof v !== 'string') v = pick(get(strings.zh, key), n);
    if (typeof v !== 'string') throw new Error(`界面文案里没有 ${key}（src/i18n/zh/${key.split('.')[0]}.json）`);
    return v.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  };
  // 原样的文案（一个字符串、{one, other}，或一整个子树），英文缺的那几条退回中文：给浏览器脚本用（parts.mjs votesConfig）
  const isPlural = (v) => v && typeof v === 'object' && typeof v.other === 'string';
  const merge = (zh, en) => {
    if (en === undefined) return zh;
    if (!zh || typeof zh !== 'object' || isPlural(zh) || !en || typeof en !== 'object' || isPlural(en)) return en;
    const out = { ...zh };
    for (const [k, v] of Object.entries(en)) out[k] = merge(zh[k], v);
    return out;
  };
  const raw = (key) => merge(get(strings.zh, key), lang === 'en' ? get(strings.en, key) : undefined);
  const L = (o) => (o == null ? '' : typeof o === 'string' ? o : (lang === 'en' ? o.en || o.zh : o.zh || o.en) ?? '');
  const nameOf = (x) => (x ? (lang === 'en' ? x.name_en || x.name : x.name) : '');
  const shortOf = (c) => (c ? (lang === 'en' ? c.short_en || c.name_en || c.name : c.short || c.name) : '');
  const href = (path = '') => base + (lang === 'en' ? 'en/' : '') + String(path).replace(/^\//, '');
  const hrefIn = (l, path = '') => base + (l === 'en' ? 'en/' : '') + String(path).replace(/^\//, '');
  const media = (path) => `${base}data/${path}?v=${data.ver(path)}`;

  const logos = new Set();
  const logo = (name, cls = 'ae-logo') => {
    logos.add(name);
    return `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#ae-logo-${esc(name)}"/></svg>`;
  };
  let n = 0;
  const uid = (p = 'u') => `${p}${++n}`;

  return {
    lang, base, route, data, t, raw, L, nameOf, shortOf, href, hrefIn, media, logo, logos, uid, esc,
    votesApi: votesOrigin + data.votes.path,
    alt: hrefIn(lang === 'en' ? 'zh' : 'en', route.path),
    hub: lang === 'en' ? '/en/' : '/',
  };
}
