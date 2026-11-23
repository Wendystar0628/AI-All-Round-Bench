import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:19106', defaultViewport: null });
const page = (await browser.pages()).find(p => p.url().includes('18106'));
page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE', msg.text()); });
page.on('pageerror', err => console.log('PAGEERROR', err.message, err.stack?.slice(0,600)));
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 800));
await page.evaluate(() => window.bench.reset());
await new Promise(r => setTimeout(r, 300));
await page.evaluate(async () => {
  const os = window.__os;
  os.openFile(os.root, '/Demo/sample.sheet');
  await new Promise(r => setTimeout(r, 500));
  const sheet = [...os.windows.values()].find(w => w.appId === 'spreadsheet').app;
  const child = os.createChild(os.root);
  await new Promise(r => setTimeout(r, 300));
  const cw = await os.openApp(child, 'charts');
  await new Promise(r => setTimeout(r, 300));
  cw.app.chart.sourceDocId = sheet.doc.id; cw.app.refreshSourceList(); cw.app.connect();
  await new Promise(r => setTimeout(r, 500));
  await os.saveState();
});
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 2000));
const out = await page.evaluate(() => {
  const os = window.__os;
  const cw = [...os.windows.values()].find(w => w.appId === 'charts');
  return {
    systems: [...os.systems.values()].map(s => [s.id, s.parentId]),
    workbooks: [...os.rootWorkbooks.keys()],
    charts: cw ? { conn: cw.app.chart.connection, data: cw.app.chart.data, ver: cw.app.chart.version } : null,
    inspect: window.bench.inspect()
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.disconnect();