// 分享图 (README 存图): what every 存为图片 on the site saves — one design for all of them, drawn from the data
// in the theme on screen, at 2× pixels. Top to bottom:
//   the bar      the site mark (favicon.svg), the site name and its English line; the data date on the right
//   the title    eyebrow, title, and the reading the board was in (sort, scope, cost basis); the big figures right
//   the body     a panel with the board drawn from the data (charts/art.js) or a chart (chartBody)
//   how to read  a few lines to read the image by: what the numbers mean, the marks, the legend
//   the foot     the address of the page and the GitHub repository
//
//   exportButton({ poster: () => spec, filename })     the small 存为图片 button of a panel head
//   spec = { kicker, title, subtitle, facts: [{ value, label, sub }], body: { svg, width, height } | Promise,
//            guide: [line | { mark: 'subscription' | 'api', text }], index: [{ no, text }] }
//   chartBody(liveSvg)        a live chart (D3 <svg>) cloned with its computed styles, as a body
//   BODY_W                    the width a body is drawn at; narrower bodies are centred
import { t } from '../core/i18n.js';
import { BASE, REPO } from '../core/route.js';
import { fmtDate } from '../core/format.js';
import { loadData } from '../core/data.js';
import { h } from '../core/dom.js';
import { inlineSVG } from '../core/names.js';
import { resolve } from './colors.js';
import { starPath } from './star.js';
import { fontCSS, inlineStyles, svgToPNG, saveBlob } from './export.js';
import { flashDone, toast } from '../vendor/stellar/fx.js';

const W = 1200;
const PAD = 56;
const INSET = 28;
/** The width a poster body is drawn at. */
export const BODY_W = W - PAD * 2 - INSET * 2;

export const FONT = "Saira, 'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', sans-serif";
const NS = 'http://www.w3.org/2000/svg';

/** An SVG element: svgEl('rect', { x: 1 }) / svgEl('text', attrs, 'words') */
export function svgEl(tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, String(v));
  if (text != null) e.textContent = text;
  return e;
}

/** The colours of the theme on screen, resolved (an SVG drawn as an image has no stylesheet). */
export function palette() {
  const r = (n) => resolve(n);
  return {
    paper: r('--st-paper'), panel: r('--st-panel'), ink: r('--st-ink'), ink2: r('--st-ink-2'), rule: r('--st-rule'), chip: r('--st-chip'),
    orbit: r('--st-orbit'), flare: r('--st-flare'), limeEdge: r('--lime-edge'), violetText: r('--text-violet'),
    bar: r('--st-bar'), barText: r('--st-bar-text'), barMuted: r('--st-bar-muted'), hatch: r('--st-hatch') || r('--st-rule'),
    ref: r('--ref-line'), series: r('--series'), standard: r('--kind-standard'), design: r('--kind-design'),
  };
}

let measureCtx = null;
/** Width of a line of text in the poster font. */
export function textWidth(s, size, weight = 400) {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  measureCtx.font = `${weight} ${size}px ${FONT}`;
  return measureCtx.measureText(String(s)).width;
}

/** Cut a line to a width with an ellipsis. */
export function fitText(s, width, size, weight = 400) {
  s = String(s);
  if (textWidth(s, size, weight) <= width) return s;
  while (s.length > 1 && textWidth(`${s}…`, size, weight) > width) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** Break a paragraph into lines of a width (CJK per character, Latin per word). */
function wrap(s, width, size, weight = 400) {
  const tokens = String(s).match(/[⺀-鿿＀-￯]|[^\s⺀-鿿＀-￯]+|\s+/g) ?? [];
  const lines = [];
  let line = '';
  for (const tok of tokens) {
    const next = line + tok;
    if (line && textWidth(next.trimEnd(), size, weight) > width) {
      lines.push(line.trimEnd());
      line = tok.trimStart();
    } else line = next;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

/** A line of text on its baseline. */
export function label(parent, x, y, s, { size = 14, weight = 400, fill, anchor = 'start', spacing = 0, numeric = false } = {}) {
  const e = svgEl('text', {
    x, y, fill, 'text-anchor': anchor, 'font-family': FONT, 'font-size': size, 'font-weight': weight,
    'letter-spacing': spacing || null, style: numeric ? 'font-variant-numeric:tabular-nums' : null,
  }, s);
  parent.append(e);
  return e;
}

/** The two cost-basis marks (ui/cost.js): a ring for 按订阅折算, a solid diamond for 按 API 标价. */
export function costMarkArt(parent, key, cx, cy, P) {
  if (key === 'api') parent.append(svgEl('path', { d: `M${cx} ${cy - 4.2}L${cx + 4.2} ${cy}L${cx} ${cy + 4.2}L${cx - 4.2} ${cy}Z`, fill: P.ink }));
  else parent.append(svgEl('circle', { cx, cy, r: 3.6, fill: 'none', stroke: P.ink, 'stroke-width': 1.4 }));
}

/** Compose the poster around a body. Returns { svg, width, height }. */
export async function posterSVG(spec) {
  const P = palette();
  const body = await spec.body;
  let updated = '';
  try {
    updated = (await loadData()).updated;
  } catch {}
  const out = svgEl('svg', { xmlns: NS, width: W });
  const defs = svgEl('defs');
  defs.append(svgEl('style', {}, await fontCSS()));
  const bg = svgEl('rect', { width: W, fill: P.paper });
  out.append(defs, bg);
  const waits = [];

  // ---- the bar ----
  const BAR = 76;
  out.append(svgEl('rect', { width: W, height: BAR, fill: P.bar }));
  const mark = svgEl('g');
  out.append(mark);
  waits.push(inlineSVG(mark, `${BASE}favicon.svg`, { x: PAD, y: 19, size: 38 }));
  label(out, PAD + 54, 38, t('common.site.name'), { size: 21, weight: 800, fill: P.barText });
  label(out, PAD + 54, 58, `${t('common.site.wordmark')} ${t('common.site.sub')}`.toUpperCase(), { size: 11, weight: 600, fill: P.barMuted, spacing: 2.4 });
  if (updated) label(out, W - PAD, 44, t('common.export.data', { date: fmtDate(updated) }), { size: 14, weight: 600, fill: P.barText, anchor: 'end', numeric: true });

  // ---- the title and the big figures ----
  let y = BAR + 48;
  const facts = spec.facts ?? [];
  const figW = facts.map((f) => Math.max(textWidth(f.value, 40, 800), textWidth(f.label, 14, 500), textWidth(f.sub ?? '', 12)) + 36);
  const factsW = figW.reduce((a, b) => a + b, 0);
  const leftW = W - PAD * 2 - factsW - 24;
  label(out, PAD, y, `// ${spec.kicker ?? ''}`.toUpperCase(), { size: 13, weight: 700, fill: P.violetText, spacing: 2.6 });
  label(out, PAD, y + 46, spec.title, { size: 40, weight: 800, fill: P.ink });
  const sub = wrap(spec.subtitle ?? '', leftW, 15);
  sub.forEach((line, i) => label(out, PAD, y + 80 + i * 22, line, { size: 15, fill: P.ink2 }));
  let fx = W - PAD - factsW;
  facts.forEach((f, i) => {
    label(out, fx, y + 34, f.value, { size: 40, weight: 800, fill: P.ink, numeric: true });
    label(out, fx, y + 60, f.label, { size: 14, weight: 500, fill: P.ink });
    if (f.sub) label(out, fx, y + 80, f.sub, { size: 12, fill: P.ink2 });
    fx += figW[i];
  });
  y += Math.max(96, 80 + sub.length * 22) + 26;

  // ---- the body ----
  const panelH = body.height + INSET * 2;
  out.append(svgEl('rect', { x: PAD, y, width: W - PAD * 2, height: panelH, fill: P.panel, stroke: P.rule, 'stroke-width': 1 }));
  body.svg.setAttribute('x', PAD + INSET + Math.max(0, (BODY_W - body.width) / 2));
  body.svg.setAttribute('y', y + INSET);
  body.svg.setAttribute('width', body.width);
  body.svg.setAttribute('height', body.height);
  body.svg.setAttribute('overflow', 'visible');
  out.append(body.svg);
  y += panelH + 44;

  // ---- how to read ----
  const guide = spec.guide ?? [];
  const index = spec.index ?? [];
  if (guide.length || index.length) {
    label(out, PAD, y, '// HOW TO READ', { size: 13, weight: 700, fill: P.violetText, spacing: 2.6 });
    label(out, PAD, y + 32, t('common.poster.guide'), { size: 20, weight: 800, fill: P.ink });
    y += 62;
    const textW = W - PAD * 2 - 26;
    for (const g of guide) {
      const item = typeof g === 'string' ? { text: g } : g;
      const lines = wrap(item.text, textW - (item.mark ? 16 : 0), 14);
      if (item.mark) costMarkArt(out, item.mark, PAD + 30, y - 5, P);
      else out.append(svgEl('path', { d: starPath(PAD + 6, y - 5, 6, 0.36), fill: P.flare, stroke: P.limeEdge, 'stroke-width': 1 }));
      lines.forEach((line, i) => label(out, PAD + 26 + (item.mark ? 16 : 0), y + i * 22, line, { size: 14, fill: P.ink }));
      y += lines.length * 22 + 8;
    }
    // a key of numbered items (the task numbers of a matrix), in columns
    if (index.length) {
      y += 8;
      const cols = 3;
      const colW = (W - PAD * 2) / cols;
      const per = Math.ceil(index.length / cols);
      index.forEach((it, i) => {
        const cx = PAD + Math.floor(i / per) * colW;
        const cy = y + (i % per) * 22;
        label(out, cx, cy, it.no, { size: 13, weight: 700, fill: P.violetText, numeric: true });
        label(out, cx + 30, cy, fitText(it.text, colW - 40, 13), { size: 13, fill: P.ink });
      });
      y += per * 22;
    }
    y += 22;
  }

  // ---- the foot ----
  out.append(svgEl('line', { x1: PAD, x2: W - PAD, y1: y, y2: y, stroke: P.rule, 'stroke-width': 1 }));
  label(out, PAD, y + 32, `${location.host}${location.pathname}`, { size: 13, weight: 600, fill: P.ink2 });
  label(out, W - PAD, y + 32, `GitHub  ${REPO.replace(/^https:\/\//, '')}`, { size: 13, weight: 600, fill: P.ink2, anchor: 'end' });
  y += 56;

  out.setAttribute('height', y);
  out.setAttribute('viewBox', `0 0 ${W} ${y}`);
  bg.setAttribute('height', y);
  await Promise.all(waits).catch(() => {});
  return { svg: out, width: W, height: y, updated };
}

/** A live chart (D3 <svg>) as a poster body: cloned with its computed look, scaled down to BODY_W when wider. */
export function chartBody(live) {
  const box = live.getBoundingClientRect();
  const clone = live.cloneNode(true);
  inlineStyles(live, clone);
  if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  const k = Math.min(1, BODY_W / box.width);
  return { svg: clone, width: Math.round(box.width * k), height: Math.round(box.height * k) };
}

/** The small 存为图片 button: poster() returns the spec (or a promise of it); filename may be a function. */
export function exportButton({ poster, filename, label: text = t('common.export.button') }) {
  const btn = h('button.st-btn.small.site-export', { type: 'button' }, text);
  btn.addEventListener('click', async () => {
    btn.setAttribute('aria-busy', 'true');
    try {
      const { svg, width, height, updated } = await posterSVG(await poster());
      const blob = await svgToPNG(svg, width, height, { scale: 2 });
      const name = typeof filename === 'function' ? filename() : filename;
      saveBlob(blob, `${name}${updated ? `-${updated}` : ''}.png`);
      flashDone(btn, t('common.export.saved'));
    } catch (e) {
      console.error(e);
      btn.removeAttribute('aria-busy');
      toast(t('common.export.failed'));
    }
  });
  return btn;
}
