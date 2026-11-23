import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:19106', defaultViewport: null });
const page = (await browser.pages()).find(p => p.url().includes('18106'));
const errs = [];
page.on('console', msg => { if (msg.type() === 'error') { errs.push(msg.text()); console.log('CONSOLE', msg.text()); } });
page.on('pageerror', err => { errs.push(err.message); console.log('PAGEERROR', err.message, err.stack?.slice(0, 500)); });
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 900));
await page.evaluate(() => window.bench.reset());
await new Promise(r => setTimeout(r, 500));
const out = await page.evaluate(async () => {
  const os = window.__os;
  const root = os.root;
  const child = os.createChild(root);
  await new Promise(r => setTimeout(r, 500));
  // spreadsheet
  os.openFile(root, '/Demo/sample.sheet');
  await new Promise(r => setTimeout(r, 500));
  const sheetWin = [...os.windows.values()].find(w => w.appId === 'spreadsheet');
  const sheet = sheetWin?.app;
  const d2 = sheet?.values?.D2, d3 = sheet?.values?.D3, d4 = sheet?.values?.D4;
  // set E1 = SUM(D2:D4)
  if (sheet) {
    sheet.sel = { a: { c: 4, r: 0 }, f: { c: 4, r: 0 } };
    sheet.anchor = { c: 4, r: 0 };
    sheet.setActiveRaw('=SUM(D2:D4)');
    sheet.updateSelectionUI();
  }
  const e1 = sheet?.values?.E1;
  const version1 = sheet?.doc?.version;
  // charts on child
  const chartWin = await os.openApp(child, 'charts');
  await new Promise(r => setTimeout(r, 400));
  const chart = chartWin?.app;
  if (chart) {
    chart.chart.sourceDocId = sheet?.doc?.id || '';
    chart.refreshSourceList();
    chart.connect();
  }
  const chartInfo = chart ? { labels: chart.chart.data.labels, series: chart.chart.data.series, conn: chart.chart.connection, version: chart.chart.version } : null;
  // project to root
  os.project(chartWin, root);
  await new Promise(r => setTimeout(r, 800));
  const proj = [...os.windows.values()].find(w => w.appId === 'projection');
  // modify root sheet B2 -> 30
  if (sheet) { sheet.doc.data.cells.B2 = 30; sheet.markDirty(); sheet.recalc(); }
  await new Promise(r => setTimeout(r, 900));
  const chartInfo2 = chart ? { labels: chart.chart.data.labels, series: chart.chart.data.series, version: chart.chart.version, conn: chart.chart.connection } : null;
  // browser
  const br = await os.openApp(root, 'browser');
  await new Promise(r => setTimeout(r, 600));
  if (br?.app) { br.app.navigate('bilibili'); await new Promise(r => setTimeout(r, 4000)); }
  const brInfo = br?.app?.inspect ? br.app.inspect(br) : null;
  return {
    child: child.id,
    sheet: { d2, d3, d4, e1, version1, title: sheet?.doc?.title, formula: sheet?.doc?.data?.cells?.E1 },
    chartInfo, chartInfo2,
    projection: proj ? { id: proj.id, sys: proj.systemId, src: proj.state } : null,
    browser: brInfo,
    windows: [...os.windows.values()].map(w => ({ id: w.id, app: w.appId, sys: w.systemId, title: w.title })),
    inspect: window.bench.inspect()
  };
});
console.log(JSON.stringify(out, null, 2));
console.log('ERRORS', errs);
await page.screenshot({ path: 'C:\\Users\\AIAgent\\AppData\\Local\\Temp\\opencode\\nos-apps.png', fullPage: false });
await browser.disconnect();