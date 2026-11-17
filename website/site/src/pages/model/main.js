// 模型得分 /models/<id>/ and the entry page /models/ (the top model; website/docs/models.md),
// a console page: the side column (every model, grouped by vendor, each vendor
// foldable) beside head (fields, three big figures, compare, download) → one
// figure: the star dial fixed to this model and the 10-category bars, saved as
// one image → the 13-task bars grouped by category → strengths and weaknesses.
// Narrow windows fold the column into a selector above the head.
// Picking a model (column, ← →) switches it in place: stars settle, bars morph,
// the address becomes /models/<id>/ with a history entry; back / forward work.
import './style.css';
import { boot, registerShortcut } from '../../shell/index.js';
import { h, t, route, links, modelLabel, altHref, BASE } from '../../core/index.js';
import { createStarDial, exportButton, chartBody } from '../../charts/index.js';
import { modelFacts, guideLines } from '../../ui/facts.js';
import { dur, onEnterView } from '../../motion.js';
import { createHead } from './head.js';
import { createBarChart } from './bars.js';
import { createStrengths } from './strengths.js';
import { createPicker } from './picker.js';
import { mountSky } from '../../decor/skyclock.js';

boot(({ data }) => {
  const main = document.querySelector('main');
  mountSky(main.querySelector('.md-head-decor'), 'sundial');
  const slot = main.querySelector('[data-slot="page"]');
  const header = main.querySelector('.md-head');
  const side = main.querySelector('.md-side');
  if (!data) {
    slot.replaceChildren();
    return;
  }
  let id = route.model;
  if (!data.model(id)) {
    createPicker(side, { data, onPick: (next) => (location.href = links.model(next)) });
    header.hidden = true;
    slot.replaceChildren(h('div.site-empty', h('p', t('model.missing'), ' ', h('a', { href: links.leaderboard() }, t('common.pages.leaderboard.title')))));
    return;
  }

  const nameOf = () => modelLabel(data.model(id));
  // 存为图片: a figure of this model as a poster (charts/poster.js), with the model's figures and how to read it
  const chartPoster = (kicker, what, body, lines = []) => {
    const G = guideLines(data);
    return { kicker, title: nameOf(), subtitle: what, facts: modelFacts(data, id), body, guide: [...lines, G.total, G.rules] };
  };
  const head = createHead(header, { data });
  const picker = createPicker(side, { data, onPick: (next) => go(next) });

  // ---------- one figure: the star dial and the 10 categories ----------
  const pair = (eyebrow, title) => h('span.st-pair', h('span.st-eyebrow', eyebrow), h('span', title));
  const ovTitle = t('model.overview.title', { n: data.categories.length });
  const dialBox = h('div.md-dial-box');
  const catBox = h('div.md-chart-box.is-fill');
  const overview = h(
    'section.st-panel.md-overview',
    h(
      'h2',
      pair(t('model.overview.eyebrow'), ovTitle),
      exportButton({ poster: () => chartPoster(t('model.overview.eyebrow'), ovTitle, chartBody(dial.svg, cats.svg), [t('model.dial.note')]), filename: () => `ai-decathlon-dial-${id}` }),
    ),
    h('div.md-ov-body', h('figure.md-ov-dial', dialBox, h('figcaption.st-field.md-dial-note', t('model.dial.note'))), h('div.md-ov-cats', catBox)),
  );
  const taskBox = h('div.md-chart-box');
  const taskPanel = h(
    'section.st-panel.md-tasks-panel',
    h(
      'h2',
      pair(t('model.tasks.eyebrow'), t('common.unit.tasksShort', { n: data.tasks.length })),
      exportButton({ poster: () => chartPoster(t('model.tasks.eyebrow'), t('common.unit.tasksShort', { n: data.tasks.length }), chartBody(tasks.svg)), filename: () => `ai-decathlon-tasks-${id}` }),
    ),
    taskBox,
  );
  const swBox = h('div.md-sw-wrap');
  slot.replaceChildren(overview, taskPanel, swBox);

  // ---------- entrance: head powers on → dial assembles, stars settle → bars grow ----------
  head.update(id, { dir: 0 });
  picker.update(id);
  if (dur('power')) {
    header.classList.add('st-in-power');
    header.addEventListener('animationend', () => header.classList.remove('st-in-power'), { once: true });
  }
  const dial = createStarDial(dialBox, { data, model: id, entrance: 'center', links: true, tagLink: false });
  const cats = createBarChart(catBox, { data, model: id, fill: true, label: t('model.cats.exportTitle', { name: nameOf() }) });
  const tasks = createBarChart(taskBox, { data, model: id, grouped: true, label: t('model.tasks.exportTitle', { name: nameOf() }) });
  const sw = createStrengths(swBox, { data });
  sw.update(id);
  setTimeout(() => cats.enter(), dur('power') ? 380 : 0);
  // the task chart grows when it is first scrolled to
  const isFirstScreen = taskBox.getBoundingClientRect().top < innerHeight;
  const cancelTasks = onEnterView(taskBox, () => setTimeout(() => tasks.enter(), isFirstScreen && dur('power') ? 520 : 0));

  // ---------- switching models in place, with a history entry ----------
  const entryId = id; // on the entry page /models/ this is the top model
  history.replaceState({ ...history.state, model: id }, '');
  const order = picker.ids;
  const step = (d) => {
    const i = order.indexOf(id) + d;
    if (i >= 0 && i < order.length) go(order[i]);
  };
  // the address now names this model: the nav's 模型得分 is a section, the language links follow
  function syncShell() {
    const nav = document.querySelector('.site-bar [data-nav="models"]');
    const entry = location.pathname.replace(BASE, '/').replace(/^\/en\//, '/') === '/models/';
    nav?.setAttribute('aria-current', entry ? 'page' : 'true');
    document.querySelectorAll('[data-lang-switch]').forEach((a) => a.setAttribute('href', altHref(a.dataset.langSwitch)));
  }
  function go(next, dir, { push = true } = {}) {
    if (!data.model(next) || next === id) return;
    dir = dir ?? (order.indexOf(next) > order.indexOf(id) ? 1 : -1);
    id = next;
    cancelTasks();
    const m = data.model(id);
    if (push) history.pushState({ model: id }, '', links.model(id));
    document.body.dataset.id = id;
    document.title = `${modelLabel(m)} │ ${t('common.pages.model.title')} │ ${t('common.site.name')}`;
    syncShell();
    picker.update(id);
    head.update(id, { dir });
    dial.setModel(id);
    cats.setModel(id);
    tasks.setModel(id);
    sw.update(id, { animate: true });
  }
  addEventListener('popstate', (e) => {
    const m = /\/models\/([^/]+)\/?$/.exec(location.pathname);
    const next = e.state?.model ?? (m ? m[1] : entryId);
    if (!data.model(next) || next === id) return;
    go(next, undefined, { push: false });
  });
  registerShortcut({ key: 'ArrowLeft', label: t('model.keys.prev'), display: '←', handler: () => step(-1) });
  registerShortcut({ key: 'ArrowRight', label: t('model.keys.next'), display: '→', handler: () => step(1) });
});
