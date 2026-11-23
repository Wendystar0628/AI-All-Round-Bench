import { AnimProp, InterpolationType, Keyframe, Layer, PropValue, Vec3 } from '../core/types';
import { clamp, lerp } from '../core/math';
import { applyEasyEase, evaluateKeyframes, evaluatePropertySpeed, sortKeyframes } from '../core/animation';
import { EvalContext } from '../core/expressions';
import { EditorStore, listLayerAnimProps } from './store';

const CHANNEL_COLORS = ['#f59e0b', '#ef4444', '#22c55e', '#38bdf8'];

export class GraphPanel {
  private container: HTMLElement;
  private store: EditorStore;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private propSelect!: HTMLSelectElement;
  private infoEl!: HTMLElement;

  private viewMinV = -10;
  private viewMaxV = 110;
  private drag: {
    kind: 'kf' | 'outHandle' | 'inHandle' | 'scrub';
    kfIdx: number;
    channel: number;
    segNextIdx?: number;
  } | null = null;

  constructor(container: HTMLElement, store: EditorStore) {
    this.container = container;
    this.store = store;
    this.buildDOM();
    this.bindEvents();
  }

  private buildDOM(): void {
    this.container.innerHTML = `
      <div class="graph-toolbar">
        <div class="graph-left">
          <span class="panel-mini-title">曲线属性</span>
          <select id="graph-prop-sel" name="graph-prop-sel" class="mini-select"></select>
          <div class="seg-group">
            <button class="seg-btn active" id="graph-mode-val">值曲线</button>
            <button class="seg-btn" id="graph-mode-spd">速度曲线</button>
          </div>
          <span class="graph-sep">进入</span>
          <select id="gr-in-type" name="gr-in-type" class="mini-select" title="单独设置进入插值">
            <option value="linear">线性</option>
            <option value="bezier">贝塞尔</option>
            <option value="hold">定格</option>
          </select>
          <span class="graph-sep">离开</span>
          <select id="gr-out-type" name="gr-out-type" class="mini-select" title="单独设置离开插值">
            <option value="linear">线性</option>
            <option value="bezier">贝塞尔</option>
            <option value="hold">定格</option>
          </select>
        </div>
        <div class="graph-right">
          <button class="mini-btn" id="gr-ease">F9 缓入缓出</button>
          <button class="mini-btn" id="gr-linear">线性</button>
          <button class="mini-btn" id="gr-hold">定格</button>
          <button class="mini-btn" id="gr-sp-curve" title="为位置关键帧生成平滑空间路径手柄">空间曲线</button>
          <button class="mini-btn" id="gr-sp-lin" title="位置空间路径设为直线/尖角">空间直线</button>
          <span class="graph-info" id="graph-info"></span>
        </div>
      </div>
      <div class="graph-canvas-wrap" id="graph-canvas-wrap">
        <canvas id="graph-canvas"></canvas>
      </div>
    `;

    this.propSelect = this.container.querySelector('#graph-prop-sel')!;
    this.canvas = this.container.querySelector('#graph-canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.infoEl = this.container.querySelector('#graph-info')!;

    this.propSelect.addEventListener('change', () => {
      const [layerId, propPath] = this.propSelect.value.split('||');
      if (layerId && propPath) {
        this.store.graphTarget = { layerId, propPath, propLabel: this.propSelect.selectedOptions[0]?.textContent || '' };
        this.render();
      }
    });

    this.container.querySelector('#graph-mode-val')!.addEventListener('click', () => {
      this.store.graphMode = 'value';
      this.render();
    });
    this.container.querySelector('#graph-mode-spd')!.addEventListener('click', () => {
      this.store.graphMode = 'speed';
      this.render();
    });

    const getTargetKfs = () => {
      const target = this.resolveActiveProp();
      if (!target) return { target: null, kfs: [] as Keyframe[] };
      const sel = target.prop.keyframes.filter((k) => this.store.selectedKeyframeIds.has(k.id));
      return { target, kfs: sel.length > 0 ? sel : target.prop.keyframes };
    };

    const applyMode = (m: 'ease' | 'easeIn' | 'easeOut' | 'linear' | 'hold') => {
      const { kfs } = getTargetKfs();
      if (kfs.length === 0) return;
      this.store.beginEdit();
      kfs.forEach((k) => applyEasyEase(k, m));
      this.store.commitEdit();
    };
    this.container.querySelector('#gr-ease')!.addEventListener('click', () => applyMode('ease'));
    this.container.querySelector('#gr-linear')!.addEventListener('click', () => applyMode('linear'));
    this.container.querySelector('#gr-hold')!.addEventListener('click', () => applyMode('hold'));

    // Independent Entering / Leaving temporal interpolation (2.3)
    const inSel = this.container.querySelector('#gr-in-type') as HTMLSelectElement;
    const outSel = this.container.querySelector('#gr-out-type') as HTMLSelectElement;
    inSel.addEventListener('change', () => {
      const { kfs } = getTargetKfs();
      if (kfs.length === 0) return;
      this.store.beginEdit();
      const t = inSel.value as InterpolationType;
      for (const k of kfs) {
        k.inType = t;
        if (t === 'bezier') k.inHandle = [0.58, 1.0];
        if (t === 'linear') k.inHandle = [0.667, 0.667];
      }
      this.store.commitEdit();
    });
    outSel.addEventListener('change', () => {
      const { kfs } = getTargetKfs();
      if (kfs.length === 0) return;
      this.store.beginEdit();
      const t = outSel.value as InterpolationType;
      for (const k of kfs) {
        k.outType = t;
        if (t === 'bezier') k.outHandle = [0.42, 0.0];
        if (t === 'linear') k.outHandle = [0.333, 0.333];
      }
      this.store.commitEdit();
    });

    // Spatial Path Curve / Linear toggles (2.3)
    this.container.querySelector('#gr-sp-curve')!.addEventListener('click', () => {
      const { target, kfs } = getTargetKfs();
      if (!target || !target.isSpatial) { this.store.showToast('空间路径仅适用于位置/目标点属性'); return; }
      this.store.beginEdit();
      const all = target.prop.keyframes;
      for (const k of kfs) {
        const idx = all.indexOf(k);
        const prev = all[Math.max(0, idx - 1)].value as Vec3;
        const next = all[Math.min(all.length - 1, idx + 1)].value as Vec3;
        const dir: Vec3 = [(next[0] - prev[0]) * 0.22, (next[1] - prev[1]) * 0.22 - 45, ((next[2] ?? 0) - (prev[2] ?? 0)) * 0.22];
        k.spatialLinear = false;
        k.spatialBroken = false;
        k.outSpatialTangent = [dir[0], dir[1], dir[2]];
        k.inSpatialTangent = [-dir[0], -dir[1], -dir[2]];
      }
      this.store.commitEdit();
      this.store.showToast('已生成空间贝塞尔曲线手柄（可在画布直接拖拽调节，Alt 拖动可断开成尖角）');
    });
    this.container.querySelector('#gr-sp-lin')!.addEventListener('click', () => {
      const { target, kfs } = getTargetKfs();
      if (!target || !target.isSpatial) return;
      this.store.beginEdit();
      for (const k of kfs) {
        k.spatialLinear = true;
        k.inSpatialTangent = [0, 0, 0];
        k.outSpatialTangent = [0, 0, 0];
      }
      this.store.commitEdit();
      this.store.showToast('已将所选位置关键帧设为空间直线');
    });
  }

  private resolveActiveProp(): { layer: Layer; prop: AnimProp<any>; path: string; label: string; isSpatial: boolean } | null {
    const comp = this.store.getActiveComp();
    if (this.store.graphTarget) {
      const l = comp.layers.find((x) => x.id === this.store.graphTarget!.layerId);
      if (l) {
        const found = listLayerAnimProps(l).find((p) => p.path === this.store.graphTarget!.propPath);
        if (found && found.prop.type !== 'path') return { layer: l, ...found };
      }
    }
    const sel = this.store.getPrimarySelectedLayer() ?? comp.layers[0];
    if (!sel) return null;
    const props = listLayerAnimProps(sel).filter((p) => p.prop.type !== 'path');
    const anim = props.find((p) => p.prop.animated || p.prop.expressionEnabled) ?? props[0];
    return anim ? { layer: sel, ...anim } : null;
  }

  public syncPropDropdown(): void {
    const comp = this.store.getActiveComp();
    const selLayers = this.store.getSelectedLayers();
    const ordered = [
      ...selLayers,
      ...comp.layers.filter((l) => !this.store.selectedLayerIds.has(l.id)),
    ];
    const options: string[] = [];
    for (const l of ordered) {
      const isSel = this.store.selectedLayerIds.has(l.id);
      for (const p of listLayerAnimProps(l)) {
        if (p.prop.type === 'path') continue;
        const isCurrentTarget = this.store.graphTarget?.layerId === l.id && this.store.graphTarget?.propPath === p.path;
        if (isCurrentTarget || p.prop.animated || p.prop.expressionEnabled || (isSel && (p.path === 'position' || p.path === 'rotation' || p.path === 'opacity'))) {
          const badge = p.prop.expressionEnabled ? ' [fx]' : p.prop.animated ? ` (${p.prop.keyframes.length}帧)` : '';
          options.push(`<option value="${l.id}||${p.path}">${l.name} · ${p.label}${badge}</option>`);
        }
      }
    }
    this.propSelect.innerHTML = options.join('');
    const active = this.resolveActiveProp();
    if (active) {
      this.propSelect.value = `${active.layer.id}||${active.path}`;
    }
  }

  private getPlotRect(w: number, h: number) {
    return { x0: 54, y0: 18, x1: w - 18, y1: h - 26 };
  }

  private timeToX(t: number, rect: { x0: number; x1: number }, dur: number): number {
    return lerp(rect.x0, rect.x1, t / Math.max(0.1, dur));
  }

  private xToTime(x: number, rect: { x0: number; x1: number }, dur: number): number {
    return clamp(((x - rect.x0) / Math.max(1, rect.x1 - rect.x0)) * dur, 0, dur);
  }

  private valToY(v: number, rect: { y0: number; y1: number }): number {
    const f = (v - this.viewMinV) / Math.max(1e-4, this.viewMaxV - this.viewMinV);
    return lerp(rect.y1, rect.y0, f);
  }

  private yToVal(y: number, rect: { y0: number; y1: number }): number {
    const f = (rect.y1 - y) / Math.max(1, rect.y1 - rect.y0);
    return lerp(this.viewMinV, this.viewMaxV, f);
  }

  public render(): void {
    this.syncPropDropdown();
    this.container.querySelector('#graph-mode-val')?.classList.toggle('active', this.store.graphMode === 'value');
    this.container.querySelector('#graph-mode-spd')?.classList.toggle('active', this.store.graphMode === 'speed');

    const wrap = this.container.querySelector('#graph-canvas-wrap') as HTMLElement;
    if (!wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(120, wrap.clientWidth);
    const h = Math.max(100, wrap.clientHeight);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
    }

    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0f131a';
    ctx.fillRect(0, 0, w, h);

    const comp = this.store.getActiveComp();
    const target = this.resolveActiveProp();
    if (!target) {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      ctx.fillText('请选择一个带有关键帧或表达式的属性查看曲线', 24, 48);
      return;
    }

    const { layer, prop, path, isSpatial } = target;
    const rect = this.getPlotRect(w, h);
    const ec = new EvalContext(comp);
    const samples = 220;
    const isSpeed = this.store.graphMode === 'speed';

    // Sample curve(s) across comp.duration
    const numChannels = isSpeed ? 1 : prop.type === 'scalar' ? 1 : prop.type === 'vec2' ? 2 : 3;
    const kfCurves: number[][] = Array.from({ length: numChannels }, () => []);
    const exprCurves: number[][] = Array.from({ length: numChannels }, () => []);
    let minV = Infinity, maxV = -Infinity;

    const evalFinal = (t: number): PropValue => ec.evaluateProp(layer, prop, path, t, isSpatial);
    const evalBase = (t: number): PropValue => evaluateKeyframes(prop, t, isSpatial);

    for (let s = 0; s <= samples; s++) {
      const t = (s / samples) * comp.duration;
      if (isSpeed) {
        const spBase = evaluatePropertySpeed(evalBase, prop, t, isSpatial);
        const spFinal = prop.expressionEnabled ? evaluatePropertySpeed(evalFinal, prop, t, isSpatial) : spBase;
        kfCurves[0].push(spBase);
        exprCurves[0].push(spFinal);
        minV = Math.min(minV, spBase, spFinal);
        maxV = Math.max(maxV, spBase, spFinal);
      } else {
        const vb = evalBase(t);
        const vf = prop.expressionEnabled ? evalFinal(t) : vb;
        for (let c = 0; c < numChannels; c++) {
          const bNum = typeof vb === 'number' ? vb : Array.isArray(vb) ? Number(vb[c]) : 0;
          const fNum = typeof vf === 'number' ? vf : Array.isArray(vf) ? Number(vf[c]) : 0;
          kfCurves[c].push(bNum);
          exprCurves[c].push(fNum);
          minV = Math.min(minV, bNum, fNum);
          maxV = Math.max(maxV, bNum, fNum);
        }
      }
    }

    if (!Number.isFinite(minV) || !Number.isFinite(maxV)) { minV = 0; maxV = 100; }
    if (Math.abs(maxV - minV) < 1e-3) { minV -= 10; maxV += 10; }
    const pad = (maxV - minV) * 0.16;
    if (!this.drag) {
      this.viewMinV = isSpeed ? Math.min(0, minV - pad * 0.25) : minV - pad;
      this.viewMaxV = maxV + pad;
    }

    // Draw Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.fillStyle = '#64748b';
    ctx.font = '10px "Consolas", monospace';
    for (let i = 0; i <= 4; i++) {
      const f = i / 4;
      const y = lerp(rect.y1, rect.y0, f);
      const val = lerp(this.viewMinV, this.viewMaxV, f);
      ctx.beginPath(); ctx.moveTo(rect.x0, y); ctx.lineTo(rect.x1, y); ctx.stroke();
      ctx.fillText(val.toFixed(Math.abs(val) >= 100 ? 0 : 1), 6, y + 3);
    }
    const secStep = comp.duration > 12 ? 2 : 1;
    for (let s = 0; s <= comp.duration + 0.01; s += secStep) {
      const x = this.timeToX(s, rect, comp.duration);
      ctx.beginPath(); ctx.moveTo(x, rect.y0); ctx.lineTo(x, rect.y1); ctx.stroke();
      ctx.fillText(`${s}s`, x - 6, h - 8);
    }

    // Plot Base Keyframe Curves
    for (let c = 0; c < numChannels; c++) {
      ctx.strokeStyle = isSpeed ? '#38bdf8' : (numChannels === 1 ? CHANNEL_COLORS[0] : CHANNEL_COLORS[c + 1]);
      ctx.lineWidth = prop.expressionEnabled ? 1.2 : 2.0;
      ctx.globalAlpha = prop.expressionEnabled ? 0.42 : 1.0;
      ctx.beginPath();
      for (let s = 0; s <= samples; s++) {
        const x = lerp(rect.x0, rect.x1, s / samples);
        const y = this.valToY(kfCurves[c][s], rect);
        if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    // Plot Expression Final Evaluated Curve (2.4!)
    if (prop.expressionEnabled) {
      for (let c = 0; c < numChannels; c++) {
        ctx.strokeStyle = c === 0 ? '#22d3ee' : c === 1 ? '#a3e635' : '#f472b6';
        ctx.lineWidth = 2.1;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        for (let s = 0; s <= samples; s++) {
          const x = lerp(rect.x0, rect.x1, s / samples);
          const y = this.valToY(exprCurves[c][s], rect);
          if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Draw Interactive Keyframes & Cubic Bezier Handles!
    const kfs = prop.keyframes;
    if (prop.animated && kfs.length > 0) {
      for (let ki = 0; ki < kfs.length; ki++) {
        const kf = kfs[ki];
        const kx = this.timeToX(kf.time, rect, comp.duration);
        const val0 = isSpeed
          ? evaluatePropertySpeed(evalBase, prop, kf.time + 1e-3, isSpatial)
          : (typeof kf.value === 'number' ? kf.value : Array.isArray(kf.value) ? Number(kf.value[0]) : 0);
        const ky = this.valToY(val0, rect);
        const sel = this.store.selectedKeyframeIds.has(kf.id);

        // Draw outgoing & incoming Bezier handles (in BOTH Value Graph AND Speed Graph!)
        if (ki < kfs.length - 1 && kf.outType !== 'hold') {
          const nextKf = kfs[ki + 1];
          const nx = this.timeToX(nextKf.time, rect, comp.duration);
          const nVal0 = isSpeed
            ? evaluatePropertySpeed(evalBase, prop, Math.max(kf.time, nextKf.time - 1e-3), isSpatial)
            : (typeof nextKf.value === 'number' ? nextKf.value : Array.isArray(nextKf.value) ? Number(nextKf.value[0]) : 0);
          const ny = this.valToY(nVal0, rect);

          const outHX = lerp(kx, nx, kf.outHandle[0]);
          const outHY = isSpeed ? ky : lerp(ky, ny, kf.outHandle[1]);
          ctx.strokeStyle = 'rgba(250,204,21,0.75)';
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(outHX, outHY); ctx.stroke();
          ctx.fillStyle = '#fde047';
          ctx.beginPath(); ctx.arc(outHX, outHY, 4, 0, Math.PI * 2); ctx.fill();

          const inHX = lerp(kx, nx, nextKf.inHandle[0]);
          const inHY = isSpeed ? ny : lerp(ky, ny, nextKf.inHandle[1]);
          ctx.strokeStyle = 'rgba(56,189,248,0.75)';
          ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(inHX, inHY); ctx.stroke();
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath(); ctx.arc(inHX, inHY, 4, 0, Math.PI * 2); ctx.fill();
        }

        // Keyframe node
        ctx.fillStyle = sel ? '#38bdf8' : '#f59e0b';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(kx, ky, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }

    // Playhead vertical line
    const phX = this.timeToX(this.store.currentTime, rect, comp.duration);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(phX, rect.y0); ctx.lineTo(phX, rect.y1); ctx.stroke();

    this.infoEl.textContent = isSpeed
      ? (isSpatial ? '沿三维/二维运动路径的实际速率 (单位/秒)' : '变化速率 (单位/秒)')
      : (prop.expressionEnabled ? '虚线 = 表达式实时最终曲线 · 实线 = 关键帧基线' : '拖动关键帧或黄/蓝手柄编辑时间缓动曲线');
  }

  private bindEvents(): void {
    const getPos = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.store.isExportMode) return;
      const target = this.resolveActiveProp();
      if (!target) return;
      const comp = this.store.getActiveComp();
      const { x, y, w, h } = getPos(e);
      const rect = this.getPlotRect(w, h);
      const isSpeed = this.store.graphMode === 'speed';
      const kfs = target.prop.keyframes;

      if (target.prop.animated) {
        const evalBase = (t: number) => evaluateKeyframes(target.prop, t, target.isSpatial);
        // Test Bezier handles first (in BOTH Value & Speed Graph!)
        for (let ki = 0; ki < kfs.length - 1; ki++) {
          const k0 = kfs[ki], k1 = kfs[ki + 1];
          if (k0.outType === 'hold') continue;
          const kx = this.timeToX(k0.time, rect, comp.duration);
          const nx = this.timeToX(k1.time, rect, comp.duration);
          const v0 = isSpeed
            ? evaluatePropertySpeed(evalBase, target.prop, k0.time + 1e-3, target.isSpatial)
            : (typeof k0.value === 'number' ? k0.value : Array.isArray(k0.value) ? Number(k0.value[0]) : 0);
          const v1 = isSpeed
            ? evaluatePropertySpeed(evalBase, target.prop, Math.max(k0.time, k1.time - 1e-3), target.isSpatial)
            : (typeof k1.value === 'number' ? k1.value : Array.isArray(k1.value) ? Number(k1.value[0]) : 0);
          const ky = this.valToY(v0, rect), ny = this.valToY(v1, rect);

          const outHX = lerp(kx, nx, k0.outHandle[0]), outHY = isSpeed ? ky : lerp(ky, ny, k0.outHandle[1]);
          if (Math.hypot(x - outHX, y - outHY) < 10) {
            this.store.beginEdit();
            k0.outType = 'bezier';
            this.drag = { kind: 'outHandle', kfIdx: ki, channel: 0, segNextIdx: ki + 1 };
            return;
          }
          const inHX = lerp(kx, nx, k1.inHandle[0]), inHY = isSpeed ? ny : lerp(ky, ny, k1.inHandle[1]);
          if (Math.hypot(x - inHX, y - inHY) < 10) {
            this.store.beginEdit();
            k1.inType = 'bezier';
            this.drag = { kind: 'inHandle', kfIdx: ki + 1, channel: 0, segNextIdx: ki };
            return;
          }
        }
      }

      // Test Keyframe points
      if (target.prop.animated) {
        const evalBase = (t: number) => evaluateKeyframes(target.prop, t, target.isSpatial);
        for (let ki = 0; ki < kfs.length; ki++) {
          const kf = kfs[ki];
          const kx = this.timeToX(kf.time, rect, comp.duration);
          const v0 = isSpeed
            ? evaluatePropertySpeed(evalBase, target.prop, kf.time + 1e-3, target.isSpatial)
            : (typeof kf.value === 'number' ? kf.value : Array.isArray(kf.value) ? Number(kf.value[0]) : 0);
          const ky = this.valToY(v0, rect);
          if (Math.hypot(x - kx, y - ky) < 11) {
            if (!e.shiftKey) this.store.selectedKeyframeIds.clear();
            this.store.selectedKeyframeIds.add(kf.id);
            this.store.beginEdit();
            this.drag = { kind: 'kf', kfIdx: ki, channel: 0 };
            this.render();
            return;
          }
        }
      }

      // Otherwise scrub time
      this.drag = { kind: 'scrub', kfIdx: -1, channel: 0 };
      this.store.setTime(this.xToTime(x, rect, comp.duration));
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const target = this.resolveActiveProp();
      if (!target) return;
      const comp = this.store.getActiveComp();
      const { x, y, w, h } = getPos(e);
      const rect = this.getPlotRect(w, h);

      if (this.drag.kind === 'scrub') {
        this.store.setTime(this.xToTime(x, rect, comp.duration));
        return;
      }

      const kfs = target.prop.keyframes;
      if (this.drag.kind === 'kf') {
        const kf = kfs[this.drag.kfIdx];
        if (!kf) return;
        kf.time = this.xToTime(x, rect, comp.duration);
        if (this.store.graphMode === 'value') {
          const nv = this.yToVal(y, rect);
          if (typeof kf.value === 'number') kf.value = nv;
          else if (Array.isArray(kf.value)) kf.value[0] = nv;
        }
        sortKeyframes(target.prop);
        this.drag.kfIdx = kfs.indexOf(kf);
        this.store.notify('full');
      } else if (this.drag.kind === 'outHandle') {
        const k0 = kfs[this.drag.kfIdx], k1 = kfs[this.drag.segNextIdx!];
        if (!k0 || !k1) return;
        const kx = this.timeToX(k0.time, rect, comp.duration);
        const nx = this.timeToX(k1.time, rect, comp.duration);
        const fx = clamp((x - kx) / Math.max(1, nx - kx), 0.02, 0.98);
        if (this.store.graphMode === 'speed') {
          k0.outHandle = [fx, 0.0];
        } else {
          const v0 = typeof k0.value === 'number' ? k0.value : Number(k0.value[0]);
          const v1 = typeof k1.value === 'number' ? k1.value : Number(k1.value[0]);
          const ky = this.valToY(v0, rect), ny = this.valToY(v1, rect);
          const fy = Math.abs(ny - ky) > 2 ? clamp((y - ky) / (ny - ky), -0.8, 1.8) : 0.333;
          k0.outHandle = [fx, fy];
        }
        this.store.notify('full');
      } else if (this.drag.kind === 'inHandle') {
        const k1 = kfs[this.drag.kfIdx], k0 = kfs[this.drag.segNextIdx!];
        if (!k0 || !k1) return;
        const kx = this.timeToX(k0.time, rect, comp.duration);
        const nx = this.timeToX(k1.time, rect, comp.duration);
        const fx = clamp((x - kx) / Math.max(1, nx - kx), 0.02, 0.98);
        if (this.store.graphMode === 'speed') {
          k1.inHandle = [fx, 1.0];
        } else {
          const v0 = typeof k0.value === 'number' ? k0.value : Number(k0.value[0]);
          const v1 = typeof k1.value === 'number' ? k1.value : Number(k1.value[0]);
          const ky = this.valToY(v0, rect), ny = this.valToY(v1, rect);
          const fy = Math.abs(ny - ky) > 2 ? clamp((y - ky) / (ny - ky), -0.8, 1.8) : 0.667;
          k1.inHandle = [fx, fy];
        }
        this.store.notify('full');
      }
    });

    window.addEventListener('pointerup', () => {
      if (!this.drag) return;
      const kind = this.drag.kind;
      this.drag = null;
      if (kind !== 'scrub') this.store.commitEdit();
    });
  }
}
