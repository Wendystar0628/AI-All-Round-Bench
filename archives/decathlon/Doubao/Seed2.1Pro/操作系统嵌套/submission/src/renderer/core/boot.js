/* 启动与主循环 */
'use strict';
window.NOS = window.NOS || {};

(async function boot() {
  await waitFixtures();
  const fs = require('fs');
  const path = require('path');

  const dataDir = await window.NOS_HOST.dataDir();
  NOS.dataDir = dataDir;
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {}

  NOS.blobStore = new NOS.BlobStore(dataDir, fs, path);

  // 根虚拟机
  const root = new NOS.RootVM();
  root.init(NOS.blobStore);
  NOS.rootVM = root;

  // 根 VFS（新建或从数据目录恢复）
  const vfsPath = path.join(dataDir, 'root-vfs.json');
  if (fs.existsSync(vfsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(vfsPath, 'utf8'));
      root.vfs = NOS.VFS.deserialize(data, NOS.blobStore);
    } catch (e) { root.vfs = null; }
  }
  if (!root.vfs) {
    root.vfs = new NOS.VFS(NOS.blobStore, 256 * 1024 * 1024);
    root.vfs.mkdir('/.trash');
    await NOS.seedRootFS(root.vfs);
    NOS._firstBoot = true;
  }

  // 根桌面
  const rootEl = document.getElementById('nos-root');
  NOS.desktop = new NOS.RootDesktop(rootEl);
  NOS.desktop.mount();

  // 根应用
  NOS.rootApps = {
    files: new NOS.RootFiles(),
    sheet: new NOS.SheetApp(),
    editor: new NOS.RootEditor(),
    tasks: new NOS.RootTasks(),
    settings: new NOS.Settings(),
    widgets: new NOS.Widgets(),
    browser: new NOS.Browser(),
    help: new NOS.Help(),
    sysmgr: new NOS.RootSysMgr()
  };

  // 设置
  try {
    const sp = path.join(dataDir, 'settings.json');
    if (fs.existsSync(sp)) Object.assign(NOS.desktop.settings, JSON.parse(fs.readFileSync(sp, 'utf8')));
    NOS.desktop.applySettings();
  } catch (e) {}
  NOS.persist = () => {
    try {
      fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify(NOS.desktop.settings));
    } catch (e) {}
  };

  // 注册示例工作簿为数据源
  try {
    const sheet = NOS.SheetModel.deserialize(JSON.parse(root.vfs.read('/Demo/sample.sheet')));
    sheet.filename = 'sample.sheet';
    root.registerWorkbook('sample.sheet', sheet);
    NOS.sampleSheetModel = sheet;
  } catch (e) {}

  // 3D 设备
  NOS.device3D = new NOS.Device3D(document.getElementById('nos-gl-layer'));

  // 主循环（逻辑 tick + 渲染）
  let last = performance.now();
  let renderAcc = 0;
  function frame(now) {
    const dt = Math.min(66, now - last);
    last = now;
    root.tick(dt);
    renderAcc += dt;
    if (renderAcc >= 33) {
      renderAcc = 0;
      render3D();
      // 远程桌面定时重绘已在各自 setInterval；这里驱动投送
      updateProjections();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 周期性持久化 VFS
  setInterval(() => {
    try { fs.writeFileSync(vfsPath, JSON.stringify(root.vfs.serialize())); } catch (e) {}
  }, 8000);
  window.addEventListener('beforeunload', () => {
    try { fs.writeFileSync(vfsPath, JSON.stringify(root.vfs.serialize())); } catch (e) {}
  });

  // bench 接口
  NOS.benchReady(NOS);

  // 首次启动自动打开一个子系统，便于看到嵌套效果（不自动播放演示）
  // 按题面：默认只显示根桌面，不自动创建。
  NOS._booted = true;
  if (NOS.onReady) NOS.onReady();
})();

function waitFixtures() {
  return new Promise(resolve => {
    const check = () => {
      if (NOS.fixtures && NOS.fixtures.wallpapers) resolve();
      else setTimeout(check, 50);
    };
    setTimeout(check, 30);
  });
}

/* 计算所有 3D 视图的屏幕可见矩形（考虑窗口遮挡），交给设备 scissor 绘制 */
function render3D() {
  const rects = {};
  const surfaces = []; // 不透明表面（窗口内容区、webview），用于遮挡裁剪
  const dpr = Math.min(window.devicePixelRatio, 2);

  // 1) 子系统播放器视图（远程桌面内）
  for (const [key, view] of NOS.remoteRegistry.playerViews) {
    const el = view.container;
    if (!el || !document.body.contains(el)) continue;
    const inst = view.inst;
    // 祖先链暂停则不更新状态
    const r = visibleRect(el, inst);
    if (!r) continue;
    surfaces.push({ rect: r, key });
  }
  // 2) 投送窗口内的视图
  for (const p of NOS.rootVM.projections) {
    const slot = p._slot;
    if (!slot || !document.body.contains(slot)) continue;
    const view = p._view;
    if (!view) continue;
    const inst = NOS.rootVM.findInstance(p.sourceInstanceId);
    const r = visibleRect(slot, inst);
    if (r) surfaces.push({ rect: r, key: view.key3d || (view.sceneKey + ':' + view.key), view });
  }

  // 设备需要 view 对象；按 key 找
  for (const s of surfaces) {
    const r = s.rect;
    const key = s.view ? (s.view.sceneKey + ':' + s.view.key) : deviceKeyFor(s.key);
    // 直接用 view.sceneKey 作为 addView key（每场景），多个视图使用独立 key
  }
  // 简化：设备按 view 实例 key（sceneKey + view.key）
  const allViews = [];
  for (const [k, v] of NOS.remoteRegistry.playerViews) allViews.push(v);
  const rectMap = {};
  for (const v of allViews) {
    if (!v.container || !document.body.contains(v.container)) continue;
    if (isAncestorPaused(v.inst)) continue;
    const r = computeVisibleRect(v.container);
    if (r) rectMap[v.key3d || (v.sceneKey + ':' + v.key)] = { ...r, w: Math.round(r.w * dpr), h: Math.round(r.h * dpr), x: Math.round(r.x * dpr), y: Math.round(r.y * dpr) };
  }
  for (const p of NOS.rootVM.projections) {
    const v = p._view;
    if (!v || !p._slot || !document.body.contains(p._slot)) continue;
    const inst = NOS.rootVM.findInstance(p.sourceInstanceId);
    if (isAncestorPaused(inst)) continue;
    const r = computeVisibleRect(p._slot);
    if (r) rectMap[v.key3d || (v.sceneKey + ':' + v.key)] = { ...r, w: Math.round(r.w * dpr), h: Math.round(r.h * dpr), x: Math.round(r.x * dpr), y: Math.round(r.y * dpr) };
  }
  // 注册到设备
  for (const [k, v] of NOS.remoteRegistry.playerViews) {
    if (v.sceneKey) {
      if (!NOS.device3D.views.has(v.sceneKey + ':' + v.key)) NOS.device3D.addView(v.sceneKey + ':' + v.key, v);
      v._rect = rectMap[v.sceneKey + ':' + v.key];
    }
  }
  NOS.device3D.render(rectMap);
}

function deviceKeyFor(k) { return k; }
function visibleRect(el, inst) { return computeVisibleRect(el); }
function isAncestorPaused(inst) {
  let p = inst;
  while (p) { if (p.state === 'paused' || p.state === 'stopped' || p.state === 'closed') return true; p = p.parent; }
  return false;
}

/* 元素在主窗口中的可见矩形；被上层不透明元素遮挡的部分通过简单矩形裁剪处理。
   为稳健起见，3D 视图只在其所在窗口为最前且未被覆盖时绘制完整矩形；
   覆盖时按覆盖矩形扣减（矩形差集近似为最大可见矩形）。 */
function computeVisibleRect(el) {
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return null;
  // 沿祖先检查 display/visibility/opacity
  let node = el;
  while (node && node !== document.body) {
    const cs = getComputedStyle(node);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null;
    node = node.parentElement;
  }
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/* ---------- 投送窗口 ---------- */
function updateProjections() {
  for (const p of NOS.rootVM.projections) {
    if (!p._win) createProjectionWindow(p);
    syncProjection(p);
  }
}
function createProjectionWindow(p) {
  const inst = NOS.rootVM.findInstance(p.sourceInstanceId);
  const win = NOS.desktop.openWindow('projection', `投送 · ${p.appId}（来自 ${p.sourceInstanceId}）`, {
    w: 800, h: 540, projection: p, forceNew: true
  });
  p._win = win;
  p._slot = win.contentEl;
  win.contentEl.classList.add('projection-slot');
  win.contentEl.dataset.systemId = 'outer';
  const badge = NOS.h('div', { class: 'proj-badge' }, `${p.sourceInstanceId} · ${p.appId}`);
  win.contentEl.appendChild(badge);
  if (p.appId === 'player') {
    const view = NOS.remoteRegistry.ensurePlayerView(inst, p.sourcePid, win.contentEl, inst._projectedScene || '/Demo/helicopter-24.scene');
    p._view = view;
    view.isProjection = true;
  } else if (p.appId === 'charts') {
    const cv = document.createElement('canvas');
    cv.width = 720; cv.height = 440;
    cv.style.cssText = 'position:absolute;inset:24px 8px 8px;';
    win.contentEl.appendChild(cv);
    p._chartCanvas = cv;
  }
}
function syncProjection(p) {
  const inst = NOS.rootVM.findInstance(p.sourceInstanceId);
  if (!inst || inst.state === 'closed') return;
  const paused = isAncestorPaused(inst);
  p._win.contentEl.classList.toggle('paused', paused);
  if (p.appId === 'player') {
    const st = inst.scenes && inst.scenes[p.sourcePid] && inst.scenes[p.sourcePid].state;
    const view = p._view;
    if (view && st) {
      view.state = st;
      view.camera = inst.scenes[p.sourcePid].camera || view.camera;
    }
    // 场景路径跟随源播放器
    const appUi = inst.appUis && inst.appUis[p.sourcePid];
    if (appUi && appUi.path && (!view.scenePath || view.scenePath !== appUi.path)) {
      NOS.remoteRegistry.attachScene(inst, view, appUi.path);
      inst._projectedScene = appUi.path;
    }
  } else if (p.appId === 'charts') {
    const ch = inst.charts && inst.charts[p.sourcePid];
    const cv = p._chartCanvas;
    if (ch && ch.data && cv) NOS.chartRender(cv, ch.data, ch.summary.chartType, ch.data.version);
  }
}
