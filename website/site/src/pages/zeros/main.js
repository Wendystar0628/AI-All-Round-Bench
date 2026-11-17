// /zeros/ 0分盘点 (website/docs/zeros.md): every 0 in the scores, task by task, each with one sentence on why.
// Which scores are 0 comes from scores.json; the written reasons ({kind, zh, en}) from zeros.json; a 0 without one
// shows the grader's anomaly note instead. A reason kind picked in the figure's legend (?kind=) shows only that kind.
import '../../reading/reading.css';
import '../../reading/figs/figs.css';
import './style.css';
import { boot } from '../../shell/index.js';
import { h, t, lang, pick, links, fmtNo, fmtDate, fetchJSON, vendorIcon, categoryIcon, modelName, modelLabel, getParam, setParams } from '../../core/index.js';
import { aside, wireToc, wireAnchors, jumpToHash, emptyState } from '../../reading/reading.js';
import { attachTip } from '../../ui/tip.js';
import { mountSky } from '../../decor/skyclock.js';

const KINDS = ['none', 'crash', 'wrong', 'slow', 'rule', 'other'];
const rowId = (task, id) => `z-${task.key}-${id}`;

boot(async ({ data }) => {
  const paper = document.querySelector('[data-slot="page"]');
  const side = document.querySelector('[data-slot="aside"]');
  if (!data) return;
  const written = (await fetchJSON('zeros').catch(() => null))?.reasons ?? {};

  // ---- the zeros: [{ task, entries: [{ id, model, kind, text }] }] in task order, models in the official order ----
  const reason = (task, id) => {
    const w = written[task.key]?.[id];
    if (w) return { kind: KINDS.includes(w.kind) ? w.kind : 'other', text: (lang === 'en' ? w.en : w.zh) || w.zh };
    const notes = data.score(id)?.task_info?.[task.key]?.anomaly ?? [];
    return { kind: 'other', text: notes.map((a) => a.text).join(' ') };
  };
  const groups = data.tasks.map((task) => ({
    task,
    entries: data.order.filter((id) => data.score(id)?.tasks?.[task.key] === 0).map((id) => ({ id, model: data.model(id), ...reason(task, id) })),
  }));
  const zeroGroups = groups.filter((g) => g.entries.length);
  const all = zeroGroups.flatMap((g) => g.entries.map((e) => ({ ...e, task: g.task })));
  const zeroModels = [...new Set(all.map((e) => e.id))];
  const kindCount = (k) => all.filter((e) => e.kind === k).length;
  const kinds = KINDS.filter((k) => kindCount(k));
  const kindLabel = (k) => t(`zeros.kind.${k}`);

  // ---- head ----
  const head = paper.querySelector('.rd-head');
  head.prepend(mountSky(h('span.rd-banner.zr-banner'), 'lunation'));
  paper.querySelector('[data-slot="count"]').textContent = t('zeros.count', { n: all.length, count: all.length });
  head.append(
    h(
      'ul.st-facts.st-field',
      h('li', t('zeros.facts.tasks', { n: zeroGroups.length, all: data.tasks.length })),
      h('li', t('zeros.facts.models', { n: zeroModels.length, all: data.order.length })),
    ),
    h('p.rd-lede.st-read', t('zeros.lede')),
  );
  if (!all.length) {
    paper.append(emptyState(t('zeros.empty'), { decor: 'orbit/orbit-nested' }));
    return;
  }

  // ---- figure: models × tasks, a mark on every 0; the legend picks a reason kind ----
  const chips = new Map();
  const legend = h(
    'div.zr-legend',
    { role: 'group', 'aria-label': t('zeros.fig.filter') },
    kinds.map((k) => {
      const chip = h(
        'button.st-chip.zr-chip',
        { type: 'button', 'aria-pressed': 'false', title: t(`zeros.kindNote.${k}`), onclick: () => setKind(current === k ? null : k) },
        h('i.zr-sw', { class: `is-${k}`, 'aria-hidden': 'true' }),
        h('span', kindLabel(k)),
        h('span.n', String(kindCount(k))),
      );
      chips.set(k, chip);
      return chip;
    }),
  );
  const cells = [];
  const gridHead = h(
    'div.zr-gr.zr-gr-head',
    { role: 'row' },
    h('span.zr-gm', { role: 'columnheader' }, t('zeros.fig.model')),
    // a task's column head: its category icon, its short name set vertically, its number under it
    data.tasks.map((task) => {
      const has = zeroGroups.some((g) => g.task === task);
      const attrs = { role: 'columnheader', title: `${fmtNo(task.no)} ${pick(task, 'name')}`, dataset: { col: task.key } };
      const body = [categoryIcon(task.category), h('span.zr-th-name', lang === 'en' ? pick(task, 'short') : task.short.replace(/\s+/g, '')), h('span.zr-th-no.num', String(task.no).padStart(2, '0'))];
      return has ? h('a.zr-th', { ...attrs, href: `#${task.key}` }, body) : h('span.zr-th.is-clean', attrs, body);
    }),
    h('span.zr-tn', { role: 'columnheader' }, t('zeros.fig.sum')),
  );
  const byModel = zeroModels
    .map((id) => ({ id, model: data.model(id), list: all.filter((e) => e.id === id) }))
    .sort((a, b) => b.list.length - a.list.length || data.order.indexOf(a.id) - data.order.indexOf(b.id));
  const gridRows = byModel.map(({ id, model, list }) =>
    h(
      'div.zr-gr',
      { role: 'row' },
      h('a.zr-gm', { role: 'rowheader', href: links.model(id) }, vendorIcon(model), modelName(model)),
      data.tasks.map((task) => {
        const e = list.find((x) => x.task === task);
        if (!e) {
          const scored = data.score(id)?.tasks?.[task.key] != null;
          return h('span.zr-c', { role: 'cell', class: scored ? 'is-scored' : 'is-pending', 'aria-hidden': 'true', dataset: { col: task.key } });
        }
        const label = t('zeros.fig.cell', { model: modelLabel(model), no: fmtNo(task.no), task: pick(task, 'name'), kind: kindLabel(e.kind) });
        const a = h('a.zr-c', { role: 'cell', href: `#${rowId(task, id)}`, class: `is-${e.kind}`, 'aria-label': `${label}：${e.text}`, dataset: { kind: e.kind, col: task.key } });
        attachTip(a, () => h('span.site-tip-lines', h('span', label), e.text ? h('span.site-tip-note', e.text) : null));
        cells.push(a);
        return a;
      }),
      h('span.zr-tn.num', { role: 'cell' }, String(list.length)),
    ),
  );
  const grid = h('div.zr-grid', { role: 'table', 'aria-label': t('zeros.fig.label'), style: { '--zr-n': data.tasks.length } }, gridHead, gridRows);
  // pointing at a cell (or a head) lights that task's column head, so the name is read off without the tip
  const heads = new Map([...gridHead.querySelectorAll('.zr-th')].map((el) => [el.dataset.col, el]));
  let hot = null;
  const heat = (key) => {
    if (key === hot) return;
    heads.get(hot)?.classList.remove('is-hot');
    hot = key;
    heads.get(hot)?.classList.add('is-hot');
  };
  const colOf = (e) => e.target.closest?.('[data-col]')?.dataset.col ?? null;
  grid.addEventListener('pointerover', (e) => heat(colOf(e)));
  grid.addEventListener('pointerleave', () => heat(null));
  grid.addEventListener('focusin', (e) => heat(colOf(e)));
  grid.addEventListener('focusout', () => heat(null));
  paper.append(
    h(
      'figure.rd-fig.zr-fig',
      h('figcaption.rd-fig-cap', h('span.st-eyebrow.slash.rd-fig-no', t('zeros.fig.no')), h('span.rd-fig-title', t('zeros.fig.title'))),
      legend,
      h('div.zr-grid-wrap', grid),
    ),
  );

  // ---- one group per task with zeros ----
  const sections = new Map();
  const rows = [];
  for (const { task, entries } of zeroGroups) {
    const cat = data.category(task.category);
    const headEl = h(
      'h2.st-group-head.rd-group-head.zr-gh',
      h(
        'span.zr-gh-l',
        h('span.st-tag', fmtNo(task.no)),
        h('span.st-pair', h('span.st-eyebrow', lang === 'en' ? pick(cat, 'name') : task.name_en), h('span', pick(task, 'name'))),
      ),
      h(
        'span.zr-gh-r',
        h('ul.st-facts.st-field', h('li', t('zeros.group.models', { n: entries.length, all: data.order.length }))),
        h('a.st-kv.zr-task', { href: links.task(task) }, h('span', t('zeros.group.task')), h('span', pick(task, 'short'))),
      ),
    );
    const recs = h(
      'ol.st-records.zr-recs',
      entries.map((e) => {
        const li = h(
          'li.zr-row',
          { id: rowId(task, e.id), dataset: { kind: e.kind }, 'aria-label': t('zeros.row', { model: modelLabel(e.model), kind: kindLabel(e.kind), text: e.text }) },
          h(
            'div.st-record.zr-rec',
            h('a.zr-who', { href: links.model(e.id) }, vendorIcon(e.model), modelName(e.model)),
            h('span.zr-kind.st-field', { title: t(`zeros.kindNote.${e.kind}`) }, h('i.zr-sw', { class: `is-${e.kind}`, 'aria-hidden': 'true' }), kindLabel(e.kind)),
            h('p.zr-why.st-read', e.text),
          ),
        );
        rows.push(li);
        return li;
      }),
    );
    const section = h('section.zr-group', { id: task.key }, headEl, recs);
    sections.set(task.key, section);
    paper.append(section);
  }

  // ---- tasks without a zero ----
  const clean = groups.filter((g) => !g.entries.length).map((g) => g.task);
  if (clean.length) {
    sections.set('clean', h(
        'section.zr-group.zr-clean',
        { id: 'clean' },
        h('h2.st-group-head.rd-group-head.zr-gh', h('span.st-pair', h('span.st-eyebrow', t('zeros.clean.en')), h('span', t('zeros.clean.title')))),
        h(
          'ul.zr-clean-list',
          clean.map((task) => h('li', h('a.st-chip', { href: links.task(task) }, h('span.n', fmtNo(task.no)), h('span', pick(task, 'name'))))),
        ),
      ));
    paper.append(sections.get('clean'));
  }

  // ---- left column ----
  const toc = zeroGroups.map(({ task, entries }) => ({
    id: task.key,
    no: String(task.no).padStart(2, '0'),
    label: h('span.zr-toc', h('span', pick(task, 'short')), h('span.zr-toc-n.num', String(entries.length))),
  }));
  if (clean.length) toc.push({ id: 'clean', label: t('zeros.clean.title') });
  const of = (n, m) => t('zeros.ledger.of', { n, all: m });
  const a = aside({
    tocLabel: t('zeros.aside.toc'),
    tocEyebrow: t('zeros.aside.tocEn'),
    toc,
    ledgerLabel: t('zeros.aside.ledger'),
    ledgerEyebrow: t('zeros.aside.ledgerEn'),
    ledger: [
      [t('zeros.ledger.zeros'), String(all.length), { hi: true }],
      [t('zeros.ledger.tasks'), of(zeroGroups.length, data.tasks.length)],
      [t('zeros.ledger.models'), of(zeroModels.length, data.order.length)],
      [t('zeros.ledger.updated'), fmtDate(data.updated)],
    ],
  });
  side.append(a.el);

  // ---- reason filter: only the picked kind's rows, groups and figure marks ----
  let current = null;
  function setKind(k) {
    current = kinds.includes(k) ? k : null;
    for (const [key, chip] of chips) chip.setAttribute('aria-pressed', String(key === current));
    for (const li of rows) li.hidden = current != null && li.dataset.kind !== current;
    for (const [key, section] of sections) {
      const on = !current || [...section.querySelectorAll('.zr-row')].some((li) => !li.hidden);   // 没有 0 分的题只在不筛选时显示
      section.hidden = !on;
      a.nav.querySelector(`a[href="#${key}"]`)?.closest('li')?.toggleAttribute('hidden', !on);
    }
    for (const c of cells) c.classList.toggle('is-dim', current != null && c.dataset.kind !== current);
    setParams({ kind: current });
  }
  setKind(getParam('kind'));

  wireAnchors(paper);
  wireToc(a.nav);
  jumpToHash();
}, { ns: [] });
