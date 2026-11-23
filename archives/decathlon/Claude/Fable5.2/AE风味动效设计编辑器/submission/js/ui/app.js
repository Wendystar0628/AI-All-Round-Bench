// 应用状态：工程、选择、时间、播放、撤销/重做、文件读写。各视图都是同一工程的不同视图，通过事件同步
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});
  const ev = new MF.Emitter();

  const App = (MF.App = {
    on: ev.on.bind(ev), emit: ev.emit.bind(ev),
    project: null, compId: null, time: 0, playing: false, loop: true,
    sel: { layers: [], keys: [], props: [], nodes: [], pin: null, sub: null },   // keys: [{pid, i}]；props: [pid]；pid = 图层id + '|' + 属性路径（节点属性的图层id 为空）
    tool: 'select', history: [], hIndex: -1, dirty: true, exporting: false, nodeCtx: [],
    ui: { expanded: {}, tlZoom: 0, tlScroll: 0, graphMode: 'value', showFields: true, showMotion: true, checker: false, res: 0, solo: null },
    view: { x: 0, y: 0, scale: 1, fit: true },

    comp() { return this.project ? MF.Model.getComp(this.project, this.compId) : null; },
    layer(id) { return MF.Model.getLayer(this.comp(), id); },
    selLayers() { const c = this.comp(); return c ? c.layers.filter((l) => this.sel.layers.indexOf(l.id) >= 0) : []; },
    fps() { const c = this.comp(); return c ? c.fps : 30; },
    snapT(t) { const f = this.fps(); return Math.round(t * f) / f; },

    // ---------- 工程 ----------
    setProject(p, opts) {
      this.project = p; MF.Eval.setProject(p); MF.Nodes.clearCache(); MF.Particles.reset();
      this.compId = p.activeComp && MF.Model.getComp(p, p.activeComp) ? p.activeComp : p.comps[0] ? p.comps[0].id : null;
      this.sel = { layers: [], keys: [], props: [], nodes: [], pin: null, sub: null }; this.nodeCtx = [];
      this.time = 0; this.playing = false; this.ui.expanded = {}; this.view.fit = true;
      if (!opts || !opts.keepHistory) { this.history = [MF.Model.serialize(p)]; this.hIndex = 0; }
      this.touch(); ev.emit('project', { structure: true, reset: true }); ev.emit('selection'); ev.emit('time');
      if (MF.Audio) MF.Audio.invalidate();
    },
    newProject() { const p = MF.Model.newProject(); this.setProject(p); },
    openComp(id) { if (!MF.Model.getComp(this.project, id)) return; this.compId = id; this.project.activeComp = id; this.sel = { layers: [], keys: [], props: [], nodes: [], pin: null, sub: null }; this.nodeCtx = []; this.time = MF.clamp(this.time, 0, this.comp().duration); this.view.fit = true; this.touch(); ev.emit('project', { structure: true }); ev.emit('selection'); ev.emit('time'); if (MF.Audio) MF.Audio.invalidate(); },
    touch() { MF.Eval.touch(); this.dirty = true; },

    // ---------- 编辑与撤销 ----------
    // 一次完整操作（输入、命令）：执行 fn 并记录一步撤销
    edit(label, fn, opts) {
      if (this._drag) { fn(); this.changed(opts); return; }
      try { fn(); } catch (e) { console.error(e); this.toast('操作失败：' + (e.message || e), 'err'); }
      this.touch(); this.commit(label);
      ev.emit('project', Object.assign({ structure: true, label }, opts || {}));
      if (MF.Audio && (!opts || opts.audio !== false)) MF.Audio.invalidate();
    },
    // 连续拖动：beginDrag → 多次 changed → endDrag 只记一步
    beginDrag(label) { this._drag = { label }; },
    changed(opts) { this.touch(); ev.emit('project', Object.assign({ structure: false, live: true }, opts || {})); },
    endDrag(opts) { if (!this._drag) return; const label = this._drag.label; this._drag = null; this.touch(); const did = this.commit(label); ev.emit('project', Object.assign({ structure: true, label }, opts || {})); if (did && MF.Audio) MF.Audio.invalidate(); },
    commit(label) {
      const js = MF.Model.serialize(this.project);
      if (js === this.history[this.hIndex]) return false;
      this.history.length = this.hIndex + 1; this.history.push(js); this.hLabels = this.hLabels || []; this.hLabels.length = this.hIndex + 1; this.hLabels.push(label || '编辑');
      if (this.history.length > 120) { this.history.shift(); this.hLabels.shift(); }
      this.hIndex = this.history.length - 1; return true;
    },
    restore(i) {
      const p = MF.Model.deserialize(this.history[i]); this.hIndex = i; this.project = p; MF.Eval.setProject(p);
      if (!MF.Model.getComp(p, this.compId)) this.compId = p.comps[0] ? p.comps[0].id : null;
      const c = this.comp();
      this.sel.layers = this.sel.layers.filter((id) => c && MF.Model.getLayer(c, id)); this.sel.keys = []; this.sel.nodes = this.sel.nodes.filter((id) => c && MF.Nodes.findDeep(c, id)); this.sel.pin = null;
      this.nodeCtx = this.nodeCtx.filter((id) => c && MF.Nodes.findDeep(c, id));
      this.touch(); ev.emit('project', { structure: true, undo: true }); ev.emit('selection'); if (MF.Audio) MF.Audio.invalidate();
    },
    undo() { if (this.hIndex > 0) { const lb = (this.hLabels || [])[this.hIndex]; this.restore(this.hIndex - 1); this.toast('撤销：' + (lb || '编辑')); } else this.toast('没有可撤销的操作'); },
    redo() { if (this.hIndex < this.history.length - 1) { this.restore(this.hIndex + 1); this.toast('重做：' + ((this.hLabels || [])[this.hIndex] || '编辑')); } else this.toast('没有可重做的操作'); },

    // ---------- 时间与播放 ----------
    setTime(t, opts) {
      const c = this.comp(); if (!c) return; t = MF.clamp(t, 0, c.duration);
      if (!opts || !opts.exact) t = Math.min(c.duration, this.snapT(t));
      if (t === this.time && !(opts && opts.force)) return;
      this.time = t; this.dirty = true; ev.emit('time', opts || {});
    },
    step(frames) { this.pause(); this.setTime(this.time + frames / this.fps()); },
    play() {
      const c = this.comp(); if (!c || this.playing || this.exporting) return;
      let t = this.time; if (t >= c.workOut - 1e-6 || t < c.workIn - 1e-6) t = c.workIn;
      this.playing = true; this._playT0 = t; this._wall0 = performance.now(); this.time = t;
      if (MF.Audio) MF.Audio.start(t);
      ev.emit('play');
    },
    pause() { if (!this.playing) return; this.playing = false; if (MF.Audio) MF.Audio.stop(); this.setTime(this.time, { force: true }); ev.emit('play'); },
    toggle() { if (this.playing) this.pause(); else this.play(); },
    // 由主循环调用：推进播放时间（导出模式下不推进）
    tick() {
      if (!this.playing || this.exporting) return;
      const c = this.comp(); if (!c) return;
      let el = MF.Audio && MF.Audio.running() ? MF.Audio.elapsed() : (performance.now() - this._wall0) / 1000;
      let t = this._playT0 + el;
      if (t >= c.workOut) {
        if (this.loop) { this._playT0 = c.workIn; this._wall0 = performance.now(); t = c.workIn; if (MF.Audio) MF.Audio.start(t); }
        else { this.playing = false; if (MF.Audio) MF.Audio.stop(); t = c.workOut; ev.emit('play'); }
      }
      t = Math.floor(t * c.fps + 1e-6) / c.fps;
      if (t !== this.time) { this.time = t; this.dirty = true; ev.emit('time', { playing: true }); }
    },

    // ---------- 选择 ----------
    pid(layerId, path) { return (layerId || '') + '|' + path; },
    selectLayers(ids, opts) { this.sel.layers = ids.slice(); if (!opts || !opts.keepKeys) { this.sel.keys = []; this.sel.props = []; } if (!opts || !opts.keepNodes) { this.sel.nodes = []; this.sel.pin = null; } this.sel.sub = null; this.dirty = true; ev.emit('selection'); },
    toggleLayer(id, additive, range) {
      const c = this.comp(); let ids = this.sel.layers.slice();
      if (range && ids.length) { const a = MF.Model.layerIndex(c, ids[ids.length - 1]), b = MF.Model.layerIndex(c, id); ids = c.layers.slice(Math.min(a, b), Math.max(a, b) + 1).map((l) => l.id); }
      else if (additive) { const i = ids.indexOf(id); if (i >= 0) ids.splice(i, 1); else ids.push(id); }
      else ids = [id];
      this.selectLayers(ids);
    },
    selectKeys(keys, additive) { if (additive) { for (const k of keys) { const i = this.sel.keys.findIndex((x) => x.pid === k.pid && x.i === k.i); if (i >= 0) this.sel.keys.splice(i, 1); else this.sel.keys.push(k); } } else this.sel.keys = keys.slice(); this.dirty = true; ev.emit('selection', { keys: true }); },
    selectProps(pids, additive) { if (additive) { for (const p of pids) { const i = this.sel.props.indexOf(p); if (i >= 0) this.sel.props.splice(i, 1); else this.sel.props.push(p); } } else this.sel.props = pids.slice(); this.dirty = true; ev.emit('selection', { props: true }); },
    selectNodes(ids, opts) { this.sel.nodes = ids.slice(); this.sel.pin = null; if (!opts || !opts.keepLayers) { /* 保留图层选择以便对照 */ } this.dirty = true; ev.emit('selection', { nodes: true }); },
    isKeySel(pid, i) { return this.sel.keys.some((k) => k.pid === pid && k.i === i); },
    // 解析 pid → { layer, desc }
    resolve(pid) { const c = this.comp(); if (!c) return null; const k = pid.indexOf('|'); const lid = pid.slice(0, k), path = pid.slice(k + 1); const L = lid ? MF.Model.getLayer(c, lid) : null; const d = MF.Model.findProp(this.project, c, L, path); return d ? { layer: L, desc: d, prop: d.prop, meta: d.meta, pid } : null; },

    // ---------- 属性写入（遵循“开启动画后只在当前时刻创建/更新关键帧”）----------
    setProp(prop, meta, value) { MF.Anim.setValue(prop, this.time, value, meta); },
    // ---------- 文件 ----------
    save() {
      const js = MF.Model.serialize(this.project); const blob = new Blob([js], { type: 'application/json' }); const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = (this.project.name || '工程') + '.mforge.json'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      try { localStorage.setItem('mforge.last', js); } catch (e) { /* 忽略容量限制 */ }
      this.toast('已保存工程文件');
    },
    open() {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = () => { const f = inp.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { try { this.loadJSON(rd.result); this.toast('已打开 ' + f.name); } catch (e) { this.toast('无法打开：' + e.message, 'err'); } }; rd.readAsText(f); };
      inp.click();
    },
    loadJSON(str) { const p = MF.Model.deserialize(str); this.setProject(p); },
    toast(msg, kind) { ev.emit('toast', msg, kind); },
  });
})();
