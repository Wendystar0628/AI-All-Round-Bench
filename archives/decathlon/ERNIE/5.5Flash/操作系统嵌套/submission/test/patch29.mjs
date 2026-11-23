import fs from 'fs';
let s = fs.readFileSync('js/apps/browser.js', 'utf8');
s = s.replace(`    const tab = { ...state, wv };
    this.tabs.push(tab);`, `    const tab = { ...state, wv, ready: false, pendingUrl: '' };
    this.tabs.push(tab);
    wv.addEventListener('dom-ready', () => {
      tab.ready = true;
      if (tab.pendingUrl) {
        const u = tab.pendingUrl; tab.pendingUrl = '';
        try { wv.loadURL(u); } catch (e) {}
      }
    });`);
s = s.replace(`    const url = this.normalize(value);
    if (!url) return;
    t.url = url; t.loadState = 'loading'; t.error = null;`, `    const url = this.normalize(value);
    if (!url) return;
    t.url = url; t.loadState = 'loading'; t.error = null;
    if (!t.ready) { t.pendingUrl = url; this.updateChrome(t); return; }`);
fs.writeFileSync('js/apps/browser.js', s);
console.log('done');