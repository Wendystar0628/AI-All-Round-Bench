import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:19106', defaultViewport: null });
const page = (await browser.pages()).find(p => p.url().includes('18106'));
page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE', msg.text()); });
page.on('pageerror', err => console.log('PAGEERROR', err.message, err.stack?.slice(0, 500)));
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
  player.app.setMode('rehearsal');
  player.app.startRehearsal();
  await new Promise(r => setTimeout(r, 16000));
  const normal = player.app.sim ? { t: +player.app.sim.state.t.toFixed(2), alive: player.app.sim.state.alive, dist: +player.app.sim.state.distance.toFixed(1), onGround: player.app.sim.state.onGround, pos: player.app.sim.state.pos, reason: player.app.sim.state.reason, rotor: player.app.sim.state.rotor } : null;
  // low budget run
  os.setGrant(child, 0.03);
  os.root.budget = 6000;
  player.app.resetRehearsal();
  player.app.startRehearsal();
  await new Promise(r => setTimeout(r, 9000));
  const low = player.app.sim ? { t: +player.app.sim.state.t.toFixed(2), alive: player.app.sim.state.alive, dist: +player.app.sim.state.distance.toFixed(1), reason: player.app.sim.state.reason, rotor: +player.app.sim.state.rotor.toFixed(2) } : null;
  // save record
  player.app.saveRecord();
  const recs = (child.fs.list('/Documents') || []).filter(f => f.path.endsWith('.record'));
  return { normal, low, recs: recs.map(f => [f.path, f.size]), grant: child.grantRatio, budget: os.root.budget };
});
console.log(JSON.stringify(out, null, 2));
await page.screenshot({ path: 'C:\\Users\\AIAgent\\AppData\\Local\\Temp\\opencode\\reh.png' });
await browser.disconnect();