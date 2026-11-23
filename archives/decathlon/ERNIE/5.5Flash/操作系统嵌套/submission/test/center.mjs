import puppeteer from 'puppeteer-core';
import fs from 'fs';
import { PNG } from 'pngjs';
const TMP='C:\\Users\\AIAgent\\AppData\\Local\\Temp\\opencode';
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:19106', defaultViewport: null });
const page = (await browser.pages()).find(p => p.url().includes('18106'));
const id = await page.evaluate(async () => {
  const os = window.__os; const w = [...os.windows.values()].find(w => w.appId === 'player');
  if (!w) return null;
  const v = w.app.view; v.terrainMesh.visible = false;
  v.scene.traverse(o => { if (o.isInstancedMesh || o.isPoints || o.isSprite) o.visible = false; });
  w.app.render();
  return w.id;
});
const canvas = await page.$(`[data-window-id="${id}"] canvas`);
const box = await canvas.boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await page.screenshot({ path: TMP + '\\center.png', clip: { x: cx - 60, y: cy - 60, width: 120, height: 120 } });
const png = PNG.sync.read(fs.readFileSync(TMP + '\\center.png'));
for (let y = 0; y < png.height; y += 8) {
  let line = '';
  for (let x = 0; x < png.width; x += 6) {
    const i = (y * png.width + x) * 4;
    line += `${png.data[i].toString(16).padStart(2,'0')}${png.data[i+1].toString(16).padStart(2,'0')}${png.data[i+2].toString(16).padStart(2,'0')} `;
  }
  console.log(line);
}
console.log('box', box, 'center', cx, cy);
await browser.disconnect();