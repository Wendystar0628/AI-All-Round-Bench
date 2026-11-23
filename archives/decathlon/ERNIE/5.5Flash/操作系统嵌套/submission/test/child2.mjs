import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:19106', defaultViewport: null });
const page = (await browser.pages()).find(p => p.url().includes('18106'));
page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE', msg.type(), msg.text()); });
page.on('pageerror', err => console.log('PAGEERROR', err.message, err.stack?.slice(0, 600)));
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 1000));
await page.evaluate(() => window.bench.reset());
await new Promise(r => setTimeout(r, 500));
const r = await page.evaluate(async () => {
  const os = window.__os;
  const child = os.createChild(os.root);
  await new Promise(r => setTimeout(r, 1200));
  const p = child.processes.find(x => x.type === 'kernel');
  return {
    child: { id: child.id, state: child.state, clock: child.clock, procs: child.processes.map(x => [x.name, x.state, x.usedTotal, x.error]) },
    kernel: p ? { state: p.state, pc: p.pc, error: p.error, out: p.output } : null,
    windows: [...os.windows.values()].map(w => ({ id: w.id, app: w.appId, sys: w.systemId })),
    grant: child.lastGrant,
    err: os.root.errorLog
  };
});
console.log(JSON.stringify(r, null, 2));
await page.screenshot({ path: 'C:\\Users\\AIAgent\\AppData\\Local\\Temp\\opencode\\nos-child2.png' });
await browser.disconnect();