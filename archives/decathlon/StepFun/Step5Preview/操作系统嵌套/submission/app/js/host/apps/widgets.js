// 根系统：小组件（时钟日历 / 倒计时秒表 / 便笺 / 剪贴板历史 / 通知中心 / 快捷设置）
export function mountWidgets(win, api) {
  win.bar.querySelector('.wtitle').textContent = '小组件';
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px;background:#121826;color:#e8ecf4;font:13px "Microsoft YaHei",sans-serif;overflow:auto';
  el.innerHTML = `
    <div class="card" style="grid-column:1/3">
      <div style="font-size:34px;font-weight:600" id="ck">--:--:--</div>
      <div style="color:#93a1bb" id="cd"></div>
      <div id="cal" style="margin-top:8px"></div>
    </div>
    <div class="card">
      <div style="color:#ffd23f;margin-bottom:6px">倒计时</div>
      <div style="display:flex;gap:4px;align-items:center"><input id="cds" type="number" value="5" style="width:56px;background:#0a0f18;border:1px solid #33405a;color:#e8ecf4;border-radius:4px;padding:2px 4px"> 秒
      <button id="cdstart" class="wbtn2">开始</button><button id="cdstop" class="wbtn2">停止</button></div>
      <div style="font-size:26px;margin-top:6px" id="cdshow">00:05</div>
    </div>
    <div class="card">
      <div style="color:#ffd23f;margin-bottom:6px">秒表</div>
      <div style="display:flex;gap:4px"><button id="swstart" class="wbtn2">开始</button><button id="swlap" class="wbtn2">计次</button><button id="swreset" class="wbtn2">重置</button></div>
      <div style="font-size:26px;margin-top:6px" id="swshow">00:00.0</div>
    </div>
    <div class="card">
      <div style="color:#ffd23f;margin-bottom:6px">便笺</div>
      <textarea id="note" style="width:100%;height:90px;background:#0a0f18;border:1px solid #33405a;color:#e8ecf4;border-radius:6px;padding:6px;font-size:13px;resize:none"></textarea>
    </div>
    <div class="card">
      <div style="color:#ffd23f;margin-bottom:6px">剪贴板历史</div>
      <div id="cliph" style="font-size:12px;color:#93a1bb;max-height:90px;overflow:auto"></div>
    </div>
    <div class="card" style="grid-column:1/3">
      <div style="color:#ffd23f;margin-bottom:6px">快捷设置（与系统设置同一份状态）</div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <label>强调色 <input id="acc" type="color" value="${api.settings.accent}"></label>
        <label>界面缩放 <input id="scale" type="range" min="0.8" max="1.4" step="0.05" value="${api.settings.scale}" style="width:120px"><span id="scalev">${Math.round(api.settings.scale * 100)}%</span></label>
        <label>免打扰 <input id="dnd" type="checkbox"></label>
      </div>
    </div>
    <style>.card{background:#1c2433;border:1px solid #33405a;border-radius:10px;padding:10px}
    .wbtn2{background:#232d3f;border:1px solid #33405a;color:#e8ecf4;border-radius:5px;padding:2px 10px;font-size:12px;cursor:pointer}</style>`;
  win.body.appendChild(el);

  // 时钟与日历
  let calMonth = new Date().getMonth(), calYear = new Date().getFullYear();
  function tick() {
    const d = new Date();
    el.querySelector('#ck').textContent = [d.getHours(), d.getMinutes(), d.getSeconds()].map(x => String(x).padStart(2, '0')).join(':');
    el.querySelector('#cd').textContent = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 星期${'日一二三四五六'[d.getDay()]}`;
    let html = `<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px"><button id="pm" class="wbtn2">‹</button><span>${calYear} 年 ${calMonth + 1} 月</span><button id="nm" class="wbtn2">›</button></div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;font-size:11px;text-align:center">`;
    html += '日一二三四五六'.split('').map(x => `<span style="color:#93a1bb">${x}</span>`).join('');
    const first = new Date(calYear, calMonth, 1).getDay();
    const days = new Date(calYear, calMonth + 1, 0).getDate();
    for (let i = 0; i < first; i++) html += '<span></span>';
    for (let i = 1; i <= days; i++) {
      const today = new Date();
      const isToday = today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === i;
      html += `<span style="padding:2px;border-radius:4px;${isToday ? 'background:#8b6cff;color:#fff' : ''}">${i}</span>`;
    }
    html += '</div>';
    el.querySelector('#cal').innerHTML = html;
    el.querySelector('#pm').onclick = () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } tick(); };
    el.querySelector('#nm').onclick = () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } tick(); };
  }
  tick(); setInterval(tick, 1000);

  // 倒计时
  let cdLeft = 0, cdTimer = null;
  const cdshow = el.querySelector('#cdshow');
  function cdRender() { cdshow.textContent = String(Math.floor(cdLeft / 60)).padStart(2, '0') + ':' + String(cdLeft % 60).padStart(2, '0'); }
  cdRender();
  el.querySelector('#cdstart').onclick = () => {
    const s = parseInt(el.querySelector('#cds').value, 10) || 5;
    cdLeft = s; cdRender();
    if (cdTimer) clearInterval(cdTimer);
    cdTimer = setInterval(() => {
      cdLeft--; cdRender();
      if (cdLeft <= 0) { clearInterval(cdTimer); cdTimer = null; api.notify('倒计时结束', s + ' 秒倒计时已完成'); }
    }, 1000);
  };
  el.querySelector('#cdstop').onclick = () => { if (cdTimer) { clearInterval(cdTimer); cdTimer = null; } };

  // 秒表
  let swT = 0, swRun = false, swLast = 0, swTimer = null;
  const swshow = el.querySelector('#swshow');
  function swRender() { swshow.textContent = (swT / 100).toFixed(1).padStart(5, '0'); }
  el.querySelector('#swstart').onclick = () => {
    swRun = !swRun;
    el.querySelector('#swstart').textContent = swRun ? '暂停' : '开始';
    if (swRun) { swLast = Date.now(); swTimer = setInterval(() => { const n = Date.now(); swT += n - swLast; swLast = n; swRender(); }, 100); }
    else if (swTimer) clearInterval(swTimer);
  };
  el.querySelector('#swlap').onclick = () => { api.notify('秒表计次', swshow.textContent + ' 秒'); };
  el.querySelector('#swreset').onclick = () => { swT = 0; swRender(); };

  // 便笺
  const note = el.querySelector('#note');
  note.value = api.host.root.vfs.read('/Documents/便笺.txt') || '';
  let noteTimer = null;
  note.oninput = () => { clearTimeout(noteTimer); noteTimer = setTimeout(() => { api.fs.write('/Documents/便笺.txt', note.value); api.refreshIcons(); }, 400); };

  // 剪贴板历史
  const clips = [];
  const cliph = el.querySelector('#cliph');
  document.addEventListener('copy', () => {
    setTimeout(() => {
      navigator.clipboard.readText().then(t => { if (t) { clips.unshift(t.slice(0, 60)); if (clips.length > 12) clips.pop(); cliph.innerHTML = clips.map((c, i) => `<div style="padding:2px 0;border-bottom:1px solid #223">${i + 1}. ${c}</div>`).join(''); } });
    }, 30);
  });

  // 快捷设置
  el.querySelector('#acc').oninput = (e) => { api.settings.accent = e.target.value; api.applySettings(); api.host.saveSettings(); };
  el.querySelector('#scale').oninput = (e) => { api.settings.scale = parseFloat(e.target.value); el.querySelector('#scalev').textContent = Math.round(api.settings.scale * 100) + '%'; api.applySettings(); api.host.saveSettings(); };
  el.querySelector('#dnd').onchange = (e) => { api.host.dnd = e.target.checked; api.notify('免打扰', e.target.checked ? '已开启' : '已关闭'); };

  win.api = { dispose: () => { if (cdTimer) clearInterval(cdTimer); if (swTimer) clearInterval(swTimer); } };
}
