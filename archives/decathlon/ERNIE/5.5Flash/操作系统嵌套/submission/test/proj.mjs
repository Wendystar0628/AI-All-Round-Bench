import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:19106', defaultViewport: null });
const page = (await browser.pages()).find(p => p.url().includes('18106'));
page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE', msg.text()); });
page.on('pageerror', err => console.log('PAGEERROR', err.message, err.stack?.slice(0, 600)));
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 800));
await page.evaluate(() => window.bench.reset());
await new Promise(r => setTimeout(r, 300));
const out = await page.evaluate(async () => {
  const os = window.__os;
  const child = os.createChild(os.root);
  await new Promise(r => setTimeout(r, 400));
  const player = await os.openApp(child, 'player');
  await new Promise(r => setTimeout(r, 600));
  player.app.togglePlay();
  await new Promise(r => setTimeout(r, 2200));
  const t1 = player.app.time;
  os.project(player, os.root);
  await new Promise(r => setTimeout(r, 1200));
  const proj = [...os.windows.values()].find(w => w.appId === 'projection');
  const camBefore = player.app.camera.yaw;
  if (proj) os.forwardProjection(proj, { type: 'orbit', dx: 80, dy: 0 });
  const camAfter = player.app.camera.yaw;
  const projCanvas = proj?.bodyEl.querySelector('canvas');
  // browser
  const br = await os.openApp(os.root, 'browser');
  await new Promise(r => setTimeout(r, 500));
  br.app.navigate('https://search.bilibili.com/all?keyword=' + encodeURIComponent('嵌套操作系统'));
  await new Promise(r => setTimeout(r, 5000));
  const wv = br.bodyEl.querySelector('webview');
  let scroll = null;
  try {
    const before = await wv.executeJavaScript('window.scrollY');
    await wv.executeJavaScript('window.scrollBy(0, 900)');
    await new Promise(r => setTimeout(r, 500));
    const after = await wv.executeJavaScript('window.scrollY');
    scroll = { before, after, title: await wv.executeJavaScript('document.title'), url: await wv.executeJavaScript('location.href') };
  } catch (e) { scroll = { error: e.message }; }
  return {
    playerTime: t1, projection: proj ? { id: proj.id, sys: proj.systemId, hasView: !!proj.app.view, canvas: projCanvas ? [projCanvas.width, projCanvas.height] : null } : null,
    camera: { before: camBefore, after: camAfter },
    browser: scroll, tabs: br.app.inspect(br)
  };
});
console.log(JSON.stringify(out, null, 2));
await page.screenshot({ path: 'C:\\Users\\AIAgent\\AppData\\Local\\Temp\\opencode\\proj.png' });
await browser.disconnect();