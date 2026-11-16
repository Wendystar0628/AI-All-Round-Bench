// 对比 (leaderboard.md「共用部件 / 对比」): the compare selection — up to 4 model ids, in the order they
// were ticked — and the compare mode. Separate from the filter (ui/filter.js).
//
// The selection is shared by every page through sessionStorage ("octa.compare"), so ticks made on one board
// carry to the other; changes are announced with the window event "octa:compare" { detail: { ids } }.
// The mode is this page's: rows carry the compare ticks only while it is on (the toolbar's 对比 button), and the
// ticked rows are marked only then. It is written on <html data-comparing> for the stylesheets, and announced
// with "octa:comparing" { detail: { on } }.
//
//   import { getCompare, toggleCompare, onCompareChange, isComparing, setComparing, onComparingChange } from '../../ui/compare.js';
import { session, getListParam } from '../core/state.js';

export const MAX_COMPARE = 4;
const KEY = 'compare';

let ids = null;

function load() {
  if (ids) return ids;
  const fromURL = getListParam('cmp');
  ids = (fromURL.length ? fromURL : session.get(KEY, [])).filter((x) => typeof x === 'string').slice(0, MAX_COMPARE);
  if (fromURL.length) session.set(KEY, ids);
  return ids;
}

/** The ticked ids, in ticking order. */
export function getCompare() {
  return [...load()];
}

/** Replace the selection (extra ids beyond 4 are dropped). */
export function setCompare(next) {
  const clean = [...new Set(next)].slice(0, MAX_COMPARE);
  const before = load().join(',');
  ids = clean;
  session.set(KEY, ids);
  if (before !== ids.join(',')) dispatchEvent(new CustomEvent('octa:compare', { detail: { ids: [...ids] } }));
}

export function isCompared(id) {
  return load().includes(id);
}

/** 1-based order of a ticked id, or 0. */
export function compareIndex(id) {
  return load().indexOf(id) + 1;
}

export function isCompareFull() {
  return load().length >= MAX_COMPARE;
}

/** Tick or untick; returns false (and changes nothing) when ticking a 5th. */
export function toggleCompare(id, on = !isCompared(id)) {
  const cur = load();
  if (on) {
    if (cur.includes(id)) return true;
    if (cur.length >= MAX_COMPARE) return false;
    setCompare([...cur, id]);
  } else setCompare(cur.filter((x) => x !== id));
  return true;
}

/** fn(ids) on every change (this page or another tab). Returns an unsubscribe function. */
export function onCompareChange(fn) {
  const local = (e) => fn(e.detail.ids);
  const other = (e) => {
    if (e.key !== `octa.${KEY}`) return;
    ids = null;
    fn(getCompare());
  };
  addEventListener('octa:compare', local);
  addEventListener('storage', other);
  return () => {
    removeEventListener('octa:compare', local);
    removeEventListener('storage', other);
  };
}

/** Is the compare mode on (rows carry the ticks)? */
export const isComparing = () => document.documentElement.hasAttribute('data-comparing');

/** Turn the compare mode on or off. */
export function setComparing(on) {
  if (on === isComparing()) return;
  document.documentElement.toggleAttribute('data-comparing', on);
  dispatchEvent(new CustomEvent('octa:comparing', { detail: { on } }));
}

/** fn(on) when the compare mode turns on or off. Returns an unsubscribe function. */
export function onComparingChange(fn) {
  const w = (e) => fn(e.detail.on);
  addEventListener('octa:comparing', w);
  return () => removeEventListener('octa:comparing', w);
}
