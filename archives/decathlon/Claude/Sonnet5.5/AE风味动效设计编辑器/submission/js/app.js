/* app.js — 应用核心：工程状态、选择、时间/播放、撤销、保存/打开、渲染调度 */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  const U = AE.U, Model = AE.Model;
  const App = AE.App = new U.Emitter();
  Object.assign(App, {
    project: null, time: 0, playing: false, rev: 0, tool: 'select', quality: 1, exporting: false, dirty: true,
    sel: { layers: [], props: [], keys: [], node: null, nodes: [], mask: null, item: null, pin: null },
    view: { zoom: 0, px: 0, py: 0 }, opts: { grid: false, safe: false, checker: false, motionPaths: true, handles: true },
    clip: { layers: null, keys: null }, autoKey: false,
  });
  App.ev = new AE.Evaluator(() => App.project, () => App.rev);
  App.hist = new Model.History(() => App.project, p => { App.project = p; App.rev++; App.fixSelection(); App.emit('struct'); App.requestRender(); App.emit('history'); });

  Object.defineProperty(App, 'comp', { get() { const p = this.project; if (!p) return null; return p.comps.find(c => c.id === p.active) || p.comps[0]; } });
  App.layers = () => App.comp.layers;
  App.selLayers = () => App.sel.layers.map(id => App.comp.layers.find(l => l.id === id)).filter(Boolean);
  App.primary = () => { const a = App.selLayers(); return a.length ? a[a.length - 1] : null; };
  App.layer = id => App.comp.layers.find(l => l.id === id);
  App.fps = () => App.comp.fps;
  App.snap = t => Math.round(t * App.comp.fps) / App.comp.fps;
  App.tc = (t) => { const c = App.comp; const f = Math.round(t * c.fps); const s = Math.floor(f / c.fps), ff = f % c.fps; const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}:${String(ff).padStart(2, '0')}`; };

  App.setProject = (p, o = {}) => {
    App.stopPlay(); App.project = p; App.rev++;
    if (!p.graph) p.graph = { nodes: [] }; if (!p.env) p.env = Model.defaultEnv(); if (!p.comps.length) { const c = Model.newComp(); p.comps.push(c); } if (!p.comps.find(c => c.id === p.active)) p.active = p.comps[0].id;
    App.sel = { layers: [], props: [], keys: [], node: null, nodes: [], mask: null, item: null, pin: null };
    App.time = o.time || 0; AE.Sim && AE.Sim.reset(); App.view.zoom = 0;
    App.hist.reset(); App.emit('struct'); App.emit('comp'); App.emit('time'); App.requestRender();
  };
  App.setComp = id => { if (App.project.active === id) return; App.project.active = id; App.rev++; App.sel.layers = []; App.sel.props = []; App.sel.keys = []; App.time = Math.min(App.time, App.comp.dur); App.view.zoom = 0; AE.Sim && AE.Sim.reset(); App.emit('struct'); App.emit('comp'); App.emit('select'); App.requestRender(); };
  App.fixSelection = () => { const ids = new Set(App.comp.layers.map(l => l.id)); App.sel.layers = App.sel.layers.filter(i => ids.has(i)); App.sel.props = App.sel.props.filter(p => ids.has(p.layer)); App.sel.keys = App.sel.keys.filter(k => ids.has(k.layer)); if (App.sel.node && !App.project.graph.nodes.find(n => n.id === App.sel.node)) App.sel.node = null; App.sel.nodes = App.sel.nodes.filter(id => App.project.graph.nodes.find(n => n.id === id)); };

  // ===== 选择 =====
  App.select = (ids, add) => {
    ids = [].concat(ids || []); if (add) { const s = App.sel.layers.slice(); for (const i of ids) { const k = s.indexOf(i); if (k >= 0) s.splice(k, 1); else s.push(i); } App.sel.layers = s; } else App.sel.layers = ids.slice();
    App.sel.props = App.sel.props.filter(p => App.sel.layers.includes(p.layer)); App.sel.mask = null; App.sel.item = null;
    App.emit('select'); App.requestRender();
  };
  App.selectProp = (layer, key, add) => { const k = { layer, key }; if (add) { const i = App.sel.props.findIndex(p => p.layer === layer && p.key === key); if (i >= 0) App.sel.props.splice(i, 1); else App.sel.props.push(k); } else App.sel.props = [k]; if (!App.sel.layers.includes(layer)) App.sel.layers = [layer]; App.emit('select'); App.emit('selprop'); };
  App.isPropSel = (layer, key) => App.sel.props.some(p => p.layer === layer && p.key === key);

  // ===== 时间 =====
  App.setTime = (t, o = {}) => {
    const c = App.comp; t = U.clamp(t, 0, Math.max(0, c.dur - 1 / c.fps)); if (!o.free) t = App.snap(t);
    if (Math.abs(t - App.time) < 1e-9 && !o.force) return; App.time = t; App.emit('time', t); App.requestRender();
  };
  App.togglePlay = () => App.playing ? App.stopPlay() : App.startPlay();
  App.startPlay = () => {
    if (App.playing || App.exporting) return; const c = App.comp; App.playing = true;
    if (App.time >= c.dur - 1.5 / c.fps) App.time = c.work[0];
    App._p0 = performance.now(); App._pt0 = App.time; AE.Audio && AE.Audio.play(App.project, c, App.time);
    const tick = () => {
      if (!App.playing) return; const c2 = App.comp; let t = App._pt0 + (performance.now() - App._p0) / 1000; const w0 = c2.work[0], w1 = Math.min(c2.work[1], c2.dur);
      if (t >= w1) { if (App.loop !== false) { t = w0 + ((t - w0) % Math.max(0.05, w1 - w0)); App._p0 = performance.now(); App._pt0 = t; AE.Audio && AE.Audio.play(App.project, c2, t); } else { t = w1 - 1 / c2.fps; App.stopPlay(); } }
      App.time = App.snap(t); App.emit('time', App.time); App.requestRender(); App._raf = requestAnimationFrame(tick);
    };
    App._raf = requestAnimationFrame(tick); App.emit('play');
  };
  App.stopPlay = () => { if (!App.playing) return; App.playing = false; cancelAnimationFrame(App._raf); AE.Audio && AE.Audio.stop(); App.emit('play'); };

  // ===== 修改与历史 =====
  App.changed = (kind = 'values') => { App.rev++; App.emit('change', kind); App.requestRender(); if (kind === 'struct') App.emit('struct'); };
  App.commit = (label) => { if (App.hist.commit(label)) { App.emit('history'); App.autosave(); } };
  App.edit = (label, fn, kind = 'struct') => { fn(); App.changed(kind); App.commit(label); };
  App.undo = () => { if (App.hist.undo()) App.toast('撤销：' + (App.hist.curLabel || '')); };
  App.redo = () => { if (App.hist.redo()) App.toast('重做'); };
  App.autosave = () => { clearTimeout(App._as); App._as = setTimeout(() => { try { localStorage.setItem('ae-forge-autosave', Model.serialize(App.project)); } catch (e) { } }, 1500); };

  // ===== 渲染调度 =====
  App.requestRender = () => { App.dirty = true; };
  App.startLoop = () => { const loop = () => { if (App.dirty && !App.exporting) { App.dirty = false; try { App.emit('render'); } catch (e) { console.error(e); } } requestAnimationFrame(loop); }; requestAnimationFrame(loop); };
  // 同步渲染（导出用）
  App.renderNow = () => { App.dirty = false; App.emit('render'); };

  // ===== 文件 =====
  App.saveFile = () => {
    const blob = new Blob([Model.serialize(App.project)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (App.project.name || '工程') + '.aeforge.json'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); App.toast('工程已保存为文件');
  };
  App.openFile = () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { App.setProject(Model.deserialize(r.result)); App.toast('已打开：' + f.name); } catch (e) { App.toast('文件无法解析：' + e.message); } }; r.readAsText(f); };
    inp.click();
  };
  App.newProject = () => { App.setProject(Model.newProject()); App.toast('已创建空工程'); };
  App.loadDemo = () => { App.setProject(AE.Demo.build()); AE.Demo.prepareUI && AE.Demo.prepareUI(App); App.toast('已载入示例工程「锻字」'); };

  // ===== 提示 =====
  App.toast = (msg, ms = 1800) => { const el = document.getElementById('toast'); el.textContent = msg; el.classList.remove('hidden'); clearTimeout(App._tt); App._tt = setTimeout(() => el.classList.add('hidden'), ms); };

  // ===== 工具：属性读写 =====
  App.val = (L, key, t) => App.ev.value(App.comp, L, key, t === undefined ? App.time : t);
  // 修改属性值（当前时刻；动画属性创建/更新关键帧）。value 为最终要得到的"基础值"
  App.setProp = (L, key, value, o = {}) => { Model.setPropAt(L, key, App.time, value, { fps: App.comp.fps }); if (!o.silent) App.changed('values'); };
  App.nodeOwner = id => App.project.graph.nodes.find(n => n.id === id);
})();
