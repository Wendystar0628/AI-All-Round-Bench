import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:19106', defaultViewport: null });
const page = (await browser.pages()).find(p => p.url().includes('18106'));
page.on('pageerror', err => console.log('PAGEERROR', err.message));
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 700));
await page.evaluate(() => window.bench.reset());
await new Promise(r => setTimeout(r, 300));
const out = await page.evaluate(async () => {
  const os = window.__os;
  os.openApp(os.root, 'widgets');
  await new Promise(r => setTimeout(r, 400));
  const w = os.desktops.get('outer').widgetsEl;
  const r = {};
  r.clock = w.querySelector('.widget-clock')?.textContent;
  r.timerInput = !!w.querySelector('[data-testid="widget-timer-input"]');
  r.stopwatch = !!w.querySelector('[data-testid="widget-stopwatch-start"]');
  r.qs = !!w.querySelector('[data-testid="qs-wifi"]');
  // start stopwatch
  w.querySelector('[data-testid="widget-stopwatch-start"]')?.click();
  await new Promise(r => setTimeout(r, 1200));
  r.swDisplay = w.querySelector('.sw-display')?.textContent;
  // timer 2s
  const ti = w.querySelector('[data-testid="widget-timer-input"]'); ti.value='2'; ti.dispatchEvent(new Event('change',{bubbles:true}));
  w.querySelector('[data-testid="widget-timer-start"]')?.click();
  await new Promise(r => setTimeout(r, 2600));
  r.notif = (os.root.notifications||[]).map(n=>n.title);
  r.qsVolume = !!w.querySelector('[data-testid="qs-volume"]');
  // note save
  const n = w.querySelector('[data-testid="widget-note-text"]'); n.value='便笺X'; n.dispatchEvent(new Event('input',{bubbles:true}));
  w.querySelector('[data-testid="widget-note-save"]')?.click();
  r.note = (os.root.fs.list('/Documents')||[]).some(f=>f.path.includes('便笺'));
  return r;
});
console.log(JSON.stringify(out, null, 2));
await browser.disconnect();