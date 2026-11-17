// 成绩与开销 (website/docs/leaderboard.md「成绩与开销」): every fully scored model that has a cost as one point,
// both axes linear. y is a measure picked in the panel head (纵轴): the total, a kind (标准评判题 / 主动设计题) or one
// of the 10 categories — the same keys and groups as the toolbar's 排序. x is the test cost under the current basis
// (订阅折算 / API 标价); for a kind or a category it is the whole run's cost shared out by time: cost × the time
// limits of its tasks ÷ the time limits of all 13 tasks.
//
// Each point is its vendor's mark on a disc, named beside it (names are placed so they do not cover each other or
// the marks, and never get a leader line). The Pareto frontier — the models no other
// model beats on both counts (as cheap or cheaper and as high or higher) — is joined by a violet polyline, with a wash
// under it; each vendor's own frontier (its models no other model of the same vendor beats) by a thin grey line, both
// in cost order. The chart follows
// the filter, the custom weights (the total) and the cost basis. Pointing at a point (or focusing it) brings its
// vendor's line forward, draws guide lines to both axes with their values and shows the details; a click (Enter)
// opens the model's side panel. Under the chart the frontier models are listed in cost order.
//
//   const fr = createFrontier({ data, weights });   // weights() -> the custom category weights, or undefined
//   fr.el                 the legend, the chart and the frontier list, for the panel
//   fr.measure            the 纵轴 choice (ui/choice.js), for the panel head
//   fr.svg                the live <svg> (存为图片)
//   fr.update({ animate })   after a filter, weights or basis change
//   fr.front() / fr.measureName()   the frontier points in cost order and the measure's name (the poster)
import * as d3 from '../../charts/d3.js';
import { h, t, pick, getParam, setParams, iconURL, inlineSVG, modelLabel, modelName, modelStatus, rankBy, vendorIcon, fmtScore, fmtPct } from '../../core/index.js';
import { isShown, showTip, hideTip, createChoice, costOf, costKey, costMark, costTag, fmtCNY, fmtTokens, getCostMode } from '../../ui/index.js';
import { openModelPanel } from '../../shell/index.js';
import { dur, reduced, onEnterView, ease } from '../../motion.js';

const M = { t: 30, r: 34, b: 62, l: 64 };
const NARROW = 560; // below this width (phones) the marks are smaller and only the frontier models are named
const FONT = 12; // the names (11 on a phone, styles)

/** The models no other model beats on both: by cost (then score, high first), each keeps a strictly higher score. */
export function paretoFront(points) {
  const front = [];
  let best = -Infinity;
  for (const p of [...points].sort((a, b) => a.x - b.x || b.y - a.y)) {
    if (p.y > best) {
      front.push(p);
      best = p.y;
    }
  }
  return front;
}

// ---- name placement: around each mark, nearest first; then a little further out (no leader lines) ----
const AROUND = [
  [1, 0],
  [-1, 0],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 1],
  [-1, -1],
  [-1, 1],
];
const overlap = (a, b) => Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)) * Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));

/**
 * items [{ id, cx, cy, w }] in priority order; lines [[x1, y1, x2, y2]] the drawn lines a name should not sit on
 * -> Map id -> { lx, ly, anchor, box, far, dx, dy }
 */
function placeNames(items, bounds, lines, dots, r) {
  const marks = dots.map(([cx, cy]) => ({ x1: cx - r - 2, x2: cx + r + 2, y1: cy - r - 2, y2: cy + r + 2 }));
  // the lines as a trail of small boxes every 6 px
  const trail = [];
  for (const [x1, y1, x2, y2] of lines) {
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 6));
    for (let i = 0; i <= n; i++) {
      const px = x1 + ((x2 - x1) * i) / n;
      const py = y1 + ((y2 - y1) * i) / n;
      trail.push({ x1: px - 2, x2: px + 2, y1: py - 2, y2: py + 2 });
    }
  }
  const taken = [];
  const out = new Map();
  const hgt = FONT + 2;
  for (const it of items) {
    let best = null;
    for (const ring of [r + 5, r + 22, r + 40]) {
      for (const [dx, dy] of AROUND) {
        const lx = it.cx + dx * ring;
        const cy = it.cy + dy * (dx ? ring - 4 : ring);
        const anchor = dx > 0 ? 'start' : dx < 0 ? 'end' : 'middle';
        const x1 = anchor === 'start' ? lx : anchor === 'end' ? lx - it.w : lx - it.w / 2;
        const bx = { x1, x2: x1 + it.w, y1: cy - hgt / 2, y2: cy + hgt / 2 };
        let cost = ring * 0.6; // nearer is better
        if (bx.x1 < bounds.x1 || bx.x2 > bounds.x2 || bx.y1 < bounds.y1 || bx.y2 > bounds.y2) cost += 1e6;
        for (const b of taken) cost += overlap(bx, b) * 4;
        for (const m of marks) cost += overlap(bx, m) * 3;
        for (const d of trail) cost += overlap(bx, d) * 2;
        if (!best || cost < best.cost) best = { cost, box: bx, lx, ly: cy + FONT / 2 - 2, anchor, ring };
      }
      if (best.cost <= best.ring * 0.6) break; // a free spot in this ring
    }
    taken.push(best.box);
    out.set(it.id, best);
  }
  return out;
}

export function createFrontier({ data, weights }) {
  // ---- the measure on y: the keys and groups of the toolbar's 排序 (scores, then the categories) ----
  const kindOf = (k) => (k === 'total' || k === 'standard' || k === 'design' ? 'score' : 'category');
  const MEASURES = ['total', 'standard', 'design', ...data.categories.map((c) => c.key)];
  const nameOf = (k) =>
    k === 'total' ? t(weights() ? 'common.score.custom' : 'common.score.total') : k === 'standard' || k === 'design' ? t(`common.kind.${k}`) : pick(data.category(k), 'name');
  // the share of the run's time a measure stands for: the time limits of its tasks over those of all tasks
  const allMinutes = d3.sum(data.tasks, (task) => task.minutes);
  const tasksOf = (k) => (k === 'total' ? data.tasks : k === 'standard' || k === 'design' ? data.tasks.filter((task) => task.kind === k) : data.category(k).tasks);
  const shareOf = (k) => (k === 'total' ? 1 : d3.sum(tasksOf(k), (task) => task.minutes) / allMinutes);
  let by = MEASURES.includes(getParam('fy')) ? getParam('fy') : 'total';
  const measure = createChoice({
    label: t('leaderboard.frontier.yLabel'),
    options: MEASURES.map((k) => ({ value: k, text: nameOf(k), group: t(`leaderboard.sort.group.${kindOf(k)}`) })),
    value: by,
    onPick: (k) => {
      by = k;
      setParams({ fy: k === 'total' ? null : k });
      draw({ animate: true });
    },
  });

  // ---- layers, back to front ----
  const svg = d3.create('svg').attr('class', 'fr-svg').attr('role', 'group');
  const gGrid = svg.append('g').attr('class', 'fr-grid');
  const gX = svg.append('g').attr('class', 'fr-axis fr-axis-x');
  const gY = svg.append('g').attr('class', 'fr-axis fr-axis-y');
  const titleX = svg.append('text').attr('class', 'fr-title fr-title-x').attr('text-anchor', 'end');
  const titleY = svg.append('text').attr('class', 'fr-title fr-title-y').attr('text-anchor', 'start');
  const zone = svg.append('path').attr('class', 'fr-zone');
  const gVendor = svg.append('g').attr('class', 'fr-vlines');
  const frontLine = svg.append('path').attr('class', 'fr-front-line');
  const guide = svg.append('g').attr('class', 'fr-guide').style('display', 'none');
  const gLabels = svg.append('g').attr('class', 'fr-labels').attr('aria-hidden', 'true');
  const gPts = svg.append('g').attr('class', 'fr-pts');
  const gBadges = svg.append('g').attr('class', 'fr-badges').style('display', 'none');
  const ruler = svg.append('text').attr('class', 'fr-label').style('visibility', 'hidden'); // measures the names

  const box = h('div.fr-box', svg.node());
  const chips = h('ol.fr-chips');
  const note = h('p.fr-note.st-field');
  const legend = h(
    'div.fr-legend.st-field',
    { 'aria-hidden': 'true' },
    h('span.fr-key', h('i.fr-key-front'), t('leaderboard.frontier.legend.front')),
    h('span.fr-key', h('i.fr-key-vendor'), t('leaderboard.frontier.legend.vendor')),
    h('span.fr-key', h('i.fr-wash'), t('leaderboard.frontier.legend.zone')),
    h('span.fr-key.fr-key-hint', t('leaderboard.frontier.legend.hint')),
  );
  const el = h('div.fr', legend, box, h('div.fr-front', h('p.fr-front-h', h('b', t('leaderboard.frontier.front')), h('span', t('leaderboard.frontier.frontQ'))), chips), note);

  let W = 0;
  let H = 0;
  let R = 12; // the mark's disc radius (9 on a phone)
  let L = 15; // the vendor mark inside it
  let pts = [];
  let front = [];
  let hot = null;
  let shown = false; // the entrance has played
  let armed = false;

  const x = d3.scaleLinear();
  const y = d3.scaleLinear();
  const tr = (sel, T) => (T ? sel.transition(T) : sel); // animated, or applied at once (also in a background tab)
  const line = d3.line().x((p) => x(p.x)).y((p) => y(p.y));

  // ---- the points: fully scored models in the filter with a cost; x shared out by time for a kind or a category ----
  function collect() {
    const share = shareOf(by);
    const ranks = new Map(rankBy(data, by, { weights: by === 'total' ? weights() : undefined }).map((e) => [e.id, e]));
    const shownIds = data.order.filter(isShown);
    const ranked = shownIds.filter((id) => modelStatus(data, id) === 'ranked');
    pts = [];
    let noCost = 0;
    for (const id of ranked) {
      const e = ranks.get(id);
      const cost = costOf(data, id);
      if (cost?.cny == null) {
        noCost++;
        continue;
      }
      if (e?.value == null) continue;
      const model = data.model(id);
      pts.push({ id, model, vendor: model.vendor, y: e.value, rank: e.rank, cost, full: cost.cny, x: cost.cny * share });
    }
    front = paretoFront(pts);
    const ids = new Set(front.map((p) => p.id));
    for (const p of pts) p.front = ids.has(p.id);
    const testing = shownIds.length - ranked.length;
    note.textContent = [
      by === 'total' ? '' : t('leaderboard.frontier.shareNote', { name: nameOf(by), share: fmtPct(Math.round(share * 1000) / 10) }),
      testing ? t('leaderboard.frontier.testing', { n: testing }) : '',
      noCost ? t('leaderboard.frontier.noCost', { n: noCost }) : '',
    ]
      .filter(Boolean)
      .join(' ');
    note.hidden = !note.textContent;
  }

  // the cheapest frontier model that beats p on both counts
  const beatenBy = (p) => front.find((q) => q.x <= p.x && q.y >= p.y && q.id !== p.id);
  // each vendor's own Pareto frontier (among its own models), where it has two or more models on it
  const vendorLines = () =>
    [...d3.group(pts, (p) => p.vendor)].map(([vendor, list]) => ({ vendor, list: paretoFront(list) })).filter((v) => v.list.length > 1);

  function layout() {
    W = Math.max(280, Math.round(box.clientWidth || 640));
    const narrow = W < NARROW;
    H = narrow ? Math.round(Math.max(400, W * 1.3)) : Math.round(Math.min(620, Math.max(360, W * 0.58)));
    R = narrow ? 9 : 12;
    L = narrow ? 11 : 15;
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
    const xmax = d3.max(pts, (p) => p.x) ?? 1;
    const ymax = Math.min(100, (d3.max(pts, (p) => p.y) ?? 10) * 1.1);
    x.domain([0, Math.max(1, xmax * 1.06)]).range([M.l, W - M.r]).nice(Math.max(3, Math.floor((W - M.l - M.r) / 90)));
    y.domain([0, Math.max(10, ymax)]).range([H - M.b, M.t]).nice(5);
  }

  const money = (v) => fmtCNY(v).replace(/\.0$/, '');

  function drawAxes(T) {
    const xt = x.ticks(Math.max(3, Math.floor((W - M.l - M.r) / 90)));
    const yt = y.ticks(5);
    gGrid
      .selectAll('line.fr-gx')
      .data(xt, (d) => d)
      .join((en) => en.append('line').attr('class', 'fr-gx').attr('x1', (d) => x(d)).attr('x2', (d) => x(d)))
      .attr('y1', M.t)
      .attr('y2', H - M.b)
      .call((sel) => tr(sel, T).attr('x1', (d) => x(d)).attr('x2', (d) => x(d)));
    gGrid
      .selectAll('line.fr-gy')
      .data(yt, (d) => d)
      .join((en) => en.append('line').attr('class', 'fr-gy').attr('y1', (d) => y(d)).attr('y2', (d) => y(d)))
      .attr('x1', M.l)
      .attr('x2', W - M.r)
      .call((sel) => tr(sel, T).attr('y1', (d) => y(d)).attr('y2', (d) => y(d)));
    gX
      .selectAll('text')
      .data(xt, (d) => d)
      .join((en) => en.append('text').attr('text-anchor', 'middle').attr('x', (d) => x(d)))
      .text((d) => money(d))
      .attr('y', H - M.b + 24)
      .call((sel) => tr(sel, T).attr('x', (d) => x(d)));
    gY
      .selectAll('text')
      .data(yt, (d) => d)
      .join((en) => en.append('text').attr('text-anchor', 'end').attr('y', (d) => y(d) + 4))
      .text((d) => d)
      .attr('x', M.l - 12)
      .call((sel) => tr(sel, T).attr('y', (d) => y(d) + 5));
    gX.selectAll('line').data([0]).join('line').attr('class', 'fr-base').attr('x1', M.l).attr('x2', W - M.r).attr('y1', H - M.b).attr('y2', H - M.b);
    gY.selectAll('line').data([0]).join('line').attr('class', 'fr-base').attr('x1', M.l).attr('x2', M.l).attr('y1', M.t).attr('y2', H - M.b);
    const basis = t(`leaderboard.costMode.${getCostMode()}`);
    titleX.attr('x', W - M.r).attr('y', H - 6).text(t(by === 'total' ? 'leaderboard.frontier.axisX' : 'leaderboard.frontier.axisXShare', { basis }));
    titleY.attr('x', M.l + 10).attr('y', M.t - 10).text(nameOf(by));
  }

  // the models named in the chart: all of them; on a phone the frontier only (the rest by pointing)
  const named = () => (W < NARROW ? pts.filter((p) => p.front) : pts);

  // every name measured, then placed: frontier names first, then the rest from the top score down
  function spots() {
    const width = (text) => {
      ruler.text(text);
      return ruler.node().getComputedTextLength?.() || text.length * 7;
    };
    const order = [...named()].sort((a, b) => (a.front === b.front ? b.y - a.y : a.front ? -1 : 1));
    const segs = (list) => list.slice(1).map((p, i) => [x(list[i].x), y(list[i].y), x(p.x), y(p.y)]);
    const lines = [...segs(front), ...vendorLines().flatMap((v) => segs(v.list))];
    return placeNames(
      order.map((p) => ({ id: p.id, cx: x(p.x), cy: y(p.y), w: width(p.model.name) + 2 })),
      { x1: M.l + 2, x2: W - 4, y1: 2, y2: H - M.b - 2 },
      lines,
      pts.map((p) => [x(p.x), y(p.y)]),
      R,
    );
  }

  function draw({ animate = false } = {}) {
    collect();
    layout();
    const T = animate && shown && !reduced() ? svg.transition().duration(dur('morph')).ease(ease.mech) : null;
    drawAxes(T);
    svg.attr('aria-label', t('leaderboard.frontier.label', { measure: nameOf(by), n: pts.length, front: front.length }));

    // the frontier: a polyline in cost order, the wash under it down to the axis
    const base = y(0);
    tr(frontLine, T).attr('d', front.length > 1 ? line(front) : '');
    tr(zone, T).attr('d', front.length > 1 ? `M${x(front[0].x)},${base}L${front.map((p) => `${x(p.x)},${y(p.y)}`).join('L')}L${x(front[front.length - 1].x)},${base}Z` : '');

    // each vendor's own frontier, joined in cost order
    gVendor
      .selectAll('path')
      .data(vendorLines(), (v) => v.vendor)
      .join((en) => en.append('path').attr('class', 'fr-vline').style('opacity', shown ? null : 0))
      .attr('data-vendor', (v) => v.vendor)
      .call((sel) => tr(sel, T).attr('d', (v) => line(v.list)));

    // the marks: the vendor's mark on a disc
    const g = gPts
      .selectAll('g.fr-pt')
      .data(pts, (p) => p.id)
      .join(
        (en) => {
          const gg = en.append('g').attr('class', 'fr-pt').attr('tabindex', 0).attr('role', 'button');
          gg.append('circle').attr('class', 'fr-halo');
          gg.append('circle').attr('class', 'fr-disc');
          gg.each(function (p) {
            inlineSVG(this, iconURL.vendor(p.model.logo), { x: -L / 2, y: -L / 2, size: L, className: 'fr-logo' }).catch(() => {});
          });
          gg.attr('transform', (p) => `translate(${x(p.x)},${y(p.y)})`).style('opacity', shown ? null : 0);
          return gg;
        },
        (up) => up,
        (ex) => tr(ex, T).style('opacity', 0).remove(),
      );
    g.attr('data-model-panel', (p) => p.id)
      .attr('data-vendor', (p) => p.vendor)
      .classed('is-front', (p) => p.front)
      .attr('aria-label', (p) => ariaOf(p));
    tr(g, T).attr('transform', (p) => `translate(${x(p.x)},${y(p.y)})`);
    g.select('circle.fr-halo').attr('r', R + 6);
    g.select('circle.fr-disc').attr('r', R);
    g.select('svg.fr-logo').attr('x', -L / 2).attr('y', -L / 2).attr('width', L).attr('height', L);
    g.sort((a, b) => (a.front === b.front ? b.x - a.x : a.front ? 1 : -1)); // frontier marks on top

    // the names, beside their marks (no leader lines)
    const at = spots();
    const lab = gLabels
      .selectAll('text')
      .data(named(), (p) => p.id)
      .join((en) => en.append('text').attr('class', 'fr-label').style('opacity', shown ? null : 0))
      .classed('is-front', (p) => p.front)
      .attr('data-vendor', (p) => p.vendor)
      .text((p) => p.model.name)
      .attr('text-anchor', (p) => at.get(p.id).anchor);
    tr(lab, T)
      .attr('x', (p) => at.get(p.id).lx)
      .attr('y', (p) => at.get(p.id).ly);

    paintChips();
    if (hot) setHot(pts.find((p) => p.id === hot.id) ?? null);
    if (!armed) {
      armed = true;
      onEnterView(box, enter); // the entrance plays when the chart scrolls into view
    }
  }

  function ariaOf(p) {
    const status = p.front ? t('leaderboard.frontier.onFront') : t('leaderboard.frontier.beaten', { name: modelLabel(beatenBy(p)?.model ?? p.model) });
    return t('leaderboard.frontier.aria', { name: modelLabel(p.model), measure: nameOf(by), score: fmtScore(p.y), cost: fmtCNY(p.x), status });
  }

  function paintChips() {
    chips.replaceChildren(
      ...front.map((p) =>
        h(
          'li',
          h(
            'button.fr-chip',
            { type: 'button', dataset: { id: p.id, modelPanel: p.id }, 'aria-label': ariaOf(p) },
            vendorIcon(p.model),
            modelName(p.model, { className: 'fr-chip-name' }),
            h('span.fr-chip-v.num', h('b', fmtScore(p.y)), h('span', money(p.x))),
          ),
        ),
      ),
    );
  }

  // ---- pointing: the point and its vendor come forward, guide lines run to both axes with their values ----
  function setHot(p) {
    hot = p;
    svg.classed('has-hot', !!p);
    const kin = function () {
      return !!p && this.getAttribute('data-vendor') === p.vendor;
    };
    gPts.selectAll('g.fr-pt').classed('is-hot', (q) => !!p && q.id === p.id).classed('is-kin', kin);
    gLabels.selectAll('text').classed('is-hot', (q) => !!p && q.id === p.id).classed('is-kin', kin);
    gVendor.selectAll('path').classed('is-kin', kin);
    for (const c of chips.querySelectorAll('.fr-chip')) c.classList.toggle('is-hot', !!p && c.dataset.id === p.id);
    guide.style('display', p ? null : 'none');
    gBadges.style('display', p ? null : 'none');
    if (!p) return;
    const cx = x(p.x);
    const cy = y(p.y);
    const base = y.range()[0];
    guide
      .selectAll('line')
      .data([
        [cx, cy + R, cx, base],
        [cx - R, cy, M.l, cy],
      ])
      .join('line')
      .attr('x1', (d) => d[0])
      .attr('y1', (d) => d[1])
      .attr('x2', (d) => d[2])
      .attr('y2', (d) => d[3]);
    const b = gBadges
      .selectAll('g')
      .data([
        { text: fmtCNY(p.x), bx: cx, by: base + 24, anchor: 'middle' },
        { text: fmtScore(p.y), bx: M.l - 12, by: cy + 5, anchor: 'end' },
      ])
      .join((en) => {
        const gg = en.append('g');
        gg.append('rect').attr('rx', 2);
        gg.append('text');
        return gg;
      });
    b.select('text')
      .text((d) => d.text)
      .attr('x', (d) => d.bx)
      .attr('y', (d) => d.by)
      .attr('text-anchor', (d) => d.anchor);
    b.each(function () {
      const tb = this.querySelector('text').getBBox();
      d3.select(this).select('rect').attr('x', tb.x - 5).attr('y', tb.y - 2).attr('width', tb.width + 10).attr('height', tb.height + 4);
    });
  }

  function tipOf(p) {
    const cost = p.cost;
    const key = costKey(cost);
    const beater = p.front ? null : beatenBy(p);
    return h(
      'span.site-tip-lines.fr-tip',
      h('b', modelLabel(p.model)),
      h('span', t('leaderboard.frontier.tipScore', { measure: nameOf(by), score: fmtScore(p.y), rank: p.rank ?? '—' })),
      h('span', t('leaderboard.frontier.tipCost', { cost: fmtCNY(p.x) }), ' ', costMark(key), ' ', costTag(cost)),
      by === 'total' ? null : h('span', t('leaderboard.frontier.tipShare', { full: fmtCNY(p.full), share: fmtPct(Math.round(shareOf(by) * 1000) / 10) })),
      by === 'total' && cost?.tokens != null ? h('span', t('leaderboard.frontier.tipTokens', { tokens: fmtTokens(cost.tokens) })) : null,
      h(
        'span.site-tip-note',
        p.front ? t('leaderboard.frontier.tipFront') : beater ? t('leaderboard.frontier.tipBeaten', { name: modelLabel(beater.model), cost: fmtCNY(beater.x), score: fmtScore(beater.y) }) : '',
      ),
    );
  }

  const pointOf = (target) => {
    const node = target.closest?.('g.fr-pt, .fr-chip');
    if (!node) return null;
    const id = node.dataset?.id ?? d3.select(node).datum()?.id;
    return pts.find((p) => p.id === id) ?? null;
  };
  svg.on('pointermove', (e) => {
    const p = pointOf(e.target);
    if (p !== hot) setHot(p);
    if (p) showTip(tipOf(p), { x: e.clientX, y: e.clientY - 12 });
    else hideTip();
  });
  svg.on('pointerleave', () => {
    setHot(null);
    hideTip();
  });
  svg.on('focusin', (e) => {
    const p = pointOf(e.target);
    setHot(p);
    if (p) showTip(tipOf(p), e.target.closest('g.fr-pt'));
  });
  svg.on('focusout', () => {
    setHot(null);
    hideTip();
  });
  svg.on('keydown', (e) => {
    const p = pointOf(e.target);
    if (p && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openModelPanel(p.id);
    }
  });
  // the frontier list lights its point (a click opens the side panel through data-model-panel)
  chips.addEventListener('pointerover', (e) => setHot(pointOf(e.target)));
  chips.addEventListener('pointerleave', () => setHot(null));
  chips.addEventListener('focusin', (e) => setHot(pointOf(e.target)));
  chips.addEventListener('focusout', () => setHot(null));

  // ---- entrance: the marks rise from the axis once the chart is on screen, then the lines and the names ----
  function enter() {
    if (shown) return;
    shown = true;
    const later = [gVendor.selectAll('path'), gLabels.selectAll('text')];
    // the inline opacity goes once an element is in, so the pointing (CSS) can step the rest back
    const settle = function () {
      this.style.removeProperty('opacity');
    };
    if (reduced()) {
      for (const s of [gPts.selectAll('g.fr-pt'), ...later]) s.style('opacity', null);
      return;
    }
    const n = pts.length;
    gPts
      .selectAll('g.fr-pt')
      .attr('transform', (p) => `translate(${x(p.x)},${y(0)})`)
      .transition()
      .delay((p, i) => (i / Math.max(1, n)) * 420)
      .duration(dur('morph'))
      .ease(ease.snap)
      .style('opacity', 1)
      .attr('transform', (p) => `translate(${x(p.x)},${y(p.y)})`)
      .on('end', settle);
    const len = frontLine.node().getTotalLength?.() || 0;
    frontLine
      .attr('stroke-dasharray', `${len} ${len}`)
      .attr('stroke-dashoffset', len)
      .transition()
      .delay(420)
      .duration(700)
      .ease(ease.mech)
      .attr('stroke-dashoffset', 0)
      .on('end', () => frontLine.attr('stroke-dasharray', null));
    for (const s of later) s.transition().delay(820).duration(320).style('opacity', 1).on('end', settle);
  }

  // a new width redraws (the page draws first when it puts the chart in place: fr.update())
  new ResizeObserver(() => {
    const w = Math.round(box.clientWidth);
    if (w && w !== W) draw();
  }).observe(box);

  return {
    el,
    measure: measure.el,
    svg: svg.node(),
    update: (o) => draw(o),
    front: () => front,
    measureName: () => nameOf(by),
  };
}
