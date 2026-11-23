/* 视频导出固定接口：window.videoExport。确定性逐帧推进，不依赖真实时间。 */
(function (root) {
  'use strict';
  const ND = root.ND = root.ND || {};
  const VE = {};
  VE.runs = ['demo-1', 'demo-2', 'demo-3'];
  let active = null; // {def, fps, frames}

  VE.begin = async function (runId, opts) {
    opts = opts || {};
    const fps = opts.fps || 30;
    const def = (ND.DEMOS || []).find(d => d.id === runId);
    if (!def) throw new Error('unknown run ' + runId);
    // 回到该段起始局面
    const game = ND.createGame(def.map, { seed: def.seed || 7, firstPrep: 9999 });
    ND.App.game = game;
    ND.App.state = 'export';
    ND.App.paused = false;
    ND.App.renderer.loadGame(game);
    ND.App.renderer.resize();
    ND.Demo.start(def, game, ND.App.renderer);
    // 展示完整界面 + 字幕 + 虚拟鼠标
    ND.UI.showBattle(game);
    document.getElementById('forecast').style.display = 'none';
    document.getElementById('demo-overlay').classList.remove('hidden');
    document.getElementById('demo-title').textContent = '实战演示 · ' + def.title;
    document.getElementById('virtual-cursor').classList.remove('hidden');
    document.getElementById('pause-overlay').classList.add('hidden');
    const frames = Math.ceil(def.dur * fps);
    active = { def, fps, frames };
    // 渲染第 0 帧
    ND.Demo.stepTo(0);
    ND.App.renderer.sync(game, 1 / fps);
    ND.UI.updateHUD(game); ND.UI.updateForecast(game);
    return { frames };
  };

  VE.frame = async function (i) {
    if (!active) throw new Error('begin() not called');
    const t = i / active.fps;
    ND.Demo.stepTo(t);
    ND.App.renderer.sync(ND.App.game, 1 / active.fps);
    ND.UI.updateHUD(ND.App.game);
    if (ND.App.selected) ND.UI.showSelection(ND.App.game, ND.App.selected);
    return { i, t };
  };

  VE.end = function () {
    active = null;
    ND.Demo.stop();
    document.getElementById('demo-overlay').classList.add('hidden');
    document.getElementById('virtual-cursor').classList.add('hidden');
    ND.App.game = null;
    ND.App.toMenu();
  };

  root.videoExport = VE;
})(typeof window !== 'undefined' ? window : globalThis);