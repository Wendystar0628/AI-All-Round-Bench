/* 应用入口：工程状态、撤销 / 重做、渲染循环、画布自适应、工程读写，以及 window.videoExport 逐帧接口。 */
(function () {
  'use strict';
  const AE = (window.AE = window.AE || {});
  const U = AE.U;
  const Model = AE.Model;
  const App = (AE.App = {});

  App.project = null;
  App.state = {
    compId: null,
    time: 0,
    selected: [], // 选中的图层 id 列表（第一个为主选择）
    selProp: null, // { layer, prop, path } 当前在属性面板 / 曲线中聚焦的属性
    tool: 'select',
    drawTarget: 'content', // 绘制结果：content 作为形状内容，mask 作为蒙版
    loopWork: true, // 播放时循环工作区
    propFocus: null, // 快捷键 P/S/R/T/A 指定要显示的属性：{ layerId, labels }
    playing: false,
    exporting: false,
    timelineZoom: 90, // 每秒像素
    graphMode: 'value',
    bottomTab: 'timeline',
    rightTab: 'props',
    graphSel: [], // 曲线视图中选中的关键帧 { prop, index }
    expandedLayers: {},
    dirty: false,
  };
  App.undoStack = [];
  App.redoStack = [];
  App.listeners = []; // UI 注册的刷新函数
  App._pendingSnap = null;
  App._renderQueued = false;

  App.onChange = (fn) => App.listeners.push(fn);

  App.comp = () => (App.project ? Model.findComp(App.project, App.state.compId) : null);
  App.layer = (id) => Model.findLayer(App.comp(), id);
  App.selectedLayer = () => {
    const id = App.state.selected[0];
    return id ? App.layer(id) : null;
  };
  App.setStatus = (txt) => {
    const el = document.getElementById('statusText');
    if (el) el.textContent = txt;
  };
  App.toast = (txt) => {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = txt;
    el.classList.add('show');
    clearTimeout(App._toastT);
    App._toastT = setTimeout(() => el.classList.remove('show'), 2400);
  };

  // ---------- 工程加载 ----------
  App.load = (project) => {
    App.project = project;
    if (!project.comps.length) project.comps.push(Model.newComp({ name: '合成 1' }));
    App.state.compId = project.activeComp && Model.findComp(project, project.activeComp) ? project.activeComp : project.comps[0].id;
    App.state.time = 0;
    App.state.selected = [];
    App.state.selProp = null;
    App.undoStack = [];
    App.redoStack = [];
    AE.Model.touch();
    App.notify();
    App.requestRender();
  };

  App.setComp = (id) => {
    App.state.compId = id;
    App.project.activeComp = id;
    App.state.selected = [];
    App.state.selProp = null;
    App.state.time = Math.min(App.state.time, App.comp().duration);
    App.notify();
    App.requestRender();
  };

  // ---------- 撤销 / 重做（快照） ----------
  App.snapshot = () => JSON.stringify(App.project);
  // 单步修改：修改前后有差异才入栈
  App.mutate = (label, fn) => {
    const before = App.snapshot();
    fn(App.project);
    App.commitSnap(before, label);
  };
  App.commitSnap = (before, label) => {
    const after = App.snapshot();
    if (before !== after) {
      App.undoStack.push({ data: before, label });
      if (App.undoStack.length > 120) App.undoStack.shift();
      App.redoStack = [];
    }
    Model.touch();
    App.notify();
    App.requestRender();
  };
  // 连续操作（拖动、输入）：开始时记录，结束时提交
  App.beginAction = () => {
    if (!App._pendingSnap) App._pendingSnap = App.snapshot();
  };
  App.endAction = (label) => {
    const before = App._pendingSnap;
    App._pendingSnap = null;
    if (before) App.commitSnap(before, label || '编辑');
  };
  // 连续操作中的实时更新（不入栈）
  App.liveChange = () => {
    Model.touch();
    App.requestRender();
    App.notifyValues();
  };
  App.undo = () => {
    if (!App.undoStack.length) return App.toast('没有可撤销的操作');
    const cur = App.snapshot();
    const prev = App.undoStack.pop();
    App.redoStack.push({ data: cur, label: prev.label });
    App.restoreData(prev.data);
    App.toast('撤销：' + prev.label);
  };
  App.redo = () => {
    if (!App.redoStack.length) return App.toast('没有可重做的操作');
    const cur = App.snapshot();
    const next = App.redoStack.pop();
    App.undoStack.push({ data: cur, label: next.label });
    App.restoreData(next.data);
    App.toast('重做：' + next.label);
  };
  App.restoreData = (data) => {
    const prev = App.project;
    App.project = JSON.parse(data);
    // 保持当前合成与选择（若仍存在）
    if (!Model.findComp(App.project, App.state.compId)) App.state.compId = App.project.comps[0].id;
    App.state.selected = App.state.selected.filter((id) => App.layer(id));
    void prev;
    Model.touch();
    App.notify();
    App.requestRender();
  };

  // ---------- 时间 ----------
  App.setTime = (t) => {
    const c = App.comp();
    if (!c) return;
    const fps = c.fps;
    t = Math.max(0, Math.min(c.duration, Math.round(t * fps) / fps));
    if (Math.abs(t - App.state.time) < 1e-9) return;
    App.state.time = t;
    App.notifyTime();
    App.requestRender();
  };

  // ---------- 通知 UI ----------
  App.notify = () => App.listeners.forEach((l) => l.full && l.full());
  App.notifyTime = () => App.listeners.forEach((l) => l.time && l.time());
  App.notifyValues = () => App.listeners.forEach((l) => l.values && l.values());
  App.register = (obj) => App.listeners.push(obj);

  // ---------- 渲染 ----------
  App.requestRender = () => {
    if (App._renderQueued) return;
    App._renderQueued = true;
    requestAnimationFrame(() => {
      App._renderQueued = false;
      App.renderNow();
    });
  };
  App.fit = () => {
    const c = App.comp();
    if (!c) return { fit: 1, cssW: 0, cssH: 0 };
    const wrap = document.getElementById('viewerWrap');
    const bar = document.getElementById('viewerBar');
    const availW = Math.max(100, wrap.clientWidth - 24);
    const availH = Math.max(100, wrap.clientHeight - (bar ? bar.offsetHeight : 0) - 24);
    const fit = Math.min(availW / c.width, availH / c.height);
    return { fit, cssW: Math.round(c.width * fit), cssH: Math.round(c.height * fit) };
  };
  App.resizeCanvases = () => {
    const c = App.comp();
    if (!c) return;
    const f = App.fit();
    const dpr = window.devicePixelRatio || 1;
    const cv = App.canvas;
    const ov = document.getElementById('overlay');
    const viewer = document.getElementById('viewer');
    viewer.style.width = f.cssW + 'px';
    viewer.style.height = f.cssH + 'px';
    App.S = (f.fit * dpr);
    const pw = Math.max(1, Math.round(c.width * App.S)), ph = Math.max(1, Math.round(c.height * App.S));
    if (cv.width !== pw || cv.height !== ph) {
      cv.width = pw;
      cv.height = ph;
    }
    ov.width = f.cssW * dpr;
    ov.height = f.cssH * dpr;
    ov.style.width = f.cssW + 'px';
    ov.style.height = f.cssH + 'px';
    App.cssFit = f.fit;
  };

  App.renderNow = () => {
    const c = App.comp();
    if (!c || !App.renderer) return;
    App.resizeCanvases();
    const t0 = performance.now();
    try {
      const rt = App.renderer.renderFrame(App.project, c, App.state.time, { S: App.S });
      App.renderer.present(rt);
      App.renderer.pool.release(rt);
      App.renderer.pool.releaseAll();
      App.lastFrameMs = performance.now() - t0;
      App.renderError = null;
    } catch (e) {
      App.renderError = e;
      console.error(e);
    }
    document.getElementById('viewerEmpty').style.display = c.layers.length ? 'none' : 'flex';
    if (App.overlayDraw) App.overlayDraw();
    const st = document.getElementById('statusRender');
    if (st) st.textContent = App.renderError ? '渲染错误：' + App.renderError.message : App.lastFrameMs ? '渲染 ' + App.lastFrameMs.toFixed(0) + ' ms' : '';
  };

  // 播放循环（不在导出模式中推进）
  App.tick = (now) => {
    if (App.state.playing && !App.state.exporting) {
      const c = App.comp();
      const dt = (now - App._lastTick) / 1000;
      let t = App.state.time + dt;
      const ws = c.workStart, we = c.workEnd;
      if (t >= we) {
        if (App.state.loopWork === false) {
          // 不循环：到达工作区终点即停止
          t = we;
          App.state.playing = false;
          App.notifyTime();
        } else t = ws + ((t - ws) % Math.max(1e-3, we - ws));
      }
      App.state.time = t;
      App.notifyTime();
      App.requestRender();
      App._lastTick = now;
      if (AE.Audio && AE.Audio.onTick) AE.Audio.onTick(App.state.time);
    }
    App._lastTick = now;
    requestAnimationFrame(App.tick);
  };
  App.play = (on) => {
    if (on === undefined) on = !App.state.playing;
    if (on && App.state.exporting) return;
    App.state.playing = on;
    App._lastTick = performance.now();
    if (AE.Audio) on ? AE.Audio.start(App.state.time) : AE.Audio.stop();
    App.notifyTime();
  };

  // ---------- 工程文件 ----------
  App.saveFile = () => {
    const data = JSON.stringify(App.project, null, 1);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (App.project.name || '工程') + '.aeproj.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    App.toast('已保存工程文件');
  };
  App.openFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        App.load(data);
        App.toast('已打开：' + (data.name || file.name));
      } catch (e) {
        App.toast('无法读取工程：' + e.message);
      }
    };
    reader.readAsText(file);
  };

  // ---------- 逐帧导出接口 ----------
  App.exportState = { runs: ['demo'], fps: 60, frames: 0 };
  function nextFrame() {
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }
  window.videoExport = {
    runs: ['demo'],
    async begin(runId, opts) {
      if (runId !== 'demo') throw new Error('未知的运行：' + runId);
      const fps = (opts && opts.fps) || 3;
      App.play(false);
      App.state.exporting = true;
      App.exportState.fps = fps;
      await AE.Demo.ready();
      App.setComp(App.project.activeComp || App.project.comps[0].id);
      const c = App.comp();
      App.exportState.comp = c.id;
      App.exportState.frames = Math.round(c.duration * fps);
      App.setTime(0);
      App.renderNow();
      App.notify();
      await nextFrame();
      return { frames: App.exportState.frames };
    },
    async frame(i) {
      const c = App.comp();
      const fps = App.exportState.fps;
      const t = i / fps;
      App.state.time = Math.min(c.duration, t);
      // 只做增量更新（播放头、属性数值、曲线与叠加层），不重建面板结构
      App.notifyTime();
      App.renderNow();
      await nextFrame();
    },
    end() {
      App.state.exporting = false;
      App.notify();
      App.requestRender();
    },
  };

  // ---------- 启动 ----------
  App.init = () => {
    if (App._inited) return;
    App._inited = true;
    const canvas = document.getElementById('glCanvas');
    App.canvas = canvas;
    try {
      App.renderer = new AE.Renderer(canvas);
    } catch (e) {
      App.setStatus(e.message);
      console.error(e);
    }
    if (AE.UI && AE.UI.init) AE.UI.init();
    App._lastTick = performance.now();
    requestAnimationFrame(App.tick);
    window.addEventListener('resize', () => App.requestRender());
    App.load(AE.Demo.build());
    App.setStatus('示例已载入：按空格播放');
  };
  window.addEventListener('DOMContentLoaded', () => App.init());
  // 首次在 DOMContentLoaded 之后加载脚本时直接初始化
  if (document.readyState !== 'loading') App.init();
})();
