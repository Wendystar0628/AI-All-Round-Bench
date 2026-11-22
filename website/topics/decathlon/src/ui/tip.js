// 浮签: the site's one tooltip (leaderboard.md 交互). One shared element;
// shows on pointer and on keyboard focus. The browser's own title box is never
// used: wireTitleTips() hands every title on the page to this tooltip.
//
//   import { attachTip, showTip, hideTip } from '../../ui/tip.js';
//   attachTip(rectOrRow, () => '数学推理 78.0 × 15% = 11.7');
import { h } from '../core/dom.js';

let el = null;

function ensure() {
  if (!el) {
    el = h('div.site-tip', { role: 'tooltip', id: 'site-tip' });
    document.body.append(el);
  }
  return el;
}

/** Show text (or a node) near a point (client coordinates) or above an element. */
export function showTip(content, at) {
  const tip = ensure();
  tip.replaceChildren(content instanceof Node ? content : String(content));
  let x;
  let y;
  if (at instanceof Element) {
    const r = at.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top;
  } else ({ x, y } = at);
  const w = tip.offsetWidth;
  const hgt = tip.offsetHeight;
  tip.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, x - w / 2))}px`;
  tip.style.top = `${Math.max(8, y - hgt - 10)}px`;
  tip.classList.add('is-on');
}

export function hideTip() {
  el?.classList.remove('is-on');
}

/**
 * Every title attribute on the site shows in this tooltip, not in the browser's box: when the pointer or focus
 * reaches an element with a title, the text moves to data-tip (the browser then has nothing to draw) and the
 * tooltip shows it. Listened in the capture phase, so a page's own tooltip for the same pointer move wins.
 * An element with no text of its own keeps the words as its aria-label.
 */
export function wireTitleTips() {
  const take = (el) => {
    const text = el.getAttribute('title');
    el.removeAttribute('title');
    if (!text) return;
    el.dataset.tip = text;
    if (!el.hasAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', text);
  };
  const tipped = (e) => {
    const titled = e.target.closest?.('[title]');
    if (titled) take(titled);
    return e.target.closest?.('[data-tip]');
  };
  document.addEventListener('pointerover', tipped, true);
  document.addEventListener('pointermove', (e) => {
    const el = tipped(e);
    if (el) showTip(el.dataset.tip, { x: e.clientX, y: e.clientY - 6 });
  }, true);
  document.addEventListener('pointerout', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el && !el.contains(e.relatedTarget)) hideTip();
  }, true);
  document.addEventListener('focusin', (e) => {
    const el = tipped(e);
    if (el) showTip(el.dataset.tip, el);
  }, true);
  document.addEventListener('focusout', (e) => e.target.closest?.('[data-tip]') && hideTip(), true);
}

/** Wire an element: text() is called on pointer enter/move and focus. Returns an unwire function. */
export function attachTip(target, text) {
  const move = (e) => showTip(text(e), { x: e.clientX, y: e.clientY - 6 });
  const focus = () => showTip(text(), target);
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerleave', hideTip);
  target.addEventListener('focus', focus);
  target.addEventListener('blur', hideTip);
  target.setAttribute('aria-describedby', 'site-tip');
  return () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerleave', hideTip);
    target.removeEventListener('focus', focus);
    target.removeEventListener('blur', hideTip);
  };
}
