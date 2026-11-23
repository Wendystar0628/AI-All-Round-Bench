import puppeteer from 'puppeteer-core';
import fs from 'fs';
import { PNG } from 'pngjs';
const TMP='C:\\Users\\AIAgent\\AppData\\Local\\Temp\\opencode';
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:19106', defaultViewport: null });
const page = (await browser.pages()).find(p => p.url().includes('18106'));
page.on('pageerror', err => console.log('PAGEERROR', err.message));
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 700));
await page.evaluate(() => window.bench.reset());
await new Promise(r => setTimeout(r, 300));
const out = await page.evaluate(async () => {
  const os = window.__os;
  os.openFile(os.root, '/Demo/sample.sheet');
  await new Promise(r => setTimeout(r, 500));
  const sheet = [...os.windows.values()].find(w => w.appId === 'spreadsheet').app;
  const child = os.createChild(os.root);
  await new Promise(r => setTimeout(r, 400));
  const cw = await os.openApp(child, 'charts');
  await new Promise(r => setTimeout(r, 300));
  const chart = cw.app;
  chart.chart.sourceDocId = sheet.doc.id;
  chart.refreshSourceList();
  chart.connect();
  await new Promise(r => setTimeout(r, 400));
  const before = { type: chart.chart.type, vals: chart.chart.data.series[0].values.slice(), conn: chart.chart.connection };
  os.project(cw, os.root);
  await new Promise(r => setTimeout(r, 700));
  const proj = [...os.windows.values()].find(w => w.appId === 'projection');
  // change type via projection
  proj.app.act({ type: 'chart-type' });
  await new Promise(r => setTimeout(r, 300));
  const afterType = chart.chart.type;
  // change data
  sheet.doc.data.cells.B2 = 40; sheet.markDirty(); sheet.recalc();
  await new Promise(r => setTimeout(r, 800));
  const after = { vals: chart.chart.data.series[0].values.slice(), version: chart.chart.version };
  // close source workbook
  os.unregisterWorkbook(sheet.doc.id);
  chart.onSourceClosed();
  return { before, afterType, after, conn: chart.chart.connection, proj: { id: proj.id, sys: proj.systemId, src: proj.state.sourceWindowId } };
});
console.log(JSON.stringify(out, null, 2));
const projCanvas = await page.$('[data-app-id="projection"] canvas');
if (projCanvas) {
  await projCanvas.screenshot({ path: TMP + '\\chartproj.png' });
  const png = PNG.sync.read(fs.readFileSync(TMP + '\\chartproj.png'));
  let n=0,r=0,g=0,b=0; const set=new Set();
  for(let i=0;i<png.data.length;i+=16){r+=png.data[i];g+=png.data[i+1];b+=png.data[i+2];n++;set.add(`${png.data[i]>>4},${png.data[i+1]>>4},${png.data[i+2]>>4}`)}
  console.log('proj stats', { avg:[Math.round(r/n),Math.round(g/n),Math.round(b/n)], colors:set.size, w:png.width,h:png.height });
}
await browser.disconnect();