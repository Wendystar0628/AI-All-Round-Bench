// ===========================================================================
//  main.js —— 启动
// ===========================================================================
(function () {
  const U = window.U;
  const { ipcRenderer } = window.require('electron');

  function flatAdapter(tree) {
    const allPaths = () => {
      const out = [];
      const walk = (n, p) => {
        for (const k in n.c) {
          const c = n.c[k];
          const pp = p + '/' + k;
          if (c.t === 'file') out.push(pp); else walk(c, pp);
        }
      };
      walk(tree.root, '');
      return out;
    };
    return new Proxy({}, {
      get(t, p) {
        if (typeof p !== 'string' || p[0] !== '/') return undefined;
        const n = tree.node(p);
        if (!n || n.t !== 'file') return undefined;
        return { d: n.d, k: n.k, m: n.m };
      },
      set(t, p, v) { if (typeof p !== 'string' || p[0] !== '/') return false; tree.write(p, v.d, v.k); return true; },
      has(t, p) { return typeof p === 'string' && p[0] === '/' && !!tree.node(p); },
      deleteProperty(t, p) { if (tree.node(p)) tree.remove(p); return true; },
      ownKeys() { return allPaths(); },
      getOwnPropertyDescriptor(t, p) {
        const n = tree.node(p);
        if (!n || n.t !== 'file') return undefined;
        return { enumerable: true, configurable: true, writable: true, value: { d: n.d, k: n.k, m: n.m } };
      }
    });
  }

  async function boot() {
    const info = await ipcRenderer.invoke('app:info');
    window.APP_INFO = info;
    const Store = window.Store;
    Store.init(info.dataDir);
    const rt = new window.NSLRuntime.Runtime();
    window.NSL_RUNTIME = rt;
    const adapter = flatAdapter(Store.fs);
    rt.createRoot(adapter);
    rt.root.memQuota = 64 * 1024 * 1024;
    rt.root.storageQuota = 16 * 1024 * 1024;
    const display = new window.Display(rt);
    window.DISPLAY = display;
    const desk = new window.Desktop();
    window.DESKTOP = desk;
    desk.init(rt, display);
    // 跨层服务
    rt.hooks.hostRequest = (inst, service, args) => {
      if (service === 'chart_connect') return window.ChartHub.connect(inst, args || {});
      if (service === 'chart_disconnect') return window.ChartHub.disconnect(inst);
      if (service === 'chart_books') { window.ChartHub.ensureSample(); return { books: window.ChartHub.openDocs().map((p) => ({ name: p.split('/').pop(), path: p })) }; }
      if (service === 'project') return window.ProjectionHub.create(inst, args || {});
      return { ok: false, error: '未知服务 ' + service };
    };
    rt.hooks.emit = (evt) => { if (evt === 'tick') desk.onRuntimeTick && desk.onRuntimeTick(); };
    desk.onRuntimeTick = () => { display.cache = display.cache || {}; };

    // ---- window.bench ----
    const findMeta = (inst) => {
      const out = {};
      for (const k in inst.display.buffers) {
        const b = inst.display.buffers[k];
        if (b.type !== '2d' || !b.list) continue;
        for (const op of b.list) if (op.op === 'meta') { out[k.split(':')[0]] = op; break; }
      }
      return out;
    };
    const subWindows = () => {
      const res = [];
      for (const id in rt.instances) {
        const inst = rt.instances[id];
        if (inst.isRoot) continue;
        const desk2 = inst.display.buffers[Object.keys(inst.display.buffers).find((k) => k.endsWith(':desktop'))];
        if (!desk2 || !desk2.list) continue;
        for (const op of desk2.list) {
          if (op.op === 'blit' && op.wid != null) {
            res.push({ id: inst.id + ':' + op.wid, systemId: inst.id, appId: op.appId, title: op.title, state: op.minimized ? 'minimized' : 'normal', wId: op.wid });
          }
        }
      }
      return res;
    };
    window.bench = {
      version: 1,
      ready: async () => {
        await new Promise((r) => setTimeout(r, 60));
        return true;
      },
      reset: async () => {
        for (const w of desk.win.list()) { try { desk.win.close(w.id); } catch (e) { /* ignore */ } }
        for (const id of Object.keys(rt.instances)) {
          if (id === 'outer') continue;
          const inst = rt.instances[id];
          rt.stopKernel(inst);
          delete rt.instances[id];
        }
        rt.root.children = [];
        rt.order = [];
        rt.counter = 0;
        Store.resetAll();
        desk.applySettings(Store.settings);
        desk.buildIcons();
        desk.buildTaskbarItems();
        return true;
      },
      inspect: () => {
        const systems = rt.listSystems().map((s) => ({ id: s.id, parentId: s.parentId, name: s.name, state: s.paused ? 'paused' : s.state }));
        const windows = desk.win.list().map((w) => ({ id: w.id, systemId: 'outer', appId: w.appId, title: w.title, state: w.minimized ? 'minimized' : (w.maximized ? 'maximized' : 'normal') }));
        for (const sw of subWindows()) windows.push(sw);
        const browsers = [];
        for (const w of desk.win.list()) {
          if (w.appId !== 'browser') continue;
          const tabs = w.el.querySelectorAll('.tab');
          tabs.forEach((t, i) => browsers.push({ windowId: w.id, tabId: t.dataset.tabId || String(i), url: (t.querySelector('.tt') || {}).textContent || '', loadState: 'loaded' }));
        }
        const players = [], charts = [];
        for (const id in rt.instances) {
          const inst = rt.instances[id];
          if (inst.isRoot) continue;
          const metas = findMeta(inst);
          for (const pid in metas) {
            const m = metas[pid];
            const wid = subWindows().find((x) => x.systemId === inst.id && String(x.wId) !== '' && false);
            if (m.kind === 'player') {
              const win = subWindows().find((x) => x.systemId === inst.id && x.appId === 'player');
              players.push({ windowId: win ? win.id : null, systemId: inst.id, state: inst.paused ? 'paused' : (m.playing ? 'playing' : 'paused'), position: m.position, duration: m.duration, rate: m.rate, scene: m.scene, frameTime: m.position });
            }
            if (m.kind === 'charts') {
              const win = subWindows().find((x) => x.systemId === inst.id && x.appId === 'charts');
              charts.push({ windowId: win ? win.id : null, systemId: inst.id, sourceTitle: m.sourceTitle, range: m.range, chartType: m.chartType, connectionState: m.conn ? 'connected' : 'disconnected', labels: m.labels, series: m.series, version: m.version });
            }
          }
        }
        const projections = [];
        for (const p of window.ProjectionHub.list) {
          if (!p.win) continue;
          projections.push({ windowId: p.win.id, systemId: 'outer', sourceSystemId: p.instId, sourceWindowId: p.win.el.dataset.sourceWindowId || null, sourceAppId: p.source, state: p.win.minimized ? 'minimized' : 'normal' });
        }
        return { systems, windows, browsers, players, charts, projections, budget: rt.rootBudget, tick: rt.tickCount };
      }
    };
    window.HELP_DOC = window.HELP_DOC || '';
    // 打开帮助文档
    try {
      const fs = window.require('fs'), path = window.require('path');
      const p = path.join(U.projectRoot(), 'docs', 'manual.html');
      if (fs.existsSync(p)) window.HELP_DOC = fs.readFileSync(p, 'utf8');
    } catch (e) { /* ignore */ }
    window.BENCH_READY = true;
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
