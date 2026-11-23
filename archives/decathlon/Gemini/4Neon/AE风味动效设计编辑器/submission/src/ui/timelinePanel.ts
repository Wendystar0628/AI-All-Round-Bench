import { AnimProp, BlendMode, Keyframe, Layer, TrackMatteMode } from '../core/types';
import { clamp, deepClone, genId } from '../core/math';
import {
  applyEasyEase, scaleSelectedKeyframes, setPropValueAtTime, sortKeyframes, togglePropAnimation,
} from '../core/animation';
import { setLayerParentPreserveVisual } from '../core/project';
import { EvalContext } from '../core/expressions';
import { audioEngine } from '../audio/audioEngine';
import { EditorStore, listLayerAnimProps } from './store';

interface RowDescriptor {
  kind: 'layer' | 'prop';
  layer: Layer;
  propPath?: string;
  propLabel?: string;
  prop?: AnimProp<any>;
  isSpatial?: boolean;
}

const ROW_H = 26;
const RULER_H = 34;

export class TimelinePanel {
  private container: HTMLElement;
  private store: EditorStore;
  private headerListEl!: HTMLElement;
  private trackCanvas!: HTMLCanvasElement;
  private trackCtx!: CanvasRenderingContext2D;
  private timeDisplayEl!: HTMLElement;
  private playBtnEl!: HTMLButtonElement;
  private rows: RowDescriptor[] = [];

  private dragState: {
    mode: 'scrub' | 'workStart' | 'workEnd' | 'barMove' | 'barIn' | 'barOut' | 'kfDrag' | 'kfStretch' | 'marquee';
    startX: number;
    startY: number;
    curX: number;
    curY: number;
    layerId?: string;
    origIn?: number;
    origOut?: number;
    origStart?: number;
    origKfTimes?: Map<string, number>;
    pivotTime?: number;
    origSpan?: number;
  } | null = null;

  private dragReorderLayerId: string | null = null;

  constructor(container: HTMLElement, store: EditorStore) {
    this.container = container;
    this.store = store;
    this.buildDOM();
    this.bindCanvasEvents();
  }

  private buildDOM(): void {
    this.container.innerHTML = `
      <div class="tl-toolbar">
        <div class="tl-transport">
          <button class="icon-btn" id="tl-start" title="跳至起始 (Home)">⏮</button>
          <button class="icon-btn" id="tl-prev-kf" title="上一关键帧 (J)">◆◀</button>
          <button class="icon-btn" id="tl-prev-fr" title="上一帧 (←)">◀</button>
          <button class="icon-btn primary-play" id="tl-play" title="播放/暂停 (空格)">▶</button>
          <button class="icon-btn" id="tl-next-fr" title="下一帧 (→)">▶|</button>
          <button class="icon-btn" id="tl-next-kf" title="下一关键帧 (K)">▶◆</button>
          <span class="tl-timecode" id="tl-timecode">00:00:00</span>
        </div>
        <div class="tl-kf-tools">
          <button class="mini-btn" id="tl-ease" title="缓入缓出 (F9)">F9 缓入缓出</button>
          <button class="mini-btn" id="tl-linear" title="设为线性插值">线性</button>
          <button class="mini-btn" id="tl-hold" title="设为定格关键帧">定格</button>
          <button class="mini-btn" id="tl-loop" title="循环工作区">⟳ 循环</button>
          <button class="mini-btn" id="tl-snap" title="吸附帧/播放头">🧲 吸附</button>
          <button class="mini-btn" id="tl-mb" title="合成运动模糊总开关">⚡ 运动模糊</button>
          <span class="tl-zoom-wrap">缩放 <input type="range" id="tl-zoom" min="24" max="240" value="68" /></span>
        </div>
      </div>
      <div class="tl-body">
        <div class="tl-headers">
          <div class="tl-headers-head">
            <span class="col-icons">显/锁/独/3D/糊</span>
            <span class="col-name">图层名称</span>
            <span class="col-mode">混合</span>
            <span class="col-parent">父级</span>
          </div>
          <div class="tl-headers-rows" id="tl-headers-rows"></div>
        </div>
        <div class="tl-tracks" id="tl-tracks-wrap">
          <canvas id="tl-canvas"></canvas>
        </div>
      </div>
    `;

    this.headerListEl = this.container.querySelector('#tl-headers-rows')!;
    this.trackCanvas = this.container.querySelector('#tl-canvas')!;
    this.trackCtx = this.trackCanvas.getContext('2d')!;
    this.timeDisplayEl = this.container.querySelector('#tl-timecode')!;
    this.playBtnEl = this.container.querySelector('#tl-play')!;

    this.container.querySelector('#tl-start')!.addEventListener('click', () => this.store.setTime(this.store.getActiveComp().workAreaStart));
    this.container.querySelector('#tl-prev-fr')!.addEventListener('click', () => this.store.stepFrames(-1));
    this.container.querySelector('#tl-next-fr')!.addEventListener('click', () => this.store.stepFrames(1));
    this.container.querySelector('#tl-prev-kf')!.addEventListener('click', () => this.jumpKeyframe(-1));
    this.container.querySelector('#tl-next-kf')!.addEventListener('click', () => this.jumpKeyframe(1));
    this.playBtnEl.addEventListener('click', () => this.store.togglePlay());

    this.container.querySelector('#tl-ease')!.addEventListener('click', () => this.applyEaseToSelected('ease'));
    this.container.querySelector('#tl-linear')!.addEventListener('click', () => this.applyEaseToSelected('linear'));
    this.container.querySelector('#tl-hold')!.addEventListener('click', () => this.applyEaseToSelected('hold'));

    const loopBtn = this.container.querySelector('#tl-loop')!;
    loopBtn.addEventListener('click', () => { this.store.loopWorkArea = !this.store.loopWorkArea; this.store.notify('ui'); });

    const snapBtn = this.container.querySelector('#tl-snap')!;
    snapBtn.addEventListener('click', () => { this.store.snapTimeline = !this.store.snapTimeline; this.store.notify('ui'); });

    const mbBtn = this.container.querySelector('#tl-mb')!;
    mbBtn.addEventListener('click', () => {
      const comp = this.store.getActiveComp();
      this.store.beginEdit();
      comp.motionBlur = !comp.motionBlur;
      this.store.commitEdit(false);
    });

    const zoomInput = this.container.querySelector('#tl-zoom') as HTMLInputElement;
    zoomInput.addEventListener('input', () => {
      this.store.timelineZoom = Number(zoomInput.value);
      this.renderCanvas();
    });

    // Sync vertical scroll between left headers and right track canvas
    this.headerListEl.addEventListener('scroll', () => this.renderCanvas());
  }

  public jumpKeyframe(dir: -1 | 1): void {
    const comp = this.store.getActiveComp();
    const layers = this.store.selectedLayerIds.size > 0 ? this.store.getSelectedLayers() : comp.layers;
    const times = new Set<number>();
    for (const l of layers) {
      for (const item of listLayerAnimProps(l)) {
        if (item.prop.animated) {
          for (const k of item.prop.keyframes) times.add(k.time);
        }
      }
    }
    const sorted = Array.from(times).sort((a, b) => a - b);
    const t = this.store.currentTime;
    if (dir > 0) {
      const next = sorted.find((x) => x > t + 1e-3);
      if (next !== undefined) this.store.setTime(next);
    } else {
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (sorted[i] < t - 1e-3) { this.store.setTime(sorted[i]); return; }
      }
    }
  }

  public applyEaseToSelected(mode: 'ease' | 'easeIn' | 'easeOut' | 'linear' | 'hold'): void {
    const comp = this.store.getActiveComp();
    let count = 0;
    this.store.beginEdit();
    for (const l of comp.layers) {
      for (const item of listLayerAnimProps(l)) {
        for (const k of item.prop.keyframes) {
          if (this.store.selectedKeyframeIds.has(k.id)) {
            applyEasyEase(k, mode);
            count++;
          }
        }
      }
    }
    // If no keyframes explicitly selected, apply to keyframes at current time on selected layers
    if (count === 0) {
      for (const l of this.store.getSelectedLayers()) {
        for (const item of listLayerAnimProps(l)) {
          for (const k of item.prop.keyframes) {
            if (Math.abs(k.time - this.store.currentTime) < 0.04) {
              applyEasyEase(k, mode);
              count++;
            }
          }
        }
      }
    }
    if (count > 0) {
      this.store.commitEdit();
      const names = { ease: '缓入缓出 (F9)', easeIn: '缓入', easeOut: '缓出', linear: '线性', hold: '定格' };
      this.store.showToast(`已将 ${count} 个关键帧设为 ${names[mode]}`);
    }
  }

  public copySelectedKeyframes(): void {
    const comp = this.store.getActiveComp();
    const collected: Array<{ propPath: string; time: number; kf: Keyframe }> = [];
    for (const l of comp.layers) {
      for (const item of listLayerAnimProps(l)) {
        for (const k of item.prop.keyframes) {
          if (this.store.selectedKeyframeIds.has(k.id)) {
            collected.push({ propPath: item.path, time: k.time, kf: deepClone(k) });
          }
        }
      }
    }
    if (collected.length === 0) return;
    const minT = Math.min(...collected.map((c) => c.time));
    this.store.clipboardKeyframes = collected.map((c) => ({
      propPath: c.propPath,
      relTime: c.time - minT,
      kf: c.kf,
    }));
    this.store.showToast(`已复制 ${collected.length} 个关键帧`);
  }

  public pasteKeyframes(): void {
    const clip = this.store.clipboardKeyframes;
    const layer = this.store.getPrimarySelectedLayer();
    if (!layer || clip.length === 0) return;
    this.store.beginEdit();
    const props = listLayerAnimProps(layer);
    const newIds: string[] = [];
    for (const item of clip) {
      const target = props.find((p) => p.path === item.propPath);
      if (!target) continue;
      target.prop.animated = true;
      const copy = deepClone(item.kf);
      copy.id = genId('kf');
      copy.time = clamp(this.store.currentTime + item.relTime, 0, this.store.getActiveComp().duration);
      target.prop.keyframes.push(copy);
      sortKeyframes(target.prop);
      newIds.push(copy.id);
    }
    this.store.selectedKeyframeIds = new Set(newIds);
    this.store.commitEdit();
    this.store.showToast(`已粘贴 ${newIds.length} 个关键帧`);
  }

  public deleteSelectedKeyframes(): boolean {
    if (this.store.selectedKeyframeIds.size === 0) return false;
    const comp = this.store.getActiveComp();
    let removed = 0;
    this.store.beginEdit();
    for (const l of comp.layers) {
      for (const item of listLayerAnimProps(l)) {
        const before = item.prop.keyframes.length;
        item.prop.keyframes = item.prop.keyframes.filter((k) => !this.store.selectedKeyframeIds.has(k.id));
        removed += before - item.prop.keyframes.length;
      }
    }
    this.store.selectedKeyframeIds.clear();
    if (removed > 0) {
      this.store.commitEdit();
      this.store.showToast(`已删除 ${removed} 个关键帧`);
      return true;
    }
    return false;
  }

  private rebuildRowList(): void {
    const comp = this.store.getActiveComp();
    this.rows = [];
    for (const l of comp.layers) {
      this.rows.push({ kind: 'layer', layer: l });
      if (this.store.expandedLayerIds.has(l.id)) {
        const props = listLayerAnimProps(l);
        // Show all transform props + any animated/expression prop
        for (const p of props) {
          const isBasic = p.path === 'position' || p.path === 'scale' || p.path === 'rotation' || p.path === 'opacity';
          if (isBasic || p.prop.animated || p.prop.expressionEnabled) {
            this.rows.push({ kind: 'prop', layer: l, propPath: p.path, propLabel: p.label, prop: p.prop, isSpatial: p.isSpatial });
          }
        }
      }
    }
  }

  public updateFull(): void {
    const comp = this.store.getActiveComp();
    this.updateTransportDisplay();
    this.rebuildRowList();
    this.renderHeaderRows(comp);
    this.renderCanvas();
  }

  public updatePlayheadOnly(): void {
    this.updateTransportDisplay();
    this.renderCanvas();
  }

  private updateTransportDisplay(): void {
    const comp = this.store.getActiveComp();
    const t = this.store.currentTime;
    const sec = Math.floor(t);
    const fr = Math.floor((t - sec) * comp.fps + 0.001);
    const min = Math.floor(sec / 60);
    const remSec = sec % 60;
    this.timeDisplayEl.textContent = `${String(min).padStart(2, '0')}:${String(remSec).padStart(2, '0')}:${String(fr).padStart(2, '0')} (${t.toFixed(2)}s)`;
    this.playBtnEl.textContent = this.store.isPlaying ? '⏸' : '▶';
    this.playBtnEl.classList.toggle('playing', this.store.isPlaying);
    this.container.querySelector('#tl-loop')?.classList.toggle('active', this.store.loopWorkArea);
    this.container.querySelector('#tl-snap')?.classList.toggle('active', this.store.snapTimeline);
    this.container.querySelector('#tl-mb')?.classList.toggle('active', comp.motionBlur);
  }

  private renderHeaderRows(comp: ReturnType<EditorStore['getActiveComp']>): void {
    const scrollTop = this.headerListEl.scrollTop;
    this.headerListEl.innerHTML = '';

    for (const row of this.rows) {
      const el = document.createElement('div');
      if (row.kind === 'layer') {
        const l = row.layer;
        const sel = this.store.selectedLayerIds.has(l.id);
        const exp = this.store.expandedLayerIds.has(l.id);
        el.className = `tl-row tl-row-layer${sel ? ' selected' : ''}`;
        el.draggable = true;
        el.dataset.layerId = l.id;

        const parentOpts = [`<option value="">无父级</option>`]
          .concat(comp.layers.filter((o) => o.id !== l.id).map((o) => `<option value="${o.id}" ${l.parentId === o.id ? 'selected' : ''}>${o.name}</option>`))
          .join('');

        const blendOpts: Array<[BlendMode, string]> = [
          ['normal', '正常'], ['add', '相加'], ['screen', '滤色'], ['multiply', '正片叠底'], ['overlay', '叠加'],
        ];
        const blendHtml = blendOpts.map(([k, lbl]) => `<option value="${k}" ${l.blendMode === k ? 'selected' : ''}>${lbl}</option>`).join('');

        el.innerHTML = `
          <div class="col-icons">
            <button class="tl-sw ${l.visible ? 'on' : ''}" data-act="vis" title="显示/隐藏">👁</button>
            <button class="tl-sw ${l.locked ? 'on warn' : ''}" data-act="lock" title="锁定">🔒</button>
            <button class="tl-sw ${l.solo ? 'on solo' : ''}" data-act="solo" title="独奏">S</button>
            <button class="tl-sw ${l.is3D ? 'on cyan' : ''}" data-act="3d" title="三维图层开关">3D</button>
            <button class="tl-sw ${l.motionBlur ? 'on amber' : ''}" data-act="mb" title="图层运动模糊">糊</button>
          </div>
          <div class="col-name">
            <button class="tl-exp" data-act="exp">${exp ? '▾' : '▸'}</button>
            <span class="tl-color-dot" style="background:${l.labelColor}"></span>
            <span class="tl-layer-name" title="${l.name}">${l.name}</span>
          </div>
          <div class="col-mode">
            <select class="tl-mini-sel" data-act="blend">${blendHtml}</select>
          </div>
          <div class="col-parent">
            <select class="tl-mini-sel" data-act="parent">${parentOpts}</select>
          </div>
        `;

        el.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          if (target.closest('button, select, input')) return;
          this.store.selectLayer(l.id, e.shiftKey || e.ctrlKey || e.metaKey);
        });

        // Double click to rename layer inline (2.1)
        const nameSpan = el.querySelector('.tl-layer-name') as HTMLElement;
        nameSpan.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.value = l.name;
          inp.className = 'tl-rename-input';
          nameSpan.replaceWith(inp);
          inp.focus(); inp.select();
          const finish = () => {
            const v = inp.value.trim();
            if (v && v !== l.name) {
              this.store.beginEdit();
              l.name = v;
              this.store.commitEdit(false);
            } else {
              this.store.notify('ui');
            }
          };
          inp.addEventListener('blur', finish);
          inp.addEventListener('keydown', (ke) => {
            if (ke.key === 'Enter') inp.blur();
            if (ke.key === 'Escape') this.store.notify('ui');
          });
        });

        // Drag reorder layers
        el.addEventListener('dragstart', () => { this.dragReorderLayerId = l.id; });
        el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
        el.addEventListener('dragleave', () => { el.classList.remove('drag-over'); });
        el.addEventListener('drop', (e) => {
          e.preventDefault();
          el.classList.remove('drag-over');
          if (!this.dragReorderLayerId || this.dragReorderLayerId === l.id) return;
          const fromIdx = comp.layers.findIndex((x) => x.id === this.dragReorderLayerId);
          const toIdx = comp.layers.findIndex((x) => x.id === l.id);
          if (fromIdx >= 0 && toIdx >= 0) {
            this.store.beginEdit();
            const [moved] = comp.layers.splice(fromIdx, 1);
            comp.layers.splice(toIdx, 0, moved);
            this.store.commitEdit();
          }
          this.dragReorderLayerId = null;
        });

        el.querySelector('[data-act="vis"]')!.addEventListener('click', () => { this.store.beginEdit(); l.visible = !l.visible; this.store.commitEdit(); });
        el.querySelector('[data-act="lock"]')!.addEventListener('click', () => { this.store.beginEdit(); l.locked = !l.locked; this.store.commitEdit(false); });
        el.querySelector('[data-act="solo"]')!.addEventListener('click', () => { this.store.beginEdit(); l.solo = !l.solo; this.store.commitEdit(false); });
        el.querySelector('[data-act="3d"]')!.addEventListener('click', () => {
          if (l.type === 'camera' || l.type === 'light' || l.type === 'mesh3d' || l.type === 'particle' || l.type === 'field') return;
          this.store.beginEdit();
          l.is3D = !l.is3D;
          // Convert pos cleanly between 2D comp pixels & 3D centered world space
          if (l.is3D) {
            l.transform.position.value = [l.transform.position.value[0] - comp.width * 0.5, comp.height * 0.5 - l.transform.position.value[1], 0];
          } else {
            l.transform.position.value = [l.transform.position.value[0] + comp.width * 0.5, comp.height * 0.5 - l.transform.position.value[1], 0];
          }
          this.store.commitEdit();
        });
        el.querySelector('[data-act="mb"]')!.addEventListener('click', () => { this.store.beginEdit(); l.motionBlur = !l.motionBlur; this.store.commitEdit(false); });
        el.querySelector('[data-act="exp"]')!.addEventListener('click', () => {
          if (this.store.expandedLayerIds.has(l.id)) this.store.expandedLayerIds.delete(l.id);
          else this.store.expandedLayerIds.add(l.id);
          this.store.notify('ui');
        });
        (el.querySelector('[data-act="blend"]') as HTMLSelectElement).addEventListener('change', (ev) => {
          this.store.beginEdit();
          l.blendMode = (ev.target as HTMLSelectElement).value as BlendMode;
          this.store.commitEdit(false);
        });
        (el.querySelector('[data-act="parent"]') as HTMLSelectElement).addEventListener('change', (ev) => {
          const pid = (ev.target as HTMLSelectElement).value || null;
          this.store.beginEdit();
          setLayerParentPreserveVisual(comp, l, pid, this.store.currentTime);
          this.store.commitEdit();
        });
      } else {
        // Expanded animated property row
        const p = row.prop!;
        const isGraphTarget = this.store.graphTarget?.layerId === row.layer.id && this.store.graphTarget?.propPath === row.propPath;
        el.className = `tl-row tl-row-prop${isGraphTarget ? ' graph-active' : ''}`;
        el.innerHTML = `
          <div class="tl-prop-indent">
            <button class="tl-sw ${p.animated ? 'on cyan' : ''}" data-act="watch" title="开启/关闭关键帧">⏱</button>
            <button class="tl-sw" data-act="addkf" title="在当前时刻添加/移除关键帧">◆</button>
            <span class="tl-prop-label">${row.propLabel}</span>
            ${p.expressionEnabled ? '<span class="fx-pill">fx</span>' : ''}
            <button class="tl-graph-btn" data-act="graph" title="在曲线视图中编辑">📈</button>
          </div>
        `;
        el.querySelector('[data-act="watch"]')!.addEventListener('click', () => {
          const ec = new EvalContext(comp);
          const curVal = ec.evaluateProp(row.layer, p, row.propPath!, this.store.currentTime, row.isSpatial);
          this.store.beginEdit();
          togglePropAnimation(p, this.store.currentTime, curVal);
          this.store.commitEdit();
        });
        el.querySelector('[data-act="addkf"]')!.addEventListener('click', () => {
          const ec = new EvalContext(comp);
          const curVal = ec.evaluateProp(row.layer, p, row.propPath!, this.store.currentTime, row.isSpatial);
          this.store.beginEdit();
          p.animated = true;
          const idx = p.keyframes.findIndex((k) => Math.abs(k.time - this.store.currentTime) < 0.015);
          if (idx >= 0) p.keyframes.splice(idx, 1);
          else setPropValueAtTime(p, this.store.currentTime, curVal);
          this.store.commitEdit();
        });
        el.querySelector('[data-act="graph"]')!.addEventListener('click', () => {
          this.store.graphTarget = { layerId: row.layer.id, propPath: row.propPath!, propLabel: `${row.layer.name} · ${row.propLabel}` };
          this.store.bottomTab = 'graph';
          this.store.notify('ui');
        });
      }
      this.headerListEl.appendChild(el);
    }
    this.headerListEl.scrollTop = scrollTop;
  }

  private timeToX(t: number): number {
    return 14 + t * this.store.timelineZoom - this.store.timelineScrollX;
  }

  private xToTime(x: number): number {
    return (x - 14 + this.store.timelineScrollX) / this.store.timelineZoom;
  }

  private snapTime(t: number): number {
    const comp = this.store.getActiveComp();
    let res = clamp(t, 0, comp.duration);
    if (!this.store.snapTimeline) return res;
    // Snap to frame
    res = Math.round(res * comp.fps) / comp.fps;
    // Snap to playhead if within 6px
    if (Math.abs(this.timeToX(res) - this.timeToX(this.store.currentTime)) < 6) {
      res = this.store.currentTime;
    }
    return clamp(res, 0, comp.duration);
  }

  public renderCanvas(): void {
    const wrap = this.container.querySelector('#tl-tracks-wrap') as HTMLElement;
    if (!wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(100, wrap.clientWidth);
    const h = Math.max(100, wrap.clientHeight);
    if (this.trackCanvas.width !== Math.round(w * dpr) || this.trackCanvas.height !== Math.round(h * dpr)) {
      this.trackCanvas.width = Math.round(w * dpr);
      this.trackCanvas.height = Math.round(h * dpr);
      this.trackCanvas.style.width = `${w}px`;
      this.trackCanvas.style.height = `${h}px`;
    }

    const ctx = this.trackCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#12151c';
    ctx.fillRect(0, 0, w, h);

    const comp = this.store.getActiveComp();
    const scrollY = this.headerListEl.scrollTop;

    // 1) Vertical second grid lines
    const secStep = this.store.timelineZoom < 40 ? 2 : this.store.timelineZoom > 130 ? 0.5 : 1;
    for (let s = 0; s <= comp.duration + 0.01; s += secStep) {
      const x = this.timeToX(s);
      if (x < 0 || x > w) continue;
      ctx.strokeStyle = Math.abs(s % 1) < 1e-3 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.025)';
      ctx.beginPath(); ctx.moveTo(x, RULER_H); ctx.lineTo(x, h); ctx.stroke();
    }

    // 2) Rows (In/Out bars, Audio Waveforms, Keyframe Diamonds)
    ctx.save();
    ctx.beginPath(); ctx.rect(0, RULER_H, w, h - RULER_H); ctx.clip();

    for (let i = 0; i < this.rows.length; i++) {
      const y = RULER_H + i * ROW_H - scrollY;
      if (y + ROW_H < RULER_H || y > h) continue;
      const row = this.rows[i];

      // Alternating row tint
      ctx.fillStyle = row.kind === 'prop' ? 'rgba(15,23,42,0.45)' : (i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent');
      if (row.kind === 'layer' && this.store.selectedLayerIds.has(row.layer.id)) {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.08)';
      }
      ctx.fillRect(0, y, w, ROW_H);
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.beginPath(); ctx.moveTo(0, y + ROW_H); ctx.lineTo(w, y + ROW_H); ctx.stroke();

      if (row.kind === 'layer') {
        const l = row.layer;
        const x0 = this.timeToX(l.inPoint);
        const x1 = this.timeToX(l.outPoint);
        const bw = Math.max(6, x1 - x0);

        // Layer In/Out Duration Bar
        ctx.fillStyle = l.visible ? `${l.labelColor}38` : 'rgba(100,116,139,0.16)';
        ctx.strokeStyle = this.store.selectedLayerIds.has(l.id) ? '#f59e0b' : `${l.labelColor}aa`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x0, y + 4, bw, ROW_H - 8, 3);
        ctx.fill(); ctx.stroke();

        // Trim handles on left/right edges
        ctx.fillStyle = l.labelColor;
        ctx.fillRect(x0, y + 5, 3, ROW_H - 10);
        ctx.fillRect(x0 + bw - 3, y + 5, 3, ROW_H - 10);

        // Audio layer: draw deterministic synchronized waveform & beat markers! (2.15, 4.2)
        if (l.type === 'audio' && l.audio) {
          const midY = y + ROW_H * 0.5;
          ctx.fillStyle = l.audio.muted ? 'rgba(148,163,184,0.3)' : 'rgba(56, 210, 120, 0.65)';
          const pxStep = 3;
          for (let px = Math.max(0, x0 + 4); px < Math.min(w, x1 - 4); px += pxStep) {
            const st = this.xToTime(px);
            const amp = audioEngine.sampleWaveformForTimeline(comp, l, st);
            const barH = Math.max(1, amp * (ROW_H - 10));
            ctx.fillRect(px, midY - barH * 0.5, 2, barH);
          }
          // Event onset markers
          ctx.fillStyle = '#fde047';
          for (const ev of l.audio.events) {
            const ex = this.timeToX(ev.time);
            if (ex >= x0 && ex <= x1) {
              ctx.beginPath(); ctx.arc(ex, midY, 2.5, 0, Math.PI * 2); ctx.fill();
            }
          }
        } else {
          // Summary keyframe dots on collapsed layer bar
          const allProps = listLayerAnimProps(l);
          const seenT = new Set<number>();
          for (const item of allProps) {
            if (!item.prop.animated) continue;
            for (const kf of item.prop.keyframes) {
              const bucket = Math.round(kf.time * 100);
              if (seenT.has(bucket)) continue;
              seenT.add(bucket);
              const kx = this.timeToX(kf.time);
              this.drawKeyframeGlyph(ctx, kx, y + ROW_H * 0.5, kf, this.store.selectedKeyframeIds.has(kf.id), 3.6);
            }
          }
        }
      } else if (row.prop && row.prop.animated) {
        // Expanded property row keyframes
        for (const kf of row.prop.keyframes) {
          const kx = this.timeToX(kf.time);
          this.drawKeyframeGlyph(ctx, kx, y + ROW_H * 0.5, kf, this.store.selectedKeyframeIds.has(kf.id), 5);
        }
      }
    }

    // Marquee selection box
    if (this.dragState?.mode === 'marquee') {
      const mx = Math.min(this.dragState.startX, this.dragState.curX);
      const my = Math.min(this.dragState.startY, this.dragState.curY);
      const mw = Math.abs(this.dragState.curX - this.dragState.startX);
      const mh = Math.abs(this.dragState.curY - this.dragState.startY);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1;
      ctx.fillRect(mx, my, mw, mh);
      ctx.strokeRect(mx, my, mw, mh);
    }
    ctx.restore();

    // 3) Top Ruler & Work Area Bar
    ctx.fillStyle = '#181c26';
    ctx.fillRect(0, 0, w, RULER_H);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.moveTo(0, RULER_H); ctx.lineTo(w, RULER_H); ctx.stroke();

    // Work Area range bar
    const wa0 = this.timeToX(comp.workAreaStart);
    const wa1 = this.timeToX(comp.workAreaEnd);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.fillRect(wa0, 22, Math.max(4, wa1 - wa0), 10);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(wa0 - 3, 21, 6, 12);
    ctx.fillRect(wa1 - 3, 21, 6, 12);

    // Ruler Ticks & Labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px "Consolas", monospace';
    for (let s = 0; s <= comp.duration + 0.001; s += secStep) {
      const x = this.timeToX(s);
      if (x < -20 || x > w + 20) continue;
      ctx.strokeStyle = '#64748b';
      ctx.beginPath(); ctx.moveTo(x, 12); ctx.lineTo(x, 22); ctx.stroke();
      ctx.fillText(`${s.toFixed(secStep < 1 ? 1 : 0)}s`, x + 3, 12);
    }

    // 4) Playhead Indicator (Amber Needle)
    const phX = this.timeToX(this.store.currentTime);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(phX, 16); ctx.lineTo(phX, h); ctx.stroke();
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(phX - 6, 4); ctx.lineTo(phX + 6, 4); ctx.lineTo(phX + 6, 12); ctx.lineTo(phX, 19); ctx.lineTo(phX - 6, 12);
    ctx.closePath();
    ctx.fill();
  }

  private drawKeyframeGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, kf: Keyframe, selected: boolean, r: number): void {
    ctx.save();
    ctx.fillStyle = selected ? '#38bdf8' : '#f59e0b';
    ctx.strokeStyle = selected ? '#ffffff' : '#0f172a';
    ctx.lineWidth = 1.1;

    if (kf.outType === 'hold') {
      ctx.fillRect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
      ctx.strokeRect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
    } else if (kf.inType === 'bezier' || kf.outType === 'bezier') {
      // AE Hourglass shape for Easy Ease / Bezier!
      ctx.beginPath();
      ctx.moveTo(x - r * 0.85, y - r);
      ctx.lineTo(x + r * 0.85, y - r);
      ctx.lineTo(x + r * 0.25, y);
      ctx.lineTo(x + r * 0.85, y + r);
      ctx.lineTo(x - r * 0.85, y + r);
      ctx.lineTo(x - r * 0.25, y);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else {
      // Classic AE Diamond for Linear
      ctx.beginPath();
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  private bindCanvasEvents(): void {
    const getLocal = (e: PointerEvent) => {
      const r = this.trackCanvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    this.trackCanvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.store.isExportMode) return;
      const { x, y } = getLocal(e);
      const comp = this.store.getActiveComp();

      // 1) Ruler / Work Area interaction
      if (y <= RULER_H) {
        const wa0 = this.timeToX(comp.workAreaStart);
        const wa1 = this.timeToX(comp.workAreaEnd);
        if (y >= 20 && Math.abs(x - wa0) < 8) {
          this.store.beginEdit();
          this.dragState = { mode: 'workStart', startX: x, startY: y, curX: x, curY: y };
          return;
        }
        if (y >= 20 && Math.abs(x - wa1) < 8) {
          this.store.beginEdit();
          this.dragState = { mode: 'workEnd', startX: x, startY: y, curX: x, curY: y };
          return;
        }
        this.store.isPlaying = false;
        audioEngine.stopAll();
        this.dragState = { mode: 'scrub', startX: x, startY: y, curX: x, curY: y };
        this.store.setTime(this.snapTime(this.xToTime(x)));
        return;
      }

      // 2) Hit-test Keyframes & Layer Bars
      const scrollY = this.headerListEl.scrollTop;
      const rowIdx = Math.floor((y - RULER_H + scrollY) / ROW_H);
      const row = this.rows[rowIdx];

      if (row) {
        // Test keyframe hits on prop row (or summary keyframes on layer row)
        const hitKfs: Keyframe[] = [];
        if (row.kind === 'prop' && row.prop?.animated) {
          for (const k of row.prop.keyframes) {
            if (Math.abs(this.timeToX(k.time) - x) < 8) hitKfs.push(k);
          }
        } else if (row.kind === 'layer') {
          for (const item of listLayerAnimProps(row.layer)) {
            if (!item.prop.animated) continue;
            for (const k of item.prop.keyframes) {
              if (Math.abs(this.timeToX(k.time) - x) < 7) hitKfs.push(k);
            }
          }
        }

        if (hitKfs.length > 0) {
          const alreadySel = hitKfs.some((k) => this.store.selectedKeyframeIds.has(k.id));
          if (!alreadySel && !e.shiftKey) this.store.selectedKeyframeIds.clear();
          for (const k of hitKfs) this.store.selectedKeyframeIds.add(k.id);
          if (row.kind === 'prop' && row.propPath) {
            this.store.graphTarget = { layerId: row.layer.id, propPath: row.propPath, propLabel: `${row.layer.name} · ${row.propLabel}` };
          }
          // Capture original times of ALL selected keyframes for move or Alt-stretch!
          const origTimes = new Map<string, number>();
          for (const l of comp.layers) {
            for (const p of listLayerAnimProps(l)) {
              for (const k of p.prop.keyframes) {
                if (this.store.selectedKeyframeIds.has(k.id)) origTimes.set(k.id, k.time);
              }
            }
          }
          const tVals = Array.from(origTimes.values());
          const minT = Math.min(...tVals), maxT = Math.max(...tVals);
          const isStretch = e.altKey && origTimes.size >= 2 && (maxT - minT) > 0.02;
          this.store.beginEdit();
          this.dragState = {
            mode: isStretch ? 'kfStretch' : 'kfDrag',
            startX: x, startY: y, curX: x, curY: y,
            origKfTimes: origTimes,
            pivotTime: Math.abs(this.xToTime(x) - minT) < Math.abs(this.xToTime(x) - maxT) ? maxT : minT,
            origSpan: maxT - minT,
          };
          this.store.notify('ui');
          return;
        }

        // Layer In/Out Trim or Shift Bar
        if (row.kind === 'layer') {
          const l = row.layer;
          const x0 = this.timeToX(l.inPoint), x1 = this.timeToX(l.outPoint);
          if (!l.locked && x >= x0 - 6 && x <= x1 + 6) {
            this.store.selectLayer(l.id, e.shiftKey);
            this.store.beginEdit();
            const mode = Math.abs(x - x0) < 7 ? 'barIn' : Math.abs(x - x1) < 7 ? 'barOut' : 'barMove';
            this.dragState = {
              mode, startX: x, startY: y, curX: x, curY: y,
              layerId: l.id, origIn: l.inPoint, origOut: l.outPoint, origStart: l.startTime,
            };
            return;
          }
        }
      }

      // 3) Empty track space -> Marquee Box-Select Keyframes!
      if (!e.shiftKey) this.store.selectedKeyframeIds.clear();
      this.dragState = { mode: 'marquee', startX: x, startY: y, curX: x, curY: y };
      this.renderCanvas();
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.dragState) return;
      const { x, y } = getLocal(e);
      this.dragState.curX = x;
      this.dragState.curY = y;
      const comp = this.store.getActiveComp();

      if (this.dragState.mode === 'scrub') {
        this.store.setTime(this.snapTime(this.xToTime(x)), true);
        return;
      }
      if (this.dragState.mode === 'workStart') {
        comp.workAreaStart = clamp(this.snapTime(this.xToTime(x)), 0, comp.workAreaEnd - 0.1);
        this.renderCanvas();
        return;
      }
      if (this.dragState.mode === 'workEnd') {
        comp.workAreaEnd = clamp(this.snapTime(this.xToTime(x)), comp.workAreaStart + 0.1, comp.duration);
        this.renderCanvas();
        return;
      }
      if (this.dragState.mode === 'barIn' || this.dragState.mode === 'barOut' || this.dragState.mode === 'barMove') {
        const l = comp.layers.find((z) => z.id === this.dragState!.layerId);
        if (!l) return;
        const dt = (x - this.dragState.startX) / this.store.timelineZoom;
        if (this.dragState.mode === 'barIn') {
          l.inPoint = clamp(this.snapTime(this.dragState.origIn! + dt), 0, l.outPoint - 0.05);
        } else if (this.dragState.mode === 'barOut') {
          l.outPoint = clamp(this.snapTime(this.dragState.origOut! + dt), l.inPoint + 0.05, comp.duration);
        } else {
          const span = this.dragState.origOut! - this.dragState.origIn!;
          const newIn = clamp(this.snapTime(this.dragState.origIn! + dt), 0, comp.duration - span);
          l.inPoint = newIn;
          l.outPoint = newIn + span;
          l.startTime = this.dragState.origStart! + (newIn - this.dragState.origIn!);
        }
        this.store.notify('full');
        return;
      }
      if (this.dragState.mode === 'kfDrag' && this.dragState.origKfTimes) {
        const dt = (x - this.dragState.startX) / this.store.timelineZoom;
        for (const l of comp.layers) {
          for (const p of listLayerAnimProps(l)) {
            let touched = false;
            for (const k of p.prop.keyframes) {
              const orig = this.dragState.origKfTimes.get(k.id);
              if (orig !== undefined) {
                k.time = clamp(this.snapTime(orig + dt), 0, comp.duration);
                touched = true;
              }
            }
            if (touched) sortKeyframes(p.prop);
          }
        }
        this.store.notify('full');
        return;
      }
      if (this.dragState.mode === 'kfStretch' && this.dragState.origKfTimes) {
        const pivot = this.dragState.pivotTime!;
        const startT = this.xToTime(this.dragState.startX);
        const curT = this.xToTime(x);
        const origDist = Math.abs(startT - pivot) || 0.2;
        const factor = clamp((curT - pivot) / (startT - pivot || 0.2), 0.1, 6.0);
        void origDist;
        for (const l of comp.layers) {
          for (const p of listLayerAnimProps(l)) {
            let touched = false;
            for (const k of p.prop.keyframes) {
              const orig = this.dragState.origKfTimes.get(k.id);
              if (orig !== undefined) {
                k.time = clamp(pivot + (orig - pivot) * factor, 0, comp.duration);
                touched = true;
              }
            }
            if (touched) sortKeyframes(p.prop);
          }
        }
        this.store.notify('full');
        return;
      }
      if (this.dragState.mode === 'marquee') {
        const minX = Math.min(this.dragState.startX, x), maxX = Math.max(this.dragState.startX, x);
        const minY = Math.min(this.dragState.startY, y), maxY = Math.max(this.dragState.startY, y);
        const scrollY = this.headerListEl.scrollTop;
        this.store.selectedKeyframeIds.clear();
        for (let i = 0; i < this.rows.length; i++) {
          const ry = RULER_H + i * ROW_H - scrollY + ROW_H * 0.5;
          if (ry < minY || ry > maxY) continue;
          const row = this.rows[i];
          const propsToCheck = row.kind === 'prop' && row.prop ? [row.prop] : listLayerAnimProps(row.layer).map((x) => x.prop);
          for (const p of propsToCheck) {
            if (!p.animated) continue;
            for (const k of p.keyframes) {
              const kx = this.timeToX(k.time);
              if (kx >= minX && kx <= maxX) this.store.selectedKeyframeIds.add(k.id);
            }
          }
        }
        this.renderCanvas();
      }
    });

    window.addEventListener('pointerup', () => {
      if (!this.dragState) return;
      const mode = this.dragState.mode;
      this.dragState = null;
      if (mode !== 'scrub' && mode !== 'marquee') {
        this.store.commitEdit();
      } else {
        this.renderCanvas();
      }
    });

    // Horizontal wheel scroll / Ctrl+wheel zoom
    this.trackCanvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey) {
        this.store.timelineZoom = clamp(this.store.timelineZoom * (e.deltaY > 0 ? 0.88 : 1.14), 24, 260);
        const z = this.container.querySelector('#tl-zoom') as HTMLInputElement | null;
        if (z) z.value = String(Math.round(this.store.timelineZoom));
      } else {
        const comp = this.store.getActiveComp();
        this.store.timelineScrollX = clamp(this.store.timelineScrollX + e.deltaX + e.deltaY * 0.6, 0, Math.max(0, comp.duration * this.store.timelineZoom - 200));
      }
      this.renderCanvas();
    }, { passive: false });
  }
}
