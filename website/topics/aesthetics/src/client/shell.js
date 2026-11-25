// 每页都有的小交互：语言切换记住选择、滚动入场。
//   [data-lang-switch]  点了就把 octa.lang 记成这种语言（总站和各专题共用），并把本页的 ?查询 和 #锚点 带过去
//   [data-reveal]       第一次进入视口时淡入上移（style="--i:n" 给同一组里的先后）；系统要求减少动态效果时只淡入。
//                       藏起来要等这里给 <html> 加上 ae-reveal，脚本没跑起来时内容照常显示
export function initShell() {
  for (const a of document.querySelectorAll('[data-lang-switch]')) {
    a.addEventListener('click', () => {
      try {
        localStorage.setItem('octa.lang', a.dataset.langSwitch);
      } catch { /* 存不了就只跳页面 */ }
      a.href = a.href.split(/[?#]/)[0] + location.search + location.hash;
    });
  }

  // 页头固定在顶上；离开页首一点后给 <html> 加 ae-scrolled，页头身后淡出夜色的底（shell.css）
  const root = document.documentElement;
  const onScroll = () => { const on = window.scrollY > 24; if (root.classList.contains('ae-scrolled') !== on) root.classList.toggle('ae-scrolled', on); };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const items = document.querySelectorAll('[data-reveal]');
  if (!items.length || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('ae-reveal');
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -6% 0px' });
  for (const el of items) io.observe(el);
}
