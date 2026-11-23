import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:19106', defaultViewport: null });
const pages = await browser.pages();
const page = pages.find(p => p.url().includes('18106')) || pages[0];
page.on('console', msg => console.log('CONSOLE', msg.type(), msg.text()));
page.on('pageerror', err => console.log('PAGEERROR', err.message, err.stack?.slice(0, 500)));
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 2500));
const info = await page.evaluate(() => ({
  title: document.title,
  bench: !!window.bench,
  os: !!window.__os,
  systems: window.__os ? window.__os.systems.size : -1,
  body: document.body.innerText.slice(0, 300),
  boot: !!document.getElementById('boot-screen'),
  html: document.getElementById('os-root')?.children.length
}));
console.log(JSON.stringify(info, null, 2));
const inspect = await page.evaluate(() => window.bench ? window.bench.inspect() : null);
console.log('inspect', JSON.stringify(inspect));
await page.screenshot({ path: 'C:\\Users\\AIAgent\\AppData\\Local\\Temp\\opencode\\nos-2.png' });
await browser.disconnect();