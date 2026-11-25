// Compact viewpoint switcher: ‹ [index · name] › with an expandable list. Keyboard: ←/→, 1-9, 0, -, =, Esc.
const NUMS = ['壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾', '拾壹', '拾贰', '拾叁', '拾肆', '拾伍', '拾陆', '拾柒', '拾捌'];

export function makeUI(vps, onSelect) {
  const root = document.getElementById('vp');
  root.innerHTML = '';
  const bar = document.createElement('div'); bar.className = 'bar';
  const prev = document.createElement('button'); prev.innerHTML = '&#8249;'; prev.title = '上一个观景点 (←)';
  const next = document.createElement('button'); next.innerHTML = '&#8250;'; next.title = '下一个观景点 (→)';
  const name = document.createElement('div'); name.className = 'name';
  const grid = document.createElement('button'); grid.innerHTML = '<svg width="13" height="13" viewBox="0 0 13 13"><g fill="currentColor"><rect x="0" y="0" width="5" height="5" rx="1"/><rect x="8" y="0" width="5" height="5" rx="1"/><rect x="0" y="8" width="5" height="5" rx="1"/><rect x="8" y="8" width="5" height="5" rx="1"/></g></svg>'; grid.title = '全部观景点';
  bar.append(prev, name, next, grid);
  const list = document.createElement('div'); list.className = 'list';
  const items = vps.map((v, i) => {
    const it = document.createElement('div'); it.className = 'item';
    it.innerHTML = `<span class="k">${i < 9 ? i + 1 : i === 9 ? '0' : ''}</span>${v.name}`;
    it.addEventListener('click', (e) => { e.stopPropagation(); onSelect(i); setOpen(false); });
    list.appendChild(it); return it;
  });
  const hint = document.createElement('div'); hint.className = 'hint'; hint.textContent = '拖拽旋转 · 右键平移 · 滚轮缩放 · ← → 切换';
  list.appendChild(hint);
  root.append(list, bar);
  let cur = 0, open = false;
  const setOpen = (o) => { open = o; root.classList.toggle('open', o); };
  const show = (i) => {
    cur = i;
    name.innerHTML = `<span class="idx">${NUMS[i] || i + 1}</span>${vps[i].name}`;
    items.forEach((it, k) => it.classList.toggle('on', k === i));
  };
  prev.addEventListener('click', (e) => { e.stopPropagation(); onSelect((cur + vps.length - 1) % vps.length); });
  next.addEventListener('click', (e) => { e.stopPropagation(); onSelect((cur + 1) % vps.length); });
  name.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!open); });
  grid.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!open); });
  document.addEventListener('pointerdown', (e) => { if (open && !root.contains(e.target)) setOpen(false); });
  window.addEventListener('keydown', (e) => {
    if (document.body.classList.contains('export')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { onSelect((cur + 1) % vps.length); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { onSelect((cur + vps.length - 1) % vps.length); e.preventDefault(); }
    else if (e.key === 'Escape') setOpen(false);
    else if (/^[0-9]$/.test(e.key)) { const n = e.key === '0' ? 9 : parseInt(e.key, 10) - 1; if (n < vps.length) onSelect(n); }
    else if (e.key === '-' && vps.length > 10) onSelect(10 + ((cur >= 10 ? cur - 10 + vps.length - 11 : vps.length - 11) % (vps.length - 10)));
    else if (e.key === '=' && vps.length > 10) onSelect(cur >= 10 && cur < vps.length - 1 ? cur + 1 : 10);
  });
  root.classList.add('ready');
  return { show };
}
