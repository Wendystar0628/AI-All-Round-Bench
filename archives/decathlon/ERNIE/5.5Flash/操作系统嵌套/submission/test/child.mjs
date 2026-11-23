import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:19106', defaultViewport: null });
const pages = await browser.pages();
const page = pages.find(p => p.url().includes('18106')) || pages[0];
page.on('console', msg => { if (msg.type() !== 'warning') console.log('CONSOLE', msg.type(), msg.text()); });
page.on('pageerror', err => console.log('PAGEERROR', err.message, err.stack?.slice(0, 800)));
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 1200));
const r1 = await page.evaluate(async () => {
  const os = window.__os;
  const child = os.createChild(os.root);
  await new Promise(r => setTimeout(r, 600));
  return {
    child: child ? { id: child.id, state: child.state, depth: child.depth, procs: child.processes.map(p => [p.name, p.state, p.usedTotal]) } : null,
    windows: [...os.windows.values()].map(w => ({ id: w.id, app: w.appId, sys: w.systemId, title: w.title, x: w.x, y: w.y, w: w.w, h: w.h })),
    systems: [...os.systems.values()].map(s => ({ id: s.id, parent: s.parentId, state: s.state, clock: s.clock, budget: s.budget, lastGrant: s.lastGrant })),
    inspect: window.bench.inspect()
  };
});
console.log(JSON.stringify(r1, null, 2));
await page.screenshot({ path: 'C:\\Users\\AIAgent\\AppData\\Local\\Temp\\opencode\\nos-child.png' });
await browser.disconnect();