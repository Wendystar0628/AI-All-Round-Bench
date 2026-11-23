/* ============================================================
   app.js — 应用状态 / 渲染循环 / 撤销重做 / 导出接口 / 声音
   ============================================================ */
(function (global) {
  const AE = global.AE = global.AE || {};
  const U = AE.util;
  const App = AE.app = {};

  App.project = null;
  App.comp = null;
  App.time = 0;
  App.playing = false;
  App.exportMode = false;
  App.exportFps = 30;
  App.selection = [];          // 选中的图层 id
  App.selectedProps = [];      // 选中的属性 key
  App.selectedKeys = [];       // 选中的关键帧 {layerId, prop, t}
  App.viewMode = 'final';
  App.showGrid = true;
  App.showPath = true;
  App.show3d = false;
  App.zoom = 'fit';
  App.zoomFactor = 1;
  App.view = { scale: 1, ox: 0, oy: 0 };
  App.clipboard = null;
  App.errors = [];
  App.dirty = true;

  const undoStack = [], redoStack = [];
  let lastTime = 0, playingStart = 0, playingStartTime = 0;
  let precompPool = new Map();

  /* ---------------- 撤销 / 重做 ---------------- */
  App.snapshot = function (label) {
    undoStack.push({ label, json: JSON.stringify(App.project) });
    if (undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
  };
  App.pushUndo = function (label) { App.snapshot(label); };
  App.undo = function () {
    if (!undoStack.length) { AE.ui.toast('没有可撤销的操作', 'bad'); return; }
    const s = undoStack.pop();
    redoStack.push({ label: s.label, json: JSON.stringify(App.project) });
    App.project = AE.model.deserialize(s.json);
    App.comp = AE.model.activeComp(App.project);
    AE.ui.refreshAll();
    AE.ui.toast('已撤销：' + (s.label || ''));
  };
  App.redo = function () {
    if (!redoStack.length) { AE.ui.toast('没有可重做的操作', 'bad'); return; }
    const s = redoStack.pop();
    undoStack.push({ label: s.label, json: JSON.stringify(App.project) });
    App.project = AE.model.deserialize(s.json);
    App.comp = AE.model.activeComp(App.project);
    AE.ui.refreshAll();
    AE.ui.toast('已重做：' + (s.label || ''));
  };

  /* ---------------- 时间 ---------------- */
  App.setTime = function (t, opts) {
    opts = opts || {};
    const comp = App.comp;
    if (!comp) return;
    let v = t;
    if (opts.snap && comp.fps) v = Math.round(v * comp.fps) / comp.fps;
    v = U.clamp(v, 0, comp.duration);
    if (Math.abs(v - App.time) < 1e-9 && !opts.force) return;
    App.time = v;
    AE.ui.updateFrame();
    App.dirty = true;
  };
  App.stepFrame = function (d) {
    const fps = App.comp ? App.comp.fps : 30;
    App.setTime(App.time + d / fps, { snap: true });
  };
  App.goStart = () => App.setTime(0);
  App.goEnd = () => App.setTime(App.comp ? App.comp.duration : 0);

  /* ---------------- 播放 ---------------- */
  App.play = function () {
    if (App.playing) return;
    if (!App.comp) return;
    if (App.time >= App.comp.duration - 1e-3) App.time = 0;
    App.playing = true;
    playingStart = performance.now();
    playingStartTime = App.time;
    AE.audio.play(App.comp, App.time, App.time);
    AE.ui.updatePlayButton();
  };
  App.pause = function () {
    App.playing = false;
    AE.audio.stop();
    AE.ui.updatePlayButton();
  };
  App.togglePlay = () => App.playing ? App.pause() : App.play();

  /* ---------------- 渲染 ---------------- */
  function buildScene(time) {
    return AE.scene.build(App.comp, App.project, time, {
      viewMode: App.viewMode,
      renderPrecomp: (subComp, layer, localTime) => {
        const sub = AE.scene.build(subComp, App.project, localTime, {
          viewMode: App.viewMode,
          renderPrecomp: null
        });
        const tex = AE.render.renderScene(sub);
        let pool = precompPool.get(layer.id);
        if (!pool) {
          pool = AE.render.makePoolTarget ? AE.render.makePoolTarget() : AE.render.targets.precomp;
          precompPool.set(layer.id, pool);
        }
        AE.render.copy(tex, pool);
        return pool;
      }
    });
  }

  App.renderFrame = function (time) {
    const comp = App.comp;
    if (!comp) return;
    const canvas = document.getElementById('glCanvas');
    const R = AE.render;
    const mb = comp.motionBlur || { enabled: false, shutter: 180 };
    const samples = mb.enabled ? Math.max(2, Math.min(10, Math.round(mb.shutter / 40))) : 1;
    let result, scene = null;
    if (samples > 1) {
      const shutter = (mb.shutter / 360) / comp.fps;
      const phase = ((mb.phase || 50) / 100) - 0.5;
      R.beginAccum(R.targets.accum);
      for (let i = 0; i < samples; i++) {
        const ts = time + (shutter * (i / (samples - 1) - 0.5) + phase * shutter);
        scene = buildScene(U.clamp(ts, 0, comp.duration));
        const tex = R.renderScene(scene);
        R.accumulate(tex, R.targets.accum);
      }
      R.finishAccum(R.targets.accum, R.targets.tmp2, samples);
      result = R.targets.tmp2;
    } else {
      scene = buildScene(time);
      result = R.renderScene(scene);
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(2, Math.round(canvas.clientWidth * dpr));
    const ch = Math.max(2, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw; canvas.height = ch;
    }
    R.present(result, cw, ch, comp.w, comp.h, comp.bgColor);
    App.lastScene = scene;
    App.errors = scene.errors || [];
    AE.ui.drawOverlay();
  };

  /* ---------------- 视口映射 ---------------- */
  App.computeView = function () {
    const comp = App.comp;
    const viewport = document.getElementById('viewport');
    const w = viewport.clientWidth, h = viewport.clientHeight;
    if (!comp) return;
    let scale;
    if (App.zoom === 'fit') scale = Math.min(w / comp.w, h / comp.h) * 0.92;
    else scale = App.zoomFactor * Math.min(w / comp.w, h / comp.h);
    App.view.scale = scale;
    App.view.ox = (w - comp.w * scale) / 2;
    App.view.oy = (h - comp.h * scale) / 2;
  };
  App.compToScreen = function (x, y) {
    return [App.view.ox + x * App.view.scale, App.view.oy + y * App.view.scale];
  };
  App.screenToComp = function (x, y) {
    return [(x - App.view.ox) / App.view.scale, (y - App.view.oy) / App.view.scale];
  };

  /* ---------------- 选择 ---------------- */
  App.select = function (id, additive) {
    if (!additive) App.selection = [];
    if (id) {
      const i = App.selection.indexOf(id);
      if (i >= 0) App.selection.splice(i, 1);
      else App.selection.push(id);
    }
    AE.ui.refreshAll();
  };
  App.selectedLayers = function () {
    if (!App.comp) return [];
    return App.comp.layers.filter(l => App.selection.includes(l.id));
  };

  /* ---------------- 工程操作 ---------------- */
  App.newProject = function () {
    App.pushUndo('新建工程');
    App.project = AE.model.createProject('未命名工程');
    App.comp = AE.model.activeComp(App.project);
    App.time = 0;
    App.selection = [];
    AE.ui.refreshAll();
  };
  App.saveProject = function () {
    const json = AE.model.serialize(App.project);
    U.download((App.project.name || '工程') + '.aeproj.json', json);
    AE.ui.toast('工程已保存', 'good');
  };
  App.openProject = function (text) {
    try {
      App.pushUndo('打开工程');
      App.project = AE.model.deserialize(text);
      App.comp = AE.model.activeComp(App.project);
      App.time = 0;
      App.selection = [];
      AE.ui.refreshAll();
      AE.ui.toast('工程已载入', 'good');
    } catch (e) {
      AE.ui.toast('载入失败：' + e.message, 'bad');
    }
  };
  App.addComp = function () {
    App.pushUndo('新建合成');
    const c = AE.model.createComp('合成 ' + (App.project.comps.length + 1), 1920, 1080, 30, 10);
    App.project.comps.push(c);
    App.project.activeComp = c.id;
    App.comp = c;
    AE.ui.refreshAll();
  };
  App.setComp = function (id) {
    App.comp = AE.model.compById(App.project, id);
    App.project.activeComp = id;
    App.time = U.clamp(App.time, 0, App.comp.duration);
    AE.ui.refreshAll();
  };

  App.addLayer = function (type) {
    App.pushUndo('新建图层');
    const l = AE.model.createLayer(type || 'shape', undefined, App.comp);
    if (type === 'shape') {
      l.shape.groups[0].paths.push({
        id: U.uid('path'),
        path: AE.path.rect(-160, -110, 320, 220, 24),
        fill: { enabled: true, color: '#ff8a3d', opacity: 100 },
        stroke: { enabled: false, color: '#ffffff', width: 4, opacity: 100 }
      });
    }
    if (type === 'text') l.text.content = '文字';
    App.comp.layers.unshift(l);
    App.selection = [l.id];
    AE.ui.refreshAll();
  };
  App.deleteSelected = function () {
    if (!App.selection.length) return;
    App.pushUndo('删除图层');
    App.comp.layers = App.comp.layers.filter(l => !App.selection.includes(l.id));
    App.selection = [];
    AE.ui.refreshAll();
  };
  App.duplicateSelected = function () {
    if (!App.selection.length) return;
    App.pushUndo('复制图层');
    const copies = [];
    for (const l of App.selectedLayers()) {
      const c = AE.model.duplicateLayer(l);
      copies.push(c);
    }
    App.comp.layers.unshift(...copies);
    App.selection = copies.map(c => c.id);
    AE.ui.refreshAll();
  };

  /** 预合成：原位合成，画面保持一致 */
  App.precompose = function () {
    const sel = App.selectedLayers();
    if (!sel.length) { AE.ui.toast('请先选择图层', 'bad'); return; }
    App.pushUndo('预合成');
    const parent = App.comp;
    const nc = AE.model.createComp(sel[0].name + ' 预合成', parent.w, parent.h, parent.fps, parent.duration);
    nc.workStart = parent.workStart; nc.workEnd = parent.workEnd;
    nc.bgColor = 'transparent';
    const ids = sel.map(l => l.id);
    // 保持叠放顺序
    const picked = parent.layers.filter(l => ids.includes(l.id));
    nc.layers = picked.map(l => JSON.parse(JSON.stringify(l)));
    // 移除原图层，插入预合成层
    const topIndex = Math.min.apply(null, picked.map(l => parent.layers.indexOf(l)));
    parent.layers = parent.layers.filter(l => !ids.includes(l.id));
    const pl = AE.model.createLayer('precomp', picked[0].name + ' 预合成', parent);
    pl.precomp = { compId: nc.id };
    pl.props.position = { v: [0, 0], tr: null, ex: null };
    pl.props.anchor = { v: [0, 0], tr: null, ex: null };
    pl.inPoint = picked[0].inPoint; pl.outPoint = picked[0].outPoint;
    parent.layers.splice(topIndex, 0, pl);
    App.project.comps.push(nc);
    App.selection = [pl.id];
    AE.ui.refreshAll();
    AE.ui.toast('已创建预合成', 'good');
  };

  /* ---------------- 声音 ---------------- */
  const Audio = AE.audio = {};
  Audio.ctx = null;
  Audio.nodes = [];
  Audio.ensure = function () {
    if (!Audio.ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      Audio.ctx = new AC();
    }
    if (Audio.ctx.state === 'suspended') Audio.ctx.resume();
    return Audio.ctx;
  };
  Audio.play = function (comp, fromTime, playTime) {
    const ctx = Audio.ensure();
    if (!ctx) return;
    Audio.stop();
    const now = ctx.currentTime;
    const startAt = now + 0.06;
    for (const layer of comp.layers) {
      if (layer.type !== 'audio' || !layer.enabled) continue;
      const events = (layer.sound && layer.sound.events) || [];
      for (const ev of events) {
        const t = ev.time;
        if (t < fromTime - 0.001) continue;
        const when = startAt + (t - fromTime);
        scheduleEvent(ctx, ev, when, layer);
      }
    }
  };
  function scheduleEvent(ctx, ev, when, layer) {
    const master = ctx.createGain();
    master.gain.value = (ev.vol === undefined ? 0.7 : ev.vol) * 0.32;
    master.connect(ctx.destination);
    const dur = ev.dur || 0.5;
    const wave = ev.wave || 'metal';
    if (wave === 'noise' || wave === 'metal' || wave === 'shimmer') {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      const seed = ev.seed || 1;
      const rnd = U.mulberry32(seed);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = rnd() * 2 - 1;
        last = last * 0.6 + w * 0.4;
        d[i] = last * Math.pow(1 - i / len, wave === 'shimmer' ? 1.2 : 2.2);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filt = ctx.createBiquadFilter();
      filt.type = wave === 'shimmer' ? 'highpass' : 'bandpass';
      filt.frequency.value = ev.freq || (wave === 'metal' ? 2400 : 1400);
      filt.Q.value = wave === 'metal' ? 6 : 1.2;
      src.connect(filt); filt.connect(master);
      if (wave === 'metal') {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(ev.freq || 420, when);
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, (ev.freq || 420) * 0.45), when + dur);
        const og = ctx.createGain();
        og.gain.setValueAtTime(0.5, when);
        og.gain.exponentialRampToValueAtTime(0.001, when + dur * 0.9);
        osc.connect(og); og.connect(master);
        osc.start(when); osc.stop(when + dur);
      }
      src.start(when); src.stop(when + dur);
    } else {
      const osc = ctx.createOscillator();
      osc.type = wave === 'saw' ? 'sawtooth' : (wave === 'square' ? 'square' : 'sine');
      const f0 = ev.freq || 220, f1 = ev.freqEnd || f0;
      osc.frequency.setValueAtTime(f0, when);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), when + dur);
      const g = ctx.createGain();
      const atk = ev.attack === undefined ? 0.01 : ev.attack;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(1, when + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.connect(g); g.connect(master);
      osc.start(when); osc.stop(when + dur + 0.05);
    }
  }
  Audio.stop = function () {
    // 关闭当前播放（重建 master 无法直接停止，改为让其自然结束）
    Audio.nodes.forEach(n => { try { n.stop(); } catch (e) { } });
    Audio.nodes = [];
  };

  /* ---------------- 快捷键 ---------------- */
  function isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }
  App.bindKeys = function () {
    document.addEventListener('keydown', e => {
      if (isTyping(e)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.code === 'Space') { e.preventDefault(); App.togglePlay(); return; }
      if (e.key === 'F9') { e.preventDefault(); easyEase(); return; }
      if (ctrl && e.shiftKey && (e.key === 'C' || e.key === 'c')) { e.preventDefault(); App.precompose(); return; }
      if (ctrl && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) App.redo(); else App.undo(); return; }
      if (ctrl && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); App.redo(); return; }
      if (ctrl && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); App.duplicateSelected(); return; }
      if (ctrl && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); App.selection = App.comp.layers.map(l => l.id); AE.ui.refreshAll(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); App.deleteSelected(); return; }
      if (e.key === 'Home') { e.preventDefault(); App.goStart(); return; }
      if (e.key === 'End') { e.preventDefault(); App.goEnd(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); App.stepFrame(e.shiftKey ? -10 : -1); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); App.stepFrame(e.shiftKey ? 10 : 1); return; }
      if (e.key === 'i' || e.key === 'I') { setInOut('in'); return; }
      if (e.key === 'o' || e.key === 'O') { setInOut('out'); return; }
      if (e.key === 'k' || e.key === 'K') { toggleCameraView(); return; }
    });
  };
  function easyEase() {
    const layers = App.selectedLayers();
    if (!layers.length) return;
    App.pushUndo('缓入缓出');
    for (const l of layers) {
      for (const key in l.props) {
        const p = l.props[key];
        if (p.tr && p.tr.keys.length) {
          const times = App.selectedKeys.filter(k => k.layerId === l.id && k.prop === key).map(k => k.t);
          AE.anim.easyEase(p.tr, times.length ? times : null);
        }
      }
    }
    AE.ui.refreshAll();
  }
  function setInOut(which) {
    App.pushUndo('设置入出点');
    for (const l of App.selectedLayers()) {
      if (which === 'in') l.inPoint = App.time; else l.outPoint = App.time;
    }
    AE.ui.refreshAll();
  }
  function toggleCameraView() {
    App.show3d = !App.show3d;
    AE.ui.refreshAll();
  }

  /* ---------------- 导出接口 ---------------- */
  function ensureDemo() {
    if (!App.project || !App.project.comps.length) {
      App.project = AE.demo.build();
      App.comp = AE.model.activeComp(App.project);
    }
  }
  global.videoExport = {
    runs: ['demo'],
    async begin(runId, opts) {
      opts = opts || {};
      App.exportMode = true;
      App.pause();
      ensureDemo();
      App.exportFps = opts.fps || App.comp.fps || 30;
      App.time = 0;
      App.setTime(0, { force: true });
      App.renderFrame(0);
      AE.ui.refreshAll();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { frames: Math.round(App.comp.duration * App.exportFps) };
    },
    async frame(i) {
      const t = i / App.exportFps;
      App.time = t;
      App.setTime(t, { force: true });
      App.renderFrame(t);
      AE.ui.updateFrame();
      AE.ui.drawOverlay();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return true;
    },
    end() {
      App.exportMode = false;
      App.time = 0;
      App.setTime(0, { force: true });
      App.renderFrame(0);
      AE.ui.refreshAll();
      return true;
    }
  };

  /* ---------------- 主循环 ---------------- */
  function loop(ts) {
    requestAnimationFrame(loop);
    const dt = lastTime ? (ts - lastTime) / 1000 : 0;
    lastTime = ts;
    if (App.playing && !App.exportMode) {
      const comp = App.comp;
      let t = playingStartTime + (ts - playingStart) / 1000;
      const end = comp.workEnd !== undefined ? comp.workEnd : comp.duration;
      if (t >= end) {
        t = comp.workStart !== undefined ? comp.workStart : 0;
        playingStart = ts; playingStartTime = t;
        Audio.play(comp, t, t);
      }
      App.time = t;
      AE.ui.updateFrame();
    }
    App.computeView();
    App.renderFrame(App.time);
  }

  /* ---------------- 初始化 ---------------- */
  App.init = function () {
    const canvas = document.getElementById('glCanvas');
    try {
      AE.render.init(canvas);
    } catch (e) {
      document.body.innerHTML = '<div style="padding:40px;color:#e05b5b;font:14px sans-serif">无法初始化 WebGL 2：' + e.message + '</div>';
      return;
    }
    AE.ui.init();
    App.bindKeys();

    // 默认载入示例工程
    App.project = AE.demo.build();
    App.comp = AE.model.activeComp(App.project);
    App.time = 0;
    AE.ui.refreshAll();

    document.getElementById('glCanvas').addEventListener('webglcontextlost', e => {
      e.preventDefault();
      AE.ui.toast('WebGL 上下文丢失', 'bad');
    });
    window.addEventListener('resize', () => { App.dirty = true; });
    requestAnimationFrame(loop);
  };

  document.addEventListener('DOMContentLoaded', () => {
    // 首次交互后允许出声
    const unlock = () => { AE.audio.ensure(); document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock); };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    App.init();
  });
})(window);
