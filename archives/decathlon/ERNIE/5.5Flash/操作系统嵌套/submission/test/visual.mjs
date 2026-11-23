import puppeteer from 'puppeteer-core';
import fs from 'fs';
import { PNG } from 'pngjs';
const TMP = 'C:\\Users\\AIAgent\\AppData\\Local\\Temp\\opencode';
function stats(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const { width: w, height: h, data } = png;
  const region = (x0, y0, x1, y1) => {
    let r = 0, g = 0, b = 0, n = 0; const set = new Set();
    for (let y = Math.floor(y0 * h); y < Math.floor(y1 * h); y += 2) for (let x = Math.floor(x0 * w); x < Math.floor(x1 * w); x += 2) {
      const i = (y * w + x) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      set.add(`${data[i] >> 4},${data[i+1] >> 4},${data[i+2] >> 4}`);
    }
    return { avg: [Math.round(r/n), Math.round(g/n), Math.round(b/n)], colors: set.size };
  };
  return { w, h, top: region(0, 0, 1, 0.45), mid: region(0, 0.45, 1, 0.75), bottom: region(0, 0.75, 1, 1), all: region(0, 0, 1, 1) };
}
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:19106', defaultViewport: null });
const page = (await browser.pages()).find(p => p.url().includes('18106'));
page.on('pageerror', err => console.log('PAGEERROR', err.message));
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 800));
await page.evaluate(() => window.bench.reset());
await new Promise(r => setTimeout(r, 300));
const win = await page.evaluate(async () => {
  const os = window.__os;
  const child = os.createChild(os.root);
  await new Promise(r => setTimeout(r, 400));
  const w = await os.openApp(child, 'player');
  await new Promise(r => setTimeout(r, 1000));
  w.app.seek(5);
  await new Promise(r => setTimeout(r, 500));
  return w.id;
});
const w2 = await page.evaluate(id => { const os = window.__os; const w = os.windows.get(id); w.app.seek(12); return true; }, win);
await new Promise(r => setTimeout(r, 500));
const canvas = await page.$(`[data-window-id="${win}"] canvas`);
await canvas.screenshot({ path: TMP + '\\canvas12.png' });
await page.evaluate(id => { window.__os.windows.get(id).app.seek(5); }, win);
await new Promise(r => setTimeout(r, 500));
await canvas.screenshot({ path: TMP + '\\canvas5.png' });
await page.screenshot({ path: TMP + '\\desk.png' });
console.log('canvas5', JSON.stringify(stats(TMP + '\\canvas5.png')));
console.log('canvas12', JSON.stringify(stats(TMP + '\\canvas12.png')));
console.log('desk', JSON.stringify(stats(TMP + '\\desk.png')));
await browser.disconnect();