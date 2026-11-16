// Boards drawn from the data for the posters (charts/poster.js), not copied from the page: every model of the board,
// one row each, in the same marks as the site (bars on the fixed 0–100 scale, the cyan pass line, the flare star and
// highlight of the best, the dashed 评测中 tag and the hatch of a missing score, the cost-basis marks).
//
//   rankingArt({ rows, cols, heads, kind, pass })   → Promise<{ svg, width, height }>
//     rows: [{ model, rank, value, best, note, cells: { <col key>: { text, mark?, best? } } }]   (rank null = 评测中)
//     cols: [{ key, label, width, sorted: 'asc' | 'desc' }]   extra columns after the score, right-aligned
//     heads: { rank, name, score, scoreSorted }               kind: 'series' | 'standard' | 'design' (bar colour)
//   matrixArt({ rows, groups, cols })                → Promise<{ svg, width, height }>
//     cols: [{ key, head, kind, last }]   groups: [{ name, span }] (one per category, over its task columns)
//     rows: [{ model, rank, cells: { <col key>: { value, mark, best } } }]
import { t } from '../core/i18n.js';
import { iconURL, hasColorLogo, inlineSVG } from '../core/names.js';
import { starPath } from './star.js';
import { stepFill, stepInk, resolve } from './colors.js';
import { BODY_W, palette, svgEl, label, fitText, textWidth, costMarkArt } from './poster.js';

const ROW = 34;
const HEAD = 38;
const RANK_W = 50;
const ICON_W = 28;
const NAME_W = 248;
const SCORE_W = 66;
const GRID = [20, 40, 80];

let seq = 0;
/** A hatch pattern (missing scores) in the art's own defs; returns its fill. */
function hatch(svg, P) {
  const id = `art-hatch-${++seq}`;
  const p = svgEl('pattern', { id, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
  p.append(svgEl('rect', { width: 6, height: 6, fill: P.chip }), svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: P.hatch, 'stroke-width': 2 }));
  const defs = svgEl('defs');
  defs.append(p);
  svg.append(defs);
  return `url(#${id})`;
}

/** The vendor mark at (x, y): colour logos keep their colours, mono ones take the ink. */
function vendorMark(parent, model, x, y, size, P) {
  const g = svgEl('g', { color: P.ink });
  parent.append(g);
  return inlineSVG(g, iconURL.vendor(model.logo), { x, y, size }).then((s) => hasColorLogo(model.logo) || s.setAttribute('fill', 'currentColor'));
}

/** Name and (effort) of a model at baseline y, cut to width. */
function nameArt(parent, model, x, y, width, P) {
  const effort = model.effort ? `(${model.effort})` : '';
  const ew = effort ? textWidth(effort, 12) + 6 : 0;
  const name = fitText(model.name, width - ew, 15, 600);
  label(parent, x, y, name, { size: 15, weight: 600, fill: P.ink });
  if (effort) label(parent, x + textWidth(name, 15, 600) + 6, y, effort, { size: 12, fill: P.ink2 });
}

/** The dashed 评测中 tag (or another short state) in a cell. */
function stateTag(parent, x, cy, text, P) {
  const w = textWidth(text, 11, 600) + 10;
  parent.append(svgEl('rect', { x: x + 0.5, y: cy - 9.5, width: w, height: 19, fill: 'none', stroke: P.ink2, 'stroke-width': 1, 'stroke-dasharray': '3 2' }));
  label(parent, x + 5, cy + 4, text, { size: 11, weight: 600, fill: P.ink2 });
}

/** The flare highlight behind a best figure, right-aligned at x. */
function bestFigure(parent, xRight, cy, text, size, P) {
  const w = textWidth(text, size, 700) + 10;
  parent.append(svgEl('rect', { x: xRight - w + 4, y: cy - size * 0.72, width: w, height: size * 1.44, fill: P.flare }));
  label(parent, xRight, cy + size * 0.36, text, { size, weight: 700, fill: P.limeEdge, anchor: 'end', numeric: true });
}

const arrow = (dir) => (dir === 'asc' ? ' ↑' : dir === 'desc' ? ' ↓' : '');

export async function rankingArt({ rows, cols = [], heads = {}, kind = 'series', pass = true, width = BODY_W }) {
  const P = palette();
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${HEAD + rows.length * ROW}` });
  const fillHatch = hatch(svg, P);
  const colsW = cols.reduce((a, c) => a + c.width, 0);
  const x = { rank: 0, icon: RANK_W, name: RANK_W + ICON_W + 6, bar: RANK_W + ICON_W + 6 + NAME_W + 16 };
  const barW = width - x.bar - 16 - SCORE_W - colsW;
  x.score = x.bar + barW + 16 + SCORE_W;
  const H = HEAD + rows.length * ROW;
  const bx = (v) => x.bar + (barW * Math.max(0, Math.min(100, v))) / 100;
  const barFill = kind === 'design' ? P.design : kind === 'standard' ? P.standard : P.series;

  // head: labels, the 0–100 axis over the bars, the sorted column's arrow
  label(svg, x.rank, 24, heads.rank ?? t('common.csv.rank'), { size: 12, weight: 600, fill: P.ink2 });
  label(svg, x.name, 24, heads.name ?? t('common.csv.model'), { size: 12, weight: 600, fill: P.ink2 });
  for (const v of [0, 20, 40, 60, 80, 100]) label(svg, bx(v), 24, String(v), { size: 11, fill: v === 60 && pass ? P.ref : P.ink2, anchor: v === 0 ? 'start' : v === 100 ? 'end' : 'middle', numeric: true });
  label(svg, x.score, 24, `${heads.score ?? t('common.score.total')}${arrow(heads.scoreSorted)}`, { size: 12, weight: 600, fill: heads.scoreSorted ? P.ink : P.ink2, anchor: 'end' });
  let cx = x.score;
  for (const c of cols) {
    cx += c.width;
    label(svg, cx, 24, `${c.label}${arrow(c.sorted)}`, { size: 12, weight: 600, fill: c.sorted ? P.ink : P.ink2, anchor: 'end' });
  }
  svg.append(svgEl('line', { x1: 0, x2: width, y1: HEAD - 0.5, y2: HEAD - 0.5, stroke: P.ink, 'stroke-width': 1 }));

  // grid and pass line behind the rows
  for (const v of GRID) svg.append(svgEl('line', { x1: bx(v), x2: bx(v), y1: HEAD, y2: H, stroke: P.rule, 'stroke-width': 1 }));
  if (pass) svg.append(svgEl('line', { x1: bx(60), x2: bx(60), y1: HEAD, y2: H, stroke: P.ref, 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }));

  const waits = [];
  rows.forEach((r, i) => {
    const top = HEAD + i * ROW;
    const cy = top + ROW / 2;
    const base = cy + 5;
    if (r.rank != null) label(svg, x.rank, base, String(r.rank).padStart(2, '0'), { size: 15, weight: 700, fill: P.ink, numeric: true });
    else stateTag(svg, x.rank, cy, t('common.score.pending'), P);
    waits.push(vendorMark(svg, r.model, x.icon, cy - 9, 18, P));
    nameArt(svg, r.model, x.name, base, NAME_W, P);
    if (r.value != null) {
      const end = bx(r.value);
      svg.append(svgEl('rect', { x: x.bar, y: cy - 6, width: Math.max(2, end - x.bar), height: 12, fill: barFill }));
      if (r.best) svg.append(svgEl('path', { d: starPath(end + 9, cy, 8, 0.36), fill: P.flare, stroke: P.limeEdge, 'stroke-width': 1 }));
      if (r.best) bestFigure(svg, x.score, cy, r.scoreText, 15, P);
      else label(svg, x.score, base, r.scoreText, { size: 15, weight: 700, fill: P.ink, anchor: 'end', numeric: true });
    } else {
      svg.append(svgEl('rect', { x: x.bar, y: cy - 8, width: barW, height: 16, fill: fillHatch }));
      if (r.note) {
        const w = textWidth(r.note, 12, 600) + 14;
        svg.append(svgEl('rect', { x: x.bar, y: cy - 9, width: w, height: 18, fill: P.panel }));
        label(svg, x.bar + 6, cy + 4, r.note, { size: 12, weight: 600, fill: P.ink2 });
      }
      label(svg, x.score, base, '—', { size: 15, fill: P.ink2, anchor: 'end' });
    }
    let ex = x.score;
    for (const c of cols) {
      ex += c.width;
      const cell = r.cells?.[c.key];
      if (!cell) continue;
      if (cell.best) bestFigure(svg, ex - (cell.mark ? 14 : 0), cy, cell.text, 14, P);
      else label(svg, ex - (cell.mark ? 14 : 0), base, cell.text, { size: 14, weight: cell.strong ? 700 : 500, fill: cell.muted ? P.ink2 : P.ink, anchor: 'end', numeric: true });
      if (cell.mark) costMarkArt(svg, cell.mark, ex - 4, cy, P);
    }
    svg.append(svgEl('line', { x1: 0, x2: width, y1: top + ROW - 0.5, y2: top + ROW - 0.5, stroke: P.rule, 'stroke-width': 1 }));
  });
  await Promise.all(waits).catch(() => {});
  return { svg, width, height: H };
}

const MX_ROW = 30;
const MX_MODEL = 270;

export async function matrixArt({ rows, groups = [], cols, width = BODY_W }) {
  const P = palette();
  const top = groups.length ? 64 : 40;
  const H = top + rows.length * MX_ROW;
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${H}` });
  const fillHatch = hatch(svg, P);
  const cw = (width - MX_MODEL) / cols.length;
  const colX = (i) => MX_MODEL + i * cw;

  // heads: category groups (name and weight) over their task columns, then each column's number
  let gi = 0;
  for (const g of groups) {
    const x0 = colX(gi);
    label(svg, x0 + 3, 20, fitText(g.name, g.span * cw - 5, 11, 700), { size: 11, weight: 700, fill: P.ink });
    if (g.sub) label(svg, x0 + 3, 36, g.sub, { size: 11, fill: P.ink2, numeric: true });
    svg.append(svgEl('line', { x1: x0 + 1, x2: x0 + g.span * cw - 2, y1: 42.5, y2: 42.5, stroke: P.rule, 'stroke-width': 1 }));
    gi += g.span;
  }
  label(svg, 0, top - 12, t('common.matrix.model'), { size: 12, weight: 600, fill: P.ink2 });
  cols.forEach((c, i) => label(svg, colX(i) + cw / 2, top - 12, c.head, { size: 12, weight: c.last ? 800 : 700, fill: c.last ? P.ink : P.violetText, anchor: 'middle', numeric: true }));
  svg.append(svgEl('line', { x1: 0, x2: width, y1: top - 0.5, y2: top - 0.5, stroke: P.ink, 'stroke-width': 1 }));

  const waits = [];
  rows.forEach((r, ri) => {
    const y0 = top + ri * MX_ROW;
    const cy = y0 + MX_ROW / 2;
    if (r.rank != null) label(svg, 0, cy + 5, String(r.rank).padStart(2, '0'), { size: 13, weight: 700, fill: P.ink, numeric: true });
    else label(svg, 0, cy + 5, '—', { size: 13, fill: P.ink2 });
    waits.push(vendorMark(svg, r.model, 32, cy - 8, 16, P));
    nameArt(svg, r.model, 56, cy + 5, MX_MODEL - 64, P);
    cols.forEach((c, i) => {
      const cell = r.cells[c.key] ?? {};
      const x0 = colX(i) + 1;
      const fill = cell.value == null ? fillHatch : resolve(stepFill(c.kind, cell.value).slice(4, -1));
      svg.append(svgEl('rect', { x: x0, y: y0 + 1, width: cw - 2, height: MX_ROW - 2, fill }));
      const text = cell.value == null ? cell.mark ?? '—' : cell.text;
      const ink = cell.value == null ? P.ink2 : resolve(stepInk(cell.value).slice(4, -1));
      label(svg, x0 + (cw - 2) / 2, cy + 4.5, text, { size: cell.value == null ? 11 : 13, weight: c.last || cell.best ? 800 : 600, fill: ink, anchor: 'middle', numeric: true });
      if (cell.best) svg.append(svgEl('path', { d: starPath(x0 + cw - 9, y0 + 8, 5, 0.36), fill: P.flare, stroke: P.limeEdge, 'stroke-width': 1 }));
    });
  });
  await Promise.all(waits).catch(() => {});
  return { svg, width, height: H };
}
