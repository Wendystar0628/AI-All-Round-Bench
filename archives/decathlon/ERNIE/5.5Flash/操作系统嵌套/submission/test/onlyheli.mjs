import puppeteer from 'puppeteer-core';
import fs from 'fs';
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
await canvas.screenshot({ path: TMP + '\\onlyheli2.png' });
console.log('done', id);
await browser.disconnect();