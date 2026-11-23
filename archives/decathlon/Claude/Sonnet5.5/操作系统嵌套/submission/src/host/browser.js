// 根系统浏览器：标签栏、地址栏、导航按钮与加载状态由自己制作；网页由 Electron 内置的 Chromium 内核（webview）真实加载。
// 网页视图是窗口内的 DOM 元素，随自制窗口一起移动、缩放、裁剪和遮挡；不向网页开放宿主文件系统、Node.js 或系统内部对象。
const CSS = `
.browser{position:absolute;inset:0;display:flex;flex-direction:column;background:#14111f;color:#ece9ff;font:13px "Microsoft YaHei UI","Segoe UI",sans-serif;user-select:none}
.browser .tabs{display:flex;align-items:flex-end;gap:3px;padding:6px 8px 0;background:#181430;min-height:36px;overflow:hidden}
.browser .tab{display:flex;align-items:center;gap:6px;max-width:210px;min-width:90px;flex:1 1 0;padding:7px 8px 7px 12px;background:#221d40;border-radius:9px 9px 0 0;cursor:default;color:#a49ecb;white-space:nowrap;overflow:hidden;border:1px solid transparent;border-bottom:none}
.browser .tab.active{background:#2d2752;color:#fff;border-color:#3a3366}
.browser .tab .tt{flex:1;overflow:hidden;text-overflow:ellipsis}.browser .tab .x{width:18px;height:18px;border-radius:9px;text-align:center;line-height:17px;color:#a49ecb;cursor:pointer;flex:none}
.browser .tab .x:hover{background:#ff6b81;color:#fff}
.browser .tab .spin{width:11px;height:11px;border:2px solid #8b6cff;border-top-color:transparent;border-radius:50%;animation:bsp .8s linear infinite;flex:none}
@keyframes bsp{to{transform:rotate(360deg)}}
.browser .plus{width:28px;height:28px;border-radius:14px;text-align:center;line-height:27px;cursor:pointer;color:#a49ecb;margin:0 0 4px 4px;flex:none}.browser .plus:hover{background:#2d2752;color:#fff}
.browser .bar{display:flex;align-items:center;gap:6px;padding:7px 10px;background:#2d2752;border-bottom:1px solid #3a3366}
.browser .bar button{width:32px;height:30px;border-radius:8px;border:none;background:transparent;color:#ece9ff;font-size:16px;cursor:pointer}
.browser .bar button:hover:not(:disabled){background:#3a3366}.browser .bar button:disabled{opacity:.3;cursor:default}
.browser .addr{flex:1;min-width:0;padding:6px 14px;background:#0f0c1d;border:1px solid #3a3366;border-radius:16px;color:#ece9ff;font:13px "Cascadia Mono",Consolas,"Microsoft YaHei UI",monospace;outline:none}
.browser .addr:focus{border-color:#8b6cff}
.browser .go{width:auto!important;padding:0 14px;font-size:13px!important;background:#8b6cff!important;border-radius:15px!important}
.browser .prog{height:3px;background:transparent;position:relative}.browser .prog i{position:absolute;left:0;top:0;height:3px;background:#ffc83d;width:0;transition:width .3s}
.browser .view{flex:1;position:relative;background:#fff;min-height:0}
.browser webview{position:absolute;inset:0;width:100%;height:100%;border:none}
.browser webview.hidden{visibility:hidden;pointer-events:none}
.browser .err{position:absolute;inset:0;background:#14111f;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;padding:30px}
.browser .err h2{margin:0;color:#ffc83d;font-size:20px}.browser .err p{margin:0;color:#a49ecb;max-width:520px;line-height:1.7}
.browser .err button{padding:8px 22px;border-radius:18px;border:none;background:#8b6cff;color:#fff;font:inherit;cursor:pointer;margin-top:8px}
.browser .start{position:absolute;inset:0;background:linear-gradient(160deg,#120d2e,#2b1a5e 60%,#4a2470);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px}
.browser .start h1{margin:0;font-size:28px;color:#ece9ff;letter-spacing:1px}.browser .start .links{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;max-width:640px}
.browser .start .lk{padding:18px 26px;border-radius:14px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);cursor:pointer;color:#fff;min-width:110px;text-align:center}.browser .start .lk:hover{background:rgba(139,108,255,.35)}
`;
let cssDone = false;
const HOME = 'about:blank';

function normalize(input) {
  const s = input.trim(); if (!s) return HOME;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^about:|^data:|^file:/i.test(s)) return s;
  if (/^[^\s/]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(s) || /^localhost(:\d+)?([/?#].*)?$/i.test(s)) return 'https://' + s;
  return 'https://www.baidu.com/s?wd=' + encodeURIComponent(s);
}

export class BrowserApp {
  constructor(machine, nid, extra, ctx) {
    this.machine = machine; this.nid = nid; this.ctx = ctx; this.kind = 'web'; this.app = 'browser'; this.wid = (extra && extra.wid) || '';
    this.tabs = []; this.active = null; this.seq = 1; this.closed = false; this.title = '浏览器';
    if (!cssDone) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); cssDone = true; }
    const root = this.root = document.createElement('div'); root.className = 'browser';
    root.innerHTML = `<div class="tabs"><div class="plus" data-testid="browser-new-tab" title="新建标签页">＋</div></div>
      <div class="bar"><button data-testid="browser-back" title="后退">←</button><button data-testid="browser-forward" title="前进">→</button><button data-testid="browser-reload" title="刷新">⟳</button>
      <input class="addr" data-testid="browser-address" spellcheck="false" placeholder="输入网址或搜索内容，回车打开"><button class="go" data-testid="browser-go">前往</button></div>
      <div class="prog"><i></i></div><div class="view"></div>`;
    this.tabsEl = root.querySelector('.tabs'); this.plus = root.querySelector('.plus'); this.addr = root.querySelector('.addr'); this.viewEl = root.querySelector('.view'); this.progEl = root.querySelector('.prog i');
    this.btnBack = root.querySelector('[data-testid=browser-back]'); this.btnFwd = root.querySelector('[data-testid=browser-forward]'); this.btnReload = root.querySelector('[data-testid=browser-reload]');
    this.plus.onclick = () => this.newTab(HOME, true);
    this.btnBack.onclick = () => { const t = this.cur(); if (t && t.ready && t.wv.canGoBack()) t.wv.goBack(); };
    this.btnFwd.onclick = () => { const t = this.cur(); if (t && t.ready && t.wv.canGoForward()) t.wv.goForward(); };
    this.btnReload.onclick = () => { const t = this.cur(); if (!t) return; if (t.loading) { try { t.wv.stop(); } catch (e) { } } else if (t.ready) { t.err = null; t.wv.reload(); } else if (t.url) this.go(t, t.url); };
    root.querySelector('.go').onclick = () => this.navigate(this.addr.value);
    this.addr.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') this.navigate(this.addr.value); });
    this.addr.addEventListener('focus', () => this.addr.select());
    const url0 = extra && extra.url;
    this.newTab(url0 || HOME, true);
    ctx.register(this);
  }
  cur() { return this.tabs.find((t) => t.id === this.active); }
  info() { return { nid: this.nid, app: 'browser', title: '浏览器', kind: 'web', views: this.tabs.length }; }
  tabsInfo() {
    return this.tabs.map((t) => ({ windowId: this.wid, tabId: String(t.id), url: t.url || '', loadState: t.err ? 'failed' : (t.loading ? 'loading' : (!t.url || t.url === HOME ? 'blank' : 'loaded')) }));
  }
  newTab(url, activate) {
    const t = { id: this.seq++, url: '', title: '新标签页', loading: false, err: null, ready: false, canBack: false, canFwd: false };
    const tab = t.tabEl = document.createElement('div'); tab.className = 'tab'; tab.dataset.testid = 'browser-tab'; tab.dataset.tabId = t.id;
    tab.innerHTML = '<span class="tt"></span><span class="x" data-testid="browser-close-tab" title="关闭标签页">×</span>';
    tab.querySelector('.x').dataset.tabId = t.id;
    tab.addEventListener('mousedown', (e) => { if (e.target.classList.contains('x')) return; this.activate(t.id); });
    tab.querySelector('.x').addEventListener('click', (e) => { e.stopPropagation(); this.closeTab(t.id); });
    this.tabsEl.insertBefore(tab, this.plus);
    const wv = t.wv = document.createElement('webview');
    wv.setAttribute('partition', 'persist:browser'); wv.setAttribute('useragent', navigator.userAgent.replace(/ Electron\/\S+/, '').replace(/ nested-os\/\S+/, ''));
    wv.setAttribute('allowpopups', 'false'); wv.className = 'hidden';
    const on = (n, f) => wv.addEventListener(n, f);
    on('dom-ready', () => { t.ready = true; try { t.wcId = wv.getWebContentsId(); } catch (e) { } this.updateNav(t); });
    on('did-start-loading', () => { t.loading = true; t.err = null; this.refresh(); });
    on('did-stop-loading', () => { t.loading = false; try { t.url = wv.getURL() || t.url; } catch (e) { } this.updateNav(t); this.refresh(); });
    on('did-navigate', (e) => { t.url = e.url; t.err = null; this.refresh(); });
    on('did-navigate-in-page', (e) => { if (e.isMainFrame) { t.url = e.url; this.refresh(); } });
    on('page-title-updated', (e) => { t.title = e.title; this.refresh(); });
    on('did-fail-load', (e) => { if (e.isMainFrame && e.errorCode !== -3) { t.err = { code: e.errorCode, desc: e.errorDescription, url: e.validatedURL }; t.loading = false; this.refresh(); } });
    on('focus', () => this.ctx.focusWindow(this));
    on('ipc-message', () => { });
    this.viewEl.appendChild(wv);
    const start = t.startEl = document.createElement('div'); start.className = 'start'; start.style.display = 'none';
    start.innerHTML = '<h1>开始浏览</h1><div class="links"></div><div style="color:#a49ecb">网页由 Chromium 内核真实加载，需要联网</div>';
    for (const [n, u] of [['哔哩哔哩', 'https://www.bilibili.com'], ['必应', 'https://www.bing.com'], ['百度', 'https://www.baidu.com'], ['维基百科', 'https://zh.wikipedia.org']]) {
      const lk = document.createElement('div'); lk.className = 'lk'; lk.textContent = n; lk.dataset.testid = 'browser-quicklink'; lk.dataset.url = u; lk.onclick = () => this.go(t, u); start.querySelector('.links').appendChild(lk);
    }
    this.viewEl.appendChild(start);
    const err = t.errEl = document.createElement('div'); err.className = 'err'; err.style.display = 'none'; err.dataset.testid = 'browser-error'; this.viewEl.appendChild(err);
    this.tabs.push(t);
    if (activate !== false) this.activate(t.id);
    if (url && url !== HOME) this.go(t, url);
    this.refresh();
    return t;
  }
  go(t, url) {
    url = normalize(url); t.url = url; t.err = null; t.title = url === HOME ? '新标签页' : url;
    if (url === HOME) { t.loading = false; this.refresh(); return; }
    t.loading = true;
    if (!t.wv.getAttribute('src')) t.wv.setAttribute('src', url); else if (t.ready) t.wv.loadURL(url).catch(() => { }); else t.wv.setAttribute('src', url);
    this.refresh();
  }
  navigate(text) { const t = this.cur(); if (t) this.go(t, text); }
  activate(id) { this.active = id; this.refresh(); }
  closeTab(id) {
    const i = this.tabs.findIndex((t) => t.id === id); if (i < 0) return;
    const t = this.tabs[i]; t.tabEl.remove(); try { t.wv.stop(); } catch (e) { } t.wv.remove(); t.startEl.remove(); t.errEl.remove(); this.tabs.splice(i, 1);
    if (!this.tabs.length) { this.newTab(HOME, true); return; }
    if (this.active === id) this.active = this.tabs[Math.min(i, this.tabs.length - 1)].id;
    this.refresh();
  }
  updateNav(t) { try { t.canBack = t.ready && t.wv.canGoBack(); t.canFwd = t.ready && t.wv.canGoForward(); } catch (e) { } this.refresh(); }
  onNewWindow(fromWc, url) { // 网页打开的新页面在浏览器内部处理
    const t = this.tabs.find((x) => x.wcId === fromWc) || this.cur();
    if (!t) return false; this.newTab(url, true); return true;
  }
  refresh() {
    for (const t of this.tabs) {
      const act = t.id === this.active;
      t.tabEl.classList.toggle('active', act);
      const tt = t.tabEl.querySelector('.tt'); const title = t.title || '新标签页'; if (tt.textContent !== title) tt.textContent = title;
      const sp = t.tabEl.querySelector('.spin'); if (t.loading && !sp) { const s = document.createElement('span'); s.className = 'spin'; t.tabEl.insertBefore(s, tt); } else if (!t.loading && sp) sp.remove();
      const blank = !t.url || t.url === HOME;
      t.wv.classList.toggle('hidden', !act || blank || !!t.err);
      t.startEl.style.display = act && blank && !t.err ? 'flex' : 'none';
      if (t.err) {
        t.errEl.style.display = act ? 'flex' : 'none';
        t.errEl.innerHTML = '<h2>无法访问此网页</h2><p></p><button data-testid="browser-retry">重试</button>';
        t.errEl.querySelector('p').textContent = t.err.url + '\n' + t.err.desc + '（错误 ' + t.err.code + '）。请检查网络连接后重试。';
        t.errEl.querySelector('p').style.whiteSpace = 'pre-wrap';
        t.errEl.querySelector('button').onclick = () => { t.err = null; if (t.ready) t.wv.reload(); else this.go(t, t.url); this.refresh(); };
      } else t.errEl.style.display = 'none';
    }
    const t = this.cur(); if (!t) return;
    if (document.activeElement !== this.addr) this.addr.value = t.url === HOME ? '' : t.url;
    this.btnBack.disabled = !t.canBack; this.btnFwd.disabled = !t.canFwd; this.btnReload.textContent = t.loading ? '✕' : '⟳'; this.btnReload.title = t.loading ? '停止加载' : '刷新';
    this.progEl.style.width = t.loading ? '70%' : '0'; this.progEl.style.opacity = t.loading ? '1' : '0';
    this.title = '浏览器 — ' + (t.title || '');
  }
  mountTo(el) { el.appendChild(this.root); }
  unmount() { }
  resize() { }
  requestClose() { return true; }
  destroy() {
    if (this.closed) return; this.closed = true;
    for (const t of this.tabs) { try { t.wv.stop(); } catch (e) { } t.wv.remove(); }
    this.root.remove(); this.tabs = []; this.ctx.unregister(this);
  }
}
