import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:19106', defaultViewport: null });
const page = (await browser.pages()).find(p => p.url().includes('18106'));
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 700));
await page.evaluate(() => window.bench.reset());
await new Promise(r => setTimeout(r, 300));
const out = await page.evaluate(async () => {
  const os = window.__os;
  const br = await os.openApp(os.root, 'browser');
  await new Promise(r => setTimeout(r, 500));
  const b = br.app;
  const html = 'data:text/html,<a id=x target=_blank href="https://example.com">open</a>';
  b.newTab(html);
  await new Promise(r => setTimeout(r, 1200));
  const t = b.tabs[b.tabs.length - 1];
  const before = b.tabs.length;
  try { await t.wv.executeJavaScript('document.getElementById("x").click()'); } catch (e) { return { error: e.message, before, tabs: b.tabs.length }; }
  await new Promise(r => setTimeout(r, 1500));
  return { before, after: b.tabs.length, tabs: b.tabs.map(x => [x.id, x.url, x.loadState]) };
});
console.log(JSON.stringify(out, null, 2));
await browser.disconnect();