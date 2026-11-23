import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:19106', defaultViewport: null });
const page = (await browser.pages()).find(p => p.url().includes('18106'));
await page.evaluateOnNewDocument(() => {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...args) {
    if (this.__ctx && this.__ctx !== type) {
      console.log('CTX_CONFLICT', type, 'existing', this.__ctx, new Error().stack);
    }
    const r = orig.call(this, type, ...args);
    if (r) this.__ctx = type;
    return r;
  };
});
page.on('console', msg => { if (msg.text().includes('CTX_CONFLICT') || msg.type() === 'error') console.log('CONSOLE', msg.text()); });
page.on('pageerror', err => console.log('PAGEERROR', err.message, err.stack?.slice(0, 800)));
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 900));
await page.evaluate(() => window.bench.reset());
await new Promise(r => setTimeout(r, 400));
const out = await page.evaluate(async () => {
  const os = window.__os;
  const child = os.createChild(os.root);
  await new Promise(r => setTimeout(r, 400));
  const player = await os.openApp(child, 'player');
  await new Promise(r => setTimeout(r, 800));
  os.project(player, os.root);
  await new Promise(r => setTimeout(r, 1000));
  // restore to trigger SceneView rebuild
  const snap = os.snapshotSubtree(child, 'ctx-snap');
  await new Promise(r => setTimeout(r, 300));
  os.restoreSnapshot(os.systems.get(child.id), snap, { fork: false });
  await new Promise(r => setTimeout(r, 1000));
  return { windows: [...os.windows.values()].map(w => [w.id, w.appId, w.systemId]) };
});
console.log(JSON.stringify(out, null, 2));
await browser.disconnect();