import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:19106', defaultViewport: null });
const page = (await browser.pages()).find(p => p.url().includes('18106'));
const r = await page.evaluate(() => {
  const c = document.querySelector('[data-testid="tray-clock"]');
  return { text: c?.innerText, html: c?.innerHTML, clock: window.__os.root.clock, epoch: window.__os.root.epochBase, taskbar: !!document.querySelector('.taskbar') };
});
console.log(JSON.stringify(r));
await browser.disconnect();