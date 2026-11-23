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
  const child = os.createChild(os.root);
  await new Promise(r => setTimeout(r, 400));
  const rootFiles = await os.openApp(os.root, 'files');
  const childFiles = await os.openApp(child, 'files');
  await new Promise(r => setTimeout(r, 300));
  childFiles.app.navigate('/Documents');
  const list = childFiles.bodyEl.querySelector('[data-testid="files-list"]');
  const dt = new DataTransfer();
  dt.setData('application/x-nos-file', JSON.stringify({ systemId: 'outer', path: '/Demo/helicopter-24.scene' }));
  list.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
  await new Promise(r => setTimeout(r, 400));
  const copied = child.fs.exists('/Documents/helicopter-24.scene');
  // open workbook via file manager
  rootFiles.app.navigate('/Demo');
  await new Promise(r => setTimeout(r, 200));
  const rows = [...rootFiles.bodyEl.querySelectorAll('[data-testid="files-item"]')];
  const sheetRow = rows.find(r => r.dataset.filePath.endsWith('.sheet'));
  sheetRow?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await new Promise(r => setTimeout(r, 600));
  const sw = [...os.windows.values()].find(w => w.appId === 'spreadsheet');
  const sheet = sw?.app;
  // modify and save
  if (sheet) { sheet.doc.data.cells.B2 = 30; sheet.markDirty(); sheet.recalc(); sheet.save(); }
  const saved = child.fs.exists('/Documents/helicopter-24.scene');
  // reopen workbook from disk in new window
  os.openFile(os.root, '/Demo/sample.sheet');
  await new Promise(r => setTimeout(r, 500));
  const sw2 = [...os.windows.values()].filter(w => w.appId === 'spreadsheet').pop();
  return {
    copied, saved,
    sheet: sheet ? { b2: sheet.values.B2, d2: sheet.values.D2, e1: sheet.values.E1, dirty: sheet.dirty, path: sheet.doc.path } : null,
    reopened: sw2?.app ? { b2: sw2.app.values.B2, d2: sw2.app.values.D2 } : null,
    windows: [...os.windows.values()].map(w => [w.id, w.appId, w.systemId])
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.disconnect();