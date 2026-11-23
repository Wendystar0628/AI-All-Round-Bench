import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:19106', defaultViewport: null });
const page = (await browser.pages()).find(p => p.url().includes('18106'));
const r = await page.evaluate(async () => {
  const os = window.__os;
  os.openApp(os.root, 'widgets');
  await new Promise(r => setTimeout(r, 300));
  const w = os.desktops.get('outer').widgetsEl;
  const n = w.querySelector('[data-testid="widget-note-text"]');
  n.value = '保存测试';
  n.dispatchEvent(new Event('input', { bubbles: true }));
  w.querySelector('[data-testid="widget-note-save"]')?.click();
  await new Promise(r => setTimeout(r, 300));
  return { files: (os.root.fs.list('/Documents') || []).map(f => f.path), note: os.root.widgets.note };
});
console.log(JSON.stringify(r, null, 2));
await browser.disconnect();