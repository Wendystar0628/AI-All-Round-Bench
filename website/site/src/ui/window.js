// 榜单窗口 (docs/README「榜单窗口」): every list of models — model rows (ui/modelRow.js), the 按题 columns of a
// category board (one window for all its columns) and the score matrix (ui/matrix.js) — shows at most WINDOW_ROWS
// models; with more, its rows scroll inside the box, which is exactly as tall as the heads and the first WINDOW_ROWS
// rows (their sub rows included), and the heads stay put. At the top or the bottom of the box the wheel goes on to
// the page. 存为图片 does not read the window: the images are drawn from the data (charts/poster.js).
//
//   const win = createWindow(box, { rows: () => ol.children });
//   win.fit();            // after the rows change (a ResizeObserver also refits on layout changes)
//   win.reveal(li);       // scroll a row to the middle of the box when it is below the window
export const WINDOW_ROWS = 20;

const LINE = 16; // px per wheel line (deltaMode 1)

export function createWindow(box, { rows, size = WINDOW_ROWS }) {
  box.classList.add('st-window');
  function fit() {
    const list = [...rows()].filter((r) => r.offsetParent !== null);
    const on = list.length > size;
    box.classList.toggle('is-window', on);
    if (!on) {
      box.style.maxHeight = '';
      return;
    }
    const top = box.getBoundingClientRect().top - box.scrollTop;
    box.style.maxHeight = `${Math.ceil(list[size - 1].getBoundingClientRect().bottom - top)}px`;
  }
  // refit when the box first gets laid out (a list filled before it was on the page) and whenever its content resizes
  const watch = new ResizeObserver(() => fit());
  for (const node of [box, ...box.children]) watch.observe(node);

  // the box has reached its top (or bottom) and the wheel keeps going that way: scroll the page instead of stopping
  // (the browser would keep the gesture latched to the box)
  box.addEventListener(
    'wheel',
    (e) => {
      if (!box.classList.contains('is-window') || e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const dy = e.deltaY * (e.deltaMode === 1 ? LINE : e.deltaMode === 2 ? innerHeight : 1);
      const atTop = box.scrollTop <= 0;
      const atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 1;
      if ((dy < 0 && atTop) || (dy > 0 && atEnd)) {
        e.preventDefault();
        window.scrollBy({ top: dy, behavior: 'instant' });
      }
    },
    { passive: false },
  );

  return {
    watch, // held with the list, so the observer lives as long as its list (a list built off the page included)
    fit,
    reveal(row) {
      if (!row || !box.classList.contains('is-window')) return;
      const head = box.querySelector(':scope > .mrow-head, thead');
      const headH = head ? head.getBoundingClientRect().height : 0;
      const view = box.clientHeight - headH;
      const y = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - headH;
      if (y + row.offsetHeight > box.scrollTop + view) box.scrollTop = Math.max(0, y - (view - row.offsetHeight) / 2);
    },
  };
}
