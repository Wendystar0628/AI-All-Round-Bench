// 根系统：设置
export function mountSettings(win, api) {
  win.bar.querySelector('.wtitle').textContent = '设置';
  const s = api.settings;
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;inset:0;padding:16px;background:#121826;color:#e8ecf4;font:13px "Microsoft YaHei",sans-serif;overflow:auto';
  el.innerHTML = `
    <div style="margin-bottom:12px"><div style="color:#93a1bb;font-size:12px;margin-bottom:4px">系统名称</div>
      <input id="name" value="${s.name}" style="width:100%;background:#0a0f18;border:1px solid #33405a;color:#e8ecf4;border-radius:6px;padding:6px 8px"></div>
    <div style="margin-bottom:12px"><div style="color:#93a1bb;font-size:12px;margin-bottom:4px">壁纸（自制风景图）</div>
      <div style="display:flex;gap:8px">
        <div class="wp" data-w="scene1" style="width:110px;height:66px;border-radius:8px;background-size:cover;background-position:center;cursor:pointer;border:2px solid ${s.wallpaper === 'scene1' ? '#8b6cff' : 'transparent'}"></div>
        <div class="wp" data-w="scene2" style="width:110px;height:66px;border-radius:8px;background-size:cover;background-position:center;cursor:pointer;border:2px solid ${s.wallpaper === 'scene2' ? '#8b6cff' : 'transparent'}"></div>
        <div class="wp" data-w="scene3" style="width:110px;height:66px;border-radius:8px;background-size:cover;background-position:center;cursor:pointer;border:2px solid ${s.wallpaper === 'scene3' ? '#8b6cff' : 'transparent'}"></div>
      </div></div>
    <div style="margin-bottom:12px"><div style="color:#93a1bb;font-size:12px;margin-bottom:4px">强调色</div>
      <input id="accent" type="color" value="${s.accent}"></div>
    <div style="margin-bottom:12px"><div style="color:#93a1bb;font-size:12px;margin-bottom:4px">界面缩放 <span id="sv">${Math.round(s.scale * 100)}%</span></div>
      <input id="scale" type="range" min="0.8" max="1.4" step="0.05" value="${s.scale}" style="width:100%"></div>
    <div style="color:#93a1bb;font-size:12px;margin-top:16px">提示：修改即时生效并保存在本机数据目录，重新打开后仍然保留。</div>`;
  win.body.appendChild(el);
  import('../desktop.js').then(m => {
    el.querySelectorAll('.wp').forEach(d => { d.style.backgroundImage = `url(${m.makeWallpaper(d.dataset.w)})`; });
  });
  el.querySelector('#name').onchange = (e) => { s.name = e.target.value; api.host.saveSettings(); api.notify('设置', '系统名称已改为 ' + s.name); };
  el.querySelectorAll('.wp').forEach(d => d.onclick = () => {
    s.wallpaper = d.dataset.w;
    el.querySelectorAll('.wp').forEach(x => x.style.borderColor = x === d ? '#8b6cff' : 'transparent');
    api.applySettings(); api.host.saveSettings();
  });
  el.querySelector('#accent').oninput = (e) => { s.accent = e.target.value; api.applySettings(); api.host.saveSettings(); };
  el.querySelector('#scale').oninput = (e) => { s.scale = parseFloat(e.target.value); el.querySelector('#sv').textContent = Math.round(s.scale * 100) + '%'; api.applySettings(); api.host.saveSettings(); };
  win.api = { dispose: () => { } };
}
