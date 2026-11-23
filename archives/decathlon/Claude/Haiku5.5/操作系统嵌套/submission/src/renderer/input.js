'use strict';
/*
 * 输入桥接：把鼠标、滚轮、键盘与中文输入转换为根系统收件箱中的 ev 消息。
 * 命中判断与焦点由窗口管理程序决定；这里只做坐标换算、双击判定和拖放落点查找。
 */
(function (global) {
  let getRoot = () => null;
  let getScale = () => 1;
  let onDrop = () => {};
  const ime = () => document.getElementById('ime');
  let lastDown = { t: -1000, x: 0, y: 0 };

  function push(ev) {
    const root = getRoot();
    if (root) root.inbox.push({ to: 'wm', type: 'ev', ev });
  }

  function pos(e) {
    const s = getScale();
    return { x: e.clientX / s, y: e.clientY / s };
  }

  function init(opts) {
    getRoot = opts.getRoot;
    getScale = opts.getScale;
    onDrop = opts.onDrop || onDrop;

    window.addEventListener('pointerdown', (e) => {
      const p = pos(e);
      const now = performance.now();
      const dbl = now - lastDown.t < 420 && Math.abs(p.x - lastDown.x) < 6 && Math.abs(p.y - lastDown.y) < 6;
      lastDown = { t: dbl ? -1000 : now, x: p.x, y: p.y };
      push({ kind: 'down', x: p.x, y: p.y, b: e.button === 2 ? 2 : 0, dbl, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey });
      e.preventDefault();
      ime().focus({ preventScroll: true });
    });
    window.addEventListener('pointermove', (e) => {
      const p = pos(e);
      push({ kind: 'move', x: p.x, y: p.y, b: e.buttons ? 1 : 0 });
    });
    window.addEventListener('pointerup', (e) => {
      const p = pos(e);
      push({ kind: 'up', x: p.x, y: p.y, b: e.button === 2 ? 2 : 0 });
      const root = getRoot();
      if (root && root.dragPayloadPending) root.dragPayloadPending = false;
      onDrop(e);
      ime().focus({ preventScroll: true });
    });
    window.addEventListener('wheel', (e) => {
      const p = pos(e);
      push({ kind: 'wheel', x: p.x, y: p.y, dy: e.deltaY, dx: e.deltaX });
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    const el = ime();
    el.addEventListener('keydown', (e) => {
      const special = e.key.length > 1 || e.ctrlKey || e.metaKey || e.altKey;
      if (e.isComposing) return;
      if (special) {
        push({ kind: 'key', key: e.key, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey });
        e.preventDefault();
      }
    });
    el.addEventListener('input', (e) => {
      if (e.isComposing) return;
      const text = el.value;
      el.value = '';
      if (text) push({ kind: 'text', text });
    });
    el.addEventListener('compositionend', (e) => {
      const text = e.data || '';
      el.value = '';
      if (text) push({ kind: 'text', text });
    });
    el.focus({ preventScroll: true });
    window.addEventListener('focus', () => el.focus({ preventScroll: true }));
  }

  global.NOSInput = { init };
})(window);
