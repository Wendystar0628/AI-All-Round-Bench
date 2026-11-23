import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
const a = `    this.build(opts);
    this.app = os.createApp(this);
    if (this.app?.mount) this.app.mount(this.bodyEl);
    this.applyRect();`;
const b = `    this.build(opts);
    this.app = os.createApp(this);
    if (this.app?.mount) this.app.mount(this.bodyEl);
    this._tagControls();
    try {
      this.observer = new MutationObserver(() => this._tagControls());
      this.observer.observe(this.bodyEl, { childList: true, subtree: true });
    } catch (e) {}
    this.applyRect();`;
if (s.includes(a)) { s = s.replace(a, b); console.log('tagged init'); } else console.log('init not found');
const c = `  setTitle(t) {`;
const d = `  _tagControls() {
    if (!this.bodyEl) return;
    for (const el of this.bodyEl.querySelectorAll('button, input, select, textarea, [contenteditable="true"], [role="button"]')) {
      if (!el.dataset.systemId) el.dataset.systemId = this.sys.id;
      if (!el.dataset.windowId) el.dataset.windowId = this.id;
    }
  }
  setTitle(t) {`;
if (s.includes(c) && !s.includes('_tagControls() {')) { s = s.replace(c, d); console.log('method added'); }
fs.writeFileSync('js/shell.js', s);