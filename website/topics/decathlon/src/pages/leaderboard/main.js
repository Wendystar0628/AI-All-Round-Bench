// 排行总榜 /leaderboard/ (docs/leaderboard.md).
// Page head with three figures → sticky toolbar (筛选 and 对比, view switch,
// sort, weights, download) → one panel: the weight sandbox and the axis bar
// (sticky) over one row per model. Five row views; rows keep their order
// across views (only the sort moves them). The compare view is entered from
// the toolbar's compare tray, and leaving the compare mode leaves it. View,
// sort, ticks, filter, custom weights, grain and the open side panel live in
// the address. When the data
// carries test costs, every row also shows its cost right of the score
// (ui/cost.js), with the conversion rule as a second foot line.
// Sorting by a part of the total (a kind or a category) turns the big number
// into that part's score, with the total beside it in small grey; the total and
// pass views then draw that part (rows.js). Sorting by cost draws the cost.
import './style.css';
import { boot, registerShortcut, setPanelOrder } from '../../shell/index.js';
import { h, t, pick, links, getParam, setParams, fmtDate, fmtScore, fmtRank, progress, modelLabel, iconURL, DASH } from '../../core/index.js';
import { createToolbar, createChoice, createModelList, scoreTable, getCompare, onCompareChange, onComparingChange, isShown, onFilterChange, filterCount, showTip, hideTip, hasCosts, hasApiCosts, costTip, costSourceNote, costLegend, COST_MODES, getCostMode, setCostMode, repoLink, videosLink, challengeFacts, guideLines, costOf, costKey, fmtCNY, fmtTokenValue } from '../../ui/index.js';
import { exportButton, rankingArt, chartBody } from '../../charts/index.js';
import { dur, css, reduced, stagger, isInView, play } from '../../motion.js';
import { scramble } from '../../vendor/stellar/fx.js';
import { VIEWS, RESOURCES, DIRS, compute, officialWeights, isOfficial, parseWeights, formatWeights, sortKeys, isResourceSort, isPartSort, defaultDir, isTop } from './model.js';
import { createRows, axisChanges } from './rows.js';
import { createAxis } from './axis.js';
import { createCompare } from './compare.js';
import { createSandbox } from './sandbox.js';
import { createMatrix } from '../../ui/matrix.js';
import { createFrontier } from './frontier.js';

boot(async ({ data }) => {
  const main = document.querySelector('main');
  const slot = main.querySelector('[data-slot="page"]');
  const factsEl = main.querySelector('[data-slot="facts"]');
  const figsEl = main.querySelector('[data-slot="figs"]');
  const noticeSlot = main.querySelector('[data-slot="notice"]');

  if (!data) {
    factsEl?.replaceChildren();
    figsEl?.replaceChildren();
    slot.replaceChildren(h('div.lb-nodata', h('span.lb-nodata-art', { 'aria-hidden': 'true', style: { '--art': `url("${iconURL.decor('orbit/orbit-nested')}")` } }), h('p', t('leaderboard.empty.noData'))));
    return;
  }

  // ---------------- state (from the address) ----------------
  const withApi = hasApiCosts(data);
  if (withApi && COST_MODES.includes(getParam('cost'))) setCostMode(getParam('cost'));
  const sorts = sortKeys(data);
  const view0 = getParam('view') === 'compare' || VIEWS.includes(getParam('view')) ? getParam('view') : 'total';
  const w0 = parseWeights(data, getParam('w'));
  const sort0 = sorts.includes(getParam('sort')) ? getParam('sort') : 'total';
  const state = {
    view: view0,
    lastRowView: view0 === 'compare' ? 'total' : view0,
    sort: sort0,
    dir: DIRS.includes(getParam('dir')) ? getParam('dir') : defaultDir(sort0),
    cols: getParam('cols') === 'task' ? 'task' : 'category',
    sliders: w0 ?? officialWeights(data),
    custom: !!w0 && !isOfficial(data, w0),
    dragging: false,
  };
  let C = compute(data, state);
  let frozen = null; // ranks shown while a slider is being dragged
  const computed = () => C;

  const withCost = hasCosts(data);
  const sortName = (k) =>
    k === 'total' ? t('common.score.total') : k === 'standard' || k === 'design' ? t(`common.kind.${k}`) : isResourceSort(k) ? t(`leaderboard.sort.${k}`) : pick(data.category(k), 'name');
  const viewName = (v) => t(`leaderboard.views.${v}`);
  // the short name in the score column head: 主动设计题, 数学推理 …
  const sortShort = (k) => pick(data.category(k) ?? {}, 'short') || sortName(k);
  const totalName = () => (state.custom ? t('common.score.custom') : t('common.score.total'));

  // ---------------- page head ----------------
  factsEl.replaceChildren(
    h('li', h('time', { datetime: data.updated }, t('leaderboard.facts.updated', { date: fmtDate(data.updated) }))),
    h('li', repoLink()),
    h('li', videosLink()),
  );
  // the scale of the challenge: models, tasks (and categories), the per-task time limit (ui/facts.js, also on the posters)
  figsEl.replaceChildren(...challengeFacts(data).map((f) => h('div', h('b.num', { 'data-fig': '' }, f.value), h('span', f.label), f.sub ? h('small', f.sub) : null)));

  // ---------------- toolbar ----------------
  const currentIds = () => [...list.el.querySelectorAll(':scope > li.mrow')].map((li) => li.dataset.id);
  const csvTable = () => {
    let entries;
    if (state.view === 'compare') entries = getCompare().filter((id) => data.model(id)).map((id) => ({ id, model: data.model(id), rank: C.info.get(id)?.totalRank ?? null }));
    else entries = currentIds().map((id) => ({ id, model: data.model(id), rank: C.info.get(id)?.sortRank ?? null }));
    return scoreTable(data, entries, { weights: state.custom ? C.weights : undefined });
  };
  // the view row is long (six views, sort, weights, download): let it wrap on narrow windows
  const tb = createToolbar({ data, download: { csv: csvTable, json: true }, wrap: true });

  // the toolbar's choices (ui/choice.js): 图表 opens the five views, each with the question it answers and its key;
  // 排序 opens the sort keys in three groups; the direction is one button beside it (the column heads flip it too)
  const viewChoice = createChoice({
    label: t('leaderboard.views.label'),
    options: VIEWS.map((v, i) => ({ value: v, text: viewName(v), note: t(`leaderboard.viewQ.${v}`), key: String(i + 1) })),
    value: state.view,
    onPick: (v) => switchView(v),
  });
  const sortGroup = (k) => t(`leaderboard.sort.group.${isResourceSort(k) ? 'resource' : k === 'total' || k === 'standard' || k === 'design' ? 'score' : 'category'}`);
  const sortChoice = createChoice({ label: t('leaderboard.sort.label'), options: sorts.map((k) => ({ value: k, text: sortName(k), group: sortGroup(k) })), value: state.sort, onPick: (k) => setSort(k) });
  const dirLab = h('span');
  const dirArrow = h('i.lb-arrow', { 'aria-hidden': 'true' });
  const dirBtn = h('button.st-btn.ctl-btn.lb-dir', { type: 'button', onclick: () => setSort(state.sort, state.dir === 'asc' ? 'desc' : 'asc') }, dirArrow, dirLab);
  tb.slots.start.append(viewChoice.el, h('div.ctl.lb-sort', sortChoice.el, dirBtn));

  const wBtn = h(
    'button.st-btn.ctl-btn.lb-wbtn',
    { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'lb-sandbox', 'aria-keyshortcuts': 'W', title: t('leaderboard.sandbox.buttonTitle') },
    t('leaderboard.sandbox.button'),
  );
  wBtn.addEventListener('click', () => toggleSandbox());
  // weights and download sit at the right end of the toolbar's one row
  tb.slots.end.prepend(wBtn);

  // ---------------- the board ----------------
  const eyebrow = h('span.st-eyebrow');
  const vTitle = h('span.lb-vtitle');
  const question = h('span.lb-q');
  // 存为图片: the whole board as a poster, every model in the current order and scope (charts/poster.js)
  const exportBtn = exportButton({ poster: () => boardPoster(), filename: () => `ai-decathlon-leaderboard${state.custom ? '-custom' : ''}` });
  // board head: the title left; right, the choices 开销 (cost basis) and 粒度 (matrix and compare grain), then 存为图片
  const choiceOf = (label, keys, current, text, onPick) => createChoice({ label, options: keys.map((k) => ({ value: k, text: text(k) })), value: current, onPick });
  const costChoice = withCost && withApi ? choiceOf(t('leaderboard.costMode.label'), COST_MODES, getCostMode(), (k) => t(`leaderboard.costMode.${k}`), (k) => setCost(k)) : null;
  const colsChoice = choiceOf(t('leaderboard.cols.label'), ['category', 'task'], state.cols, (k) => t(`leaderboard.cols.${k}`), (k) => setCols(k));
  const costCtl = costChoice?.el ?? null;
  const colsSeg = colsChoice.el;
  const boardHead = h('div.lb-board-head', h('h2.lb-board-title#lb-board-title', h('span.st-pair', eyebrow, vTitle), question), h('div.lb-board-tools', costCtl, colsSeg, exportBtn));
  // the cost marks (○ 订阅折算 ◆ API 标价) explained under the board, repainted when the basis changes
  const legendSlot = withCost ? h('div.lb-cost-legend-slot') : null;
  const paintLegend = () => legendSlot?.replaceChildren(costLegend(data, 'p.cost-legend.lb-cost-legend'));
  paintLegend();

  const axis = createAxis({ data, state, computed, onFocus: (k) => state.view === 'parts' && rows.setFocus(k) });
  const hRank = h('span.mrow-rank.lb-h-rank');
  const hName = h('span.mrow-name.lb-h-name');
  // sortable column heads (the score and the resource columns): a click sorts by that column; on the column sorted
  // by, it flips the direction. Every head carries an arrow: ↓ / ↑ on the sorted one, a faint ↕ on the others.
  const sortHeads = [];
  const sortHead = (key, cellCls) => {
    const lab = h('span.lb-h-lab');
    const mark = h('i.lb-arrow', { 'aria-hidden': 'true' });
    const btn = h('button.lb-h-sort', { type: 'button', dataset: { key } }, lab, mark);
    btn.addEventListener('click', () => setSort(btn.dataset.key, btn.dataset.key === state.sort ? (state.dir === 'asc' ? 'desc' : 'asc') : defaultDir(btn.dataset.key)));
    sortHeads.push({ btn, lab, mark });
    return h(`span.${cellCls}`, btn);
  };
  const RES_CELL = { cost: 'mrow-cost.lb-h-res', tokens: 'mrow-tok.lb-h-res', tps: 'mrow-tps.lb-h-res' };
  const hScore = sortHead('total', 'mrow-score.lb-h-score');
  const scoreHead = sortHeads[0];
  const resHeads = withCost ? Object.keys(RESOURCES).map((k) => sortHead(k, RES_CELL[k])) : [];
  for (const sh of sortHeads.slice(1)) sh.lab.textContent = t(`common.cost.head.${sh.btn.dataset.key}`);
  const headRow = h('div.mrow.mrow-head.lb-axisrow', { class: withCost ? 'has-cost' : null }, h('span.mrow-check'), hRank, h('span.mrow-icon'), hName, h('span.mrow-plot.lb-h-plot', axis.svg), hScore, ...resHeads);

  const sandbox = createSandbox({
    data,
    state,
    onInput: () => weightsInput(),
    onCommit: () => weightsCommit(260),
    onPreset: () => weightsCommit(0),
  });
  const sticky = h('div.lb-sticky', sandbox.el, headRow);
  const ol = h('ol.lb-list');
  const compare = createCompare({ data, state, width: () => rows.width, onBack: () => switchView(state.lastRowView || 'total') });
  // the matrix for screen readers: a real table (the cells on screen are drawn, aria-hidden)
  const srMatrix = h('div.sr-only.lb-sr-matrix');
  const board = h('section.st-panel.lb-board', { class: withCost ? 'has-cost' : null, 'aria-labelledby': 'lb-board-title', dataset: { view: state.view } }, boardHead, sticky, ol, legendSlot, srMatrix, compare.el);
  const foot = h('p.lb-foot.st-field', h('a', { href: links.about('scoring-1') }, t('leaderboard.foot', { n: data.categories.length })));
  // how the test costs are converted (ModelDial weekly quotas, the dollar rate, the date of the quota data)
  const costFoot = withCost ? costSourceNote(data, 'div.lb-foot.cost-note.st-field') : null;
  // 成绩矩阵 under the ranking: models × 13 tasks grouped by category, the total last (ui/matrix.js)
  const matrix = createMatrix({ data, cats: data.categories, last: 'total', label: t('leaderboard.matrix.label') });
  const mxBoard = h(
    'section.st-panel.lb-mx',
    { 'aria-labelledby': 'lb-mx-title' },
    h(
      'div.lb-board-head',
      h('h2.lb-board-title#lb-mx-title', h('span.st-pair', h('span.st-eyebrow', t('leaderboard.matrix.eyebrow')), h('span', t('leaderboard.matrix.title'))), h('span.lb-q', t('leaderboard.matrix.q'))),
      h(
        'div.lb-board-tools',
        h('p.lb-mx-hint.st-field', t('leaderboard.matrix.hint')),
        exportButton({
          poster: () => ({ kicker: 'SCORE MATRIX', title: t('leaderboard.matrix.title'), subtitle: t('common.poster.matrixSub', { tasks: data.tasks.length }), facts: challengeFacts(data), body: matrix.art(), guide: [t('common.poster.matrixRead'), guideLines(data).total, t('common.poster.matrixIndex')], index: matrix.index() }),
          filename: 'ai-decathlon-score-matrix',
        }),
      ),
    ),
    matrix.el,
  );
  matrix.refresh();
  // 成绩与开销 under the ranking: a measure on y (纵轴, the keys of 排序) against the test cost on x, with the Pareto
  // frontier (frontier.js); its 开销 choice is the board's basis, picked from either place
  const frontier = withCost ? createFrontier({ data, weights: () => (state.custom ? C.weights : undefined) }) : null;
  const frCost = frontier && withApi ? choiceOf(t('leaderboard.costMode.label'), COST_MODES, getCostMode(), (k) => t(`leaderboard.costMode.${k}`), (k) => setCost(k)) : null;
  const frBoard = frontier
    ? h(
        'section.st-panel.lb-fr',
        { 'aria-labelledby': 'lb-fr-title' },
        h(
          'div.lb-board-head',
          h('h2.lb-board-title#lb-fr-title', h('span.st-pair', h('span.st-eyebrow', t('leaderboard.frontier.eyebrow')), h('span', t('leaderboard.frontier.title'))), h('span.lb-q', t('leaderboard.frontier.q'))),
          h('div.lb-board-tools', frontier.measure, frCost?.el ?? null, exportButton({ poster: () => frontierPoster(), filename: 'ai-decathlon-score-cost' })),
        ),
        frontier.el,
      )
    : null;
  slot.replaceChildren(tb.el, board, ...(frBoard ? [frBoard] : []), mxBoard, foot, ...(costFoot ? [costFoot] : []));
  frontier?.update();

  // ---------------- rows ----------------
  const list = createModelList(ol, {
    data,
    kind: 'series',
    cost: withCost,
    rank: (cell, entry, ctx) => paintRow(ctx.row, entry, ctx),
    plot: (cell, entry, ctx) => rows.plot(cell, entry, ctx),
    empty: t('common.toolbar.noMatch'),
  });
  const rows = createRows({ data, state, computed, list, sortLabel: sortName });

  function entries({ keepOrder = false } = {}) {
    const ids = keepOrder ? currentIds() : C.order.filter(isShown);
    const part = isPartSort(state.sort);
    return ids.map((id) => {
      const it = C.info.get(id);
      const rank = frozen ? frozen.info.get(id)?.totalRank ?? null : it.totalRank;
      // the big number: the part sorted by (its best highlighted), else the total
      if (part) return { id, model: it.model, value: it.sortValue, rank, ranked: it.total != null, best: it.status === 'ranked' && isTop(it.sortValue, C.best.sort) };
      return { id, model: it.model, value: it.total, rank, ranked: it.total != null };
    });
  }

  // rank cell (the shared rank hook): the place in the current order (sort and direction); sorted by the total from the
  // top, the custom-weights move beside it. Sorted by a part, the score cell gets the total in small grey before it.
  function paintRow(li, entry, ctx) {
    const src = frozen ?? C;
    const it = src.info.get(entry.id);
    const now = C.info.get(entry.id);
    if (!it || !now) return;
    const rankCell = li.querySelector('.mrow-rank');
    const sr = li.querySelector('.mrow-sr');
    const name = modelLabel(it.model);
    const rank = it.sortRank;
    const byTotal = state.sort === 'total' && state.dir === 'desc';
    const sub = byTotal && state.custom && rank != null && it.delta ? `${it.delta > 0 ? '▲' : '▼'}${Math.abs(it.delta)}` : '';
    if (isPartSort(state.sort)) li.querySelector('.mrow-score')?.prepend(h('small.lb-tot', fmtScore(now.total)));
    if (rank != null) {
      const before = li.dataset.sub ?? '';
      const small = sub ? h('small.lb-rank-sub', { class: it.delta > 0 ? 'is-up' : 'is-down' }, sub) : null;
      rankCell.replaceChildren(...[h('b.lb-rank-n', fmtRank(rank)), small].filter(Boolean));
      if (small && before !== sub && !ctx.first && !reduced()) small.classList.add('st-in-wipe');
      li.dataset.sub = sub;
    } else {
      // no value by this sort: a dash for a fully scored model, 评测中 for one still being tested
      rankCell.replaceChildren(it.status === 'ranked' ? h('b.lb-rank-n', DASH) : h('span.st-state.is-draft', t('common.score.pending')));
      li.dataset.sub = '';
    }
    // what a screen reader hears for the row
    const score = fmtScore(now.total);
    const by = sortName(state.sort);
    const label = totalName();
    if (state.sort === 'total') {
      if (rank != null) sr.textContent = t('leaderboard.row.aria', { rank, name, label, score });
    } else if (rank == null) sr.textContent = t('leaderboard.row.ariaSortNone', { by, name, label, score });
    else if (isResourceSort(state.sort)) sr.textContent = t('leaderboard.row.ariaMetric', { by, rank, name, value: RESOURCES[state.sort].fmt(it.sortValue), label, score });
    else sr.textContent = t('leaderboard.row.ariaSort', { by, rank, name, value: fmtScore(it.sortValue), label, score });
  }

  // ---------------- measuring ----------------
  // the probe has a name line and a cost cell like a real row: at phone width they sit above and below the plot and take its height
  const probe = h('li.mrow', { class: withCost ? 'has-cost' : null }, h('span.mrow-check'), h('span.mrow-rank'), h('span.mrow-icon'), h('span.mrow-name', h('a.mrow-open', '\u00a0')), h('span.mrow-plot'), h('span.mrow-score'), withCost ? h('span.mrow-cost', h('b.mrow-cost-v', '\u00a0')) : null, withCost ? h('span.mrow-tok') : null, withCost ? h('span.mrow-tps') : null);
  function measure() {
    ol.append(probe);
    const hh = probe.querySelector('.mrow-plot').clientHeight;
    probe.remove();
    const changed = rows.measure(headRow.querySelector('.mrow-plot'), hh);
    axis.setWidth(rows.width);
    return changed;
  }

  // ---------------- painting the frame around the rows ----------------
  function paintHeads() {
    const v = state.view;
    eyebrow.textContent = t(`leaderboard.viewsEn.${v}`);
    vTitle.textContent = viewName(v);
    question.textContent = t(`leaderboard.viewQ.${v}`);
    colsSeg.hidden = !(v === 'matrix' || v === 'compare');
    if (costCtl) costCtl.hidden = v === 'compare';
    const cmp = v === 'compare';
    sortChoice.setDisabled(cmp);
    dirBtn.disabled = cmp;
    sortChoice.el.title = cmp ? t('leaderboard.sort.compareOff') : '';
    dirArrow.dataset.dir = state.dir;
    dirLab.textContent = t(`leaderboard.sort.dir.${state.dir}`);
    // the score head sorts by what the big numbers show: the part sorted by, else the total
    scoreHead.btn.dataset.key = isPartSort(state.sort) ? state.sort : 'total';
    if (cmp) {
      hRank.replaceChildren();
      hName.textContent = t('leaderboard.head.item');
      scoreHead.lab.textContent = t('leaderboard.compare.diffHead');
    } else {
      const sorted = state.sort !== 'total' || state.dir !== defaultDir('total');
      const by = sorted ? h('small.lb-h-by', sortShort(state.sort), h('i.lb-arrow', { 'aria-hidden': 'true', dataset: { dir: state.dir } })) : null;
      hRank.replaceChildren(...[h('span', t('leaderboard.head.rank')), by].filter(Boolean));
      hName.textContent = t('leaderboard.head.model');
      // sorted by a part: its name over the big numbers, the total over the small grey ones
      if (isPartSort(state.sort)) scoreHead.lab.replaceChildren(h('small.lb-tot', totalName()), h('span.lb-h-part', sortShort(state.sort)));
      else scoreHead.lab.textContent = totalName();
    }
    for (const sh of sortHeads) {
      const key = sh.btn.dataset.key;
      const on = !cmp && key === state.sort;
      sh.btn.disabled = cmp;
      sh.btn.classList.toggle('is-on', on);
      sh.btn.setAttribute('aria-pressed', String(on));
      sh.mark.dataset.dir = cmp ? '' : on ? state.dir : 'off';
    }
    board.dataset.view = v;
    board.classList.toggle('is-by-part', isPartSort(state.sort));
  }

  // 图表 shows the current view; the compare view is not one of its choices, so it reads 对比 with none marked
  function syncViewChoice() {
    viewChoice.set(state.view);
    if (state.view === 'compare') viewChoice.setValueText(viewName('compare'));
  }

  let customShown = null;
  function paintNotice() {
    if (customShown === state.custom) return;
    customShown = state.custom;
    noticeSlot.replaceChildren(
      state.custom
        ? h(
            'p.st-notice.lb-notice',
            { 'data-flag': t('leaderboard.notice.flag'), role: 'status', class: reduced() ? null : 'st-in-wipe' },
            h('span', t('leaderboard.notice.text')),
            h('button.st-btn.small', { type: 'button', onclick: () => resetWeights() }, t('leaderboard.sandbox.reset')),
          )
        : '',
    );
  }

  // ---------------- updates ----------------
  function refresh({ animate = true } = {}) {
    list.update(entries(), { animate });
    setPanelOrder(C.order.filter(isShown));
    paintSrMatrix();
    frontier?.update({ animate });
  }

  function paintSrMatrix() {
    if (state.view !== 'matrix') {
      srMatrix.replaceChildren();
      return;
    }
    const byTask = state.cols === 'task';
    const cols = byTask ? data.tasks : data.categories;
    const label = (k) => (byTask ? `${String(k.no).padStart(2, '0')} ${pick(k, 'name')}` : pick(k, 'name'));
    srMatrix.replaceChildren(
      h(
        'table',
        h('caption', viewName('matrix')),
        h('thead', h('tr', h('th', { scope: 'col' }, t('leaderboard.head.model')), cols.map((k) => h('th', { scope: 'col' }, label(k))))),
        h(
          'tbody',
          C.order.filter(isShown).map((id) => {
            const it = C.info.get(id);
            return h(
              'tr',
              h('th', { scope: 'row' }, modelLabel(it.model)),
              cols.map((k) => {
                const v = byTask ? it.tasks[k.key] : it.cats[k.key];
                return h('td', v == null ? t('common.score.none') : fmtScore(v));
              }),
            );
          }),
        ),
      ),
    );
  }

  // sort = key + direction; a new key starts in its own direction (scores high first, the cost cheapest first)
  function setSort(k, dir = k === state.sort ? state.dir : defaultDir(k)) {
    if (!sorts.includes(k) || (k === state.sort && dir === state.dir)) return;
    state.sort = k;
    state.dir = dir;
    sortChoice.set(k);
    setParams({ sort: k === 'total' ? null : k, dir: dir === defaultDir(k) ? null : dir });
    C = compute(data, state);
    // the score column widens for the grey total (or narrows back): measure the plot first, so the bars morph on the new width
    paintHeads();
    measure();
    if (state.view !== 'compare') axis.render(state.view, { animate: true });
    refresh();
    if (!reduced())
      setTimeout(() => {
        for (const li of list.rows.values()) if (isInView(li)) li.querySelector('.lb-rank-n') && scramble(li.querySelector('.lb-rank-n'), dur('scramble'));
      }, 60);
  }

  function setCols(k) {
    if (k === state.cols) return;
    state.cols = k;
    setParams({ cols: k === 'task' ? k : null });
    if (state.view === 'matrix') {
      axis.render('matrix', { animate: true });
      rows.redrawAll('switch', { from: 'matrix' });
      paintSrMatrix();
    } else if (state.view === 'compare') compare.render({ animate: true });
  }

  // 开销口径：订阅折算 / 纯 API 标价（the amounts, the cost sort and the legend follow)
  function setCost(k) {
    if (k === getCostMode()) return;
    setCostMode(k);
    costChoice?.set(k);
    frCost?.set(k);
    setParams({ cost: k === 'plan' ? null : k });
    C = compute(data, state);
    paintLegend();
    paintHeads();
    if (state.view !== 'compare') axis.render(state.view, { animate: true });
    refresh();
  }

  let viewToken = 0;
  async function leaveRows() {
    const els = [...list.rows.values()].filter((li) => isInView(li));
    const step = stagger('row', els.length, 120);
    await Promise.all(els.map((li, i) => play(li, [{ opacity: 1, clipPath: 'inset(0)' }, { opacity: 0, clipPath: 'inset(0 0 0 100%)' }], { duration: 'rowOut', easing: 'mech', delay: i * step, fill: 'forwards' })));
    for (const li of els) li.getAnimations().forEach((a) => a.cancel());
  }
  async function leaveCompare() {
    const els = [...compare.el.querySelectorAll('tr.lb-cmp-row')].filter((tr) => isInView(tr));
    const step = stagger('row', els.length, 120);
    await Promise.all(els.map((tr, i) => play(tr, [{ opacity: 1, clipPath: 'inset(0)' }, { opacity: 0, clipPath: 'inset(0 0 0 100%)' }], { duration: 'rowOut', easing: 'mech', delay: i * step, fill: 'forwards' })));
  }
  function rowsComeIn() {
    if (reduced()) return;
    const els = [...list.rows.values()].filter((li) => isInView(li));
    els.forEach((li, i) => {
      li.classList.remove('st-in-come');
      void li.offsetWidth;
      li.style.setProperty('--i', i);
      li.style.animationDelay = `${i * stagger('row', els.length, 300)}ms`;
      li.classList.add('st-in-come');
      li.addEventListener(
        'animationend',
        () => {
          li.classList.remove('st-in-come');
          li.style.animationDelay = '';
        },
        { once: true },
      );
    });
  }

  async function switchView(next) {
    if ((!VIEWS.includes(next) && next !== 'compare') || next === state.view) {
      syncViewChoice();
      return;
    }
    const prev = state.view;
    const my = ++viewToken;
    state.view = next;
    if (next !== 'compare') state.lastRowView = next;
    tb.setCompareView(next === 'compare');
    setParams({ view: next === 'total' ? null : next });
    hideTip();
    rows.setFocus(null);
    syncViewChoice();
    if (next === 'compare') srMatrix.replaceChildren();
    if (next === 'compare') {
      paintHeads();
      board.dataset.view = prev; // rows stay until they have folded away
      axis.render('compare', { animate: axisChanges(prev, 'compare') });
      await leaveRows();
      if (my !== viewToken) return;
      board.dataset.view = 'compare';
      compare.el.hidden = false;
      compare.render({ animate: true });
      return;
    }
    if (prev === 'compare') {
      await leaveCompare();
      if (my !== viewToken) return;
      compare.el.hidden = true;
      paintHeads();
      axis.render(next, { animate: true });
      rows.redrawAll('static');
      rowsComeIn();
      paintSrMatrix();
      setPanelOrder(currentIds());
      return;
    }
    paintHeads();
    axis.render(next, { animate: axisChanges(prev, next) });
    rows.redrawAll('switch', { from: prev });
    paintSrMatrix();
  }

  // ---------------- weights ----------------
  // the weights only change the total: moving them goes back to sorting by the total
  const toTotal = () => setSort('total', defaultDir('total'));
  function weightsInput() {
    toTotal();
    if (!state.dragging) {
      state.dragging = true;
      frozen = C;
    }
    state.custom = !isOfficial(data, state.sliders);
    C = compute(data, state);
    list.update(entries({ keepOrder: true }), { animate: false });
    if (state.view === 'parts' || state.view === 'pass') axis.render(state.view);
    paintHeads();
  }
  let commitTimer = 0;
  function weightsCommit(wait) {
    toTotal();
    clearTimeout(commitTimer);
    commitTimer = setTimeout(() => {
      state.dragging = false;
      frozen = null;
      state.custom = !isOfficial(data, state.sliders);
      C = compute(data, state);
      setParams({ w: state.custom ? formatWeights(data, state.sliders) : null });
      paintHeads();
      paintNotice();
      if (state.view !== 'compare') axis.render(state.view);
      refresh();
    }, reduced() ? 0 : wait);
  }
  function resetWeights() {
    state.sliders = officialWeights(data);
    sandbox.sync();
    weightsCommit(0);
  }
  function toggleSandbox(force) {
    const open = force ?? !sandbox.open;
    if (open === sandbox.open) return;
    wBtn.setAttribute('aria-expanded', String(open));
    wBtn.classList.toggle('is-on', open);
    if (open) {
      sandbox.setOpen(true);
      play(sandbox.el, [{ clipPath: 'inset(0 0 100% 0)', opacity: 0 }, { clipPath: 'inset(0 0 0 0)', opacity: 1 }], { duration: 'expand', easing: 'mech', fill: 'none' });
      // bring it into view when it opened above the screen
      const r = board.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) board.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    } else {
      play(sandbox.el, [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 0 100% 0)' }], { duration: Math.round(dur('expand') * 0.66), easing: 'mech', fill: 'none' }).then(() => sandbox.setOpen(false));
      if (reduced()) sandbox.setOpen(false);
    }
  }

  // ---------------- 存为图片 ----------------
  // the poster of 成绩与开销: the chart as drawn (measure, basis and filter), the frontier models as the index
  function frontierPoster() {
    const fc = filterCount(data);
    const front = frontier.front();
    return {
      kicker: 'SCORE × COST',
      title: t('leaderboard.frontier.title'),
      subtitle: [frontier.measureName(), t(`leaderboard.costMode.${getCostMode()}`), fc.on ? t('common.filter.some', fc) : t('common.filter.every', fc)].join(' │ '),
      facts: challengeFacts(data),
      body: chartBody(frontier.svg),
      guide: [t('leaderboard.frontier.posterRead'), t('leaderboard.frontier.tipFront')],
      index: front.map((p, i) => ({ no: String(i + 1).padStart(2, '0'), text: `${modelLabel(p.model)}  ${fmtScore(p.y)} │ ${fmtCNY(p.x)}` })),
    };
  }

  // the poster of the board: every model in the current order and scope, the total as the bar, the sorted part
  // (a category or a task kind) as its own column, the test cost (with its basis mark), tokens and TPS
  function boardPoster() {
    const part = isPartSort(state.sort);
    const cols = [];
    if (part) cols.push({ key: 'part', label: sortShort(state.sort), width: 92, sorted: state.dir });
    if (withCost) {
      for (const k of Object.keys(RESOURCES)) cols.push({ key: k, label: t(`common.cost.head.${k}`), width: k === 'tps' ? 60 : 96, sorted: state.sort === k ? state.dir : null });
    }
    const rows = C.order
      .filter(isShown)
      .map((id) => {
        const it = C.info.get(id);
        const ranked = it.status === 'ranked';
        const cells = {};
        if (part) cells.part = { text: fmtScore(it.sortValue), best: ranked && isTop(it.sortValue, C.best.sort) };
        if (withCost) {
          const cost = costOf(data, id);
          const key = costKey(cost);
          cells.cost = key === 'none' ? { text: DASH, muted: true } : { text: fmtCNY(cost.cny), mark: key };
          cells.tokens = { text: fmtTokenValue(cost?.tokens) };
          cells.tps = { text: cost?.tps == null ? DASH : String(Math.round(cost.tps)) };
        }
        return {
          model: it.model,
          rank: ranked ? (it.sortRank ?? DASH) : null,
          value: it.total,
          scoreText: fmtScore(it.total),
          best: ranked && isTop(it.total, C.best.total),
          note: it.total == null ? t('common.score.progress', progress(data, id)) : '',
          cells,
        };
      });
    const G = guideLines(data);
    const fc = filterCount(data);
    const reading = t('common.poster.reading', { sort: sortName(state.sort), dir: t(`leaderboard.sort.dir.${state.dir}`), models: fc.on ? t('common.filter.some', fc) : t('common.filter.every', fc) });
    return {
      kicker: 'LEADERBOARD',
      title: t('leaderboard.title'),
      subtitle: [reading, withCost ? t(`leaderboard.costMode.${getCostMode()}`) : null, state.custom ? t('common.poster.custom') : null].filter(Boolean).join(' │ '),
      facts: challengeFacts(data),
      body: rankingArt({ rows, cols, heads: { rank: t('common.csv.rank'), name: t('common.csv.model'), score: t('common.score.total'), scoreSorted: state.sort === 'total' ? state.dir : null } }),
      guide: [`${G.total}${G.pass}`, G.rules, G.best, ...(withCost ? G.cost : [])],
    };
  }

  // ---------------- events ----------------
  onFilterChange(() => {
    if (state.view !== 'compare') refresh();
    else frontier?.update({ animate: true });
  });
  // the tray's 查看对比 enters the compare view, its 返回榜单 goes back to the rows; leaving the compare mode leaves it too
  tb.on('compare', () => switchView(state.view === 'compare' ? state.lastRowView : 'compare'));
  onComparingChange((on) => {
    if (!on && state.view === 'compare') switchView(state.lastRowView);
    else if (state.view === 'kinds') rows.redrawAll('update');
  });
  onCompareChange((ids) => {
    setParams({ cmp: ids });
    if (state.view === 'compare') compare.render();
    else if (state.view === 'kinds') rows.redrawAll('update');
  });

  // tooltip for the graphics; the breakdown focuses the category under the pointer
  ol.addEventListener('pointermove', (e) => {
    const li = e.target.closest('li.mrow');
    // the cost and token cells: plan, token total, conversion basis note (ui/cost.js)
    if (li && e.target.closest('.mrow-cost, .mrow-tok, .mrow-tps')) {
      if (state.view === 'parts') rows.setFocus(null);
      showTip(costTip(data, li.dataset.id), { x: e.clientX, y: e.clientY - 8 });
      return;
    }
    if (!li || !e.target.closest('.mrow-plot')) {
      hideTip();
      if (state.view === 'parts') rows.setFocus(null);
      return;
    }
    if (state.view === 'parts') rows.setFocus(e.target.closest('.lb-seg')?.dataset.cat ?? null);
    showTip(rows.tip(li, e.target), { x: e.clientX, y: e.clientY - 8 });
  });
  ol.addEventListener('pointerleave', () => {
    hideTip();
    if (state.view === 'parts') rows.setFocus(null);
  });
  ol.addEventListener('focusin', (e) => {
    const li = e.target.closest('li.mrow');
    if (li) showTip(rows.tip(li, null), li.querySelector('.mrow-plot'));
  });
  ol.addEventListener('focusout', () => hideTip());
  // a click on a row (the matrix cells included) opens the side panel through the row's
  // data-model-panel (shell/panel.js), in the order set by setPanelOrder; the name is a link to the model page

  // keyboard: 1–5 views, W weights, F filter, C compare (listed under "本页" in the ? sheet)
  VIEWS.forEach((v, i) => registerShortcut({ key: String(i + 1), label: t('leaderboard.keys.view', { name: viewName(v) }), handler: () => switchView(v) }));
  registerShortcut({ key: 'w', label: t('leaderboard.keys.weights'), handler: () => toggleSandbox() });
  registerShortcut({ key: 'f', label: t('common.toolbar.keyFilter'), handler: () => tb.toggleFilter() });
  registerShortcut({ key: 'c', label: t('common.toolbar.keyCompare'), handler: () => tb.toggleCompare() });

  // sticky: the axis bar sits right under the toolbar
  const setTbH = () => main.style.setProperty('--lb-tb-h', `${tb.el.offsetHeight}px`);
  new ResizeObserver(setTbH).observe(tb.el);
  setTbH();
  new ResizeObserver(() => {
    if (!measure()) return;
    axis.render(state.view);
    rows.redrawAll('static');
    if (state.view === 'compare') compare.render();
  }).observe(headRow.querySelector('.mrow-plot'));

  // ---------------- first paint ----------------
  paintHeads();
  paintNotice();
  sandbox.sync();
  if (w0) toggleSandbox(true);
  measure();
  syncViewChoice();
  axis.render(state.view);
  const animateIn = !reduced();
  if (animateIn) {
    board.classList.add('st-in-power');
    board.addEventListener('animationend', () => board.classList.remove('st-in-power'), { once: true });
    axis.svg.animate?.([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 -40px 0 0)' }], { duration: dur('wipe'), delay: 200, easing: css.mech, fill: 'backwards' });
  }
  if (state.view === 'compare') {
    // opened on the compare view (a shared link, or 查看对比 from another page): the compare mode is on
    tb.openCompare();
    tb.setCompareView(true);
    list.update(entries(), { animate: false });
    compare.el.hidden = false;
    compare.render({ animate: animateIn });
  } else list.update(entries(), { animate: animateIn });
  paintSrMatrix();
  rows.markEntered();
  setPanelOrder(currentIds());

  // readouts settle: the head figures, then the score column
  if (animateIn) {
    figsEl.querySelectorAll('[data-fig]').forEach((b, i) => setTimeout(() => scramble(b, dur('scrambleLoad')), 120 + i * 40));
    const vis = [...list.rows.values()].filter((li) => isInView(li));
    const step = stagger('row', vis.length, 180);
    vis.forEach((li, i) => setTimeout(() => scramble(li.querySelector('.mrow-score'), dur('scrambleLoad')), 380 + i * step));
    // the cost amounts settle with the scores, one step later
    if (withCost) vis.forEach((li, i) => setTimeout(() => li.querySelector('.mrow-cost-v') && scramble(li.querySelector('.mrow-cost-v'), dur('scrambleLoad')), 380 + (i + 1) * step));
  }
});
