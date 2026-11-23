import puppeteer from 'puppeteer-core';
import fs from 'fs';
import { PNG } from 'pngjs';
const TMP = 'C:\\Users\\AIAgent\\AppData\\Local\\Temp\\opencode';
function avg(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  let r=0,g=0,b=0,n=0; for(let i=0;i<png.data.length;i+=16){r+=png.data[i];g+=png.data[i+1];b+=png.data[i+2];n++}
  return [Math.round(r/n),Math.round(g/n),Math.round(b/n)];
}
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:19106', defaultViewport: null });
const page = (await browser.pages()).find(p => p.url().includes('18106'));
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 700));
await page.evaluate(() => window.bench.reset());
await new Promise(r => setTimeout(r, 300));
const id = await page.evaluate(async () => {
  const os = window.__os; const c = os.createChild(os.root); await new Promise(r => setTimeout(r, 300));
  const w = await os.openApp(c, 'player'); await new Promise(r => setTimeout(r, 800)); w.app.seek(5); return w.id;
});
const canvas = await page.$(`[data-window-id="${id}"] canvas`);
async function shot(name) { await new Promise(r => setTimeout(r, 250)); await canvas.screenshot({ path: TMP + '\\' + name + '.png' }); console.log(name, avg(TMP + '\\' + name + '.png')); }
await shot('all');
await page.evaluate(id => { const w = window.__os.windows.get(id); w.app.view.terrainMesh.visible = false; w.app.render(); }, id);
await shot('no-terrain');
await page.evaluate(id => { const w = window.__os.windows.get(id); w.app.view.scene.traverse(o => { if (o.isInstancedMesh) o.visible = false; }); w.app.render(); }, id);
await shot('no-grass');
await page.evaluate(id => { const w = window.__os.windows.get(id); w.app.view.scene.traverse(o => { if (o.isPoints || o.isSprite) o.visible = false; }); w.app.render(); }, id);
await shot('no-points');
await page.evaluate(id => { const w = window.__os.windows.get(id); w.app.view.scene.traverse(o => { if (o.isMesh && !o.userData.part) o.visible = false; }); w.app.render(); }, id);
await shot('only-heli');
await page.evaluate(id => { const w = window.__os.windows.get(id); w.app.view.heli.visible = false; w.app.render(); }, id);
await shot('nothing');
await browser.disconnect();