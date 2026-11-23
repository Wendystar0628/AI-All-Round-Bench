/* AE Forge Editor - project model, layer management, transforms, undo, persistence */
(function (global) {
  'use strict';
  const A = global.AEAnim;
  const M4 = AEMath.M4;
  let uidCounter = 1;
  function uid() { return 'L' + (uidCounter++).toString(36) + Math.floor(Math.random() * 46656).toString(36); }

  const LAYER_TYPES = ['shape', 'text', 'null', 'adjust', 'precomp', 'camera', 'light', 'geo3d', 'particle', 'audio'];
  const TYPE_NAMES = {
    shape: '形状', text: '文字', null: '空对象', adjust: '调整图层', precomp: '预合成',
    camera: '摄像机', light: '灯光', geo3d: '三维几何', particle: '粒子', audio: '音色',
  };

  function P(value, opts) { return A.createProp(value, opts); }

  function baseLayer(comp, type, name) {
    return {
      id: uid(),
      name: name || (TYPE_NAMES[type] || type) + ' ' + (comp.layers.filter(l => l.type === type).length + 1),
      type,
      enabled: true, locked: false, solo: false, guide: false,
      is3D: false,
      startTime: 0, inPoint: 0, outPoint: comp.duration, stretch: 100,
      parentId: null, blendMode: 'normal',
      transform: {
        anchor: P([0, 0, 0]),
        position: P([0, 0, 0]),
        scale: P([100, 100, 100]),
        rotation: P([0, 0, 0]),
        opacity: P(100),
      },
      effects: [], masks: [], trackMatte: false, matteInvert: false, matteLayerId: null,
    };
  }

  function createLayer(comp, type, opts) {
    opts = opts || {};
    const l = baseLayer(comp, type, opts.name);
    if (opts.from) Object.assign(l, JSON.parse(JSON.stringify(opts.from)));
    if (l.type === 'shape') {
      l.shapes = l.shapes || [{ kind: 'rect', x: 0, y: 0, w: 300, h: 200, round: 0, closed: true }];
      l.fill = l.fill || { enabled: true, color: '#e8e8ea', opacity: 100 };
      l.stroke = l.stroke || { enabled: false, color: '#ffffff', opacity: 100, width: 4 };
      l.modifiers = l.modifiers || { trim: null, repeater: null, merge: null };
      l.geometryDepth = 40;
    } else if (l.type === 'text') {
      l.text = l.text || {
        content: '文字', size: 180, weight: 700, family: 'sans', lineHeight: 1.25,
        align: 'center', tracking: 0, color: '#f2f2f4',
      };
      l.animator = l.animator || {
        enabled: false, range: 'char', start: 0, end: 100, offset: 0, feather: 0,
        position: [0, 0], rotation: 0, scale: 100, opacity: 100,
      };
      l.geometryDepth = 40;
    } else if (l.type === 'precomp') {
      l.compId = opts.compId || comp.id;
      l.timeRemap = P(0);
      l.timeStretch = 100;
    } else if (l.type === 'camera') {
      l.is3D = true;
      l.camera = { fov: P(45), focus: P(1200), aperture: P(0.05), target: P([0, 0, 0]), zoom: 1 };
      l.transform.position = P([0, 0, 1200]);
    } else if (l.type === 'light') {
      l.is3D = true;
      l.light = { kind: 'parallel', color: '#ffffff', intensity: 2.2, cone: 60, radius: 6, shadow: true };
      l.transform.rotation = P([-45, 0, 0]);
    } else if (l.type === 'geo3d') {
      l.is3D = true;
      l.geo = l.geo || { kind: 'box', w: 200, h: 200, d: 80, r: 20, seg: 24 };
      l.material = l.material || { color: '#9aa0a8', metalness: 0.9, roughness: 0.28, emissive: '#000000', emissiveIntensity: 0, opacity: 100 };
    } else if (l.type === 'particle') {
      l.is3D = true;
      l.particles = l.particles || {
        emitter: 'point', rate: 120, speed: 260, life: 1.1, size: 6, color: '#ffb15a',
        gravity: -900, drag: 0.9, seed: 7, emitTime: 0, emitDuration: 0.2, burst: 0,
        speedRandom: 0.5, direction: [0, 1, 0], spread: 70, bounce: 0.35, colorEnd: '#ff4a1e',
        emitterLayerId: null, collision: true, secondary: true, trail: 0.25,
      };
      l.material = l.material || { color: '#ffb15a', metalness: 0, roughness: 1, emissive: '#ff7a2a', emissiveIntensity: 4, opacity: 100 };
    } else if (l.type === 'audio') {
      l.audio = l.audio || { patch: 'forge', gain: 0.7, rate: 1, events: [] };
    }
    return l;
  }

  function createComp(name, w, h, fps, duration) {
    const c = {
      id: uid(), name: name || '合成 1', width: w || 1920, height: h || 1080,
      fps: fps || 30, duration: duration || 5, bg: '#101014',
      layers: [], motionBlur: { enabled: false, shutter: 180, phase: 0 },
      workArea: [0, duration || 5],
      background: { type: 'gradient', color1: '#141419', color2: '#050507' },
    };
    return c;
  }

  const AEProject = {
    project: null,
    state: {
      time: 0, playing: false, loop: true, loopWorkArea: false,
      selected: [], activeCompId: null, tool: 'select',
      zoom: 1, panX: 0, panY: 0,
      exporting: false, exportRun: null,
      currentTime: 0,
    },
    undoStack: [], redoStack: [],
    frameCache: { time: -1, map: new Map(), compId: null },
    pendingAutosave: null,

    init(project) {
      this.project = project || this.createEmptyProject();
      this.state.activeCompId = this.project.activeCompId || this.project.comps[0].id;
      this.state.time = 0;
      this.state.currentTime = 0;
      this.invalidate();
    },
    createEmptyProject() {
      const comp = createComp('合成 1', 1920, 1080, 30, 5);
      const p = { version: 1, name: '未命名工程', comps: [comp], activeCompId: comp.id };
      return p;
    },
    activeComp() {
      return this.project.comps.find(c => c.id === this.state.activeCompId) || this.project.comps[0];
    },
    comp(id) { return this.project.comps.find(c => c.id === id); },
    layer(comp, id) { return comp.layers.find(l => l.id === id); },
    selectedLayers() {
      const c = this.activeComp();
      return c.layers.filter(l => this.state.selected.includes(l.id));
    },
    invalidate() {
      this.frameCache.time = -1;
      this.frameCache.map.clear();
      this.geometryRevision = (this.geometryRevision || 0) + 1;
      this.simRevision = (this.simRevision || 0) + 1;
      this.changed = true;
    },
    makeCtx(comp, layer, time) {
      return { comp, layer, time, shared: { stack: [] }, prop: null };
    },
    // ---------- transforms ----------
    localMatrix(layer, time, ctx) {
      const t = layer.transform;
      const pos = A.evalProp(t.position, time, ctx);
      const anchor = A.evalProp(t.anchor, time, ctx);
      const scale = A.evalProp(t.scale, time, ctx);
      const rot = A.evalProp(t.rotation, time, ctx);
      const p3 = [pos[0] || 0, pos[1] || 0, pos[2] || 0];
      const a3 = [anchor[0] || 0, anchor[1] || 0, anchor[2] || 0];
      const s3 = [
        (scale[0] === undefined ? 100 : scale[0]) / 100,
        (scale[1] === undefined ? 100 : scale[1]) / 100,
        (scale[2] === undefined ? 100 : scale[2]) / 100,
      ];
      const r3 = layer.is3D ? [rot[0] || 0, rot[1] || 0, rot[2] || 0] : [0, 0, rot[2] || 0];
      const m = M4.compose(p3, r3, s3);
      const ta = M4.fromTranslation(M4.create(), -a3[0], -a3[1], -a3[2]);
      return M4.multiply(M4.create(), m, ta);
    },
    worldMatrix(comp, layer, time, ctxIn) {
      const key = layer.id + '|' + (layer.parentId || '');
      if (this.frameCache.time !== time || this.frameCache.compId !== comp.id) {
        this.frameCache.time = time; this.frameCache.compId = comp.id; this.frameCache.map.clear();
      }
      const hit = this.frameCache.map.get(key);
      if (hit) return hit;
      const ctx = ctxIn || this.makeCtx(comp, layer, time);
      let m = this.localMatrix(layer, time, ctx);
      if (layer.parentId) {
        const parent = this.layer(comp, layer.parentId);
        if (parent) m = M4.multiply(M4.create(), this.worldMatrix(comp, parent, time, ctx), m);
      }
      this.frameCache.map.set(key, m);
      return m;
    },
    isLayerVisible(layer, time) {
      if (!layer.enabled) return false;
      const st = layer.startTime || 0;
      const stretch = (layer.stretch || 100) / 100;
      const out = layer.outPoint;
      if (out != null && time < st - 1e-6) return false;
      const end = st + (out - layer.inPoint) * Math.abs(stretch || 1);
      if (time > end + 1e-6) return false;
      const op = A.evalProp(layer.transform.opacity, time, this.makeCtx(this.activeComp(), layer, time));
      if (op <= 0.001) return false;
      return true;
    },
    layerOpacity(layer, time) {
      const v = A.evalProp(layer.transform.opacity, time, this.makeCtx(this.activeComp(), layer, time));
      if (!isFinite(v)) return 0;
      return Math.max(0, Math.min(100, v)) / 100;
    },
    layerSourceTime(layer, time) {
      const st = layer.startTime || 0;
      const stretch = (layer.stretch || 100) / 100;
      return layer.inPoint + (time - st) * (stretch || 1);
    },
    // ---------- structure ----------
    addLayer(type, opts) {
      const comp = this.activeComp();
      const l = createLayer(comp, type, opts);
      comp.layers.unshift(l);
      this.invalidate();
      return l;
    },
    addComp(name, w, h, fps, dur) {
      const c = createComp(name, w, h, fps, dur);
      this.project.comps.push(c);
      this.state.activeCompId = c.id;
      this.invalidate();
      return c;
    },
    removeLayers(ids) {
      const comp = this.activeComp();
      for (const id of ids) {
        const idx = comp.layers.findIndex(l => l.id === id);
        if (idx < 0) continue;
        const [l] = comp.layers.splice(idx, 1);
        for (const c of comp.layers) if (c.parentId === id) c.parentId = l.parentId;
      }
      this.state.selected = this.state.selected.filter(id => !ids.includes(id));
      this.invalidate();
    },
    duplicateLayers(ids) {
      const comp = this.activeComp();
      const copies = [];
      for (const id of ids) {
        const l = this.layer(comp, id);
        if (!l) continue;
        const c = JSON.parse(JSON.stringify(l));
        c.id = uid(); c.name = l.name + ' 副本';
        copies.push(c);
      }
      const idx = comp.layers.findIndex(l => l.id === ids[0]);
      comp.layers.splice(idx + 1, 0, ...copies);
      this.state.selected = copies.map(c => c.id);
      this.invalidate();
      return copies;
    },
    moveLayer(id, dir) {
      const comp = this.activeComp();
      const i = comp.layers.findIndex(l => l.id === id);
      const j = i + dir;
      if (j < 0 || j >= comp.layers.length) return;
      const [l] = comp.layers.splice(i, 1);
      comp.layers.splice(j, 0, l);
      this.invalidate();
    },
    reparent(layerId, parentId, preserveWorld) {
      const comp = this.activeComp();
      const l = this.layer(comp, layerId);
      if (!l) return;
      const time = this.state.time;
      const world = this.worldMatrix(comp, l, time);
      l.parentId = parentId || null;
      this.frameCache.time = -1;
      if (preserveWorld && parentId) {
        const parent = this.layer(comp, parentId);
        if (parent) {
          const pw = this.worldMatrix(comp, parent, time);
          const inv = M4.invert(M4.create(), pw);
          const local = inv ? M4.multiply(M4.create(), inv, world) : world;
          this.decomposeToLayer(l, local);
        }
      }
      this.invalidate();
    },
    decomposeToLayer(layer, m) {
      const pos = [m[12], m[13], m[14]];
      const sx = Math.hypot(m[0], m[1], m[2]) || 1e-6;
      const sy = Math.hypot(m[4], m[5], m[6]) || 1e-6;
      const sz = Math.hypot(m[8], m[9], m[10]) || 1e-6;
      // rotation matrix (normalized columns)
      const r = [
        [m[0] / sx, m[4] / sy, m[8] / sz],
        [m[1] / sx, m[5] / sy, m[9] / sz],
        [m[2] / sx, m[6] / sy, m[10] / sz],
      ];
      let ry = Math.asin(Math.max(-1, Math.min(1, r[0][2])));
      let rx, rz;
      if (Math.abs(r[0][2]) < 0.9999) {
        rx = Math.atan2(-r[1][2], r[2][2]);
        rz = Math.atan2(-r[0][1], r[0][0]);
      } else {
        rx = Math.atan2(r[2][1], r[1][1]);
        rz = 0;
      }
      const deg = 180 / Math.PI;
      layer.transform.position = P(pos);
      layer.transform.scale = P([sx * 100, sy * 100, sz * 100]);
      if (layer.is3D) layer.transform.rotation = P([rx * deg, ry * deg, rz * deg]);
      else layer.transform.rotation = P([0, 0, rz * deg]);
    },

    // ---------- undo / redo ----------
    snapshot() {
      return JSON.stringify(this.project);
    },
    pushUndo() {
      try {
        const s = this.snapshot();
        if (this.undoStack[this.undoStack.length - 1] !== s) this.undoStack.push(s);
        if (this.undoStack.length > 60) this.undoStack.shift();
        this.redoStack.length = 0;
      } catch (e) { console.warn(e); }
    },
    undo() {
      if (!this.undoStack.length) return false;
      this.redoStack.push(this.snapshot());
      this.project = JSON.parse(this.undoStack.pop());
      this.ensureState();
      this.invalidate();
      return true;
    },
    redo() {
      if (!this.redoStack.length) return false;
      this.undoStack.push(this.snapshot());
      this.project = JSON.parse(this.redoStack.pop());
      this.ensureState();
      this.invalidate();
      return true;
    },
    ensureState() {
      if (!this.project.comps.find(c => c.id === this.state.activeCompId)) {
        this.state.activeCompId = this.project.comps[0].id;
      }
      this.state.selected = this.state.selected.filter(id => this.layer(this.activeComp(), id));
    },
    // ---------- persistence ----------
    saveLocal() {
      try { localStorage.setItem('ae_forge_project', this.snapshot()); return true; } catch (e) { return false; }
    },
    loadLocal() {
      try {
        const s = localStorage.getItem('ae_forge_project');
        if (!s) return false;
        this.project = JSON.parse(s);
        this.ensureState();
        this.invalidate();
        return true;
      } catch (e) { return false; }
    },
    exportJSON() { return JSON.stringify(this.project, null, 2); },
    importJSON(text) {
      const p = JSON.parse(text);
      if (!p.comps || !p.comps.length) throw new Error('文件不是有效的工程');
      this.project = p;
      this.ensureState();
      this.invalidate();
    },
  };

  global.AEProject = AEProject;
  global.AELayerTypes = LAYER_TYPES;
  global.AETypeNames = TYPE_NAMES;
  global.AEUtil = { uid, createLayer, createComp };
})(window);