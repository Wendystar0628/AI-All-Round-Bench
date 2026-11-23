// 根系统：浏览器（自制界面 + Chromium 网页视图）
export function mountBrowser(win, api) {
  win.bar.querySelector('.wtitle').textContent = '浏览器';
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;background:#121826;color:#e8ecf4;font:13px "Microsoft YaHei",sans-serif';
  el.innerHTML = `
    <div style="display:flex;gap:4px;padding:5px 6px;background:#1c2433;border-bottom:1px solid #33405a;align-items:center">
      <button id="back" class="bbtn">‹</button>
      <button id="fwd" class="bbtn">›</button>
      <button id="reload" class="bbtn">⟳</button>
      <button id="stop" class="bbtn">✕</button>
      <input id="url" style="flex:1;background:#0a0f18;border:1px solid #33405a;border-radius:14px;color:#e8ecf4;padding:4px 12px;font-size:13px;outline:none" placeholder="输入网址，例如 https://www.bilibili.com">
      <button id="go" class="bbtn">转到</button>
      <button id="newtab" class="bbtn">＋ 标签</button>
    </div>
    <div id="tabs" style="display:flex;gap:2px;padding:0 6px;background:#161d29;border-bottom:1px solid #223;overflow-x:auto"></div>
    <div id="pages" style="flex:1;position:relative;background:#000"></div>
    <style>.bbtn{background:#232d3f;border:1px solid #33405a;color:#e8ecf4;border-radius:6px;padding:2px 9px;font-size:12px;cursor:pointer}
    .tab{padding:5px 10px;background:#1c2433;border-radius:8px 8px 0 0;font-size:12px;cursor:pointer;white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis;color:#93a1bb}
    .tab.on{background:#232d3f;color:#e8ecf4}
    .pg{position:absolute;inset:0;display:none}.pg.on{display:block}
    .pg webview,.pg iframe{width:100%;height:100%;border:none;background:#fff}</style>`;
  win.body.appendChild(el);
  const tabsEl = el.querySelector('#tabs');
  const pagesEl = el.querySelector('#pages');
  const urlInp = el.querySelector('#url');
  const tabs = [];
  let cur = -1;

  function newTab(url) {
    const id = tabs.length;
    const pg = document.createElement('div');
    pg.className = 'pg';
    pagesEl.appendChild(pg);
    const view = document.createElement(api.host.electron ? 'webview' : 'iframe');
    if (api.host.electron) {
      view.setAttribute('allowpopups', '');
      view.style.cssText = 'width:100%;height:100%;border:none';
      view.addEventListener('did-navigate', (e) => { tabs[id].url = e.url; update(); });
      view.addEventListener('did-navigate-in-page', (e) => { tabs[id].url = e.url; update(); });
      view.addEventListener('page-title-updated', (e) => { tabs[id].title = e.title; update(); });
      view.addEventListener('did-start-loading', () => { tabs[id].loadState = 'loading'; update(); });
      view.addEventListener('did-stop-loading', () => { tabs[id].loadState = 'done'; update(); });
      view.addEventListener('did-fail-load', (e) => { if (e.errorCode !== -3) { tabs[id].loadState = 'error'; tabs[id].err = e.errorDescription; update(); } });
      view.addEventListener('new-window', (e) => { const t = newTab(e.url); }); 
    } else {
      view.style.cssText = 'width:100%;height:100%;border:none;background:#fff';
      view.onload = () => { tabs[id].loadState = 'done'; update(); };
    }
    pg.appendChild(view);
    tabs.push({ id, url: url || '', title: url || '新标签页', loadState: 'idle', view, pg });
    select(id);
    if (url) navigate(url);
    return id;
  }

  function select(id) {
    cur = id;
    tabs.forEach((t, i) => { t.pg.classList.toggle('on', i === id); });
    update();
  }

  function navigate(url) {
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(url)) url = 'https://' + url;
      else url = 'https://www.bing.com/search?q=' + encodeURIComponent(url);
    }
    const t = tabs[cur];
    if (!t) return;
    t.url = url; t.loadState = 'loading'; t.title = url;
    if (api.host.electron) t.view.loadURL(url); else t.view.src = url;
    update();
  }

  function update() {
    tabsEl.innerHTML = '';
    tabs.forEach((t, i) => {
      const d = document.createElement('div');
      d.className = 'tab' + (i === cur ? ' on' : '');
      d.textContent = (t.loadState === 'loading' ? '⏳ ' : '') + (t.title || t.url || '新标签页');
      d.onclick = () => select(i);
      const x = document.createElement('span');
      x.textContent = ' ✕'; x.style.cssText = 'margin-left:6px;color:#93a1bb';
      x.onclick = (e) => { e.stopPropagation(); closeTab(i); };
      d.appendChild(x);
      tabsEl.appendChild(d);
    });
    const t = tabs[cur];
    urlInp.value = t ? t.url : '';
    win.bar.querySelector('.wtitle').textContent = '浏览器' + (t && t.title ? ' - ' + t.title : '');
    if (api.host.browserTabs) api.host.browserTabs();
  }

  function closeTab(i) {
    const t = tabs[i];
    if (t) { t.pg.remove(); if (api.host.electron) { try { t.view.src = 'about:blank'; } catch (e) { } } }
    tabs.splice(i, 1);
    if (cur >= tabs.length) cur = tabs.length - 1;
    if (cur < 0 && tabs.length) cur = 0;
    if (tabs.length) select(cur); else update();
  }

  el.querySelector('#go').onclick = () => navigate(urlInp.value.trim());
  urlInp.onkeydown = (e) => { if (e.key === 'Enter') navigate(urlInp.value.trim()); };
  el.querySelector('#back').onclick = () => { if (api.host.electron && tabs[cur]) tabs[cur].view.goBack(); };
  el.querySelector('#fwd').onclick = () => { if (api.host.electron && tabs[cur]) tabs[cur].view.goForward(); };
  el.querySelector('#reload').onclick = () => { if (api.host.electron && tabs[cur]) tabs[cur].view.reload(); else if (tabs[cur]) tabs[cur].view.src = tabs[cur].view.src; };
  el.querySelector('#stop').onclick = () => { if (api.host.electron && tabs[cur]) tabs[cur].view.stop(); };
  el.querySelector('#newtab').onclick = () => newTab('');

  win.api = {
    openUrl: (u) => { if (tabs.length === 0) newTab(u); else navigate(u); },
    dispose: () => { tabs.forEach(t => { if (api.host.electron) { try { t.view.src = 'about:blank'; } catch (e) { } } }); }
  };
  newTab('');
  api.host.browserTabs = () => tabs.map(t => ({ windowId: win.id, tabId: t.id, url: t.url, loadState: t.loadState, title: t.title }));
}
