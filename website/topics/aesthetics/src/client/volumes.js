// 卷目页：悬停或聚焦哪一卷，哪一卷就成了主角卷（抽出一点、被灯照亮、题名换成烫箔、垂下书签带），
// 左边的图版区换成那一卷。鼠标要在一卷上停一下（140ms）才换：从书摞斜着移向图版时，路过的书脊不会把图版换走。
import './site.js';

const spines = [...document.querySelectorAll('.sp[data-vol]')];
const panes = [...document.querySelectorAll('[data-vp]')];
let current = 0;

function show(i) {
  if (i === current || !panes[i]) return;
  panes[current].hidden = true;
  panes[i].hidden = false;
  panes[i].classList.remove('is-swap');
  void panes[i].offsetWidth;
  panes[i].classList.add('is-swap');
  spines[current]?.classList.remove('is-active');
  spines[i].classList.add('is-active');
  current = i;
}

const INTENT = 140;
let timer = 0;
spines.forEach((s, i) => {
  s.addEventListener('pointerenter', (e) => {
    clearTimeout(timer);
    if (e.pointerType === 'mouse') timer = setTimeout(() => show(i), INTENT);
    else show(i);
  });
  s.addEventListener('pointerleave', () => clearTimeout(timer));
  s.addEventListener('focus', () => {
    clearTimeout(timer);
    show(i);
  });
});
