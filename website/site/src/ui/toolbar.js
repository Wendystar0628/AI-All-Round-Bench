// The toolbar above the boards (leaderboard.md「共用部件 / 工具条」), sticky under the command bar.
// Left: the two modes, 筛选 and 对比, one open at a time, and — while a filter is on — what it shows with a
// button to clear it. Right (slots.end): the page's tools, 下载数据 last. Under them the open mode's panel: the
// filter panel (ui/filter.js) or the compare tray (the ticked models, 清空, 查看对比, 完成). By default no row
// carries a tick box; the compare ticks appear only while 对比 is on (ui/compare.js).
//
//   const tb = createToolbar({ data, download: { csv: () => scoreTable(...), json: true } });
//   container.append(tb.el);
//   tb.on('compare', () => …)          查看对比 / 返回榜单 pressed; without a listener: /leaderboard/?view=compare&cmp=…
//   tb.toggleFilter(), tb.toggleCompare()   the F and C keys
//   tb.setCompareView(on)              the leaderboard's compare view is showing: the tray's button reads 返回榜单
//   tb.slots.top / tb.slots.end        rows and tools of the page (the leaderboard's views, sort, weights)
//   tb.slots.bottom                    a row under the toolbar that sticks with it (题目类别榜的跳转条)
//   createToolbar({ wrap: true })      let the rows wrap onto more lines
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { links } from '../core/route.js';
import { modelLabel } from '../core/names.js';
import { getCompare, setCompare, toggleCompare, onCompareChange, isComparing, setComparing, onComparingChange, MAX_COMPARE } from './compare.js';
import { createFilterPanel, filterCount, onFilterChange, setShown } from './filter.js';
import { downloadCSV, downloadJSON, downloadBundle } from './download.js';
import { flashDone } from '../vendor/stellar/fx.js';
import { play } from '../motion.js';

// the two mode glyphs: a funnel (筛选) and three bars of different length (对比)
const GLYPHS = {
  filter: '<svg viewBox="0 0 16 16"><path d="M1.5 2.5h13l-5 6v5l-3 1.5v-6.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  compare: '<svg viewBox="0 0 16 16"><path d="M2 3.5h8M2 8h12M2 12.5h5.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
};
function glyph(k) {
  const s = h('span.tb-glyph', { 'aria-hidden': 'true' });
  s.innerHTML = GLYPHS[k];
  return s;
}

/**
 * Options:
 *   data        loadData() result (required)
 *   download    null | { csv: () => ({ columns, rows, preface }), json: true | () => object }
 *   wrap        false (default): every row stays on one line; true: rows may wrap
 * Returns { el, slots: { top, end, bottom }, on(type, fn), toggleFilter(), toggleCompare(), setCompareView(on) }
 * Events: 'compare' (查看对比 or 返回榜单 pressed)
 */
export function createToolbar({ data, download = null, wrap = false } = {}) {
  const events = new EventTarget();
  const emit = (type, detail) => events.dispatchEvent(new CustomEvent(type, { detail }));
  let listening = false;
  let filterOpen = false;
  let compareView = false;

  const top = h('div.tb-top');
  const end = h('div.tb-end');
  const bottom = h('div.tb-bottom');
  const panelId = `tb-panel-${Math.random().toString(36).slice(2, 8)}`;

  // ---------- the two modes ----------
  const filterN = h('span.tb-mode-n.num');
  const filterBtn = h('button.st-btn.small.tb-mode', { type: 'button', 'aria-expanded': 'false', 'aria-controls': panelId, 'aria-keyshortcuts': 'F', title: t('common.toolbar.filterTitle') }, glyph('filter'), h('span', t('common.toolbar.filter')), filterN);
  const compareN = h('span.tb-mode-n.num');
  const compareBtn = h('button.st-btn.small.tb-mode.tb-mode-compare', { type: 'button', 'aria-pressed': 'false', 'aria-controls': panelId, 'aria-keyshortcuts': 'C', title: t('common.toolbar.compareTitle') }, glyph('compare'), h('span', t('common.toolbar.compare')), compareN);
  filterBtn.addEventListener('click', () => setMode(filterOpen ? null : 'filter'));
  compareBtn.addEventListener('click', () => setMode(isComparing() ? null : 'compare'));
  // a filter that is on, while its panel is closed: what it shows, and a way back to every model
  const statusText = h('span');
  const status = h('span.tb-status.st-field', statusText, h('button.tb-clear', { type: 'button', onclick: () => setShown(null, data) }, t('common.toolbar.filterClear')));

  // ---------- the panels ----------
  const filterPanel = createFilterPanel({ data, onDone: () => setMode(null) });
  const trayList = h('div.tb-tray', { 'aria-live': 'polite' });
  const trayGo = h('button.st-btn.small.go.tb-cmp-go', { type: 'button' });
  trayGo.addEventListener('click', () => {
    if (listening) emit('compare');
    else location.href = links.compare(getCompare());
  });
  const tray = h(
    'div.tb-cmp',
    { role: 'group', 'aria-label': t('common.toolbar.compare') },
    h('b.tb-cmp-title', t('common.toolbar.compareTray', { n: MAX_COMPARE })),
    trayList,
    h(
      'div.tb-cmp-acts',
      h('button.st-btn.small', { type: 'button', onclick: () => setCompare([]) }, t('common.toolbar.compareClear')),
      trayGo,
      h('button.st-btn.small', { type: 'button', onclick: () => setMode(null) }, t('common.toolbar.done')),
    ),
  );
  const panel = h('div.tb-panel', { id: panelId, hidden: true });

  const left = h('div.tb-left', filterBtn, compareBtn, status);
  const el = h('div.site-toolbar', { role: 'toolbar', 'aria-label': t('common.toolbar.label'), class: wrap ? 'is-wrap' : null }, top, h('div.tb-main', left, end), panel, bottom);
  // the top and bottom slots show only when something is put in them
  for (const slot of [top, bottom]) {
    slot.hidden = true;
    new MutationObserver(() => (slot.hidden = !slot.childElementCount)).observe(slot, { childList: true });
  }
  // Esc inside the toolbar closes the open mode
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || (!filterOpen && !isComparing())) return;
    e.stopPropagation();
    setMode(null);
  });

  function setMode(mode) {
    const was = filterOpen ? 'filter' : isComparing() ? 'compare' : null;
    filterOpen = mode === 'filter';
    setComparing(mode === 'compare');
    paint();
    if (mode && mode !== was) {
      play(panel, [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0)' }], { duration: 'expand', easing: 'mech' });
      if (mode === 'filter') filterPanel.focus();
    }
  }

  function paintTray() {
    const ids = getCompare().filter((id) => data.model(id));
    trayList.replaceChildren(
      ...ids.map((id, i) => {
        const m = data.model(id);
        const b = h('button.st-chip.tb-slot', { type: 'button', title: t('common.toolbar.compareRemove', { name: modelLabel(m) }), style: { '--c': `var(--compare-${i + 1})` } }, h('b.num', String(i + 1).padStart(2, '0')), m.short || m.name);
        b.addEventListener('click', () => toggleCompare(id, false));
        return b;
      }),
    );
    if (!ids.length) trayList.append(h('span.tb-hint.st-field', t('common.toolbar.compareHint')));
    trayGo.textContent = compareView ? t('common.toolbar.compareBack') : t('common.toolbar.compareGo');
    trayGo.disabled = !compareView && ids.length < 2;
    compareN.textContent = ids.length ? String(ids.length) : '';
  }

  function paint() {
    const comparing = isComparing();
    filterBtn.setAttribute('aria-expanded', String(filterOpen));
    filterBtn.classList.toggle('is-on', filterOpen);
    compareBtn.setAttribute('aria-pressed', String(comparing));
    compareBtn.classList.toggle('is-on', comparing);
    const c = filterCount(data);
    filterN.textContent = c.on ? `${c.n}/${c.all}` : '';
    statusText.textContent = t('common.toolbar.filterStatus', c);
    status.hidden = !c.on || filterOpen;
    const show = filterOpen ? filterPanel.el : comparing ? tray : null;
    panel.hidden = !show;
    if (show && panel.firstChild !== show) panel.replaceChildren(show);
    paintTray();
  }
  onFilterChange(paint);
  onCompareChange(paintTray);
  onComparingChange(paint);

  // ---------- download ----------
  if (download) {
    const menuId = `tb-dl-${Math.random().toString(36).slice(2, 8)}`;
    const btn = h('button.st-btn.small.tb-download', { type: 'button', popovertarget: menuId, 'aria-haspopup': 'menu' }, t('common.toolbar.download'));
    const item = (label, fn) => {
      const b = h('button.st-act.tb-dl-item', { type: 'button', role: 'menuitem' }, h('span', label));
      b.addEventListener('click', async () => {
        menu.hidePopover?.();
        await fn();
        flashDone(btn, t('common.toolbar.saved'));
      });
      return b;
    };
    const menu = h(
      'div.tb-dl-menu',
      { id: menuId, popover: 'auto', role: 'menu' },
      download.csv ? item(t('common.toolbar.csv'), () => downloadCSV({ ...download.csv(), updated: data.updated })) : null,
      download.json ? item(t('common.toolbar.json'), () => (typeof download.json === 'function' ? downloadJSON(download.json()) : downloadBundle())) : null,
    );
    menu.addEventListener('toggle', (e) => {
      if (e.newState !== 'open') return;
      const r = btn.getBoundingClientRect();
      menu.style.top = `${r.bottom + 4}px`;
      menu.style.left = `${Math.max(8, r.right - menu.offsetWidth)}px`;
    });
    end.append(btn, menu);
  }

  paint();

  return {
    el,
    slots: { top, end, bottom },
    on(type, fn) {
      if (type === 'compare') listening = true;
      const w = (e) => fn(e.detail);
      events.addEventListener(type, w);
      return () => events.removeEventListener(type, w);
    },
    toggleFilter: () => setMode(filterOpen ? null : 'filter'),
    toggleCompare: () => setMode(isComparing() ? null : 'compare'),
    /** Open the compare mode (the leaderboard opened on its compare view). */
    openCompare: () => setMode('compare'),
    setCompareView(on) {
      compareView = on;
      paintTray();
    },
  };
}
