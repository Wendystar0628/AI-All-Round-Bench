import {
  ActiveTool, Composition, ExpressionDiagnostic, Keyframe, Layer, LayerType,
  Project, AnimProp,
} from '../core/types';
import { clamp, deepClone, genId } from '../core/math';
import {
  createEmptyComposition, createEmptyProject, createLayer, deserializeProject,
  HistoryManager, precomposeLayers, serializeProject,
} from '../core/project';
import { createForgeDemoProject } from '../demo/forgeDemo';
import { EvaluatedSceneSnapshot } from '../simulation/sceneEval';
import { particleEngine } from '../simulation/particleEngine';
import { audioEngine } from '../audio/audioEngine';

export type BottomTab = 'timeline' | 'graph' | 'nodes';
export type GraphMode = 'value' | 'speed';

type Listener = (reason: 'render' | 'ui' | 'full') => void;

export class EditorStore {
  public project: Project;
  public history = new HistoryManager();

  public currentTime = 0;
  public isPlaying = false;
  public loopWorkArea = true;
  public isExportMode = false;

  public selectedLayerIds = new Set<string>();
  public selectedKeyframeIds = new Set<string>();
  public selectedNodeIds = new Set<string>();
  public selectedShapeItemId: string | null = null;
  public selectedVertexRef: { layerId: string; itemId: string; contourIdx: number; vertexIdx: number } | null = null;

  public activeTool: ActiveTool = 'select';
  public bottomTab: BottomTab = 'timeline';
  public graphMode: GraphMode = 'value';
  public graphTarget: { layerId: string; propPath: string; propLabel: string } | null = null;

  public showOverlays = true;
  public showGrid = false;
  public viewportZoom = 1.0;
  public viewportPan: [number, number] = [0, 0];

  public timelineZoom = 68; // pixels per second
  public timelineScrollX = 0;
  public snapTimeline = true;
  public expandedLayerIds = new Set<string>();

  public clipboardKeyframes: Array<{ propPath: string; relTime: number; kf: Keyframe }> = [];
  public diagnostics: ExpressionDiagnostic[] = [];
  public lastSceneSnap: EvaluatedSceneSnapshot | null = null;
  public toastMsg = '';
  private toastTimer: number | null = null;

  private listeners = new Set<Listener>();

  constructor() {
    this.project = createForgeDemoProject();
    this.history.reset(this.project);
    const comp = this.getActiveComp();
    // Select Hero Metal Block or Text by default so Inspector immediately showcases rich editable controls!
    const hero = comp.layers.find((l) => l.name === '锻造金属字块') ?? comp.layers[0];
    if (hero) {
      this.selectedLayerIds.add(hero.id);
      this.graphTarget = { layerId: hero.id, propPath: 'material.emissiveIntensity', propLabel: '发光强度' };
    }
  }

  public subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  public notify(reason: 'render' | 'ui' | 'full' = 'full'): void {
    for (const fn of this.listeners) fn(reason);
  }

  public showToast(msg: string, ms = 2400): void {
    this.toastMsg = msg;
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastMsg = '';
      this.notify('ui');
    }, ms);
    this.notify('ui');
  }

  public getActiveComp(): Composition {
    return this.project.compositions.find((c) => c.id === this.project.activeCompId) ?? this.project.compositions[0];
  }

  public getSelectedLayers(): Layer[] {
    const comp = this.getActiveComp();
    return comp.layers.filter((l) => this.selectedLayerIds.has(l.id));
  }

  public getPrimarySelectedLayer(): Layer | null {
    const list = this.getSelectedLayers();
    return list.length === 1 ? list[0] : null;
  }

  public setTime(t: number, notifyUi = true): void {
    const comp = this.getActiveComp();
    this.currentTime = clamp(t, 0, Math.max(0.01, comp.duration));
    this.notify(notifyUi ? 'full' : 'render');
  }

  public stepFrames(deltaFrames: number): void {
    const comp = this.getActiveComp();
    const dt = 1 / Math.max(1, comp.fps);
    this.setTime(this.currentTime + deltaFrames * dt, true);
  }

  public togglePlay(): void {
    audioEngine.unlock();
    this.isPlaying = !this.isPlaying;
    if (!this.isPlaying) audioEngine.stopAll();
    else {
      const comp = this.getActiveComp();
      if (this.currentTime >= comp.workAreaEnd - 0.01) {
        this.currentTime = comp.workAreaStart;
      }
    }
    this.notify('ui');
  }

  // Undo / Redo Transactions (1 full drag / input / wiring = 1 step!)
  public beginEdit(): void {
    this.history.beginTransaction(this.project);
  }

  public commitEdit(invalidateSim = true): void {
    this.history.commitTransaction(this.project);
    if (invalidateSim) particleEngine.clearAll();
    this.notify('full');
  }

  public pushDiscreteEdit(invalidateSim = true): void {
    this.history.pushSnapshot(this.project);
    if (invalidateSim) particleEngine.clearAll();
    this.notify('full');
  }

  public undo(): void {
    const prev = this.history.undo();
    if (!prev) return;
    this.project = prev;
    particleEngine.clearAll();
    this.pruneSelections();
    this.showToast('已撤销 (Ctrl+Z)');
    this.notify('full');
  }

  public redo(): void {
    const next = this.history.redo();
    if (!next) return;
    this.project = next;
    particleEngine.clearAll();
    this.pruneSelections();
    this.showToast('已重做');
    this.notify('full');
  }

  private pruneSelections(): void {
    const comp = this.getActiveComp();
    const ids = new Set(comp.layers.map((l) => l.id));
    for (const sid of Array.from(this.selectedLayerIds)) {
      if (!ids.has(sid)) this.selectedLayerIds.delete(sid);
    }
  }

  public selectLayer(layerId: string | null, additive = false): void {
    if (!additive) this.selectedLayerIds.clear();
    if (layerId) {
      if (additive && this.selectedLayerIds.has(layerId)) this.selectedLayerIds.delete(layerId);
      else this.selectedLayerIds.add(layerId);
    }
    this.notify('full');
  }

  public addLayer(type: LayerType, opts?: Parameters<typeof createLayer>[3]): Layer {
    const comp = this.getActiveComp();
    this.beginEdit();
    const layer = createLayer(comp, type, undefined, opts);
    comp.layers.unshift(layer);
    this.selectedLayerIds.clear();
    this.selectedLayerIds.add(layer.id);
    this.commitEdit();
    this.showToast(`已创建 ${layer.name}`);
    return layer;
  }

  public duplicateSelectedLayers(): void {
    const comp = this.getActiveComp();
    const sel = this.getSelectedLayers();
    if (sel.length === 0) return;
    this.beginEdit();
    const newIds: string[] = [];
    for (const orig of sel) {
      const idx = comp.layers.indexOf(orig);
      const copy = deepClone(orig);
      copy.id = genId('lyr');
      copy.name = `${orig.name} 副本`;
      // Regenerate keyframe IDs to avoid selection collision
      this.refreshPropKeyframeIds(copy);
      comp.layers.splice(Math.max(0, idx), 0, copy);
      newIds.push(copy.id);
    }
    this.selectedLayerIds = new Set(newIds);
    this.commitEdit();
    this.showToast(`已复制 ${newIds.length} 个图层`);
  }

  public deleteSelectedLayers(): void {
    const comp = this.getActiveComp();
    if (this.selectedLayerIds.size === 0) return;
    const toRemove = new Set(this.selectedLayerIds);
    this.beginEdit();
    comp.layers = comp.layers.filter((l) => !toRemove.has(l.id));
    // Clean dangling parent references
    for (const l of comp.layers) {
      if (l.parentId && toRemove.has(l.parentId)) l.parentId = null;
    }
    this.selectedLayerIds.clear();
    this.commitEdit();
    this.showToast('已删除所选图层');
  }

  public precomposeSelected(customName?: string): void {
    const comp = this.getActiveComp();
    const ids = Array.from(this.selectedLayerIds);
    if (ids.length === 0) {
      this.showToast('请先选择至少一个图层再预合成');
      return;
    }
    this.beginEdit();
    const res = precomposeLayers(this.project, comp, ids, customName);
    if (res) {
      this.selectedLayerIds = new Set([res.precompLayer.id]);
      this.commitEdit();
      this.showToast(`已原位预合成：${res.newComp.name}`);
    }
  }

  public switchComp(compId: string): void {
    const target = this.project.compositions.find((c) => c.id === compId);
    if (!target) return;
    this.isPlaying = false;
    audioEngine.stopAll();
    this.project.activeCompId = compId;
    this.currentTime = clamp(this.currentTime, 0, target.duration);
    this.selectedLayerIds.clear();
    if (target.layers[0]) this.selectedLayerIds.add(target.layers[0].id);
    this.notify('full');
  }

  public createNewComp(name?: string, w = 1280, h = 720, fps = 30, duration = 10): void {
    this.beginEdit();
    const comp = createEmptyComposition(name || `合成 ${this.project.compositions.length + 1}`, w, h, fps, duration);
    this.project.compositions.push(comp);
    this.project.activeCompId = comp.id;
    this.currentTime = 0;
    this.selectedLayerIds.clear();
    this.commitEdit();
    this.showToast(`已新建合成：${comp.name}`);
  }

  public resetToEmptyProject(): void {
    this.isPlaying = false;
    audioEngine.stopAll();
    particleEngine.clearAll();
    this.project = createEmptyProject('新建空工程');
    this.history.reset(this.project);
    this.currentTime = 0;
    this.selectedLayerIds.clear();
    this.selectedKeyframeIds.clear();
    this.selectedNodeIds.clear();
    this.graphTarget = null;
    this.notify('full');
    this.showToast('已新建空白工程');
  }

  public loadForgeDemo(): void {
    this.isPlaying = false;
    audioEngine.stopAll();
    particleEngine.clearAll();
    this.project = createForgeDemoProject();
    this.history.reset(this.project);
    this.currentTime = 0;
    this.selectedLayerIds.clear();
    this.selectedKeyframeIds.clear();
    const comp = this.getActiveComp();
    const hero = comp.layers.find((l) => l.name === '锻造金属字块');
    if (hero) this.selectedLayerIds.add(hero.id);
    this.notify('full');
    this.showToast('已重新载入 15 秒「锻字」示例工程');
  }

  public exportProjectJSON(): string {
    return serializeProject(this.project);
  }

  public importProjectJSON(json: string): void {
    const loaded = deserializeProject(json);
    this.isPlaying = false;
    audioEngine.stopAll();
    particleEngine.clearAll();
    this.project = loaded;
    this.history.reset(this.project);
    this.currentTime = 0;
    this.selectedLayerIds.clear();
    this.selectedKeyframeIds.clear();
    this.notify('full');
    this.showToast(`已打开工程：${loaded.name}`);
  }

  private refreshPropKeyframeIds(obj: any): void {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj.keyframes)) {
      for (const kf of obj.keyframes) {
        if (kf && typeof kf === 'object' && 'id' in kf) kf.id = genId('kf');
      }
    }
    for (const val of Object.values(obj)) {
      if (val && typeof val === 'object') this.refreshPropKeyframeIds(val);
    }
  }
}

/** Collect all AnimProps of a layer (for Timeline, Keyframe jump J/K, Easy Ease F9, Graph Editor!) */
export function listLayerAnimProps(layer: Layer): Array<{ path: string; label: string; prop: AnimProp<any>; isSpatial: boolean }> {
  const out: Array<{ path: string; label: string; prop: AnimProp<any>; isSpatial: boolean }> = [
    { path: 'anchor', label: '锚点', prop: layer.transform.anchor, isSpatial: false },
    { path: 'position', label: '位置', prop: layer.transform.position, isSpatial: true },
    { path: 'scale', label: '缩放', prop: layer.transform.scale, isSpatial: false },
    { path: 'rotation', label: '旋转', prop: layer.transform.rotation, isSpatial: false },
    { path: 'opacity', label: '不透明度', prop: layer.transform.opacity, isSpatial: false },
  ];

  if (layer.text) {
    out.push(
      { path: 'text.fontSize', label: '字号', prop: layer.text.fontSize, isSpatial: false },
      { path: 'text.writeOnProgress', label: '笔画书写', prop: layer.text.writeOnProgress, isSpatial: false },
      { path: 'text.fillColor', label: '文字填充', prop: layer.text.fillColor, isSpatial: false }
    );
    for (const a of layer.text.animators) {
      out.push(
        { path: `text.anim.${a.id}.start`, label: `${a.name}·起点`, prop: a.start, isSpatial: false },
        { path: `text.anim.${a.id}.end`, label: `${a.name}·终点`, prop: a.end, isSpatial: false },
        { path: `text.anim.${a.id}.offset`, label: `${a.name}·偏移`, prop: a.offset, isSpatial: false },
        { path: `text.anim.${a.id}.position`, label: `${a.name}·位置`, prop: a.position, isSpatial: false },
        { path: `text.anim.${a.id}.rotation`, label: `${a.name}·旋转`, prop: a.rotation, isSpatial: false }
      );
    }
  }
  if (layer.shape) {
    out.push(
      { path: 'shape.fillColor', label: '填充颜色', prop: layer.shape.fillColor, isSpatial: false },
      { path: 'shape.strokeWidth', label: '描边宽度', prop: layer.shape.strokeWidth, isSpatial: false }
    );
    for (const item of layer.shape.items) {
      if (item.kind === 'path') {
        out.push({ path: `shape.${item.id}.path`, label: `${item.name}·路径形变`, prop: item.path, isSpatial: false });
      } else {
        out.push({ path: `shape.${item.id}.size`, label: `${item.name}·尺寸`, prop: item.size, isSpatial: false });
      }
    }
    for (const m of layer.shape.modifiers) {
      if (m.start) out.push({ path: `mod.${m.id}.start`, label: `${m.name}·起点`, prop: m.start, isSpatial: false });
      if (m.end) out.push({ path: `mod.${m.id}.end`, label: `${m.name}·终点`, prop: m.end, isSpatial: false });
      if (m.copies) out.push({ path: `mod.${m.id}.copies`, label: `${m.name}·副本数`, prop: m.copies, isSpatial: false });
      if (m.repRotation) out.push({ path: `mod.${m.id}.repRotation`, label: `${m.name}·旋转`, prop: m.repRotation, isSpatial: false });
    }
  }
  if (layer.mesh3d) {
    out.push(
      { path: 'extrudeDepth', label: '挤出深度', prop: layer.mesh3d.extrudeDepth, isSpatial: false },
      { path: 'bevelSize', label: '倒角尺寸', prop: layer.mesh3d.bevelSize, isSpatial: false },
      { path: 'material.baseColor', label: '基础色', prop: layer.mesh3d.material.baseColor, isSpatial: false },
      { path: 'material.metallic', label: '金属度', prop: layer.mesh3d.material.metallic, isSpatial: false },
      { path: 'material.roughness', label: '粗糙度', prop: layer.mesh3d.material.roughness, isSpatial: false },
      { path: 'material.emissiveIntensity', label: '自发光强度', prop: layer.mesh3d.material.emissiveIntensity, isSpatial: false },
      { path: 'material.opacity', label: '材质不透明', prop: layer.mesh3d.material.opacity, isSpatial: false }
    );
    if (layer.mesh3d.material.heatIntensity) {
      out.push({ path: 'material.heatIntensity', label: '受击炽热', prop: layer.mesh3d.material.heatIntensity, isSpatial: false });
    }
    for (const d of layer.mesh3d.deformers) {
      if (d.amount) out.push({ path: `def.${d.id}.amount`, label: `${d.name}·强度`, prop: d.amount, isSpatial: false });
      if (d.fieldStrength) out.push({ path: `def.${d.id}.fieldStrength`, label: `${d.name}·场强度`, prop: d.fieldStrength, isSpatial: false });
    }
  }
  if (layer.camera) {
    out.push(
      { path: 'camera.target', label: '目标点', prop: layer.camera.target, isSpatial: true },
      { path: 'camera.fov', label: '视角 FOV', prop: layer.camera.fov, isSpatial: false },
      { path: 'camera.focalDistance', label: '对焦距离', prop: layer.camera.focalDistance, isSpatial: false },
      { path: 'camera.aperture', label: '景深光圈', prop: layer.camera.aperture, isSpatial: false }
    );
  }
  if (layer.light) {
    out.push(
      { path: 'light.color', label: '灯光颜色', prop: layer.light.color, isSpatial: false },
      { path: 'light.intensity', label: '光强', prop: layer.light.intensity, isSpatial: false },
      { path: 'light.target', label: '目标点', prop: layer.light.target, isSpatial: true }
    );
  }
  if (layer.field) {
    out.push(
      { path: 'field.strength', label: '场强度', prop: layer.field.strength, isSpatial: false },
      { path: 'field.radius', label: '影响半径', prop: layer.field.radius, isSpatial: false }
    );
  }
  if (layer.particle) {
    for (const em of layer.particle.emitters) {
      out.push(
        { path: `emt.${em.id}.rate`, label: `${em.name}·速率`, prop: em.rate, isSpatial: false },
        { path: `emt.${em.id}.burst`, label: `${em.name}·爆发`, prop: em.burst, isSpatial: false },
        { path: `emt.${em.id}.speed`, label: `${em.name}·初速`, prop: em.speed, isSpatial: false }
      );
    }
  }
  if (layer.precomp && layer.precomp.timeRemapEnabled) {
    out.push({ path: 'precomp.timeRemap', label: '时间重映射', prop: layer.precomp.timeRemap, isSpatial: false });
  }
  for (const m of layer.masks) {
    out.push(
      { path: `msk.${m.id}.feather`, label: `${m.name}·羽化`, prop: m.feather, isSpatial: false },
      { path: `msk.${m.id}.path`, label: `${m.name}·路径`, prop: m.path, isSpatial: false }
    );
  }
  for (const fx of layer.effects) {
    if (fx.blurRadius) out.push({ path: `fx.${fx.id}.blurRadius`, label: `${fx.name}·半径`, prop: fx.blurRadius, isSpatial: false });
    if (fx.glowIntensity) out.push({ path: `fx.${fx.id}.glowIntensity`, label: `${fx.name}·强度`, prop: fx.glowIntensity, isSpatial: false });
    if (fx.shadowDistance) out.push({ path: `fx.${fx.id}.shadowDistance`, label: `${fx.name}·距离`, prop: fx.shadowDistance, isSpatial: false });
    if (fx.hue) out.push({ path: `fx.${fx.id}.hue`, label: `${fx.name}·色相`, prop: fx.hue, isSpatial: false });
  }
  return out;
}
