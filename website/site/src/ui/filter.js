// 筛选 (leaderboard.md「共用部件 / 筛选」): which models the boards show; null means every model.
// Shared by the leaderboard and the category boards through sessionStorage ("octa.filter") and the address
// (?show=<id>,<id>); a change is announced with the window event "octa:filter". Filtering only hides rows,
// it never changes ranks. The compare selection (ui/compare.js) is a separate thing.
//
//   import { isShown, onFilterChange } from '../../ui/filter.js';
//   list.update(rankBy(data, key).filter((e) => isShown(e.id)));
//   onFilterChange(() => redraw());
//   createFilterPanel({ data, onDone })   what the toolbar's 筛选 button opens: presets, vendor groups, a search
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { session, getListParam, setParams } from '../core/state.js';
import { vendorIcon, modelName } from '../core/names.js';

const KEY = 'filter';
let shown; // undefined: not read yet; null: every model; Set: the models shown

function load() {
  if (shown !== undefined) return shown;
  const fromURL = getListParam('show');
  const ids = fromURL.length ? fromURL : session.get(KEY, null);
  shown = Array.isArray(ids) ? new Set(ids.filter((x) => typeof x === 'string')) : null;
  if (fromURL.length) session.set(KEY, [...shown]);
  else if (shown) setParams({ show: [...shown] });
  return shown;
}

/** Is this model shown? */
export const isShown = (id) => load() === null || load().has(id);

/** The ids shown, or null for every model. */
export function getShown() {
  const s = load();
  return s && new Set(s);
}

/** Show these models (every registered model, or null, clears the filter). */
export function setShown(ids, data) {
  const next = ids == null || data.models.every((m) => ids.has(m.id)) ? null : new Set(ids);
  const key = (s) => (s ? [...s].sort().join(',') : '*');
  if (key(next) === key(load())) return;
  shown = next;
  session.set(KEY, next && [...next]);
  setParams({ show: next ? [...next] : null });
  dispatchEvent(new CustomEvent('octa:filter', { detail: { shown: getShown() } }));
}

/** How many models are shown, of how many. */
export function filterCount(data) {
  const all = data.models.length;
  return { n: data.models.filter((m) => isShown(m.id)).length, all, on: load() !== null };
}

/** fn(shown) on every change (this page or another tab). Returns an unsubscribe function. */
export function onFilterChange(fn) {
  const local = (e) => fn(e.detail.shown);
  const other = (e) => {
    if (e.key !== `octa.${KEY}`) return;
    shown = undefined;
    fn(getShown());
  };
  addEventListener('octa:filter', local);
  addEventListener('storage', other);
  return () => {
    removeEventListener('octa:filter', local);
    removeEventListener('storage', other);
  };
}

// quick sets: 全部 / 御三家 (OpenAI, Anthropic, Google) / 外模 / 国模 (models.json region)
const BIG3 = new Set(['OpenAI', 'Anthropic', 'Google']);
const PRESETS = {
  all: () => true,
  big3: (m) => BIG3.has(m.vendor),
  foreign: (m) => m.region !== 'cn',
  cn: (m) => m.region === 'cn',
};

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, '');

/**
 * The filter panel: a head (title and count, the presets, a search over the list, 全不选, 完成) over the
 * vendor groups — a vendor box ticks its whole group (half-ticked when only some are shown), then a box per
 * model, short name with effort, in total-rank order. Every tick applies at once.
 * Returns { el, focus() }.
 */
export function createFilterPanel({ data, onDone }) {
  const order = [...data.order.filter((id) => data.model(id)), ...data.models.map((m) => m.id).filter((id) => !data.order.includes(id))];
  const boxes = new Map();
  const groups = data.vendors.map((v) => {
    const ids = order.filter((id) => data.model(id).vendor === v.vendor);
    const all = h('input', { type: 'checkbox', 'aria-label': t('common.filter.vendorAll', { vendor: v.vendor }) });
    all.addEventListener('change', () => apply((s) => ids.forEach((id) => (all.checked ? s.add(id) : s.delete(id)))));
    const items = ids.map((id) => {
      const m = data.model(id);
      const box = h('input', { type: 'checkbox' });
      box.addEventListener('change', () => apply((s) => (box.checked ? s.add(id) : s.delete(id))));
      boxes.set(id, box);
      const lab = h('label.tbf-model', { dataset: { id } }, box, modelName(m, { short: true }));
      lab.dataset.find = norm([m.name, m.short, m.vendor, m.id, ...(m.aliases ?? [])].join('|'));
      return lab;
    });
    const el = h('fieldset.tbf-group', h('legend.tbf-vendor', h('label', all, vendorIcon(v.logo), h('span.tbf-vname', v.vendor), h('span.tbf-n.num', String(ids.length)))), h('div.tbf-models', items));
    return { v, ids, all, items, el };
  });

  const count = h('span.tbf-count.st-field', { 'aria-live': 'polite' });
  const presets = Object.keys(PRESETS).map((k) => {
    const b = h('button.st-chip.tbf-preset', { type: 'button', 'aria-pressed': 'false', dataset: { preset: k } }, t(`common.filter.preset.${k}`), h('span.n', String(data.models.filter(PRESETS[k]).length)));
    b.addEventListener('click', () => setShown(new Set(data.models.filter(PRESETS[k]).map((m) => m.id)), data));
    return b;
  });
  const find = h('input', { type: 'search', placeholder: t('common.filter.find'), 'aria-label': t('common.filter.findLabel'), autocomplete: 'off', spellcheck: 'false' });
  find.addEventListener('input', () => {
    const q = norm(find.value);
    for (const g of groups) {
      let any = false;
      for (const lab of g.items) {
        const hit = !q || lab.dataset.find.includes(q) || norm(g.v.vendor).includes(q);
        lab.hidden = !hit;
        any ||= hit;
      }
      g.el.hidden = !any;
    }
  });
  const none = h('button.st-btn.small.tbf-none', { type: 'button', onclick: () => setShown(new Set(), data) }, t('common.filter.none'));
  const done = h('button.st-btn.small.go.tbf-done', { type: 'button', onclick: () => onDone?.() }, t('common.filter.done'));
  const el = h(
    'div.tb-filter',
    { role: 'group', 'aria-label': t('common.filter.title') },
    h('div.tbf-head', h('b.tbf-title', t('common.filter.title')), count, h('div.tbf-presets', presets), h('label.st-search.tbf-find', find), h('div.tbf-acts', none, done)),
    h('div.tbf-groups', groups.map((g) => g.el)),
  );

  function apply(change) {
    const s = getShown() ?? new Set(data.models.map((m) => m.id));
    change(s);
    setShown(s, data);
  }

  function paint() {
    for (const [id, box] of boxes) box.checked = isShown(id);
    for (const g of groups) {
      const on = g.ids.filter(isShown).length;
      g.all.checked = on === g.ids.length;
      g.all.indeterminate = on > 0 && on < g.ids.length;
      g.el.classList.toggle('is-off', on === 0);
    }
    const c = filterCount(data);
    count.textContent = t('common.filter.count', c);
    for (const b of presets) {
      const match = data.models.every((m) => PRESETS[b.dataset.preset](m) === isShown(m.id));
      b.setAttribute('aria-pressed', String(match));
    }
  }
  onFilterChange(paint);
  paint();

  return { el, focus: () => find.focus() };
}
