// 评委页：Gemini 那一段的交接线。订口线从这一段的顶上（--gx 那一列）落下来，从她身边起笔，
// 打一个圈兜住那个被拍歪的 O，停在一颗星上。圈和星要跟着字的位置走，所以按版面画（宽度、字号变了就重画）。
import './site.js';

const section = document.querySelector('.jd--gemini');
const path = section?.querySelector('.jd-tail path');
const star = section?.querySelector('.jd-tail-star');
const odd = section?.querySelector('.jd-name .is-odd');
const svg = section?.querySelector('.jd-tail');

const f = (n) => n.toFixed(1);

function draw() {
  if (!path || !odd || getComputedStyle(svg).display === 'none') return;
  const box = section.getBoundingClientRect();
  const o = odd.getBoundingClientRect();
  const W = box.width, H = svg.getBoundingClientRect().height;
  svg.setAttribute('viewBox', `0 0 ${f(W)} ${f(H)}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  const gx = W * (parseFloat(getComputedStyle(section).getPropertyValue('--gx')) || 48) / 100;
  const ox = o.left + o.width / 2 - box.left, oy = o.top + o.height / 2 - box.top;
  const r = Math.max(o.width, o.height) * 0.62;
  const ex = Math.min(W - 40, ox + r * 5.2), ey = Math.max(40, oy - r * 2.6);
  path.setAttribute('d', [
    `M${f(gx)} 0`,
    `C${f(gx)} ${f(oy * 0.55)} ${f(ox - r * 2.6)} ${f(oy + r * 1.9)} ${f(ox - r * 0.2)} ${f(oy + r * 1.2)}`,
    `C${f(ox + r * 1.5)} ${f(oy + r * 1.1)} ${f(ox + r * 1.4)} ${f(oy - r * 1.2)} ${f(ox)} ${f(oy - r * 1.15)}`,
    `C${f(ox - r * 1.35)} ${f(oy - r * 1.1)} ${f(ox - r * 1.1)} ${f(oy + r * 0.6)} ${f(ox + r * 0.35)} ${f(oy + r * 0.7)}`,
    `C${f(ox + r * 2.6)} ${f(oy + r * 0.8)} ${f(ex - r * 0.6)} ${f(ey + r * 1.6)} ${f(ex)} ${f(ey)}`,
  ].join(' '));
  if (star) {
    star.style.left = `${f(ex)}px`;
    star.style.top = `${f(ey)}px`;
  }
}

if (path) {
  draw();
  new ResizeObserver(draw).observe(section);
  document.fonts?.ready.then(draw);
}
