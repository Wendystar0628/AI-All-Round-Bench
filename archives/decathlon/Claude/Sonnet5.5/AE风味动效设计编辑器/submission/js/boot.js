/* boot.js — 启动 */
(function () {
  const AE = globalThis.AE; const App = AE.App, UI = AE.UI;
  const $ = id => document.getElementById(id);
  function boot() {
    UI.initSplitters(); UI.buildMenubar(); App.project = null;
    App.setProject(AE.Demo.build());
    AE.Viewer.init($('center')); AE.Props.init($('right')); AE.Project.init($('left')); AE.Timeline.init($('timeline'));
    const br = $('bottomRight'); br.innerHTML = '';
    const holder = document.createElement('div'); holder.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0;position:relative';
    const cv = document.createElement('div'); cv.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0';
    const nd = document.createElement('div'); nd.style.cssText = 'flex:1;display:none;flex-direction:column;min-height:0';
    holder.append(cv, nd); br.append(holder);
    AE.Curves.init(cv); AE.NodeEditor.init(nd);
    const tabs = UI.tabs(br, [{ id: 'curves', label: '曲线' }, { id: 'nodes', label: '节点' }], id => {
      cv.style.display = id === 'curves' ? 'flex' : 'none'; nd.style.display = id === 'nodes' ? 'flex' : 'none';
      if (id === 'curves') AE.Curves.refresh(); else AE.NodeEditor.refresh && AE.NodeEditor.refresh(); App.requestRender();
    }, 'curves');
    AE.Bottom = { show: id => tabs.set(id) };
    UI.initKeys(); if (AE.Demo.prepareUI && App.project.demo) AE.Demo.prepareUI(App); App.startLoop(); App.requestRender();
    const st = $('status');
    const upd = () => {
      const c = App.comp;
      st.innerHTML = `<span>合成 <b>${c.name}</b></span><span>图层 <b>${c.layers.length}</b></span><span>选中 <b>${App.sel.layers.length}</b></span><span>时间 <b>${App.tc(App.time)}</b></span><span>撤销栈 <b>${App.hist.past.length}</b></span><span style="margin-left:auto">WebGL2 ${AE.Viewer.glctx ? (AE.Viewer.glctx.hdr ? 'RGBA16F' : 'RGBA8') : '不可用'}</span>`;
    };
    ['struct', 'select', 'time', 'history', 'comp'].forEach(e => App.on(e, upd)); upd();
  }
  window.addEventListener('DOMContentLoaded', () => {
    try { boot(); } catch (e) {
      console.error(e);
      document.body.insertAdjacentHTML('beforeend', '<pre style="position:fixed;inset:40px;color:#f88;z-index:9999;background:#000c;padding:20px;overflow:auto">启动失败：' + (e && e.stack || e) + '</pre>');
    }
  });
})();
