import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:19106', defaultViewport: null });
const page = (await browser.pages()).find(p => p.url().includes('18106'));
page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE', msg.type(), msg.text()); });
page.on('pageerror', err => console.log('PAGEERROR', err.message, err.stack?.slice(0, 800)));
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 1000));
const r = await page.evaluate(async () => {
  const os = window.__os;
  const child = os.createChild(os.root);
  await new Promise(r => setTimeout(r, 600));
  const win = await os.openApp(child, 'player');
  await new Promise(r => setTimeout(r, 1500));
  const canvas = win.bodyEl.querySelector('canvas');
  const gl = !!document.createElement('canvas').getContext('webgl2');
  const before = win.app.sceneState();
  const playBtn = win.bodyEl.querySelector('[data-testid="player-play"]');
  playBtn?.click();
  await new Promise(r => setTimeout(r, 3000));
  const after = win.app.sceneState();
  return {
    gl,
    canvas: canvas ? { w: canvas.width, h: canvas.height, cw: canvas.clientWidth, ch: canvas.clientHeight } : null,
    before: { t: before.time, heli: before.heli, dur: before.duration },
    after: { t: after.time, heli: after.heli },
    inspect: window.bench.inspect().players,
    view: !!win.app.view,
    sceneName: win.app.sceneDef?.name,
    errors: win.app.view?.error || null
  };
});
console.log(JSON.stringify(r, null, 2));
await page.screenshot({ path: 'C:\\Users\\AIAgent\\AppData\\Local\\Temp\\opencode\\nos-player.png' });
await browser.disconnect();