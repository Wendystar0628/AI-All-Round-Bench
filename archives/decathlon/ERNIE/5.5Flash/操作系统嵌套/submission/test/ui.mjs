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
  const root = os.root;
  const q = sel => document.querySelector(sel);
  const qa = sel => [...document.querySelectorAll(sel)];
  const click = sel => { const e = q(sel); if (e) { e.click(); return true; } return false; };
  const res = {};
  // start menu
  click('[data-testid="start-toggle"]');
  res.startMenu = !!q('[data-testid="start-menu"]');
  res.launchButtons = qa('[data-testid^="launch-"]').map(e => e.dataset.testid);
  click('[data-testid="start-toggle"]');
  // settings
  const stWin = await os.openApp(root, 'settings');
  await new Promise(r => setTimeout(r, 300));
  const rootD = os.desktops.get('outer');
  const wall = stWin.bodyEl.querySelector('[data-testid="settings-wallpaper"][data-value="aurora"]');
  wall?.click();
  stWin.bodyEl.querySelector('[data-testid="settings-accent"][data-value="teal"]')?.click();
  stWin.bodyEl.querySelector('[data-testid="settings-scale"][data-value="1.15"]')?.click();
  await new Promise(r => setTimeout(r, 200));
  res.settings = { wallpaper: root.settings.wallpaper, accent: root.settings.accent, scale: root.settings.scale, cssAccent: getComputedStyle(rootD.el).getPropertyValue('--accent').trim(), zoom: rootD.stage.style.zoom };
  stWin.bodyEl.querySelector('[data-testid="settings-wallpaper"][data-value="dusk"]')?.click();
  stWin.bodyEl.querySelector('[data-testid="settings-accent"][data-value="blue"]')?.click();
  stWin.bodyEl.querySelector('[data-testid="settings-scale"][data-value="1"]')?.click();
  os.closeWindow(stWin);
  // widgets
  os.openApp(root, 'widgets');
  await new Promise(r => setTimeout(r, 300));
  const w = rootD.widgetsEl;
  res.widgetsOpen = !w.classList.contains('hidden');
  const timerInput = w.querySelector('[data-testid="widget-timer-input"]');
  if (timerInput) { timerInput.value = '2'; timerInput.dispatchEvent(new Event('change', { bubbles: true })); }
  w.querySelector('[data-testid="widget-timer-start"]')?.click();
  const note = w.querySelector('[data-testid="widget-note-text"]');
  if (note) { note.value = '测试便笺内容'; note.dispatchEvent(new Event('input', { bubbles: true })); }
  await new Promise(r => setTimeout(r, 2600));
  res.notifications = (root.notifications || []).map(n => [n.title, n.text]);
  res.noteSaved = !!root.fs.get('/Documents/便笺 ' + new Date().toISOString().slice(0, 10) + '.txt');
  // calendar next
  const calBtns = w.querySelectorAll('.cal-head button');
  const monthBefore = w.querySelector('.cal-month')?.textContent;
  calBtns[1]?.click();
  const monthAfter = w.querySelector('.cal-month')?.textContent;
  res.calendar = { monthBefore, monthAfter };
  rootD.toggleWidgets(false);
  // files
  const filesWin = await os.openApp(root, 'files');
  await new Promise(r => setTimeout(r, 300));
  const list = filesWin.bodyEl.querySelector('[data-testid="files-list"]');
  res.files = { items: list ? list.querySelectorAll('[data-testid="files-item"]').length : 0, path: filesWin.bodyEl.querySelector('[data-testid="files-path"]')?.value };
  const recycle = filesWin.bodyEl.querySelector('[data-testid="files-nav"][data-file-path="/Recycle Bin"]');
  recycle?.click();
  await new Promise(r => setTimeout(r, 200));
  res.recycle = { path: filesWin.bodyEl.querySelector('[data-testid="files-path"]')?.value, items: filesWin.bodyEl.querySelectorAll('[data-testid="files-item"]').length };
  filesWin.app.navigate('/Demo');
  await new Promise(r => setTimeout(r, 200));
  res.demoFiles = filesWin.bodyEl.querySelectorAll('[data-testid="files-item"]').length;
  // tasks
  const tasks = await os.openApp(root, 'tasks');
  await new Promise(r => setTimeout(r, 400));
  res.tasks = { rows: tasks.bodyEl.querySelectorAll('.tt-row').length, budget: !!tasks.bodyEl.querySelector('[data-testid="tasks-budget"]'), memory: !!tasks.bodyEl.querySelector('[data-testid="tasks-memory"]') };
  // sysmgr
  const sm = await os.openApp(root, 'sysmgr');
  await new Promise(r => setTimeout(r, 300));
  res.sysmgr = { nodes: sm.bodyEl.querySelectorAll('.sys-node').length, newBtn: !!sm.bodyEl.querySelector('[data-testid="system-new"]'), pauseBtn: !!sm.bodyEl.querySelector('[data-testid="system-pause"]') };
  const child = os.createChild(root);
  await new Promise(r => setTimeout(r, 400));
  res.child = { id: child.id, state: child.state, windows: [...os.windows.values()].filter(w => w.appId === 'system').length };
  // desktop context menu
  const d = os.desktops.get('outer');
  d.el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 600, clientY: 400 }));
  res.ctxMenu = !!d.ctxMenuEl;
  d.closeTopLayer();
  res.ctxClosed = !d.ctxMenuEl;
  res.testids = {
    desktopIcon: qa('[data-testid="desktop-icon"]').length,
    taskbarItems: qa('[data-testid="taskbar-item"]').length,
    startToggle: !!q('[data-testid="start-toggle"]'),
    notifToggle: !!q('[data-testid="notifications-toggle"]'),
    windowControls: qa('[data-testid="window-close"]').length
  };
  return res;
});
console.log(JSON.stringify(out, null, 2));
await page.screenshot({ path: 'C:\\Users\\AIAgent\\AppData\\Local\\Temp\\opencode\\ui.png' });
await browser.disconnect();