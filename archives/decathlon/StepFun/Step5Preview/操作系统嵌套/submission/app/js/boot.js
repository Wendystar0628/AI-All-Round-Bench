// ============================================================
// 启动：创建根系统、桌面、主循环，并提供自动化接口
// ============================================================
import { Host, System, STEP_MS } from './core/system.js';
import { seedRootFS, manualText, sampleSheet } from './host/rootfs.js';
import { loadPresets } from './host/presets.js';
import { Desktop } from './host/desktop.js';

const qs = new URLSearchParams(location.search);
const isElectron = !!window.host && window.host.platform === 'electron';
const params = {
  dataDir: qs.get('dataDir') || '',
  width: parseInt(qs.get('width') || '0', 10) || window.innerWidth,
  height: parseInt(qs.get('height') || '0', 10) || window.innerHeight,
  platform: qs.get('platform') || (isElectron ? 'electron' : 'browser')
};

const store = {
  get(k) { try { return localStorage.getItem('nestedos:' + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem('nestedos:' + k, v); } catch (e) { } },
  del(k) { try { localStorage.removeItem('nestedos:' + k); } catch (e) { } }
};

const host = new Host();
host.electron = isElectron;
host.params = params;
host.dnd = false;

// ---------------- 初始化 ----------------
async function init(fresh) {
  const presets = await loadPresets();
  host.presets = presets;
  const root = new System(host, {
    id: 'outer', parentId: null, name: '根系统', kind: 'root', depth: 0,
    config: { budget: 40000, memQuota: 16000000, storageQuota: 8000000, procQuota: 8000, childGrant: 14000, quantum: 1400 }
  });
  host.root = root;
  host.addSystem(root);
  host.innerSeq = 0;

  if (!fresh) {
    const savedFs = store.get('rootfs');
    const savedSet = store.get('settings');
    if (savedFs) { try { root.vfs.load(JSON.parse(savedFs)); } catch (e) { } }
    if (savedSet) { try { Object.assign(root.config, JSON.parse(savedSet).config || {}); } catch (e) { } }
    if (!root.vfs.exists('/Demo/sample.sheet')) seedRootFS(root.vfs, presets);
  } else {
    seedRootFS(root.vfs, presets);
    host.presets.kernelSource = presets.kernelSource;
  }
  // 说明文档写入根文件系统
  root.vfs.write('/Documents/操作说明.txt', manualText);

  const desk = new Desktop(host, root);
  host.saveSettings = () => {
    store.set('settings', JSON.stringify({ config: root.config, desktop: desk.settings }));
    if (isElectron) window.host.saveFile('settings.json', JSON.stringify({ config: root.config, desktop: desk.settings }, null, 1));
  };
  const savedSet = store.get('settings');
  if (savedSet && !fresh) { try { const s = JSON.parse(savedSet); if (s.desktop) Object.assign(desk.settings, s.desktop); if (s.config) Object.assign(root.config, s.config); } catch (e) { } }
  desk.applySettings();

  // 宿主方法
  host.chargeRoot = (units) => { root.appBudget = Math.max(0, (root.appBudget || 0) - units); root.stepUsed = (root.stepUsed || 0) + units; };
  host.spawnRootProgram = (path) => {
    const src = root.vfs.read(path);
    if (src === null) return { error: '文件不存在: ' + path };
    const c = host.compile(src, root);
    if (c.error) return { error: c.error };
    const p = root.spawnProc({ name: path.split('/').pop(), kind: 'demo', code: c.code, quota: 2000 });
    root.console.push({ t: root.vtime, pid: p.pid, name: p.name, text: '进程 ' + p.pid + ' 已启动（' + path + '）' });
    return { pid: p.pid };
  };
  host.killRootProc = (pid) => { const p = root.getProc(pid); if (p) { p.status = 'ended'; p.blocked = null; p._queue = []; } };
  host.beginDrag = (systemId, path, name) => {
    host.drag = { systemId, path, name };
    desk.input.showGhost(name);
  };
  host.endDrag = () => { host.drag = null; desk.input.hideGhost(); };
  host.resetInnerSeq = () => { host.innerSeq = 0; };
  host.saveToLocal = (name, content) => {
    if (isElectron) return window.host.saveFile(name, content);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    a.download = name; a.click();
    return Promise.resolve('下载目录/' + name);
  };
  host.importFromLocal = () => new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) { resolve(null); return; }
      const r = new FileReader();
      r.onload = () => resolve({ name: f.name, content: String(r.result) });
      r.readAsText(f);
    };
    inp.click();
  });

  // 主循环：逻辑步 + 画面同步（被盖住时也继续推进）
  let last = performance.now();
  let acc = 0;
  let rafId = 0;
  function frame() {
    const now = performance.now();
    const dt = Math.min(100, now - last);
    last = now;
    acc += dt;
    while (acc >= STEP_MS * 1000 / 60) {
      host.frame();
      acc -= STEP_MS * 1000 / 60;
    }
    // 同步各系统画面
    for (const s of host.systems.values()) if (s.frame2d) host.view2d.sync(s);
    // 根桌面投送三维视图
    host.view3d.views.length = 0;
    if (host.rootProjRects) {
      const cover = desk.rootWindowRects();
      for (const r of host.rootProjRects) {
        const proj = host.projections.get(r.projId);
        if (!proj || proj.kind !== '3d' || !proj.payload || !proj.payload.state) continue;
        const rects = [[r.x, r.y, r.w, r.h]];
        for (const c of cover) {
          // 仅扣除更高层的其他窗口（近似：全部扣除后再排除自身窗口）
        }
        host.view3d.views.push({ key: 'proj:' + proj.id, resource: proj.payload.resource, state: proj.payload.state, rects });
      }
    }
    host.view3d.render();
    host.rootProjRects = [];
  }
  function loop() { frame(); rafId = requestAnimationFrame(loop); }
  loop();
  // 遮挡/后台 watchdog：rAF 停止时仍按时间推进
  setInterval(() => {
    const now2 = performance.now();
    if (now2 - last > 120) { last = now2; frame(); }
  }, 60);

  // 定期持久化
  setInterval(() => {
    store.set('rootfs', JSON.stringify({ root: host.root.vfs.root }));
  }, 5000);
  window.addEventListener('beforeunload', () => {
    store.set('rootfs', JSON.stringify({ root: host.root.vfs.root }));
  });

  // ---------------- 自动化接口 ----------------
  window.bench = {
    version: 1,
    ready: async () => { await new Promise(r => setTimeout(r, 60)); return true; },
    reset: async () => {
      for (const id of [...host.systems.keys()]) if (id !== 'outer') host.destroySubtree(id, false);
      host.root.procs.clear();
      host.root.inbox.length = 0;
      host.innerSeq = 0;
      host.projections.clear();
      host.dataSubs.clear();
      store.del('rootfs'); store.del('settings');
      desk.windows.forEach((w, id) => { if (id) { try { w.el.remove(); } catch (e) { } } });
      desk.windows.clear();
      desk.sysWins.clear(); desk.projWins.clear(); desk.notifs.length = 0;
      await init(true);
      desk.applySettings();
      desk.renderIcons();
      return true;
    },
    inspect: () => {
      const systems = [];
      const walk = (id, depth) => {
        const s = host.systems.get(id);
        if (!s) return;
        systems.push({ id: s.id, parentId: s.parentId, name: s.name, state: s.effectivePaused() ? 'paused' : 'running', depth: s.depth, rate: s.rate, vtime: Math.round(s.vtime), ownPaused: s.ownPaused });
        for (const p of s.procs.values()) if (p.kind === 'carrier' && p.childSystemId) walk(p.childSystemId, depth + 1);
      };
      walk('outer', 0);
      const windows = [];
      for (const w of desk.windows.values()) {
        windows.push({ id: w.id, systemId: w.sys || (w.proj ? host.projections.get(w.proj)?.targetSystemId : 'outer') || 'outer', appId: w.appId, title: w.title, state: w.min ? 'minimized' : (w.max ? 'maximized' : 'normal') });
      }
      // 子系统窗口（来自各系统帧）
      for (const s of host.systems.values()) {
        if (!s.frame2d || !s.frame2d.wins) continue;
        for (const w of s.frame2d.wins) {
          windows.push({ id: s.id + ':' + w.id, systemId: s.id, appId: w.key, title: w.title, state: w.min === 1 ? 'minimized' : 'normal', projId: w.projId });
        }
      }
      const browsers = [];
      if (host.browserTabs) for (const t of host.browserTabs()) browsers.push(t);
      const players = [];
      const charts = [];
      const projections = [];
      for (const s of host.systems.values()) {
        for (const k in s.views3d) {
          const v = s.views3d[k];
          players.push({
            windowId: k, systemId: s.id, state: v.state && v.state.paused ? 'paused' : 'playing',
            position: v.state ? Math.round(v.state.time * 1000) / 1000 : 0, duration: 15, rate: 1,
            scene: '/Demo/helicopter-24.scene', frameTime: v.state ? v.state.time : 0
          });
        }
        if (s.frame2d && s.frame2d.wins) {
          for (const w of s.frame2d.wins) {
            if (w.key === 'chart') charts.push({ windowId: s.id + ':' + w.id, systemId: s.id, sourceTitle: '图表', range: 'A1:D4', chartType: 'bar', connectionState: w.meta && w.meta.conn || 'idle' });
            if (w.kind === 'proj') projections.push({ windowId: s.id + ':' + w.id, systemId: s.id, sourceSystemId: w.srcSys || '', sourceWindowId: '', sourceAppId: '', state: 'open' });
          }
        }
      }
      for (const p of host.projections.values()) {
        projections.push({ windowId: p.targetSystemId + ':proj:' + p.id, systemId: p.targetSystemId, sourceSystemId: p.sourceSystemId, sourceWindowId: p.sourceWindowId, sourceAppId: '', state: p.active ? 'open' : 'closed' });
      }
      return { systems, windows, browsers, players, charts, projections };
    }
  };
  window.hostApi = host;
  return desk;
}

// 启动
init(false).then(() => {
  document.body.classList.add('ready');
  console.log('[nested-os] 已启动', params);
}).catch(e => {
  document.body.innerHTML = `<pre style="color:#f66;padding:20px;font:13px monospace">启动失败: ${e.stack || e}</pre>`;
  console.error(e);
});
