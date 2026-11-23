import puppeteer from 'puppeteer-core';
import fs from 'fs';
import { PNG } from 'pngjs';
const TMP = 'C:\\Users\\AIAgent\\AppData\\Local\\Temp\\opencode';
function stats(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  let r=0,g=0,b=0,n=0; const set=new Set();
  for (let i=0;i<png.data.length;i+=16){r+=png.data[i];g+=png.data[i+1];b+=png.data[i+2];n++;set.add(`${png.data[i]>>4},${png.data[i+1]>>4},${png.data[i+2]>>4}`)}
  return {avg:[Math.round(r/n),Math.round(g/n),Math.round(b/n)],colors:set.size};
}
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:19106', defaultViewport: null });
const page = (await browser.pages()).find(p => p.url().includes('18106'));
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 700));
await page.evaluate(() => window.bench.reset());
await new Promise(r => setTimeout(r, 300));
const info = await page.evaluate(async () => {
  const os = window.__os;
  const child = os.createChild(os.root);
  await new Promise(r => setTimeout(r, 300));
  const w = await os.openApp(child, 'player');
  await new Promise(r => setTimeout(r, 800));
  w.app.seek(5);
  await new Promise(r => setTimeout(r, 300));
  const v = w.app.view;
  return {
    children: v.scene.children.map(o => ({ type: o.type, pos: o.position.toArray(), scale: o.scale.toArray(), visible: o.visible, name: o.name, mat: o.material?.type })),
    cam: v.camera.position.toArray(), rot: v.camera.rotation.toArray().slice(0,3),
    heli: v.heli.position.toArray(), bg: v.scene.background?.isTexture
  };
});
console.log(JSON.stringify(info, null, 2));
const canvas = await page.$('[data-window-id] canvas');
// hide sprites and sun
await page.evaluate(async () => {
  const os = window.__os; const w = [...os.windows.values()].find(w => w.appId === 'player'); const v = w.app.view;
  v.scene.traverse(o => { if (o.isSprite) o.visible = false; });
  w.app.render();
});
await new Promise(r => setTimeout(r, 300));
await canvas.screenshot({ path: TMP + '\\nosprites.png' });
// hide terrain
await page.evaluate(async () => {
  const os = window.__os; const w = [...os.windows.values()].find(w => w.appId === 'player'); const v = w.app.view;
  v.terrainMesh.visible = false; w.app.render();
});
await new Promise(r => setTimeout(r, 300));
await canvas.screenshot({ path: TMP + '\\noterrain.png' });
// hide heli
await page.evaluate(async () => {
  const os = window.__os; const w = [...os.windows.values()].find(w => w.appId === 'player'); const v = w.app.view;
  v.heli.visible = false; w.app.render();
});
await new Promise(r => setTimeout(r, 300));
await canvas.screenshot({ path: TMP + '\\noheli.png' });
console.log('nosprites', stats(TMP+'\\nosprites.png'));
console.log('noterrain', stats(TMP+'\\noterrain.png'));
console.log('noheli', stats(TMP+'\\noheli.png'));
await browser.disconnect();