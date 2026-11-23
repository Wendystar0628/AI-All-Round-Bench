// Root Chromium Browser App ('browser')
// - Real Chromium browsing via isolated sandboxed Electron <webview>
// - Multi-tab, Back/Forward/Reload/Stop, Address bar, loading state, error + retry overlay
// - Links opening new windows (target="_blank" / window.open) open as new tabs INSIDE this browser
// - Strict z-order / occlusion / minimize / close / Task Manager termination lifecycle

export function mountBrowserApp(os, win, bodyEl, launchArgs = {}) {
  const tabs = new Map(); // tabId -> { tabId, url, title, loadState, error, webviewEl, errOverlayEl }
  let activeTabId = null;
  let tabSeq = 0;

  bodyEl.innerHTML = `
    <div class="browser-app">
      <div class="browser-tabbar">
        <div class="browser-tabs-strip"></div>
        <button class="btn-xs browser-newtab-btn" data-testid="browser-new-tab" data-system-id="outer" data-window-id="${win.id}" aria-label="新建标签页" title="新建标签页">+</button>
      </div>
      <div class="browser-navbar">
        <button class="btn-xs" data-testid="browser-back" data-system-id="outer" data-window-id="${win.id}" aria-label="后退" title="后退">←</button>
        <button class="btn-xs" data-testid="browser-forward" data-system-id="outer" data-window-id="${win.id}" aria-label="前进" title="前进">→</button>
        <button class="btn-xs" data-testid="browser-reload" data-system-id="outer" data-window-id="${win.id}" aria-label="刷新或停止" title="刷新/停止">↻</button>
        <input class="nos-input browser-addr-in" type="text" placeholder="输入网址（例如 https://www.bilibili.com）" data-testid="browser-address" data-system-id="outer" data-window-id="${win.id}" aria-label="地址栏"/>
        <button class="btn-xs btn-accent" data-testid="browser-go" data-system-id="outer" data-window-id="${win.id}" aria-label="访问">前往</button>
      </div>
      <div class="browser-bookmarks">
        <button class="bm-chip" data-url="https://www.bilibili.com">哔哩哔哩 Bilibili</button>
        <button class="bm-chip" data-url="https://www.bing.com">必应搜索</button>
        <button class="bm-chip" data-url="https://example.com">Example.com</button>
        <span class="browser-load-badge">就绪</span>
      </div>
      <div class="browser-stage"></div>
    </div>
  `;

  const tabsStrip = bodyEl.querySelector('.browser-tabs-strip');
  const addrInput = bodyEl.querySelector('[data-testid="browser-address"]');
  const reloadBtn = bodyEl.querySelector('[data-testid="browser-reload"]');
  const loadBadge = bodyEl.querySelector('.browser-load-badge');
  const stageEl = bodyEl.querySelector('.browser-stage');

  const normalizeUrl = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return 'https://www.bilibili.com';
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return s;
    if (s.includes('.') && !s.includes(' ')) return 'https://' + s;
    return 'https://www.bing.com/search?q=' + encodeURIComponent(s);
  };

  const syncChrome = () => {
    tabsStrip.innerHTML = '';
    for (const tab of tabs.values()) {
      const el = document.createElement('div');
      el.className = `browser-tab${tab.tabId === activeTabId ? ' active' : ''}`;
      el.dataset.testid = 'browser-tab';
      el.dataset.systemId = 'outer';
      el.dataset.windowId = win.id;
      el.dataset.tabId = tab.tabId;
      el.innerHTML = `
        <span class="bt-dot st-${tab.loadState}"></span>
        <span class="bt-title" title="${tab.title || tab.url}">${tab.title || tab.url || '新标签页'}</span>
        <button class="bt-close" data-testid="browser-close-tab" data-system-id="outer" data-window-id="${win.id}" data-tab-id="${tab.tabId}" aria-label="关闭标签">×</button>
      `;
      el.addEventListener('click', (e) => {
        if (e.target.closest('.bt-close')) {
          closeTab(tab.tabId);
        } else {
          selectTab(tab.tabId);
        }
      });
      tabsStrip.appendChild(el);
    }

    const cur = tabs.get(activeTabId);
    if (cur) {
      if (document.activeElement !== addrInput) addrInput.value = cur.url;
      reloadBtn.textContent = cur.loadState === 'loading' ? '✕' : '↻';
      loadBadge.textContent = cur.loadState === 'loading' ? '加载中...' : (cur.loadState === 'error' ? '加载失败' : '已加载');
      os.setWindowTitle(win.id, `${cur.title || '浏览器'} — Chromium 浏览器`);
    }
  };

  const selectTab = (tabId) => {
    if (!tabs.has(tabId)) return;
    activeTabId = tabId;
    for (const tab of tabs.values()) {
      const show = tab.tabId === activeTabId;
      tab.wrapEl.style.display = show ? 'flex' : 'none';
    }
    syncChrome();
  };

  const createTab = (initialUrl = 'https://www.bilibili.com') => {
    const tabId = `tab-${win.id}-${++tabSeq}`;
    const url = normalizeUrl(initialUrl);

    const wrapEl = document.createElement('div');
    wrapEl.className = 'browser-tab-pane';

    const wv = document.createElement('webview');
    wv.className = 'browser-webview';
    wv.setAttribute('src', url);
    wv.setAttribute('partition', 'persist:nestedos-browser');
    wv.setAttribute('webpreferences', 'backgroundThrottling=no, contextIsolation=yes, nodeIntegration=no, sandbox=yes');
    wv.setAttribute('useragent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36');

    const errOverlay = document.createElement('div');
    errOverlay.className = 'browser-err-overlay';
    errOverlay.style.display = 'none';

    wrapEl.append(wv, errOverlay);
    stageEl.appendChild(wrapEl);

    const tab = {
      windowId: win.id,
      tabId,
      url,
      title: '加载中...',
      loadState: 'loading', // loading | loaded | error | idle
      error: null,
      wrapEl,
      webviewEl: wv,
      errOverlayEl: errOverlay,
    };
    tabs.set(tabId, tab);

    const showError = (code, desc, failedUrl) => {
      tab.loadState = 'error';
      tab.error = `${desc} (${code})`;
      errOverlay.style.display = 'flex';
      errOverlay.innerHTML = `
        <div class="be-card">
          <div class="be-title">页面加载失败</div>
          <div class="be-url">${failedUrl || tab.url}</div>
          <div class="be-code">${tab.error}</div>
          <button class="btn-sm btn-accent be-retry" data-testid="browser-retry">重新加载</button>
        </div>
      `;
      errOverlay.querySelector('.be-retry').addEventListener('click', () => {
        errOverlay.style.display = 'none';
        tab.loadState = 'loading';
        tab.error = null;
        try { wv.reload(); } catch { wv.setAttribute('src', tab.url); }
        syncChrome();
      });
      syncChrome();
    };

    wv.addEventListener('did-start-loading', () => {
      tab.loadState = 'loading';
      tab.error = null;
      errOverlay.style.display = 'none';
      syncChrome();
    });
    wv.addEventListener('did-stop-loading', () => {
      if (tab.loadState !== 'error') {
        tab.loadState = 'loaded';
      }
      try {
        const curU = wv.getURL();
        if (curU) tab.url = curU;
        const curT = wv.getTitle();
        if (curT) tab.title = curT;
      } catch {}
      syncChrome();
    });
    wv.addEventListener('did-navigate', (e) => {
      if (e.url) tab.url = e.url;
      syncChrome();
    });
    wv.addEventListener('did-navigate-in-page', (e) => {
      if (e.url) tab.url = e.url;
      syncChrome();
    });
    wv.addEventListener('page-title-updated', (e) => {
      if (e.title) tab.title = e.title;
      syncChrome();
    });
    wv.addEventListener('did-fail-load', (e) => {
      // Ignore ERR_ABORTED (-3) caused by quick redirects/stops or subframes
      if (e.errorCode === -3 || !e.isMainFrame) return;
      showError(e.errorCode, e.errorDescription || '网络错误', e.validatedURL);
    });
    wv.addEventListener('dom-ready', () => {
      try {
        if (tab.loadState === 'loading') {
          const curU = wv.getURL();
          if (curU) tab.url = curU;
        }
      } catch {}
      syncChrome();
    });

    selectTab(tabId);
    return tab;
  };

  const closeTab = (tabId) => {
    const tab = tabs.get(tabId);
    if (!tab) return;
    try { tab.webviewEl.remove(); } catch {}
    tab.wrapEl.remove();
    tabs.delete(tabId);
    if (tabs.size === 0) {
      createTab('https://www.bilibili.com');
      return;
    }
    if (activeTabId === tabId) {
      const nextId = tabs.keys().next().value;
      selectTab(nextId);
    } else {
      syncChrome();
    }
  };

  const navigateActive = (rawUrl) => {
    const cur = tabs.get(activeTabId);
    if (!cur) return;
    const url = normalizeUrl(rawUrl);
    cur.url = url;
    cur.loadState = 'loading';
    cur.errOverlayEl.style.display = 'none';
    try {
      cur.webviewEl.loadURL(url);
    } catch {
      cur.webviewEl.setAttribute('src', url);
    }
    syncChrome();
  };

  // Wire toolbar controls
  bodyEl.querySelector('[data-testid="browser-new-tab"]').addEventListener('click', () => {
    createTab('https://www.bilibili.com');
  });
  bodyEl.querySelector('[data-testid="browser-go"]').addEventListener('click', () => {
    navigateActive(addrInput.value);
  });
  addrInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      navigateActive(addrInput.value);
    }
  });
  bodyEl.querySelector('[data-testid="browser-back"]').addEventListener('click', () => {
    const cur = tabs.get(activeTabId);
    try { if (cur && cur.webviewEl.canGoBack()) cur.webviewEl.goBack(); } catch {}
  });
  bodyEl.querySelector('[data-testid="browser-forward"]').addEventListener('click', () => {
    const cur = tabs.get(activeTabId);
    try { if (cur && cur.webviewEl.canGoForward()) cur.webviewEl.goForward(); } catch {}
  });
  reloadBtn.addEventListener('click', () => {
    const cur = tabs.get(activeTabId);
    if (!cur) return;
    try {
      if (cur.loadState === 'loading') cur.webviewEl.stop();
      else cur.webviewEl.reload();
    } catch {}
  });
  bodyEl.querySelectorAll('.bm-chip').forEach((chip) => {
    chip.addEventListener('click', () => navigateActive(chip.dataset.url));
  });

  // Listen for main-process intercepted window.open / target="_blank" URLs -> open inside browser tab!
  const unsubOpenTab = window.nestedHost?.onOpenBrowserTab?.((url) => {
    if (url) createTab(url);
  });

  const controller = {
    windowId: win.id,
    getTabsInfo: () => Array.from(tabs.values()).map((t) => ({
      windowId: win.id,
      tabId: t.tabId,
      url: t.url,
      title: t.title,
      loadState: t.loadState,
    })),
    openUrl: (u) => createTab(u),
    closeTab,
    setMinimized: (min) => {
      // Properly hide webview when browser window is minimized so it NEVER lingers on screen
      stageEl.style.visibility = min ? 'hidden' : 'visible';
      stageEl.style.pointerEvents = min ? 'none' : 'auto';
    },
    destroy: () => {
      if (typeof unsubOpenTab === 'function') unsubOpenTab();
      for (const tab of tabs.values()) {
        try { tab.webviewEl.remove(); } catch {}
      }
      tabs.clear();
      os.browsers.delete(win.id);
    },
  };
  os.browsers.set(win.id, controller);

  createTab(launchArgs.url || 'https://www.bilibili.com');
  return controller;
}
