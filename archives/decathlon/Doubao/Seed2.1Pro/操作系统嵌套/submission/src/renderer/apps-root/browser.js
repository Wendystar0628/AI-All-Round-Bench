/* 根系统浏览器：自制界面（标签栏/地址栏/导航），Chromium 内核由 <webview> 承载。
 * 网页视图随窗口移动/缩放/遮挡/最小化，不悬浮、不穿过菜单。 */
'use strict';
window.NOS = window.NOS || {};

class Browser {
  constructor() {
    this.tabs = [];
    this.active = null;
    this.seq = 0;
  }
  open() {
    this.win = NOS.desktop.openWindow('browser', '浏览器', { w: 1000, h: 660, model: this });
    this.render();
    if (!this.tabs.length) this.newTab('https://www.bilibili.com');
  }
  unmount() {
    // 关闭浏览器释放网页视图
    this.tabs.forEach(t => { try { t.webview && t.webview.remove(); } catch (e) {} });
    this.tabs = [];
  }
  beforeClose() { this.unmount(); }

  render() {
    const c = this.win.contentEl;
    c.innerHTML = '';
    c.classList.add('browser-app');

    const tabbar = NOS.h('div', { class: 'tabbar' });
    const tabsEl = NOS.h('div', { class: 'tabs', id: 'browser-tabs' });
    this.tabs.forEach(t => {
      const b = NOS.h('div', { class: 'tab' + (t.id === this.active ? ' active' : ''), dataTabId: t.id, dataTestid: 'browser-tab' });
      const title = NOS.h('span', { class: 'tab-title' }, t.title || t.url || '新标签页');
      title.addEventListener('click', () => this.switchTab(t.id));
      const cl = NOS.h('button', { class: 'tab-close', dataTestid: 'browser-close-tab', dataTabId: t.id }, '×');
      cl.addEventListener('click', (e) => { e.stopPropagation(); this.closeTab(t.id); });
      b.append(title, cl);
      tabsEl.appendChild(b);
    });
    const plus = NOS.h('button', { class: 'tab-new', dataTestid: 'browser-new-tab' }, '+');
    plus.addEventListener('click', () => this.newTab());
    tabbar.append(tabsEl, plus);

    const nav = NOS.h('div', { class: 'navbar' });
    const mk = (label, fn, testid) => { const b = NOS.h('button', { class: 'nav-btn', dataTestid: testid || '' }, label); b.addEventListener('click', fn); return b; };
    const back = mk('←', () => this.activeTab() && this.activeTab().webview.goBack(), 'browser-back');
    const fwd = mk('→', () => this.activeTab() && this.activeTab().webview.goForward(), 'browser-forward');
    const reload = mk('⟳', () => { const t = this.activeTab(); if (t) t.loadState === 'loading' ? t.webview.stop() : t.webview.reload(); }, 'browser-reload');
    const addr = NOS.h('input', { class: 'address', dataTestid: 'browser-address', placeholder: '搜索或输入网址' });
    addr.value = this.activeTab() ? this.activeTab().url : '';
    const go = NOS.h('button', { class: 'nav-btn go', dataTestid: 'browser-go' }, '转到');
    const doGo = () => this.navigate(this.normalize(addr.value));
    go.addEventListener('click', doGo);
    addr.addEventListener('keydown', e => { if (e.key === 'Enter') doGo(); e.stopPropagation(); });
    addr.addEventListener('pointerdown', e => e.stopPropagation());
    nav.append(back, fwd, reload, addr, go);
    this.addrEl = addr;

    const views = NOS.h('div', { class: 'webviews' });
    c.append(tabbar, nav, views);
    this.viewsEl = views;
    this.tabs.forEach(t => {
      if (!t.webview) {
        const wv = document.createElement('webview');
        wv.src = t.url;
        wv.style.cssText = 'flex:1;border:0;width:100%;height:100%;display:flex';
        wv.setAttribute('allowpopups', 'true');
        wv.setAttribute('webpreferences', 'contextIsolation=yes');
        wv.addEventListener('page-title-updated', (e) => { t.title = e.title; this.refreshTitles(); });
        wv.addEventListener('did-navigate', (e) => { t.url = e.url; if (t.id === this.active) addr.value = e.url; t.loadState = 'ready'; this.refreshTitles(); });
        wv.addEventListener('did-navigate-in-page', (e) => { t.url = e.url; if (t.id === this.active) addr.value = e.url; });
        wv.addEventListener('did-start-loading', () => { t.loadState = 'loading'; if (t.id === this.active) this.setLoading(true); });
        wv.addEventListener('did-stop-loading', () => { t.loadState = 'ready'; if (t.id === this.active) this.setLoading(false); });
        wv.addEventListener('did-fail-load', (e) => {
          if (e.errorCode === -3) return;
          t.loadState = 'error';
          if (t.id === this.active) this.showError(e.errorDescription);
        });
        wv.addEventListener('new-window', (e) => { e.preventDefault(); this.newTab(e.url); });
        t.webview = wv;
      }
      t.webview.style.display = t.id === this.active ? 'flex' : 'none';
      views.appendChild(t.webview);
    });
  }
  setLoading(on) {
    const b = this.win.contentEl.querySelector('[data-testid="browser-reload"]');
    if (b) b.textContent = on ? '■' : '⟳';
  }
  showError(desc) {
    // 不遮挡 webview 之外的窗口；错误条在浏览器窗口内
    let bar = this.viewsEl.querySelector('.load-error');
    if (!bar) {
      bar = NOS.h('div', { class: 'load-error' });
      const retry = NOS.h('button', { class: 'btn' }, '重试');
      retry.addEventListener('click', () => { bar.remove(); this.activeTab().webview.reload(); });
      bar.append(NOS.h('span', {}, '页面加载失败：' + desc), retry);
      this.viewsEl.appendChild(bar);
    }
  }
  refreshTitles() {
    this.tabs.forEach(t => {
      const el = this.win.contentEl.querySelector(`[data-tab-id="${t.id}"] .tab-title`);
      if (el) el.textContent = (t.title || t.url || '新标签页').slice(0, 22);
    });
  }
  activeTab() { return this.tabs.find(t => t.id === this.active); }
  newTab(url) {
    const t = { id: 'tab' + (++this.seq), url: url || 'about:blank', title: url ? '' : '新标签页', loadState: 'loading', webview: null };
    this.tabs.push(t);
    this.active = t.id;
    if (this.viewsEl) this.render(); else this.render();
    if (url) t.url = url;
  }
  switchTab(id) {
    this.active = id;
    this.render();
  }
  closeTab(id) {
    const t = this.tabs.find(x => x.id === id);
    if (t && t.webview) t.webview.remove();
    this.tabs = this.tabs.filter(x => x.id !== id);
    if (this.active === id) this.active = this.tabs.length ? this.tabs[0].id : null;
    if (!this.tabs.length) { NOS.desktop.closeWindow(this.win.id); return; }
    this.render();
  }
  navigate(url) {
    const t = this.activeTab();
    if (!t) { this.newTab(url); return; }
    t.url = url; t.loadState = 'loading';
    if (t.webview) t.webview.src = url;
    this.addrEl.value = url;
  }
  normalize(q) {
    q = q.trim();
    if (/^https?:\/\//.test(q)) return q;
    if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(q) && !q.includes(' ')) return 'https://' + q;
    return 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(q);
  }
}
NOS.Browser = Browser;
