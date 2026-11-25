// Minimal viewpoint switcher (bottom centre). Hidden during video export.
export function createUI(views) {
  const css = `
  .vp-bar{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);display:flex;align-items:stretch;gap:0;
    padding:3px;border-radius:3px;background:rgba(8,11,16,0.42);backdrop-filter:blur(6px) saturate(1.1);-webkit-backdrop-filter:blur(6px);
    border:1px solid rgba(190,210,235,0.10);box-shadow:0 6px 24px rgba(0,0,0,0.35);user-select:none;z-index:10;
    font-family:"HarmonyOS Sans SC","MiSans","Microsoft YaHei UI","Noto Sans SC",sans-serif;transition:opacity .4s}
  .vp-bar button{all:unset;cursor:pointer;position:relative;display:flex;align-items:baseline;gap:5px;padding:6px 10px 7px;
    color:rgba(205,215,228,0.56);font-size:12px;letter-spacing:.06em;white-space:nowrap;transition:color .2s, background .2s;border-radius:2px}
  .vp-bar button .n{font-family:"Barlow Condensed","Bahnschrift","Roboto Condensed",sans-serif;font-size:11px;letter-spacing:.04em;color:rgba(160,175,195,0.42);font-weight:500}
  .vp-bar button:hover{color:rgba(235,240,248,0.92);background:rgba(255,255,255,0.045)}
  .vp-bar button:hover .n{color:rgba(255,170,90,0.75)}
  .vp-bar button.on{color:#f1f3f6}
  .vp-bar button.on .n{color:#ffab5e}
  .vp-bar button.on::after{content:"";position:absolute;left:10px;right:10px;bottom:2px;height:1.5px;background:linear-gradient(90deg,#ff9a3c,#ffcf7a);box-shadow:0 0 8px rgba(255,150,60,.65)}
  .vp-bar .sep{width:1px;margin:7px 1px;background:rgba(200,215,235,0.08)}
  .vp-bar.hidden{opacity:0;pointer-events:none}
  @media (max-width:1100px){.vp-bar button{padding:6px 7px 7px;font-size:11px}}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  const bar = document.createElement('div');
  bar.className = 'vp-bar';
  const btns = views.vps.map((v, i) => {
    if (i > 0) { const s = document.createElement('div'); s.className = 'sep'; bar.appendChild(s); }
    const b = document.createElement('button');
    b.innerHTML = `<span class="n">${String(i + 1).padStart(2, '0')}</span><span>${v.short}</span>`;
    b.title = v.name;
    b.addEventListener('click', () => views.go(i));
    bar.appendChild(b);
    return b;
  });
  document.body.appendChild(bar);
  const mark = (i) => btns.forEach((b, k) => b.classList.toggle('on', k === i));
  views.onChange(mark);
  mark(views.current);
  return {
    el: bar,
    setVisible(v) { bar.classList.toggle('hidden', !v); bar.style.display = v ? '' : 'none'; },
  };
}
