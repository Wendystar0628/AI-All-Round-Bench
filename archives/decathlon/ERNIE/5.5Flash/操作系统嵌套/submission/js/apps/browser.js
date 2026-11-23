// 浏览器：自制标签/地址栏 + Electron <webview> 真实 Chromium 网页视图
import { h, clear, icon, iconSvg } from '../util.js';

let tabSeq = 1;

export class BrowserApp {
  constructor(win, os, state = {}) {
    this.win = win; this.os = os; this.sys = win.sys;
    this.tabs = [];
    this.active = null;
    this.startUrl = state.url || '';
  }
  mount(body) {
    const wrap = h('div', { class: 'browser-wrap' });
    this.tabbar = h('div', { class: 'browser-tabbar' });
    const bar = h('div', { class: 'browser-bar' });
    const mk = (testid, ic, title, fn) => {
      const b = h('button', { class: 'bb-btn', title, 'data-testid': testid });
      b.innerHTML = iconSvg(ic);
      b.addEventListener('click', e => { e.stopPropagation(); fn(); });
      bar.append(b); return b;
    };
    mk('browser-back', 'chevronLeft', '后退', () => this.back());
    mk('browser-forward', 'chevronRight', '前进', () => this.forward());
    mk('browser-reload', 'reload', '刷新', () => this.reload());
    mk('browser-stop', 'stopload', '停止', () => this.stop());
    const omni = h('div', { class: 'bb-omni' });
    const lock = h('span', { style: { display: 'flex', color: 'var(--faint)' } }); lock.innerHTML = iconSvg('lock');
    this.address = h('input', { 'data-testid': 'browser-address', spellcheck: 'false', placeholder: '搜索或输入网址' });
    this.address.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { this.navigate(this.address.value); e.target.blur(); }
    });
    omni.append(lock, this.address);
    mk('browser-go', 'navigation', '转到', () => this.navigate(this.address.value));
    mk('browser-new-tab', 'plus', '新建标签', () => this.newTab());
    bar.append(omni);
    const status = h('div', { class: 'browser-status' });
    this.statusEl = status;
    const stage = h('div', { class: 'browser-stage' });
    this.stage = stage;
    wrap.append(this.tabbar, bar, stage, status);
    body.append(wrap);
    this.renderTabs();
    if (this.startUrl) this.newTab(this.startUrl);
    else this.newTab('');
    this.win.setTitle('浏览器');
  }

  normalize(url) {
    url = (url || '').trim();
    if (!url) return '';
    if (/^(https?|file|about|chrome):/i.test(url)) return url;
    if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(url)) return 'https://' + url;
    return 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(url);
  }

  newTab(url = '') {
    const id = 'tab-' + (tabSeq++);
    const state = { id, url: '', title: '新标签页', loadState: 'empty', error: null };
    const wv = document.createElement('webview');
    wv.setAttribute('src', 'about:blank');
    wv.setAttribute('allowpopups', '');
    wv.setAttribute('allow', 'autoplay; fullscreen; clipboard-read; clipboard-write');
    wv.setAttribute('partition', 'persist:nestedos');
    wv.setAttribute('webpreferences', 'autoplayPolicy=no-user-gesture-required, backgroundThrottling=false');
    wv.style.position = 'absolute';
    wv.style.inset = '0';
    wv.style.width = '100%';
    wv.style.height = '100%';
    wv.style.border = 'none';
    wv.style.display = 'none';
    this.stage.append(wv);
    const tab = { ...state, wv, ready: false, pendingUrl: '' };
    this.tabs.push(tab);
    wv.addEventListener('dom-ready', () => {
      tab.ready = true;
      if (tab.pendingUrl) {
        const u = tab.pendingUrl; tab.pendingUrl = '';
        try { wv.loadURL(u); } catch (e) {}
      }
    });
    wv.addEventListener('did-start-loading', () => { tab.loadState = 'loading'; this.updateChrome(tab); });
    wv.addEventListener('did-stop-loading', () => { tab.loadState = 'complete'; this.updateChrome(tab); });
    wv.addEventListener('did-fail-load', e => {
      if (e.errorCode === -3) return;
      tab.loadState = 'failed';
      tab.error = e.errorDescription || ('错误 ' + e.errorCode);
      this.updateChrome(tab);
    });
    wv.addEventListener('page-title-updated', e => { tab.title = e.title || tab.url; this.updateChrome(tab); });
    wv.addEventListener('did-navigate', e => { tab.url = e.url; tab.loadState = 'complete'; this.updateChrome(tab); });
    wv.addEventListener('did-navigate-in-page', e => { tab.url = e.url; this.updateChrome(tab); });
    wv.addEventListener('new-window', e => {
      const u = e.url;
      if (u && !u.startsWith('about:blank')) this.newTab(u);
    });
    const showError = () => {
      const d = h('div', { class: 'browser-empty', style: { zIndex: '5' } });
      const logo = h('div', { class: 'be-logo' }); logo.innerHTML = iconSvg('warning');
      const t = h('div', { class: 'be-title' }, '网页加载失败');
      const s = h('div', { style: { maxWidth: '420px', textAlign: 'center', fontSize: '12px', lineHeight: '1.6' } }, tab.error || '网络不可用或页面拒绝连接。');
      const retry = h('button', { class: 'btn primary', style: { marginTop: '6px' } }, '重试');
      retry.addEventListener('click', () => { d.remove(); this.reload(); });
      d.append(logo, t, s, retry);
      this.stage.append(d);
      tab.errorEl = d;
    };
    tab.showError = showError;
    this.activate(id);
    if (url) this.navigate(url, id);
    return tab;
  }

  activate(id) {
    this.active = id;
    for (const t of this.tabs) {
      const on = t.id === id;
      t.wv.style.display = on ? 'block' : 'none';
      if (t.errorEl) t.errorEl.style.display = on && t.loadState === 'failed' ? 'flex' : 'none';
    }
    this.renderTabs();
    const t = this.tabs.find(x => x.id === id);
    if (t) {
      if (this.address && document.activeElement !== this.address) this.address.value = t.url || '';
      this.win.setTitle((t.title || '浏览器') + ' · 浏览器');
      this.updateStatus();
    }
  }
  closeTab(id) {
    const t = this.tabs.find(x => x.id === id);
    if (!t) return;
    if (t.errorEl) t.errorEl.remove();
    t.wv.remove();
    this.tabs = this.tabs.filter(x => x !== t);
    if (this.active === id) this.activate(this.tabs[this.tabs.length - 1]?.id || null);
    if (!this.tabs.length) {
      this.os.closeWindow(this.win);
      return;
    }
    this.renderTabs();
  }
  renderTabs() {
    clear(this.tabbar);
    for (const t of this.tabs) {
      const tab = h('div', { class: 'browser-tab' + (t.id === this.active ? ' active' : ''), 'data-testid': 'browser-tab', 'data-tab-id': t.id, title: t.title || t.url });
      if (t.loadState === 'loading') { const sp = h('span', { class: 'bt-spin' }); tab.append(sp); }
      else { const ic = h('span', { style: { display: 'flex', color: 'var(--faint)' } }); ic.innerHTML = iconSvg('globe'); tab.append(ic); }
      tab.append(h('span', { class: 'bt-title' }, t.title || '新标签页'));
      const close = h('button', { class: 'bt-close', 'data-testid': 'browser-close-tab', title: '关闭标签' }, '×');
      close.addEventListener('click', e => { e.stopPropagation(); this.closeTab(t.id); });
      tab.append(close);
      tab.addEventListener('click', e => { if (!e.target.closest('button')) this.activate(t.id); });
      this.tabbar.append(tab);
    }
    const add = h('button', { class: 'tb-button', style: { width: '30px', height: '28px', margin: '0 4px' }, title: '新建标签' }, '+');
    add.addEventListener('click', () => this.newTab());
    this.tabbar.append(add);
    this.updateStatus();
  }
  updateChrome(tab) {
    if (tab.loadState === 'failed') {
      if (!tab.errorEl) tab.showError?.();
      if (tab.errorEl && tab.id === this.active) tab.errorEl.style.display = 'flex';
    } else if (tab.errorEl) tab.errorEl.style.display = 'none';
    if (tab.id === this.active) {
      if (document.activeElement !== this.address) this.address.value = tab.url || '';
      this.win.setTitle((tab.title || '浏览器') + ' · 浏览器');
    }
    this.renderTabs();
  }
  updateStatus() {
    if (!this.statusEl) return;
    const t = this.tabs.find(x => x.id === this.active);
    if (!t) { this.statusEl.textContent = '没有打开的标签'; return; }
    const st = t.loadState === 'loading' ? '正在加载…' : t.loadState === 'failed' ? '加载失败' : t.loadState === 'complete' ? '已完成' : '就绪';
    this.statusEl.textContent = `${st} · ${t.url || 'about:blank'}`;
  }
  navigate(value, tabId) {
    const t = this.tabs.find(x => x.id === (tabId || this.active));
    if (!t) { this.newTab(value); return; }
    const url = this.normalize(value);
    if (!url) return;
    t.url = url; t.loadState = 'loading'; t.error = null;
    if (!t.ready) { t.pendingUrl = url; this.updateChrome(t); return; }
    if (t.errorEl) { t.errorEl.remove(); t.errorEl = null; }
    this.activate(t.id);
    try { t.wv.loadURL(url); } catch (e) { t.loadState = 'failed'; t.error = e.message; }
    this.address.value = url;
    this.updateChrome(t);
  }
  back() { const t = this.tabs.find(x => x.id === this.active); if (t) { try { if (t.wv.canGoBack()) t.wv.goBack(); } catch (e) {} } }
  forward() { const t = this.tabs.find(x => x.id === this.active); if (t) { try { if (t.wv.canGoForward()) t.wv.goForward(); } catch (e) {} } }
  reload() { const t = this.tabs.find(x => x.id === this.active); if (t) { try { t.wv.reload(); } catch (e) {} } }
  stop() { const t = this.tabs.find(x => x.id === this.active); if (t) { try { t.wv.stop(); } catch (e) {} } }

  inspect(win) {
    return this.tabs.map(t => ({ windowId: win.id, tabId: t.id, url: t.url, loadState: t.loadState }));
  }
  serialize() {
    return { active: this.active, tabs: this.tabs.map(t => ({ id: t.id, url: t.url, title: t.title, loadState: t.loadState })) };
  }
  restore(st) {
    if (st?.tabs) {
      for (const t of this.tabs) { try { t.wv.remove(); } catch (e) {} }
      this.tabs = [];
      for (const x of st.tabs) {
        const t = this.newTab(x.url || '');
        t.id = x.id; t.title = x.title; t.loadState = x.loadState;
      }
      this.activate(st.active || this.tabs[0]?.id);
    }
  }
  beforeClose() { return true; }
  tick() {}
  render() {}
  dispose() { for (const t of this.tabs) { try { t.wv.remove(); } catch (e) {} } this.tabs = []; }
}