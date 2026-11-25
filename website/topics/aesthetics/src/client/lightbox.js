// 看图器。页面里 [data-gallery] 容器中的 a[data-shot]（parts.mjs 的 shot()、wall() 画的）点开看大图，
// 同一个容器里的图前后翻页。骨架由页面骨架放进页面（parts.mjs lightbox()），这里只接交互。
//
//   键盘    ← → 翻页（放大时 ← → ↑ ↓ 平移），Home / End 第一张 / 最后一张，Esc 关闭，+ − 缩放，0 还原；
//           Tab 只在看图器里看得见的按钮之间转
//   鼠标    点图放大到细节 / 再点还原，滚轮缩放，放大后拖动平移，点图外的地方关闭
//   触屏    左右滑翻页，双指缩放，双击放大 / 还原，放大后拖动平移，往下滑关闭
//   网址    #shot=<型号id>/<题key>/<NN> 直接打开那一张；看图时地址跟着变，「复制链接」复制的就是它；
//           浏览器的「后退」先关掉看图器；从这种网址打开的，关掉后翻到那张缩略图并把焦点放在它上面
//   事件    每换一张图在 document 上发 ae:lightbox（detail: { id, anchor }），页面可以借它切到那张图所在的型号
const MIN_SWIPE = 56;
const TAP_SLOP = 6;

export function initLightbox() {
  const root = document.querySelector('[data-lightbox]');
  if (!root) return;
  const stage = root.querySelector('[data-lb-stage]');
  const pic = root.querySelector('.lb-img');
  const text = root.querySelector('.lb-text');
  const count = root.querySelector('.lb-count');
  const orig = root.querySelector('.lb-orig');
  const toast = root.querySelector('.lb-toast');
  const $ = (cls) => root.querySelector(`.${cls}`);
  const zoomBtn = $('lb-zoom');
  const PAN = 80;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  let list = [];
  let index = 0;
  let pushed = false;          // 打开时往历史里加过一条（关的时候用「后退」收回）
  let opener = null;
  let fit = { w: 0, h: 0 };    // 图在「适合窗口」时的显示尺寸
  let scale = 1, tx = 0, ty = 0;

  const anchorsOf = (a) => [...a.closest('[data-gallery]').querySelectorAll('a[data-shot]')];
  const itemOf = (a) => ({ id: a.dataset.shot, src: a.href, thumb: a.dataset.thumb, w: +a.dataset.w, h: +a.dataset.h, caption: a.dataset.caption, alt: a.querySelector('img')?.alt ?? '', anchor: a });
  const hashId = () => (location.hash.startsWith('#shot=') ? decodeURIComponent(location.hash.slice(6)) : null);
  const bare = () => location.pathname + location.search;

  /* ---------- 开、关、翻页 ---------- */

  function open(anchors, i, push) {
    list = anchors.map(itemOf);
    opener = document.activeElement;
    root.hidden = false;
    document.documentElement.classList.add('lb-open');
    void root.offsetWidth;     // 先排一次版，淡入才有起点
    root.classList.add('is-open');
    show(i, push ? 'push' : null);
    $('lb-close').focus({ preventScroll: true });
  }

  function hide() {
    if (root.hidden) return;
    root.classList.remove('is-open');
    const done = () => {
      root.hidden = true;
      document.documentElement.classList.remove('lb-open');
      pic.removeAttribute('src');
      if (opener && opener !== document.body && document.contains(opener)) {
        opener.focus({ preventScroll: true });
      } else {
        // 从带 #shot= 的网址直接打开的：没有原来的元素可还，翻到这张图的缩略图并聚焦它
        const a = list[index]?.anchor;
        a?.scrollIntoView({ block: 'center' });
        a?.focus({ preventScroll: true });
      }
    };
    setTimeout(done, reduce.matches ? 150 : 90);
  }

  function close() {
    if (pushed) {
      pushed = false;
      history.back();          // popstate → sync() → hide()
    } else {
      history.replaceState(history.state, '', bare());
      hide();
    }
  }

  function show(i, mode) {
    index = (i + list.length) % list.length;
    const it = list[index];
    layout(it);
    zoomTo(1);
    pic.alt = it.alt;
    pic.src = it.thumb;
    root.classList.add('is-loading');
    const full = new Image();
    full.decoding = 'async';
    full.onload = () => {
      if (list[index] !== it) return;
      pic.src = it.src;
      root.classList.remove('is-loading');
      for (const k of [index + 1, index - 1]) if (list.length > 1) new Image().src = list[(k + list.length) % list.length].src;
    };
    full.src = it.src;
    text.textContent = it.caption;
    count.textContent = `${index + 1} / ${list.length}`;
    orig.href = it.src;
    $('lb-prev').hidden = $('lb-next').hidden = list.length < 2;
    if (mode === 'push') {
      history.pushState(history.state, '', `${bare()}#shot=${it.id}`);
      pushed = true;
    } else if (mode === 'replace') {
      history.replaceState(history.state, '', `${bare()}#shot=${it.id}`);
    }
    document.dispatchEvent(new CustomEvent('ae:lightbox', { detail: { id: it.id, anchor: it.anchor } }));
  }

  const step = (d) => list.length > 1 && show(index + d, 'replace');

  /** 地址里的 #shot= 和看图器对上（刚打开页面、前进后退、手改地址） */
  function sync() {
    const id = hashId();
    if (!id) {
      pushed = false;
      hide();
      return;
    }
    if (!root.hidden && list[index]?.id === id) return;
    const a = [...document.querySelectorAll('[data-gallery] a[data-shot]')].find((x) => x.dataset.shot === id);
    if (!a) return;
    const anchors = anchorsOf(a);
    if (root.hidden) open(anchors, anchors.indexOf(a), false);
    else {
      list = anchors.map(itemOf);
      show(anchors.indexOf(a), null);
    }
  }

  /* ---------- 尺寸与缩放 ---------- */

  function layout(it = list[index]) {
    const r = stage.getBoundingClientRect();
    const k = Math.min(r.width / it.w, r.height / it.h);
    fit = { w: Math.round(it.w * k), h: Math.round(it.h * k) };
    pic.style.width = `${fit.w}px`;
    pic.style.height = `${fit.h}px`;
  }

  const maxScale = () => Math.max(3, (list[index].w / fit.w) * 2);
  const detailScale = () => Math.max(2, list[index].w / fit.w);

  function clampPan() {
    const r = stage.getBoundingClientRect();
    const mx = Math.max(0, (fit.w * scale - r.width) / 2), my = Math.max(0, (fit.h * scale - r.height) / 2);
    tx = Math.min(mx, Math.max(-mx, tx));
    ty = Math.min(my, Math.max(-my, ty));
  }

  function apply(animate) {
    const zoomed = scale > 1.01;
    pic.classList.toggle('is-anim', Boolean(animate) && !reduce.matches);
    pic.style.transform = scale === 1 && !tx && !ty ? '' : `translate(${tx}px, ${ty}px) scale(${scale})`;
    root.classList.toggle('is-zoomed', zoomed);
    zoomBtn.setAttribute('aria-pressed', String(zoomed));
  }

  /** 放大以后用键盘平移（按 → 看右边：图往左挪） */
  function pan(dx, dy) {
    tx += dx;
    ty += dy;
    clampPan();
    apply(true);
  }

  /** 缩放到 s，屏幕上 (x, y) 这一点不动（不给点就以中心为准） */
  function zoomTo(s, x, y, animate = false) {
    s = Math.min(maxScale(), Math.max(1, s));
    if (x != null) {
      const r = stage.getBoundingClientRect();
      const cx = x - (r.left + r.width / 2), cy = y - (r.top + r.height / 2);
      tx = cx - ((cx - tx) / scale) * s;
      ty = cy - ((cy - ty) / scale) * s;
    }
    scale = s;
    if (s === 1) tx = ty = 0;
    clampPan();
    apply(animate);
  }

  const toggleZoom = (x, y) => zoomTo(scale > 1.01 ? 1 : detailScale(), x, y, true);

  /* ---------- 指针：拖动、双指、滑动 ---------- */

  const pts = new Map();
  let drag = null, pinch = null, lastTap = 0;

  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: scale };
      drag = null;
    } else if (pts.size === 1) {
      drag = { x: e.clientX, y: e.clientY, tx, ty, type: e.pointerType, moved: false, onPic: e.target === pic };
    }
  });

  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()];
      zoomTo(pinch.s * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d), (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP) drag.moved = true;
    if (scale > 1.01) {
      tx = drag.tx + dx;
      ty = drag.ty + dy;
      clampPan();
      apply(false);
    } else if (drag.type !== 'mouse') {
      // 跟手：横着滑是翻页，往下滑是关闭
      const down = Math.abs(dy) > Math.abs(dx) && dy > 0;
      pic.style.transform = down ? `translateY(${dy}px)` : `translateX(${dx}px)`;
      root.style.setProperty('--lb-fade', down ? String(Math.max(0.35, 1 - dy / 400)) : '1');
    }
  });

  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pinch) {
      if (pts.size < 2) pinch = null;
      if (scale < 1.02) zoomTo(1, null, null, true);
      return;
    }
    if (!drag) return;
    const d = drag;
    drag = null;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    root.style.removeProperty('--lb-fade');
    if (!d.moved) {
      if (d.type === 'mouse') {
        if (d.onPic) toggleZoom(e.clientX, e.clientY);
        else close();
      } else if (performance.now() - lastTap < 300) {
        lastTap = 0;
        toggleZoom(e.clientX, e.clientY);
      } else {
        lastTap = performance.now();
      }
      return;
    }
    if (scale > 1.01 || d.type === 'mouse') return;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > MIN_SWIPE) step(dx < 0 ? 1 : -1);
    else if (dy > MIN_SWIPE * 1.6) close();
    else apply(true);
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);

  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomTo(scale * Math.exp(-e.deltaY * 0.0018), e.clientX, e.clientY);
  }, { passive: false });

  /* ---------- 按钮与键盘 ---------- */

  $('lb-prev').addEventListener('click', () => step(-1));
  $('lb-next').addEventListener('click', () => step(1));
  $('lb-close').addEventListener('click', close);
  zoomBtn.addEventListener('click', () => toggleZoom());
  $('lb-share').addEventListener('click', async (e) => {
    const label = e.currentTarget.getAttribute('aria-label');
    try {
      await navigator.clipboard.writeText(location.href);
      toast.textContent = toast.dataset.copied;
      toast.classList.add('is-on');
      setTimeout(() => toast.classList.remove('is-on'), 2200);
    } catch {
      window.prompt(label, location.href);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (root.hidden) return;
    const zoomed = scale > 1.01;
    const keys = {
      ArrowLeft: () => (zoomed ? pan(PAN, 0) : step(-1)), ArrowRight: () => (zoomed ? pan(-PAN, 0) : step(1)),
      ...(zoomed ? { ArrowUp: () => pan(0, PAN), ArrowDown: () => pan(0, -PAN) } : {}),
      Home: () => show(0, 'replace'), End: () => show(list.length - 1, 'replace'),
      Escape: close, '+': () => zoomTo(scale * 1.4, null, null, true), '=': () => zoomTo(scale * 1.4, null, null, true),
      '-': () => zoomTo(scale / 1.4, null, null, true), 0: () => zoomTo(1, null, null, true),
    };
    if (keys[e.key]) {
      e.preventDefault();
      keys[e.key]();
    } else if (e.key === 'Tab') {
      // 只在看得见的按钮之间转：窄屏上左右箭头是被样式藏起来的（没有 hidden 属性），聚焦不上
      const items = [...root.querySelectorAll('button, a[href]')].filter((el) => !el.hidden && el.getClientRects().length > 0);
      const at = items.indexOf(document.activeElement);
      e.preventDefault();
      items[(at + (e.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
    }
  });

  /* ---------- 入口 ---------- */

  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('[data-gallery] a[data-shot]');
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const anchors = anchorsOf(a);
    open(anchors, anchors.indexOf(a), true);
  });
  addEventListener('popstate', sync);
  addEventListener('resize', () => {
    if (root.hidden) return;
    layout();
    zoomTo(1);
  });
  if (hashId()) sync();
}
