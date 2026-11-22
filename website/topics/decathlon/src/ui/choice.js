// 选项按钮 (leaderboard.md「共用部件 / 控件」): the one control for every labelled choice of a board — 图表, 排序,
// 开销, 粒度. A framed button that reads "<group> <current value> ▾"; pressing it opens the choices in a menu right
// under it, the current one marked (violet wash, violet bar), each with an optional line saying what it shows and
// its key. A pick closes the menu; Esc and a click elsewhere close it too; ↑ ↓ move between the choices.
// The button owns what it shows: a pick becomes its current value at once, then onPick tells the page; picking
// the current value again does nothing.
//
//   const c = createChoice({ label: '图表', options: [{ value, text, note?, key?, group? }], value, onPick: (v) => … });
//   el.append(c.el);
//   c.set(value)          the value changed elsewhere (a key, the address, a column head): show it
//   c.setDisabled(on)     the board does not use this choice now (the compare view has no sort)
//   c.setValueText(text)  a current value that is not one of the choices (the compare view under 图表)
import { h } from '../core/dom.js';

let seq = 0;

export function createChoice({ label, options, value, onPick, className = '' }) {
  const id = `ctl-menu-${++seq}`;
  const valEl = h('span.ctl-val');
  const btn = h(
    'button.st-btn.ctl-btn.ctl-choice',
    { type: 'button', class: className || null, popovertarget: id, 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
    h('b.ctl-k', label),
    valEl,
    h('span.ctl-chev', { 'aria-hidden': 'true' }),
  );
  const items = new Map();
  const menu = h('div.ctl-menu', { id, popover: 'auto', role: 'menu', 'aria-label': label });
  let group = null;
  for (const o of options) {
    if (o.group && o.group !== group) {
      group = o.group;
      menu.append(h('div.ctl-menu-group', { role: 'presentation' }, group));
    }
    const item = h(
      'button.ctl-opt',
      { type: 'button', role: 'menuitemradio', 'aria-checked': 'false', dataset: { value: o.value } },
      h('span.ctl-opt-text', o.text, o.note ? h('small.ctl-opt-note', o.note) : null),
      o.key ? h('kbd.ctl-opt-key', o.key) : null,
    );
    item.addEventListener('click', () => {
      menu.hidePopover?.();
      const v = item.dataset.value;
      if (v === current) return;
      set(v);
      onPick(v);
    });
    items.set(String(o.value), item);
    menu.append(item);
  }
  // under the button, as wide as it at least; kept inside the window
  menu.addEventListener('toggle', (e) => {
    const open = e.newState === 'open';
    btn.setAttribute('aria-expanded', String(open));
    btn.classList.toggle('is-open', open);
    if (!open) return;
    const r = btn.getBoundingClientRect();
    menu.style.minWidth = `${r.width}px`;
    menu.style.top = `${r.bottom + 4}px`;
    menu.style.left = `${Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8))}px`;
    (items.get(current) ?? menu.querySelector('.ctl-opt'))?.focus({ preventScroll: true });
  });
  menu.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const list = [...items.values()];
    const i = list.indexOf(document.activeElement);
    list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]?.focus();
  });
  // the menu leaves the page flow (top layer) but follows the button when the page scrolls
  addEventListener('scroll', () => menu.matches(':popover-open') && menu.hidePopover(), { passive: true });

  let current = null;
  function set(v) {
    current = String(v);
    for (const [k, item] of items) item.setAttribute('aria-checked', String(k === current));
    const o = options.find((x) => String(x.value) === current);
    valEl.textContent = o ? o.text : '';
  }
  set(value);

  return {
    el: h('div.ctl', btn, menu),
    set,
    setDisabled(on) {
      btn.disabled = on;
    },
    setValueText(text) {
      valEl.textContent = text;
    },
  };
}
