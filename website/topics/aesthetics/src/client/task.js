// 题目页。
// 页首：题名锁定的几何线碰到字就断开（和视频的介绍页一样）：按点题短语、主要内容、每条看点、评委那一行字实际占的地方，
//   外面留一圈 14 个舞台像素，在锁定的遮罩里挖洞（parts.mjs lockup 的 .lk-holes）。字体载入后、窗口改宽后重算。
//   点题短语一行放不下、英文折到下一行时，去掉中间那道细斜线（.is-wrapped）。
// 作品：受测模型页签（同一道题里切换型号）。
// 每个型号的作品在构建时都画好了；没有脚本时依次排开，页签就是本页的目录（#m-<型号id>）。
// 这里把它们变成 WAI-ARIA 页签：只露选中的一块；← → / Home / End 在页签间移动并选中；
// 点选写进地址 ?m=<型号id>（history.replaceState，可分享）；没带 ?m= 时选第一位。
// 看图器换图时（ae:lightbox，也包括打开带 #shot= 的网址）切到那张图所在的型号。
// 每块末尾「下一位」切到下一个型号，并回到页签那一行；本卷票选的一行（也带 data-goto）同样切过去，页签那一行已经在眼前时不滚。
// 观测者票选（观测票、打孔钮、页签上的小孔、本卷票选）由 votes.js 接。
import './site.js';
import './votes.js';

const head = document.querySelector('.tk-head');
if (head) initHead(head);

const root = document.querySelector('[data-tabs]');
if (root) initTabs(root);

function initHead(head) {
  const tag = head.querySelector('.tk-tagline');
  const geo = head.querySelector('.lk-geo');
  const holes = head.querySelector('.lk-holes');
  const stage = head.querySelector('.tk-stage');
  const blocks = [...head.querySelectorAll('.tk-copy .tk-prov, .tk-tagline, .tk-summary, .tk-points li, .tk-judge')];

  /** 一块字实际占的地方（每行字的外框合起来，视口坐标） */
  function ink(el) {
    const r = document.createRange();
    r.selectNodeContents(el);
    const q = [...r.getClientRects()].filter((v) => v.width && v.height);
    if (!q.length) return null;
    return [Math.min(...q.map((v) => v.left)), Math.min(...q.map((v) => v.top)), Math.max(...q.map((v) => v.right)), Math.max(...q.map((v) => v.bottom))];
  }

  function update() {
    if (tag) {
      tag.classList.remove('is-wrapped');
      const zh = tag.querySelector('span'), en = tag.querySelector('em');
      if (zh && en && en.offsetTop > zh.offsetTop + zh.offsetHeight / 2) tag.classList.add('is-wrapped');
    }
    if (!geo || !holes) return;
    const M = geo.getScreenCTM()?.inverse();
    if (!M) return;
    const m = (14 * stage.getBoundingClientRect().width) / 1920;
    holes.innerHTML = blocks.map(ink).filter(Boolean).map(([l, t, r, b]) => {
      const a = new DOMPoint(l - m, t - m).matrixTransform(M), z = new DOMPoint(r + m, b + m).matrixTransform(M);
      return `<rect x="${a.x.toFixed(1)}" y="${a.y.toFixed(1)}" width="${(z.x - a.x).toFixed(1)}" height="${(z.y - a.y).toFixed(1)}"/>`;
    }).join('');
  }

  let raf = 0;
  const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
  update();
  document.fonts?.ready.then(later);
  addEventListener('resize', later);
}

function initTabs(root) {
  const list = root.querySelector('.tk-tabs');
  const tabs = [...list.querySelectorAll('[data-tab]')];
  const panels = tabs.map((t) => document.getElementById(`m-${t.dataset.tab}`));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let current = -1;

  list.setAttribute('role', 'tablist');
  tabs.forEach((t, i) => {
    t.setAttribute('role', 'tab');
    t.setAttribute('aria-controls', panels[i].id);
    panels[i].setAttribute('role', 'tabpanel');
    panels[i].setAttribute('aria-labelledby', t.id);
    panels[i].removeAttribute('aria-label');
  });
  root.classList.add('is-tabbed');

  /** 选中第 i 位。write：写进地址的 ?m= */
  function select(i, { write = false, focus = false } = {}) {
    if (i < 0 || i >= tabs.length) return;
    if (i !== current) {
      tabs.forEach((t, k) => {
        const on = k === i;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        panels[k].hidden = !on;
      });
      if (current >= 0) {
        panels[i].classList.remove('is-swap');
        void panels[i].offsetWidth;          // 重新触发淡入
        panels[i].classList.add('is-swap');
      }
      current = i;
    }
    if (focus) tabs[i].focus();
    if (write) {
      const url = new URL(location.href);
      if (url.hash.startsWith('#m-')) url.hash = '';      // 没有脚本时的目录锚点，选了别人就不对了
      if (url.searchParams.get('m') !== tabs[i].dataset.tab || location.hash !== url.hash) {
        url.searchParams.set('m', tabs[i].dataset.tab);
        history.replaceState(history.state, '', url.pathname + url.search + url.hash);
      }
    }
  }

  const indexOf = (id) => tabs.findIndex((t) => t.dataset.tab === id);
  const panelOf = (el) => panels.indexOf(el?.closest?.('[data-panel]'));

  list.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (!t) return;
    e.preventDefault();
    select(tabs.indexOf(t), { write: true });
  });

  list.addEventListener('keydown', (e) => {
    const at = tabs.indexOf(document.activeElement);
    if (at < 0) return;
    const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (to != null) {
      e.preventDefault();
      select((to + tabs.length) % tabs.length, { write: true, focus: true });
    } else if (e.key === ' ') {
      e.preventDefault();
      select(at, { write: true });
    }
  });

  // 每块末尾的「下一位」、本卷票选的一行：切过去，回到页签那一行（已经看得见时不动）
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-goto]');
    if (!a) return;
    e.preventDefault();
    select(indexOf(a.dataset.goto), { write: true });
    list.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'nearest' });
    tabs[current].focus({ preventScroll: true });
  });

  // 看图器换到另一个型号的图（分享链接、前进后退）时，页签跟过去
  document.addEventListener('ae:lightbox', (e) => {
    const i = panelOf(e.detail?.anchor);
    if (i >= 0 && i !== current) select(i, { write: true });
  });

  // 起始：地址带 #shot= 时看图器已经打开了那张图（在本脚本之前），选它所在的型号；
  // 带 #m-<型号id>（没有脚本时页签的链接）就选那一位；否则看 ?m=，再否则第一位
  const hash = decodeURIComponent(location.hash.slice(1));
  const fromHash = hash.startsWith('shot=')
    ? panelOf([...root.querySelectorAll('a[data-shot]')].find((a) => a.dataset.shot === hash.slice(5)))
    : hash.startsWith('m-') ? indexOf(hash.slice(2)) : -1;
  const fromQuery = indexOf(new URLSearchParams(location.search).get('m'));
  select(fromHash >= 0 ? fromHash : Math.max(0, fromQuery), { write: fromHash >= 0 });
  if (hash.startsWith('m-') && fromHash >= 0) list.scrollIntoView({ block: 'start' });
}
