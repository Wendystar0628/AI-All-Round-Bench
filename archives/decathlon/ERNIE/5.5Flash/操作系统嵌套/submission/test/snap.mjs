import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:19106', defaultViewport: null });
const page = (await browser.pages()).find(p => p.url().includes('18106'));
page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE', msg.text()); });
page.on('pageerror', err => console.log('PAGEERROR', err.message, err.stack?.slice(0, 600)));
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 900));
await page.evaluate(() => window.bench.reset());
await new Promise(r => setTimeout(r, 400));
const out = await page.evaluate(async () => {
  const os = window.__os;
  const root = os.root;
  const child = os.createChild(root);
  await new Promise(r => setTimeout(r, 400));
  const player = await os.openApp(child, 'player');
  await new Promise(r => setTimeout(r, 800));
  player.app.togglePlay();
  await new Promise(r => setTimeout(r, 2000));
  const t1 = player.app.time;
  const snap = os.snapshotSubtree(child, 'test-snap');
  const snapFile = snap ? '/Snapshots/' + snap.name + '.snap' : null;
  await new Promise(r => setTimeout(r, 800));
  const t2 = player.app.time;
  const target = os.systems.get(child.id);
  os.restoreSnapshot(target, snap, { fork: false });
  await new Promise(r => setTimeout(r, 900));
  const restored = [...os.systems.values()].find(s => s.id === child.id);
  const restoredPlayer = [...os.windows.values()].find(w => w.appId === 'player' && w.systemId === child.id);
  const rt = restoredPlayer?.app?.time;
  // fork
  const snap2 = JSON.parse(root.fs.read(snapFile));
  const target2 = os.systems.get(child.id);
  const fork = os.restoreSnapshot(target2, snap2, { fork: true });
  await new Promise(r => setTimeout(r, 700));
  const forkPlayer = [...os.windows.values()].find(w => w.appId === 'player' && w.systemId === fork?.id);
  const ids = [...os.systems.values()].map(s => s.id);
  // deep nesting
  const g1 = os.createChild(restored || child);
  await new Promise(r => setTimeout(r, 300));
  const g2 = g1 ? os.createChild(g1) : null;
  await new Promise(r => setTimeout(r, 300));
  const g3 = g2 ? os.createChild(g2) : null;
  await new Promise(r => setTimeout(r, 500));
  const deepWin = g3 ? await os.openApp(g3, 'files') : null;
  await new Promise(r => setTimeout(r, 500));
  // pause test
  const before = restored.clock;
  os.pauseSystem(restored);
  await new Promise(r => setTimeout(r, 1000));
  const pausedClock = restored.clock;
  os.resumeSystem(restored);
  await new Promise(r => setTimeout(r, 600));
  const after = restored.clock;
  return {
    snap: snap ? { name: snap.name, bytes: snapFile ? root.fs.get(snapFile)?.size : 0 } : null,
    t1, t2, restoredTime: rt,
    fork: fork ? { id: fork.id, state: fork.state, forkTime: forkPlayer?.app?.time } : null,
    ids,
    deep: g3 ? { id: g3.id, depth: g3.depth, parent: g3.parentId, filesWindow: !!deepWin } : null,
    pause: { before, pausedClock, after, deltaAfter: after - pausedClock },
    windows: [...os.windows.values()].map(w => [w.id, w.appId, w.systemId, w.title]),
    systems: [...os.systems.values()].map(s => [s.id, s.parentId, s.state, s.depth])
  };
});
console.log(JSON.stringify(out, null, 2));
await page.screenshot({ path: 'C:\\Users\\AIAgent\\AppData\\Local\\Temp\\opencode\\snap.png' });
await browser.disconnect();