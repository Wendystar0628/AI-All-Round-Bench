// 模型侧栏 (models.md 侧栏): every registered model in the left column, grouped
// by vendor — the vendor icon and name head each group, the group's models
// follow by total rank (rank, short name with effort, total; being tested last
// with the dashed "评测中" and "—"). Groups are ordered by their best total rank,
// vendors with no ranked model last. The current model has the violet wash and
// the violet bar, which slides from item to item. Each item is a real link to
// /models/<id>/; a plain click switches the page in place (main.js go()), a
// modified click opens it normally.
// Each vendor head folds its group (a chevron turns); the head of the column folds or opens them all. What is
// folded is remembered in localStorage ("octa.md.folded"); switching to a model opens its group.
// Narrow windows: the column folds into a selector above the head — a button
// with the current model that opens the same grouped list below it.
//
//   const picker = createPicker(navEl, { data, onPick: (id) => … });
//   picker.update(id)   mark the current model, keep it in view inside the column
//   picker.ids          the column's order (← → step through it)
import { h, t, links, rankOf, modelStatus, progress, fmtScore, fmtRank, modelName, modelLabel, vendorIcon, local } from '../../core/index.js';
import { dur, durOut, play } from '../../motion.js';

const FOLDED = 'md.folded';

export function createPicker(nav, { data, onPick }) {
  // official order (ranked by total, then being tested), plus anything registered but missing from it
  const order = [...data.order.filter((id) => data.model(id)), ...data.models.map((m) => m.id).filter((id) => !data.order.includes(id))];
  const groups = new Map();
  for (const id of order) {
    const m = data.model(id);
    if (!groups.has(m.vendor)) groups.set(m.vendor, { vendor: m.vendor, logo: m.logo, ids: [] });
    groups.get(m.vendor).ids.push(id);
  }
  // a vendor's place is its best model's place in the official order (ranked models come first there)
  const ids = [...groups.values()].flatMap((g) => g.ids);

  const items = new Map();
  const listId = 'md-side-list';
  const bar = h('span.md-side-bar', { 'aria-hidden': 'true' });
  const list = h('div.md-side-list', { id: listId }, bar);
  const folded = new Set(local.get(FOLDED, []).filter((v) => groups.has(v)));
  for (const g of groups.values()) {
    const olId = `md-side-${g.ids[0]}`;
    g.ol = h('ol.md-side-models', { id: olId });
    for (const id of g.ids) g.ol.append(h('li', item(id)));
    g.btn = h(
      'button.md-side-fold',
      { type: 'button', 'aria-controls': olId },
      h('span.md-fold-chev', { 'aria-hidden': 'true' }),
      vendorIcon(g.logo),
      h('span.md-side-vname', g.vendor),
      h('span.md-side-count.num', String(g.ids.length)),
    );
    g.btn.addEventListener('click', () => fold([g.vendor], !folded.has(g.vendor)));
    g.el = h('section.md-side-group', h('h2.md-side-vendor', g.btn), g.ol);
    list.append(g.el);
  }

  // ---------- folding ----------
  const allBtn = h('button.md-side-all', { type: 'button' });
  allBtn.addEventListener('click', () => fold([...groups.keys()], folded.size < groups.size));
  function fold(vendors, on) {
    for (const v of vendors) on ? folded.add(v) : folded.delete(v);
    local.set(FOLDED, [...folded]);
    paintFolds();
    place(false);
  }
  function paintFolds() {
    for (const g of groups.values()) {
      const f = folded.has(g.vendor);
      g.ol.hidden = f;
      g.el.classList.toggle('is-folded', f);
      g.btn.setAttribute('aria-expanded', String(!f));
      g.btn.title = t(f ? 'model.picker.unfold' : 'model.picker.fold', { vendor: g.vendor });
    }
    allBtn.textContent = t(folded.size < groups.size ? 'model.picker.foldAll' : 'model.picker.unfoldAll');
  }
  paintFolds();

  function item(id) {
    const m = data.model(id);
    const ranked = modelStatus(data, id) === 'ranked';
    const r = rankOf(data, id, 'total');
    const score = ranked ? fmtScore(data.score(id).total) : '—';
    const a = h(
      'a.md-pick',
      {
        href: links.model(id),
        dataset: { id },
        class: ranked ? null : 'is-pending',
        'aria-label': ranked ? t('common.row.aria', { rank: r.rank, name: modelLabel(m), score }) : t('common.row.ariaPending', { name: modelLabel(m), ...progress(data, id) }),
      },
      ranked ? h('span.md-pick-rank.num', fmtRank(r.rank)) : h('span.md-pick-rank'),
      modelName(m, { short: true, className: 'md-pick-name' }),
      ranked ? h('b.md-pick-score.num', score) : h('span.st-state.is-draft.md-pick-state', t('model.picker.pending')),
    );
    a.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      setOpen(false);
      onPick(id);
    });
    items.set(id, a);
    return a;
  }

  // ---------- narrow windows: the selector button ----------
  const current = h('span.md-side-current');
  const toggle = h(
    'button.md-side-toggle',
    { type: 'button', 'aria-expanded': 'false', 'aria-controls': listId },
    h('span.st-eyebrow.md-side-toggle-label', t('model.picker.choose')),
    current,
    h('span.md-side-chev', { 'aria-hidden': 'true' }),
  );
  const head = h('div.md-side-head', h('span.st-eyebrow', t('model.picker.eyebrow')), h('b', t('model.picker.title')), h('span.md-side-sub', h('span.st-field', t('common.unit.models', { n: ids.length })), allBtn));
  nav.replaceChildren(head, toggle, list);

  const narrow = matchMedia('(max-width: 1023px)');
  let open = false;
  function setOpen(on) {
    if (on === open) return;
    open = on;
    toggle.setAttribute('aria-expanded', String(on));
    nav.classList.toggle('is-open', on);
    if (!narrow.matches) return;
    // 展开 / 收起: the list reveals top-down; folding is quicker
    if (on) {
      place(false);
      if (dur('expand')) play(list, [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 'expand', easing: 'mech' });
    } else if (durOut('expand')) {
      list.classList.add('is-closing');
      play(list, [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 0 100% 0)' }], { duration: durOut('expand'), easing: 'mech' }).then(() => list.classList.remove('is-closing'));
    }
  }
  toggle.addEventListener('click', () => setOpen(!open));
  nav.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
      toggle.focus();
    }
  });
  document.addEventListener('click', (e) => open && !nav.contains(e.target) && setOpen(false));
  narrow.addEventListener('change', () => {
    setOpen(false);
    place(false);
  });

  // ---------- the current mark ----------
  let currentId = null;
  function place(slide) {
    const a = items.get(currentId);
    if (!a || !a.offsetParent) {
      bar.classList.remove('is-on');
      return;
    }
    bar.classList.toggle('is-ready', slide && dur('come') > 0);
    bar.style.transform = `translateY(${a.offsetTop}px)`;
    bar.style.height = `${a.offsetHeight}px`;
    bar.classList.add('is-on');
  }

  function update(id) {
    const slide = currentId != null;
    currentId = id;
    // the current model's group always opens
    const vendor = data.model(id).vendor;
    if (folded.has(vendor)) fold([vendor], false);
    for (const [k, a] of items) {
      const on = k === id;
      a.classList.toggle('is-current', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    const m = data.model(id);
    const ranked = modelStatus(data, id) === 'ranked';
    current.replaceChildren(
      vendorIcon(m),
      modelName(m, { className: 'md-side-current-name' }),
      ranked ? h('b.num', fmtScore(data.score(id).total)) : h('span.st-state.is-draft', t('model.picker.pending')),
    );
    place(slide);
    // keep the current item inside the column when the column scrolls (never scrolls the page)
    const a = items.get(id);
    if (!a || narrow.matches || nav.scrollHeight <= nav.clientHeight) return;
    const top = a.getBoundingClientRect().top - nav.getBoundingClientRect().top;
    if (top < 0 || top + a.offsetHeight > nav.clientHeight) nav.scrollTop += top - (nav.clientHeight - a.offsetHeight) / 2;
  }
  addEventListener('resize', () => place(false));
  document.fonts?.ready.then(() => place(false));

  return { update, ids };
}
