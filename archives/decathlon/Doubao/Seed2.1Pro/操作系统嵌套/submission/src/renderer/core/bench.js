/* window.bench 自动化接口 */
'use strict';
window.NOS = window.NOS || {};

NOS.benchReady = function (NOS) {
  let readyRes;
  const readyP = new Promise(res => readyRes = res);
  NOS._benchReadyRes = readyRes;

  window.bench = {
    version: 1,
    async ready() {
      if (NOS._booted && NOS.desktop) return true;
      return new Promise(res => {
        const t = setInterval(() => { if (NOS._booted) { clearInterval(t); res(true); } }, 50);
      });
    },
    async reset() {
      // 关闭应用与全部子系统，恢复预置文件与默认设置
      for (const id of Array.from(NOS.rootVM.instances.keys())) {
        const inst = NOS.rootVM.instances.get(id);
        inst.closeTree();
      }
      NOS.rootVM.children = [];
      NOS.rootVM.instances.clear();
      NOS.rootVM.setChildSeq(0);
      // 重建根 VFS
      await NOS.seedRootFS(NOS.rootVM.vfs);
      // 关闭所有窗口
      for (const id of Array.from(NOS.desktop.windows.keys())) NOS.desktop.closeWindow(id);
      NOS.desktop.settings = { wallpaper: 'dusk', accent: '#7c3aed', scale: 1, sysName: 'Nested OS' };
      NOS.desktop.applySettings();
      // 重新注册示例工作簿
      const sheet = NOS.SheetModel.deserialize(JSON.parse(NOS.rootVM.vfs.read('/Demo/sample.sheet')));
      sheet.filename = 'sample.sheet';
      NOS.rootVM.dataSources.clear();
      NOS.rootVM.registerWorkbook('sample.sheet', sheet);
      NOS.sampleSheetModel = sheet;
      return true;
    },
    async inspect() {
      const systems = [];
      systems.push({ id: 'outer', parentId: null, name: 'outer', state: 'running' });
      const walk = (inst, parentId) => {
        systems.push({ id: inst.id, parentId, name: inst.name, state: inst.state, error: inst.kernelError });
        inst.children.forEach(c => walk(c, inst.id));
      };
      NOS.rootVM.children.forEach(c => walk(c, 'outer'));

      const windows = [];
      for (const w of NOS.desktop.windows.values()) {
        windows.push({
          id: w.id, systemId: w.projection ? w.projection.targetId || 'outer' : 'outer',
          appId: w.app, title: w.title,
          state: w.min ? 'minimized' : (w.state === 'max' ? 'maximized' : w.state)
        });
      }

      const browsers = [];
      const b = NOS.rootApps.browser;
      if (b.win) (b.tabs || []).forEach(t => browsers.push({ windowId: b.win.id, tabId: t.id, url: t.url, loadState: t.loadState }));

      const players = [];
      const charts = [];
      const projections = [];
      const scanInst = (inst) => {
        const appUi = inst.appUis || {};
        if (appUi[6]) {
          const ui = appUi[6];
          // 找对应窗口（远程）：简化记录
          players.push({ windowId: 'rd:' + inst.id + ':6', systemId: inst.id, state: ui.playing ? 'playing' : 'paused', position: ui.time / 100 || 0, duration: ui.duration / 100 || 15, rate: ui.rate, scene: ui.path, frameTime: ui.time / 100 || 0 });
        }
        if (appUi[7]) {
          const ui = appUi[7];
          charts.push({ windowId: 'rd:' + inst.id + ':7', systemId: inst.id, sourceTitle: ui.source, range: ui.range, chartType: ui.type, connectionState: ui.state });
        }
        for (const p of inst.projections) {
          projections.push({ windowId: p._win ? p._win.id : null, systemId: (p.targetId || 'outer'), sourceSystemId: inst.id, sourceWindowId: 'rd:' + inst.id + ':' + p.sourcePid, sourceAppId: p.appId, state: 'normal' });
        }
        inst.children.forEach(scanInst);
      };
      NOS.rootVM.children.forEach(scanInst);

      return { systems, windows, browsers, players, charts, projections };
    }
  };
};
