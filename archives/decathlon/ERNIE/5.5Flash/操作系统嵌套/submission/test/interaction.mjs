import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:19106', defaultViewport: null });
const page = (await browser.pages()).find(p => p.url().includes('18106'));
page.on('pageerror', err => console.log('PAGEERROR', err.message));
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 800));
await page.evaluate(() => window.bench.reset());
await new Promise(r => setTimeout(r, 300));
await page.evaluate(async () => {
  const os = window.__os;
  os.root.settings.scale = 1.15; os.applySettings(os.root);
  await os.openApp(os.root, 'files');
  await new Promise(r => setTimeout(r, 400));
});
const info = await page.evaluate(() => {
  const os = window.__os; const w = [...os.windows.values()].find(w => w.appId === 'files');
  const r = w.el.getBoundingClientRect();
  const tb = w.el.querySelector('.titlebar').getBoundingClientRect();
  return { id: w.id, x: w.x, y: w.y, w: w.w, h: w.h, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, tb: { x: tb.x, y: tb.y, w: tb.width, h: tb.height }, zoom: os.desktops.get('outer').zoom };
});
await page.mouse.move(info.tb.x + 200, info.tb.y + 15);
await page.mouse.down();
await page.mouse.move(info.tb.x + 300, info.tb.y + 75, { steps: 8 });
await page.mouse.up();
await new Promise(r => setTimeout(r, 300));
const moved = await page.evaluate(id => { const w = window.__os.windows.get(id); return { x: w.x, y: w.y, zoom: w.desktop.zoom }; }, info.id);
// resize via SE handle
const se = await page.evaluate(id => { const w = window.__os.windows.get(id); const h = w.el.querySelector('.rh-se').getBoundingClientRect(); return { x: h.x + h.width/2, y: h.y + h.height/2 }; }, info.id);
await page.mouse.move(se.x, se.y);
await page.mouse.down();
await page.mouse.move(se.x + 80, se.y + 50, { steps: 8 });
await page.mouse.up();
await new Promise(r => setTimeout(r, 300));
const resized = await page.evaluate(id => { const w = window.__os.windows.get(id); return { x: w.x, y: w.y, w: w.w, h: w.h }; }, info.id);
// minimize and restore via taskbar
await page.evaluate(id => { const w = window.__os.windows.get(id); window.__os.closeWindow; w.minimize(); }, info.id);
const min = await page.evaluate(id => { const w = window.__os.windows.get(id); return w.minimized; }, info.id);
await page.evaluate(id => { const w = window.__os.windows.get(id); const btn = [...w.desktop.el.querySelectorAll('[data-testid="taskbar-item"]')].find(b => b.dataset.windowId === id); btn?.click(); }, info.id);
await new Promise(r => setTimeout(r, 300));
const restored = await page.evaluate(id => { const w = window.__os.windows.get(id); return { minimized: w.minimized, vis: getComputedStyle(w.el).display }; }, info.id);
console.log(JSON.stringify({ info, moved, resized, min, restored }, null, 2));
await page.screenshot({ path: 'C:\\Users\\AIAgent\\AppData\\Local\\Temp\\opencode\\interact.png' });
await browser.disconnect();