import puppeteer from 'puppeteer-core';
import fs from 'fs';
import { PNG } from 'pngjs';
const TMP = 'C:\\Users\\AIAgent\\AppData\\Local\\Temp\\opencode';
function stats(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  let n = png.width * png.height, r = 0, g = 0, b = 0, dark = 0;
  const colors = new Set();
  for (let i = 0; i < png.data.length; i += 4) {
    r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2];
    if (png.data[i] + png.data[i + 1] + png.data[i + 2] < 40) dark++;
    if (i % 400 === 0) colors.add(`${png.data[i] >> 4},${png.data[i+1] >> 4},${png.data[i+2] >> 4}`);
  }
  return { w: png.width, h: png.height, avg: [Math.round(r/n), Math.round(g/n), Math.round(b/n)], dark: +(dark/n).toFixed(3), colors: colors.size };
}
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:19106', defaultViewport: null });
const page = (await browser.pages()).find(p => p.url().includes('18106'));
const errs = [];
page.on('console', msg => { if (msg.type() === 'error') { errs.push(msg.text()); } });
page.on('pageerror', err => { errs.push(err.message); console.log('PAGEERROR', err.message, err.stack?.slice(0, 500)); });
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 900));
await page.evaluate(() => window.bench.reset());
await new Promise(r => setTimeout(r, 500));
const out = await page.evaluate(async () => {
  const os = window.__os;
  const child = os.createChild(os.root);
  await new Promise(r => setTimeout(r, 500));
  const win = await os.openApp(child, 'player');
  await new Promise(r => setTimeout(r, 1200));
  const c = win.bodyEl.querySelector('canvas');
  const gl = c ? { w: c.width, h: c.height } : null;
  win.bodyEl.querySelector('[data-testid="player-play"]')?.click();
  await new Promise(r => setTimeout(r, 3500));
  const showState = win.app.sceneState();
  os.project(win, os.root);
  await new Promise(r => setTimeout(r, 1200));
  const proj = [...os.windows.values()].find(w => w.appId === 'projection');
  // rehearsal
  win.app.setMode('rehearsal');
  win.app.startRehearsal();
  await new Promise(r => setTimeout(r, 6000));
  const reh1 = win.app.sim ? { t: win.app.sim.state.t, alive: win.app.sim.state.alive, pos: win.app.sim.state.pos, reason: win.app.sim.state.reason, dist: win.app.sim.state.distance } : null;
  const rehProc = child.processes.find(p => p.name === 'controller');
  const ctrlState = rehProc ? { state: rehProc.state, used: rehProc.usedTotal } : null;
  return {
    gl, show: { time: showState.time, heli: showState.heli, cam: showState.camPos },
    projection: proj ? { id: proj.id, sys: proj.systemId, app: proj.appId, view: !!proj.app.view, canvas: proj.bodyEl.querySelector('canvas')?.width } : null,
    rehearsal: reh1, controller: ctrlState,
    windows: [...os.windows.values()].map(w => [w.id, w.appId, w.systemId])
  };
});
console.log(JSON.stringify(out, null, 2));
await page.screenshot({ path: TMP + '\\media.png' });
console.log('stats media', stats(TMP + '\\media.png'));
console.log('ERRORS', errs.slice(0, 10));
await browser.disconnect();