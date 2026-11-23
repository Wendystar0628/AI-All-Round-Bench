'use strict';
/* 启动顺序：装载设置与文件 → 装配内核与显示设备 → 呈现根桌面 → 开始逻辑步循环。 */
(function () {
  const OS = window.OS;
  let readyResolve; OS.readyPromise = new Promise(r => { readyResolve = r; });
  async function init() {
    try {
      OS.hostInfo = OS.bridge ? await OS.bridge.info() : { dataDir: '', exportDir: '' };
      const saved = await OS.store.get('settings');
      if (saved) { try { Object.assign(OS.settings.data, JSON.parse(saved)); } catch (e) { /* 忽略损坏的设置 */ } }
      OS.initKernel();
      if (window.Device3D) { OS.dev3d = new window.Device3D(); OS.deviceHost.dev3d = OS.dev3d; }
      await OS.loadFs(false);
      const $ = OS.$;
      $('#start-btn').innerHTML = OS.svgIcon('start');
      $('#sys-new').innerHTML = OS.svgIcon('plus') + '<span>子系统</span>';
      $('#widgets-btn').innerHTML = OS.svgIcon('widgets');
      $('#notes-btn').innerHTML = OS.svgIcon('bell');
      for (const f of OS.whenReady || []) f();
      OS.wm.init();
      OS.settings.apply();
      // 任务栏固定应用
      const pins = $('#tb-pins');
      for (const id of ['files', 'spreadsheet', 'browser', 'editor', 'tasks', 'settings']) {
        const a = OS.wm.apps[id]; if (!a) continue;
        const b = OS.h('button', { class: 'tb-btn', 'data-testid': 'pin-' + id, 'data-system-id': 'outer', 'data-app-id': id, title: a.name, 'aria-label': a.name, html: OS.svgIcon(a.icon), onclick: () => OS.wm.launch(id) });
        pins.appendChild(b);
      }
      $('#sys-new').addEventListener('click', () => OS.systems.create());
      $('#start-sys').addEventListener('click', () => { OS.wm.toggleStart(false); OS.systems.create(); });
      $('#start-help').addEventListener('click', () => { OS.wm.toggleStart(false); OS.wm.launch('help'); });
      const clock = $('#clock');
      const tickClock = () => {
        const d = new Date(), p = (n) => String(n).padStart(2, '0');
        clock.firstChild.textContent = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
        clock.lastChild.textContent = d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate());
      };
      tickClock(); OS.on('second', tickClock);
      OS.startLoop();
      OS.ready = true;
      document.body.dataset.ready = '1';
      readyResolve(true);
    } catch (e) {
      console.error(e);
      document.body.insertAdjacentHTML('beforeend', '<pre style="position:fixed;inset:20px;color:#f88;white-space:pre-wrap;z-index:99999">启动失败：' + String(e && e.stack || e).replace(/</g, '&lt;') + '</pre>');
    }
  }
  window.addEventListener('load', init);
})();
