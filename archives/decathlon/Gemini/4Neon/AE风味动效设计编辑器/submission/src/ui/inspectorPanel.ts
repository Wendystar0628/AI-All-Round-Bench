import {
  AnimProp, AudioPresetKind, BlendMode, BooleanOpMode, ColorRGBA, EffectType,
  FieldKind, Layer, MaskMode, PrimitiveMeshKind, ShapeModifierType, TextAlign,
  TextRangeUnit, TrackMatteMode, Vec2, Vec3,
} from '../core/types';
import { clamp, deepClone, genId, hexToRgba, rgbaToHex } from '../core/math';
import { makeKeyframe, makeProp, setPropValueAtTime, togglePropAnimation } from '../core/animation';
import {
  createDeformer, createDefaultEmitter, createEffect, createLayer, createMask,
  createShapeItem, createShapeModifier, makeRingPath, moveAnchorPreserveVisual,
  setLayerParentPreserveVisual,
} from '../core/project';
import { EvalContext } from '../core/expressions';
import { evaluateTextLayout, fontManager } from '../geometry/fontEngine';
import { evaluateShapeItemContours } from '../geometry/pathOps';
import { audioEngine } from '../audio/audioEngine';
import { EditorStore } from './store';

export class InspectorPanel {
  private container: HTMLElement;
  private store: EditorStore;
  private openExprKeys = new Set<string>();
  private liveBindings: Array<{ el: HTMLInputElement; evalFn: (t: number) => string }> = [];
  private lastStructureSig = '';

  constructor(container: HTMLElement, store: EditorStore) {
    this.container = container;
    this.store = store;
  }

  private getStructureSig(): string {
    const comp = this.store.getActiveComp();
    const sel = this.store.getSelectedLayers();
    if (sel.length !== 1) return `multi:${sel.length}:${comp.id}:${comp.layers.length}`;
    const l = sel[0];
    return [
      comp.id, l.id, l.type, l.is3D, l.parentId, l.blendMode, l.trackMatte,
      l.masks.length, l.effects.map((e) => e.id + e.enabled).join(','),
      l.shape?.items.length, l.shape?.modifiers.map((m) => m.id + m.type + m.boolOp).join(','), l.shape?.puppetPins?.length,
      l.text?.fontId, l.text?.writeOnEnabled, l.text?.animators.length, l.text?.puppetPins?.length,
      l.mesh3d?.sourceType, l.mesh3d?.deformers.map((d) => d.id + d.enabled + (d.pins?.length || 0)).join(','),
      l.particle?.emitters.length, l.particle?.attractors.length, l.particle?.trailsEnabled,
      l.audio?.preset, l.audio?.events.length,
      l.field?.kind, l.precomp?.timeRemapEnabled,
      Array.from(this.openExprKeys).join('|'),
      this.store.diagnostics.length,
    ].join('::');
  }

  public update(forceRebuild = false): void {
    // Avoid blowing away an actively focused text/expression input!
    const active = document.activeElement;
    const focusInside = active && this.container.contains(active) && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT');
    const sig = this.getStructureSig();
    if (!forceRebuild && (focusInside || sig === this.lastStructureSig)) {
      this.updateLiveValues();
      return;
    }
    this.lastStructureSig = sig;
    this.rebuildDOM();
  }

  public updateLiveValues(): void {
    const t = this.store.currentTime;
    const active = document.activeElement;
    for (const b of this.liveBindings) {
      if (b.el === active) continue;
      const next = b.evalFn(t);
      if (b.el.value !== next) b.el.value = next;
    }
  }

  private rebuildDOM(): void {
    this.liveBindings = [];
    this.container.innerHTML = '';
    const comp = this.store.getActiveComp();
    const sel = this.store.getSelectedLayers();

    if (sel.length === 0) {
      this.renderNoSelection(comp);
      return;
    }
    if (sel.length > 1) {
      this.renderMultiSelection(comp, sel);
      return;
    }

    const layer = sel[0];
    const ec = new EvalContext(comp);
    const t = this.store.currentTime;

    // Header bar
    const head = document.createElement('div');
    head.className = 'insp-layer-header';
    head.innerHTML = `
      <span class="insp-dot" style="background:${layer.labelColor}"></span>
      <input class="insp-name-input" value="${this.esc(layer.name)}" />
      <span class="insp-type-tag">${this.layerTypeLabel(layer.type)}</span>
    `;
    const nameInput = head.querySelector('input')!;
    nameInput.addEventListener('change', () => {
      this.store.beginEdit();
      layer.name = nameInput.value.trim() || layer.name;
      this.store.commitEdit(false);
    });
    this.container.appendChild(head);

    // Diagnostics banner if any expression errors exist on this layer
    const myErrors = this.store.diagnostics.filter((d) => d.layerId === layer.id);
    if (myErrors.length > 0) {
      const errBox = document.createElement('div');
      errBox.className = 'insp-error-box';
      errBox.innerHTML = myErrors.map((e) => `<div>⚠ 表达式 [${e.propPath}]: ${this.esc(e.error)}</div>`).join('');
      this.container.appendChild(errBox);
    }

    // 1) Transform & Compositing Section (all non-audio layers)
    if (layer.type !== 'audio') {
      const trSec = this.makeSection('变换与合成', true);
      this.appendPropRow(trSec, layer, layer.transform.anchor, 'anchor', false, ec, t, (newAnc) => {
        moveAnchorPreserveVisual(comp, layer, newAnc as Vec3, this.store.currentTime);
      });
      this.appendPropRow(trSec, layer, layer.transform.position, 'position', true, ec, t);
      this.appendPropRow(trSec, layer, layer.transform.scale, 'scale', false, ec, t);
      this.appendPropRow(trSec, layer, layer.transform.rotation, 'rotation', false, ec, t);
      this.appendPropRow(trSec, layer, layer.transform.opacity, 'opacity', false, ec, t);

      // Track Matte & Parent quick selects
      const rowMeta = document.createElement('div');
      rowMeta.className = 'insp-grid-2';
      const parentOpts = [`<option value="">无父级</option>`]
        .concat(comp.layers.filter((o) => o.id !== layer.id).map((o) => `<option value="${o.id}" ${layer.parentId === o.id ? 'selected' : ''}>${this.esc(o.name)}</option>`))
        .join('');
      const matteOpts: Array<[TrackMatteMode, string]> = [
        ['none', '无轨道遮罩'], ['alpha', 'Alpha 遮罩'], ['alphaInverted', 'Alpha 反转'], ['luma', '亮度遮罩'], ['lumaInverted', '亮度反转'],
      ];
      rowMeta.innerHTML = `
        <label class="insp-inline-field"><span>父级</span><select data-k="parent">${parentOpts}</select></label>
        <label class="insp-inline-field"><span>轨道遮罩</span><select data-k="matte">${matteOpts.map(([k, v]) => `<option value="${k}" ${layer.trackMatte === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      `;
      (rowMeta.querySelector('[data-k="parent"]') as HTMLSelectElement).addEventListener('change', (e) => {
        this.store.beginEdit();
        setLayerParentPreserveVisual(comp, layer, (e.target as HTMLSelectElement).value || null, this.store.currentTime);
        this.store.commitEdit();
      });
      (rowMeta.querySelector('[data-k="matte"]') as HTMLSelectElement).addEventListener('change', (e) => {
        this.store.beginEdit();
        layer.trackMatte = (e.target as HTMLSelectElement).value as TrackMatteMode;
        this.store.commitEdit(false);
      });
      trSec.appendChild(rowMeta);
      this.container.appendChild(trSec);
    }

    // 2) Type-Specific Sections
    if (layer.type === 'text' && layer.text) this.renderTextSection(layer, ec, t);
    if (layer.type === 'shape' && layer.shape) this.renderShapeSection(layer, ec, t);
    if (layer.type === 'mesh3d' && layer.mesh3d) this.renderMesh3DSection(layer, ec, t);
    if (layer.type === 'field' && layer.field) this.renderFieldSection(layer, ec, t);
    if (layer.type === 'camera' && layer.camera) this.renderCameraSection(layer, ec, t);
    if (layer.type === 'light' && layer.light) this.renderLightSection(layer, ec, t);
    if (layer.type === 'particle' && layer.particle) this.renderParticleSection(layer, ec, t);
    if (layer.type === 'precomp' && layer.precomp) this.renderPrecompSection(layer, ec, t);
    if (layer.type === 'audio' && layer.audio) this.renderAudioSection(layer, ec, t);

    // 3) Masks & Effects Sections (for renderable/adjustment layers)
    if (layer.type !== 'audio' && layer.type !== 'camera' && layer.type !== 'light' && layer.type !== 'field' && layer.type !== 'null') {
      this.renderMasksSection(layer, ec, t);
      this.renderEffectsSection(layer, ec, t);
    }
  }

  private renderNoSelection(comp: ReturnType<EditorStore['getActiveComp']>): void {
    const sec = this.makeSection(`合成设置 · ${comp.name}`, true);
    sec.innerHTML += `
      <div class="insp-empty-tip">当前未选中图层。在画布或时间轴点击图层以编辑属性，或调整合成参数：</div>
      <div class="insp-grid-2">
        <label class="insp-inline-field"><span>宽度</span><input type="number" id="cs-w" name="cs-w" value="${comp.width}" step="10" /></label>
        <label class="insp-inline-field"><span>高度</span><input type="number" id="cs-h" name="cs-h" value="${comp.height}" step="10" /></label>
        <label class="insp-inline-field"><span>帧率 FPS</span><input type="number" id="cs-fps" name="cs-fps" value="${comp.fps}" min="1" max="120" /></label>
        <label class="insp-inline-field"><span>时长 (秒)</span><input type="number" id="cs-dur" name="cs-dur" value="${comp.duration}" min="1" max="300" step="0.5" /></label>
        <label class="insp-inline-field"><span>工作区起点(s)</span><input type="number" id="cs-ws" name="cs-ws" value="${comp.workAreaStart.toFixed(2)}" min="0" max="${comp.duration}" step="0.1" /></label>
        <label class="insp-inline-field"><span>工作区终点(s)</span><input type="number" id="cs-we" name="cs-we" value="${comp.workAreaEnd.toFixed(2)}" min="0" max="${comp.duration}" step="0.1" /></label>
        <label class="insp-inline-field"><span>快门角度°</span><input type="number" id="cs-sa" name="cs-sa" value="${comp.shutterAngle}" min="0" max="720" /></label>
        <label class="insp-inline-field"><span>快门相位°</span><input type="number" id="cs-sp" name="cs-sp" value="${comp.shutterPhase}" min="-360" max="360" /></label>
      </div>
      <div class="insp-row-checks">
        <label><input type="checkbox" id="cs-mb" ${comp.motionBlur ? 'checked' : ''} /> 合成运动模糊</label>
        <label><input type="checkbox" id="cs-tr" ${comp.bgTransparent ? 'checked' : ''} /> 透明背景</label>
        <label>背景色 <input type="color" id="cs-bg" value="${rgbaToHex(comp.bgColor)}" /></label>
      </div>
    `;
    const bindNum = (id: string, fn: (v: number) => void) => {
      sec.querySelector(id)!.addEventListener('change', (e) => {
        this.store.beginEdit();
        fn(Number((e.target as HTMLInputElement).value));
        this.store.commitEdit();
      });
    };
    bindNum('#cs-w', (v) => { comp.width = clamp(Math.round(v), 128, 3840); });
    bindNum('#cs-h', (v) => { comp.height = clamp(Math.round(v), 128, 2160); });
    bindNum('#cs-fps', (v) => { comp.fps = clamp(Math.round(v), 1, 120); });
    bindNum('#cs-dur', (v) => { comp.duration = Math.max(1, v); comp.workAreaEnd = Math.min(comp.workAreaEnd, comp.duration); });
    bindNum('#cs-ws', (v) => { comp.workAreaStart = clamp(v, 0, comp.workAreaEnd - 0.1); });
    bindNum('#cs-we', (v) => { comp.workAreaEnd = clamp(v, comp.workAreaStart + 0.1, comp.duration); });
    bindNum('#cs-sa', (v) => { comp.shutterAngle = clamp(v, 0, 720); });
    bindNum('#cs-sp', (v) => { comp.shutterPhase = clamp(v, -360, 360); });
    sec.querySelector('#cs-mb')!.addEventListener('change', (e) => { this.store.beginEdit(); comp.motionBlur = (e.target as HTMLInputElement).checked; this.store.commitEdit(false); });
    sec.querySelector('#cs-tr')!.addEventListener('change', (e) => { this.store.beginEdit(); comp.bgTransparent = (e.target as HTMLInputElement).checked; this.store.commitEdit(false); });
    sec.querySelector('#cs-bg')!.addEventListener('input', (e) => { this.store.beginEdit(); comp.bgColor = hexToRgba((e.target as HTMLInputElement).value, 1); this.store.commitEdit(false); });
    this.container.appendChild(sec);
  }

  private renderMultiSelection(comp: ReturnType<EditorStore['getActiveComp']>, layers: Layer[]): void {
    const sec = this.makeSection(`已多选 ${layers.length} 个图层`, true);
    sec.innerHTML += `
      <div class="insp-multi-list">${layers.map((l) => `<span class="chip">${this.esc(l.name)}</span>`).join('')}</div>
      <div class="insp-btn-stack">
        <button class="mini-btn accent" id="ms-precomp">📦 原位预合成 (Ctrl+Shift+C)</button>
        <button class="mini-btn" id="ms-dup">📑 复制所选图层 (Ctrl+D)</button>
        <button class="mini-btn" id="ms-mb">⚡ 切换运动模糊</button>
        <button class="mini-btn danger" id="ms-del">🗑 删除所选图层</button>
      </div>
    `;
    sec.querySelector('#ms-precomp')!.addEventListener('click', () => this.store.precomposeSelected());
    sec.querySelector('#ms-dup')!.addEventListener('click', () => this.store.duplicateSelectedLayers());
    sec.querySelector('#ms-mb')!.addEventListener('click', () => {
      this.store.beginEdit();
      const target = !layers[0].motionBlur;
      layers.forEach((l) => { l.motionBlur = target; });
      this.store.commitEdit(false);
    });
    sec.querySelector('#ms-del')!.addEventListener('click', () => this.store.deleteSelectedLayers());
    this.container.appendChild(sec);
    void comp;
  }

  // ==========================================================================
  // Section Builders for Each Layer Type
  // ==========================================================================
  private renderTextSection(layer: Layer, ec: EvalContext, t: number): void {
    const tc = layer.text!;
    const comp = this.store.getActiveComp();
    const sec = this.makeSection('文字与字形几何', true);
    const fonts = fontManager.listFonts();
    const curMeta = fontManager.getFont(tc.fontId);

    const box = document.createElement('div');
    box.className = 'insp-block';
    box.innerHTML = `
      <label class="insp-label-top">文字内容（支持中文多行，修改后字块/变形/火星自动重生）</label>
      <textarea class="insp-textarea" rows="2" id="txt-content">${this.esc(tc.text)}</textarea>
      <div class="quick-chars">
        <span>换字测试：</span>
        ${['锻', '铭', '鼎', '钢', '铸', '锋', '炼', '熔', '火', '金'].map((ch) => `<button class="char-pill ${tc.text === ch ? 'active' : ''}" data-ch="${ch}">${ch}</button>`).join('')}
      </div>
      <div class="insp-grid-2">
        <label class="insp-inline-field"><span>字体</span>
          <select id="txt-font">${fonts.map((f) => `<option value="${f.id}" ${tc.fontId === f.id ? 'selected' : ''}>${f.label}</option>`).join('')}</select>
        </label>
        <label class="insp-inline-field"><span>对齐</span>
          <select id="txt-align">
            <option value="left" ${tc.align === 'left' ? 'selected' : ''}>左对齐</option>
            <option value="center" ${tc.align === 'center' ? 'selected' : ''}>居中</option>
            <option value="right" ${tc.align === 'right' ? 'selected' : ''}>右对齐</option>
          </select>
        </label>
      </div>
      <div class="font-scope-badge">
        内置字库：${curMeta?.label || '思源宋体'}（${curMeta?.cjkCount ?? 1500} 常用汉字 + ASCII/标点，${fontManager.getStrokeCount()} 汉字笔顺；其余字符自动轮廓描摹）
      </div>
    `;
    sec.appendChild(box);

    const ta = box.querySelector('#txt-content') as HTMLTextAreaElement;
    ta.addEventListener('input', () => {
      this.store.beginEdit();
      tc.text = ta.value;
      this.store.commitEdit();
    });
    box.querySelectorAll('.char-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ch = (btn as HTMLElement).dataset.ch!;
        this.store.beginEdit();
        tc.text = ch;
        this.store.commitEdit();
        this.store.showToast(`已换字为「${ch}」，三维字块、压痕与火星已重新生成`);
      });
    });
    (box.querySelector('#txt-font') as HTMLSelectElement).addEventListener('change', (e) => {
      this.store.beginEdit(); tc.fontId = (e.target as HTMLSelectElement).value; this.store.commitEdit();
    });
    (box.querySelector('#txt-align') as HTMLSelectElement).addEventListener('change', (e) => {
      this.store.beginEdit(); tc.align = (e.target as HTMLSelectElement).value as TextAlign; this.store.commitEdit();
    });

    this.appendPropRow(sec, layer, tc.fontSize, 'text.fontSize', false, ec, t);
    this.appendPropRow(sec, layer, tc.lineHeight, 'text.lineHeight', false, ec, t);
    this.appendPropRow(sec, layer, tc.letterSpacing, 'text.letterSpacing', false, ec, t);
    this.appendPropRow(sec, layer, tc.fillColor, 'text.fillColor', false, ec, t);

    const toggles = document.createElement('div');
    toggles.className = 'insp-row-checks';
    toggles.innerHTML = `
      <label><input type="checkbox" id="txt-fill-en" ${tc.fillEnabled ? 'checked' : ''} /> 填充</label>
      <label><input type="checkbox" id="txt-str-en" ${tc.strokeEnabled ? 'checked' : ''} /> 描边</label>
      <label><input type="checkbox" id="txt-wo-en" ${tc.writeOnEnabled ? 'checked' : ''} /> 笔画书写</label>
    `;
    toggles.querySelector('#txt-fill-en')!.addEventListener('change', (e) => { this.store.beginEdit(); tc.fillEnabled = (e.target as HTMLInputElement).checked; this.store.commitEdit(false); });
    toggles.querySelector('#txt-str-en')!.addEventListener('change', (e) => { this.store.beginEdit(); tc.strokeEnabled = (e.target as HTMLInputElement).checked; this.store.commitEdit(false); });
    toggles.querySelector('#txt-wo-en')!.addEventListener('change', (e) => { this.store.beginEdit(); tc.writeOnEnabled = (e.target as HTMLInputElement).checked; this.store.commitEdit(); });
    sec.appendChild(toggles);

    if (tc.strokeEnabled) {
      this.appendPropRow(sec, layer, tc.strokeColor, 'text.strokeColor', false, ec, t);
      this.appendPropRow(sec, layer, tc.strokeWidth, 'text.strokeWidth', false, ec, t);
    }
    if (tc.writeOnEnabled) {
      this.appendPropRow(sec, layer, tc.writeOnProgress, 'text.writeOnProgress', false, ec, t);
      this.appendPropRow(sec, layer, tc.writeOnFeather, 'text.writeOnFeather', false, ec, t);
    }

    // Action buttons: Convert Text to Editable Shape Geometry / Extrude to 3D Mesh! (2.6)
    const actRow = document.createElement('div');
    actRow.className = 'insp-btn-row';
    actRow.innerHTML = `
      <button class="mini-btn" id="txt-to-shape">✦ 转为形状轮廓</button>
      <button class="mini-btn accent" id="txt-to-3d">🧊 挤出为三维实体</button>
      <button class="mini-btn" id="txt-add-anim">+ 文字动画器</button>
    `;
    actRow.querySelector('#txt-to-shape')!.addEventListener('click', () => {
      this.store.beginEdit();
      const layout = evaluateTextLayout(comp, layer, { ...tc, writeOnEnabled: false }, t, ec);
      const shpLayer = createLayer(comp, 'shape', `${layer.name}·轮廓`);
      shpLayer.is3D = layer.is3D;
      shpLayer.transform = deepClone(layer.transform);
      const pathItem = createShapeItem('path', '字形轮廓');
      pathItem.path.value = deepClone(layout.combinedPath);
      shpLayer.shape!.items = [pathItem];
      comp.layers.unshift(shpLayer);
      this.store.selectLayer(shpLayer.id);
      this.store.commitEdit();
      this.store.showToast('已将文字字形转换为可编辑矢量轮廓');
    });
    actRow.querySelector('#txt-to-3d')!.addEventListener('click', () => {
      const m = this.store.addLayer('mesh3d', { sourceLayerId: layer.id });
      m.name = `${layer.name}·三维体`;
    });
    actRow.querySelector('#txt-add-anim')!.addEventListener('click', () => {
      this.store.beginEdit();
      tc.animators.push({
        id: genId('tanim'),
        name: `动画器 ${tc.animators.length + 1}`,
        enabled: true,
        unit: 'char',
        start: makeProp('start', '范围起点', 'scalar', 0, { min: 0, max: 100, unit: '%' }),
        end: makeProp('end', '范围终点', 'scalar', 100, { min: 0, max: 100, unit: '%' }),
        offset: makeProp('offset', '范围偏移', 'scalar', 0, { min: -100, max: 100, unit: '%' }),
        softness: makeProp('softness', '软边', 'scalar', 20, { min: 0, max: 100, unit: '%' }),
        position: makeProp('position', '字符位移', 'vec3', [0, -40, 0]),
        scale: makeProp('scale', '字符缩放', 'vec2', [100, 100]),
        rotation: makeProp('rotation', '字符旋转', 'scalar', 18, { unit: '°' }),
        opacity: makeProp('opacity', '字符不透明', 'scalar', 100, { min: 0, max: 100 }),
      });
      this.store.commitEdit();
    });
    sec.appendChild(actRow);

    // Render Text Animators
    tc.animators.forEach((anim, idx) => {
      const card = document.createElement('div');
      card.className = 'insp-subcard';
      card.innerHTML = `
        <div class="subcard-head">
          <label><input type="checkbox" ${anim.enabled ? 'checked' : ''} data-act="en" /> ${this.esc(anim.name)}</label>
          <select data-act="unit" class="mini-select">
            <option value="char" ${anim.unit === 'char' ? 'selected' : ''}>按字</option>
            <option value="word" ${anim.unit === 'word' ? 'selected' : ''}>按词</option>
            <option value="line" ${anim.unit === 'line' ? 'selected' : ''}>按行</option>
          </select>
          <button class="tiny-btn danger" data-act="del">✕</button>
        </div>
      `;
      card.querySelector('[data-act="en"]')!.addEventListener('change', (e) => { this.store.beginEdit(); anim.enabled = (e.target as HTMLInputElement).checked; this.store.commitEdit(false); });
      card.querySelector('[data-act="unit"]')!.addEventListener('change', (e) => { this.store.beginEdit(); anim.unit = (e.target as HTMLSelectElement).value as TextRangeUnit; this.store.commitEdit(false); });
      card.querySelector('[data-act="del"]')!.addEventListener('click', () => { this.store.beginEdit(); tc.animators.splice(idx, 1); this.store.commitEdit(); });
      this.appendPropRow(card, layer, anim.start, `text.anim.${anim.id}.start`, false, ec, t);
      this.appendPropRow(card, layer, anim.end, `text.anim.${anim.id}.end`, false, ec, t);
      this.appendPropRow(card, layer, anim.offset, `text.anim.${anim.id}.offset`, false, ec, t);
      this.appendPropRow(card, layer, anim.softness, `text.anim.${anim.id}.softness`, false, ec, t);
      this.appendPropRow(card, layer, anim.position, `text.anim.${anim.id}.position`, false, ec, t);
      this.appendPropRow(card, layer, anim.scale, `text.anim.${anim.id}.scale`, false, ec, t);
      this.appendPropRow(card, layer, anim.rotation, `text.anim.${anim.id}.rotation`, false, ec, t);
      this.appendPropRow(card, layer, anim.opacity, `text.anim.${anim.id}.opacity`, false, ec, t);
      sec.appendChild(card);
    });

    if (tc.puppetPins && tc.puppetPins.length > 0) {
      const pHead = document.createElement('div');
      pHead.className = 'insp-sub-title';
      pHead.textContent = `文字图钉变形 (${tc.puppetPins.length})`;
      sec.appendChild(pHead);
      tc.puppetPins.forEach((pin, pidx) => {
        const pc = document.createElement('div');
        pc.className = 'insp-subcard';
        pc.innerHTML = `<div class="subcard-head"><span>📌 ${this.esc(pin.name)}</span><button class="tiny-btn danger" data-a="del">✕</button></div>`;
        pc.querySelector('[data-a="del"]')!.addEventListener('click', () => { this.store.beginEdit(); tc.puppetPins!.splice(pidx, 1); this.store.commitEdit(); });
        this.appendPropRow(pc, layer, pin.position, `pin.${pin.id}.pos`, false, ec, t);
        this.appendPropRow(pc, layer, pin.rotation, `pin.${pin.id}.rot`, false, ec, t);
        this.appendPropRow(pc, layer, pin.scale, `pin.${pin.id}.scl`, false, ec, t);
        sec.appendChild(pc);
      });
    }

    this.container.appendChild(sec);
  }

  private renderShapeSection(layer: Layer, ec: EvalContext, t: number): void {
    const sh = layer.shape!;
    const sec = this.makeSection('矢量形状与操作栈', true);

    const addBar = document.createElement('div');
    addBar.className = 'insp-btn-row';
    addBar.innerHTML = `
      <button class="mini-btn" data-add="rect">+矩形</button>
      <button class="mini-btn" data-add="ellipse">+椭圆</button>
      <button class="mini-btn" data-add="star">+星形</button>
      <button class="mini-btn" data-add="ring">+带孔环</button>
      <button class="mini-btn accent" id="shp-to-3d">🧊 挤出3D</button>
    `;
    addBar.querySelectorAll('[data-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = (btn as HTMLElement).dataset.add!;
        this.store.beginEdit();
        if (k === 'ring') {
          const it = createShapeItem('path', '带孔双环');
          it.path.value = makeRingPath(110, 56);
          sh.items.push(it);
        } else {
          const it = createShapeItem(k as any);
          it.position.value = [sh.items.length * 45, 0];
          sh.items.push(it);
        }
        this.store.commitEdit();
      });
    });
    addBar.querySelector('#shp-to-3d')!.addEventListener('click', () => {
      const m = this.store.addLayer('mesh3d', { sourceLayerId: layer.id });
      m.name = `${layer.name}·三维体`;
    });
    sec.appendChild(addBar);

    // Shape Items
    const comp = this.store.getActiveComp();
    sh.items.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = 'insp-subcard';
      card.innerHTML = `
        <div class="subcard-head">
          <span>${this.esc(item.name)} (${item.kind})</span>
          <div>
            ${item.kind !== 'path' ? `<button class="tiny-btn" data-act="toPath" title="转为可编辑贝塞尔节点与形变路径">转路径</button>` : `<button class="tiny-btn" data-act="morph" title="在当前时刻打路径形变关键帧">◆形变帧</button>`}
            <button class="tiny-btn danger" data-act="del">✕</button>
          </div>
        </div>
      `;
      card.querySelector('[data-act="del"]')!.addEventListener('click', () => { this.store.beginEdit(); sh.items.splice(idx, 1); this.store.commitEdit(); });
      card.querySelector('[data-act="toPath"]')?.addEventListener('click', () => {
        this.store.beginEdit();
        const contours = evaluateShapeItemContours(comp, layer, item, t, ec);
        item.kind = 'path';
        item.position.value = [0, 0];
        item.path.value = { contours: deepClone(contours) };
        this.store.commitEdit();
        this.store.showToast('已转为贝塞尔路径，可用钢笔工具 (G) 编辑节点与切线');
      });
      card.querySelector('[data-act="morph"]')?.addEventListener('click', () => {
        this.store.beginEdit();
        item.path.animated = true;
        const cur = ec.evaluateProp(layer, item.path, `shape.${item.id}.path`, t);
        setPropValueAtTime(item.path, t, cur);
        this.store.commitEdit();
        this.store.showToast('已在当前时刻记录路径形变关键帧，切换时间用钢笔工具编辑节点即可自动形变');
      });
      this.appendPropRow(card, layer, item.position, `shape.${item.id}.position`, false, ec, t);
      if (item.kind !== 'path') {
        this.appendPropRow(card, layer, item.size, `shape.${item.id}.size`, false, ec, t);
        if (item.kind === 'rect') this.appendPropRow(card, layer, item.roundness, `shape.${item.id}.roundness`, false, ec, t);
      }
      sec.appendChild(card);
    });

    // Fill & Stroke
    const fsRow = document.createElement('div');
    fsRow.className = 'insp-row-checks';
    fsRow.innerHTML = `
      <label><input type="checkbox" id="sh-fe" ${sh.fillEnabled ? 'checked' : ''} /> 启用填充</label>
      <label><input type="checkbox" id="sh-se" ${sh.strokeEnabled ? 'checked' : ''} /> 启用描边</label>
    `;
    fsRow.querySelector('#sh-fe')!.addEventListener('change', (e) => { this.store.beginEdit(); sh.fillEnabled = (e.target as HTMLInputElement).checked; this.store.commitEdit(false); });
    fsRow.querySelector('#sh-se')!.addEventListener('change', (e) => { this.store.beginEdit(); sh.strokeEnabled = (e.target as HTMLInputElement).checked; this.store.commitEdit(false); });
    sec.appendChild(fsRow);
    if (sh.fillEnabled) {
      this.appendPropRow(sec, layer, sh.fillColor, 'shape.fillColor', false, ec, t);
      this.appendPropRow(sec, layer, sh.fillOpacity, 'shape.fillOpacity', false, ec, t);
    }
    if (sh.strokeEnabled) {
      this.appendPropRow(sec, layer, sh.strokeColor, 'shape.strokeColor', false, ec, t);
      this.appendPropRow(sec, layer, sh.strokeWidth, 'shape.strokeWidth', false, ec, t);
    }

    // Ordered Modifiers (Trim, Repeater, Boolean Union/Diff/Intersect — reorderable!)
    const modAdd = document.createElement('div');
    modAdd.className = 'insp-btn-row';
    modAdd.innerHTML = `
      <button class="mini-btn" data-m="trim">+修剪路径</button>
      <button class="mini-btn" data-m="repeater">+重复器</button>
      <button class="mini-btn" data-m="boolean">+布尔运算</button>
    `;
    modAdd.querySelectorAll('[data-m]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.store.beginEdit();
        sh.modifiers.push(createShapeModifier((btn as HTMLElement).dataset.m as ShapeModifierType));
        this.store.commitEdit();
      });
    });
    sec.appendChild(modAdd);

    sh.modifiers.forEach((mod, idx) => {
      const card = document.createElement('div');
      card.className = 'insp-subcard';
      card.innerHTML = `
        <div class="subcard-head">
          <label><input type="checkbox" ${mod.enabled ? 'checked' : ''} data-act="en" /> ${this.esc(mod.name)}</label>
          <div>
            <button class="tiny-btn" data-act="up" title="上移顺序">↑</button>
            <button class="tiny-btn" data-act="dn" title="下移顺序">↓</button>
            <button class="tiny-btn danger" data-act="del">✕</button>
          </div>
        </div>
      `;
      card.querySelector('[data-act="en"]')!.addEventListener('change', (e) => { this.store.beginEdit(); mod.enabled = (e.target as HTMLInputElement).checked; this.store.commitEdit(); });
      card.querySelector('[data-act="up"]')!.addEventListener('click', () => { if (idx > 0) { this.store.beginEdit(); [sh.modifiers[idx - 1], sh.modifiers[idx]] = [sh.modifiers[idx], sh.modifiers[idx - 1]]; this.store.commitEdit(); } });
      card.querySelector('[data-act="dn"]')!.addEventListener('click', () => { if (idx < sh.modifiers.length - 1) { this.store.beginEdit(); [sh.modifiers[idx + 1], sh.modifiers[idx]] = [sh.modifiers[idx], sh.modifiers[idx + 1]]; this.store.commitEdit(); } });
      card.querySelector('[data-act="del"]')!.addEventListener('click', () => { this.store.beginEdit(); sh.modifiers.splice(idx, 1); this.store.commitEdit(); });

      if (mod.type === 'trim') {
        this.appendPropRow(card, layer, mod.start!, `mod.${mod.id}.start`, false, ec, t);
        this.appendPropRow(card, layer, mod.end!, `mod.${mod.id}.end`, false, ec, t);
        this.appendPropRow(card, layer, mod.offset!, `mod.${mod.id}.offset`, false, ec, t);
      } else if (mod.type === 'repeater') {
        this.appendPropRow(card, layer, mod.copies!, `mod.${mod.id}.copies`, false, ec, t);
        this.appendPropRow(card, layer, mod.repPosition!, `mod.${mod.id}.repPosition`, false, ec, t);
        this.appendPropRow(card, layer, mod.repRotation!, `mod.${mod.id}.repRotation`, false, ec, t);
        this.appendPropRow(card, layer, mod.repScale!, `mod.${mod.id}.repScale`, false, ec, t);
      } else if (mod.type === 'boolean') {
        const bSel = document.createElement('label');
        bSel.className = 'insp-inline-field';
        bSel.innerHTML = `<span>运算方式</span><select>
          <option value="union" ${mod.boolOp === 'union' ? 'selected' : ''}>并集 (Union)</option>
          <option value="difference" ${mod.boolOp === 'difference' ? 'selected' : ''}>差集 (Difference)</option>
          <option value="intersect" ${mod.boolOp === 'intersect' ? 'selected' : ''}>交集 (Intersect)</option>
        </select>`;
        bSel.querySelector('select')!.addEventListener('change', (e) => {
          this.store.beginEdit(); mod.boolOp = (e.target as HTMLSelectElement).value as BooleanOpMode; this.store.commitEdit();
        });
        card.appendChild(bSel);
      }
      sec.appendChild(card);
    });

    if (sh.puppetPins && sh.puppetPins.length > 0) {
      const pHead = document.createElement('div');
      pHead.className = 'insp-sub-title';
      pHead.textContent = `形状图钉变形 (${sh.puppetPins.length})`;
      sec.appendChild(pHead);
      sh.puppetPins.forEach((pin, pidx) => {
        const pc = document.createElement('div');
        pc.className = 'insp-subcard';
        pc.innerHTML = `<div class="subcard-head"><span>📌 ${this.esc(pin.name)}</span><button class="tiny-btn danger" data-a="del">✕</button></div>`;
        pc.querySelector('[data-a="del"]')!.addEventListener('click', () => { this.store.beginEdit(); sh.puppetPins!.splice(pidx, 1); this.store.commitEdit(); });
        this.appendPropRow(pc, layer, pin.position, `pin.${pin.id}.pos`, false, ec, t);
        this.appendPropRow(pc, layer, pin.rotation, `pin.${pin.id}.rot`, false, ec, t);
        this.appendPropRow(pc, layer, pin.scale, `pin.${pin.id}.scl`, false, ec, t);
        sec.appendChild(pc);
      });
    }

    this.container.appendChild(sec);
  }

  private renderMesh3DSection(layer: Layer, ec: EvalContext, t: number): void {
    const mc = layer.mesh3d!;
    const comp = this.store.getActiveComp();
    const sec = this.makeSection('三维实体、材质与变形', true);

    const srcBox = document.createElement('div');
    srcBox.className = 'insp-grid-2';
    const srcLayers = comp.layers.filter((l) => l.type === 'text' || l.type === 'shape');
    const meshNodes = comp.nodeGraph.nodes.filter((n) => n.outputs.some((o) => o.dataType === 'mesh' || o.dataType === 'path'));

    srcBox.innerHTML = `
      <label class="insp-inline-field"><span>几何来源</span>
        <select id="m3-src-type">
          <option value="node" ${mc.sourceType === 'node' ? 'selected' : ''}>程序节点输出</option>
          <option value="layer" ${mc.sourceType === 'layer' ? 'selected' : ''}>形状/文字图层</option>
          <option value="primitive" ${mc.sourceType === 'primitive' ? 'selected' : ''}>三维基础体</option>
        </select>
      </label>
      ${mc.sourceType === 'layer' ? `
        <label class="insp-inline-field"><span>源图层</span>
          <select id="m3-src-lyr">
            <option value="">请选择</option>
            ${srcLayers.map((l) => `<option value="${l.id}" ${mc.sourceLayerId === l.id ? 'selected' : ''}>${this.esc(l.name)}</option>`).join('')}
          </select>
        </label>
      ` : mc.sourceType === 'node' ? `
        <label class="insp-inline-field"><span>节点输出</span>
          <select id="m3-src-nd">
            <option value="">请选择</option>
            ${meshNodes.map((n) => {
              const p = n.outputs.find((o) => o.dataType === 'mesh') ?? n.outputs[0];
              const val = `${n.id}:${p.id}`;
              const cur = mc.sourceNodeRef ? `${mc.sourceNodeRef.nodeId}:${mc.sourceNodeRef.portId}` : '';
              return `<option value="${val}" ${val === cur ? 'selected' : ''}>${this.esc(n.title)}·${p.name}</option>`;
            }).join('')}
          </select>
        </label>
      ` : `
        <label class="insp-inline-field"><span>基础体</span>
          <select id="m3-prim">
            ${([['box', '立方体'], ['cylinder', '圆柱'], ['sphere', '球体'], ['plane', '平面'], ['anvil', '锻造铁砧'], ['hammer', '锻造重锤']] as Array<[PrimitiveMeshKind, string]>)
              .map(([k, lb]) => `<option value="${k}" ${mc.primitiveKind === k ? 'selected' : ''}>${lb}</option>`).join('')}
          </select>
        </label>
      `}
    `;
    srcBox.querySelector('#m3-src-type')!.addEventListener('change', (e) => {
      this.store.beginEdit(); mc.sourceType = (e.target as HTMLSelectElement).value as any; this.store.commitEdit();
    });
    srcBox.querySelector('#m3-src-lyr')?.addEventListener('change', (e) => {
      this.store.beginEdit(); mc.sourceLayerId = (e.target as HTMLSelectElement).value; this.store.commitEdit();
    });
    srcBox.querySelector('#m3-src-nd')?.addEventListener('change', (e) => {
      const [nodeId, portId] = (e.target as HTMLSelectElement).value.split(':');
      this.store.beginEdit(); mc.sourceNodeRef = nodeId ? { nodeId, portId } : undefined; this.store.commitEdit();
    });
    srcBox.querySelector('#m3-prim')?.addEventListener('change', (e) => {
      this.store.beginEdit(); mc.primitiveKind = (e.target as HTMLSelectElement).value as PrimitiveMeshKind; this.store.commitEdit();
    });
    sec.appendChild(srcBox);

    if (mc.sourceType !== 'primitive') {
      this.appendPropRow(sec, layer, mc.extrudeDepth, 'extrudeDepth', false, ec, t);
      this.appendPropRow(sec, layer, mc.bevelSize, 'bevelSize', false, ec, t);
    } else if (mc.primitiveSize) {
      this.appendPropRow(sec, layer, mc.primitiveSize, 'mesh3d.primitiveSize', false, ec, t);
    }

    // Shadows
    const shRow = document.createElement('div');
    shRow.className = 'insp-row-checks';
    shRow.innerHTML = `
      <label><input type="checkbox" id="m3-cs" ${mc.castShadow ? 'checked' : ''} /> 投射阴影</label>
      <label><input type="checkbox" id="m3-rs" ${mc.receiveShadow ? 'checked' : ''} /> 接收阴影</label>
    `;
    shRow.querySelector('#m3-cs')!.addEventListener('change', (e) => { this.store.beginEdit(); mc.castShadow = (e.target as HTMLInputElement).checked; this.store.commitEdit(false); });
    shRow.querySelector('#m3-rs')!.addEventListener('change', (e) => { this.store.beginEdit(); mc.receiveShadow = (e.target as HTMLInputElement).checked; this.store.commitEdit(false); });
    sec.appendChild(shRow);

    // PBR Material
    const matHead = document.createElement('div');
    matHead.className = 'insp-sub-title';
    matHead.textContent = 'PBR 物理材质';
    sec.appendChild(matHead);
    this.appendPropRow(sec, layer, mc.material.baseColor, 'material.baseColor', false, ec, t);
    this.appendPropRow(sec, layer, mc.material.metallic, 'material.metallic', false, ec, t);
    this.appendPropRow(sec, layer, mc.material.roughness, 'material.roughness', false, ec, t);
    this.appendPropRow(sec, layer, mc.material.emissiveColor, 'material.emissiveColor', false, ec, t);
    this.appendPropRow(sec, layer, mc.material.emissiveIntensity, 'material.emissiveIntensity', false, ec, t);
    this.appendPropRow(sec, layer, mc.material.opacity, 'material.opacity', false, ec, t);
    if (mc.material.heatIntensity) {
      this.appendPropRow(sec, layer, mc.material.heatIntensity, 'material.heatIntensity', false, ec, t);
    }

    // Deformers Stack
    const defHead = document.createElement('div');
    defHead.className = 'insp-sub-title';
    defHead.textContent = '三维几何变形器';
    sec.appendChild(defHead);

    const defAdd = document.createElement('div');
    defAdd.className = 'insp-btn-row';
    defAdd.innerHTML = `
      <button class="mini-btn" data-d="bend">+弯曲</button>
      <button class="mini-btn" data-d="twist">+扭转</button>
      <button class="mini-btn" data-d="field">+空间场变形</button>
    `;
    defAdd.querySelectorAll('[data-d]').forEach((b) => {
      b.addEventListener('click', () => {
        this.store.beginEdit();
        mc.deformers.push(createDeformer((b as HTMLElement).dataset.d as any));
        this.store.commitEdit();
      });
    });
    sec.appendChild(defAdd);

    const fieldLayers = comp.layers.filter((l) => l.type === 'field');
    mc.deformers.forEach((d, idx) => {
      const card = document.createElement('div');
      card.className = 'insp-subcard';
      card.innerHTML = `
        <div class="subcard-head">
          <label><input type="checkbox" ${d.enabled ? 'checked' : ''} data-act="en" /> ${this.esc(d.name)}</label>
          <button class="tiny-btn danger" data-act="del">✕</button>
        </div>
      `;
      card.querySelector('[data-act="en"]')!.addEventListener('change', (e) => { this.store.beginEdit(); d.enabled = (e.target as HTMLInputElement).checked; this.store.commitEdit(); });
      card.querySelector('[data-act="del"]')!.addEventListener('click', () => { this.store.beginEdit(); mc.deformers.splice(idx, 1); this.store.commitEdit(); });
      if (d.amount) this.appendPropRow(card, layer, d.amount, `def.${d.id}.amount`, false, ec, t);
      if (d.fieldStrength) this.appendPropRow(card, layer, d.fieldStrength, `def.${d.id}.fieldStrength`, false, ec, t);
      if (d.type === 'field' && fieldLayers.length > 0) {
        const fWrap = document.createElement('div');
        fWrap.className = 'insp-row-checks';
        fWrap.innerHTML = fieldLayers.map((fl) => `<label><input type="checkbox" value="${fl.id}" ${(d.fieldLayerIds || []).includes(fl.id) ? 'checked' : ''} /> ${this.esc(fl.name)}</label>`).join('');
        fWrap.querySelectorAll('input').forEach((inp) => {
          inp.addEventListener('change', () => {
            this.store.beginEdit();
            const set = new Set(d.fieldLayerIds || []);
            if (inp.checked) set.add(inp.value); else set.delete(inp.value);
            d.fieldLayerIds = Array.from(set);
            this.store.commitEdit();
          });
        });
        card.appendChild(fWrap);
      }
      if (d.type === 'puppet' && d.pins && d.pins.length > 0) {
        d.pins.forEach((pin, pidx) => {
          const pSub = document.createElement('div');
          pSub.className = 'insp-subcard';
          pSub.innerHTML = `<div class="subcard-head"><span>📌 ${this.esc(pin.name)}</span><button class="tiny-btn danger" data-a="del">✕</button></div>`;
          pSub.querySelector('[data-a="del"]')!.addEventListener('click', () => { this.store.beginEdit(); d.pins!.splice(pidx, 1); this.store.commitEdit(); });
          this.appendPropRow(pSub, layer, pin.position, `def.${d.id}.pin.${pin.id}.pos`, false, ec, t);
          this.appendPropRow(pSub, layer, pin.rotation, `def.${d.id}.pin.${pin.id}.rot`, false, ec, t);
          this.appendPropRow(pSub, layer, pin.scale, `def.${d.id}.pin.${pin.id}.scl`, false, ec, t);
          card.appendChild(pSub);
        });
      }
      sec.appendChild(card);
    });

    this.container.appendChild(sec);
  }

  private renderFieldSection(layer: Layer, ec: EvalContext, t: number): void {
    const f = layer.field!;
    const sec = this.makeSection('空间场设置（同步驱动几何与粒子）', true);
    const top = document.createElement('div');
    top.className = 'insp-grid-2';
    top.innerHTML = `
      <label class="insp-inline-field"><span>场类型</span>
        <select id="fld-kind">
          <option value="distance" ${f.kind === 'distance' ? 'selected' : ''}>距离衰减场</option>
          <option value="noise" ${f.kind === 'noise' ? 'selected' : ''}>三维噪声场</option>
          <option value="vortex" ${f.kind === 'vortex' ? 'selected' : ''}>旋涡力场</option>
        </select>
      </label>
      <label class="insp-inline-field"><input type="checkbox" id="fld-giz" ${f.showGizmo ? 'checked' : ''} /> 显示影响范围</label>
    `;
    top.querySelector('#fld-kind')!.addEventListener('change', (e) => { this.store.beginEdit(); f.kind = (e.target as HTMLSelectElement).value as FieldKind; this.store.commitEdit(); });
    top.querySelector('#fld-giz')!.addEventListener('change', (e) => { this.store.beginEdit(); f.showGizmo = (e.target as HTMLInputElement).checked; this.store.commitEdit(false); });
    sec.appendChild(top);
    this.appendPropRow(sec, layer, f.strength, 'field.strength', false, ec, t);
    this.appendPropRow(sec, layer, f.radius, 'field.radius', false, ec, t);
    this.appendPropRow(sec, layer, f.falloff, 'field.falloff', false, ec, t);
    this.appendPropRow(sec, layer, f.direction, 'field.direction', false, ec, t);
    if (f.kind === 'noise') {
      this.appendPropRow(sec, layer, f.noiseScale, 'field.noiseScale', false, ec, t);
      this.appendPropRow(sec, layer, f.noiseSpeed, 'field.noiseSpeed', false, ec, t);
    } else if (f.kind === 'vortex') {
      this.appendPropRow(sec, layer, f.swirlAngle, 'field.swirlAngle', false, ec, t);
      this.appendPropRow(sec, layer, f.pullInward, 'field.pullInward', false, ec, t);
    }
    this.container.appendChild(sec);
  }

  private renderCameraSection(layer: Layer, ec: EvalContext, t: number): void {
    const c = layer.camera!;
    const sec = this.makeSection('摄像机与真实景深 (DoF)', true);
    const dofChk = document.createElement('div');
    dofChk.className = 'insp-row-checks';
    dofChk.innerHTML = `<label><input type="checkbox" id="cam-dof" ${c.dofEnabled ? 'checked' : ''} /> 开启真实深度景深</label>`;
    dofChk.querySelector('#cam-dof')!.addEventListener('change', (e) => { this.store.beginEdit(); c.dofEnabled = (e.target as HTMLInputElement).checked; this.store.commitEdit(false); });
    sec.appendChild(dofChk);
    this.appendPropRow(sec, layer, c.target, 'camera.target', true, ec, t);
    this.appendPropRow(sec, layer, c.fov, 'camera.fov', false, ec, t);
    this.appendPropRow(sec, layer, c.focalDistance, 'camera.focalDistance', false, ec, t);
    this.appendPropRow(sec, layer, c.aperture, 'camera.aperture', false, ec, t);
    this.container.appendChild(sec);
  }

  private renderLightSection(layer: Layer, ec: EvalContext, t: number): void {
    const l = layer.light!;
    const sec = this.makeSection('灯光与阴影', true);
    const row = document.createElement('div');
    row.className = 'insp-grid-2';
    row.innerHTML = `
      <label class="insp-inline-field"><span>类型</span>
        <select id="lt-type">
          <option value="directional" ${l.lightType === 'directional' ? 'selected' : ''}>平行光</option>
          <option value="point" ${l.lightType === 'point' ? 'selected' : ''}>点光源</option>
        </select>
      </label>
      <label class="insp-inline-field"><input type="checkbox" id="lt-sh" ${l.castShadow ? 'checked' : ''} /> 真实几何投影</label>
    `;
    row.querySelector('#lt-type')!.addEventListener('change', (e) => { this.store.beginEdit(); l.lightType = (e.target as HTMLSelectElement).value as any; this.store.commitEdit(false); });
    row.querySelector('#lt-sh')!.addEventListener('change', (e) => { this.store.beginEdit(); l.castShadow = (e.target as HTMLInputElement).checked; this.store.commitEdit(false); });
    sec.appendChild(row);
    this.appendPropRow(sec, layer, l.color, 'light.color', false, ec, t);
    this.appendPropRow(sec, layer, l.intensity, 'light.intensity', false, ec, t);
    if (l.lightType === 'directional') this.appendPropRow(sec, layer, l.target, 'light.target', true, ec, t);
    else this.appendPropRow(sec, layer, l.range, 'light.range', false, ec, t);
    this.container.appendChild(sec);
  }

  private renderParticleSection(layer: Layer, ec: EvalContext, t: number): void {
    const pc = layer.particle!;
    const comp = this.store.getActiveComp();
    const sec = this.makeSection('粒子系统、力场、碰撞与拖尾', true);

    const addEm = document.createElement('button');
    addEm.className = 'mini-btn accent';
    addEm.textContent = '+ 添加发射器';
    addEm.addEventListener('click', () => {
      this.store.beginEdit();
      pc.emitters.push(createDefaultEmitter(`发射器 ${pc.emitters.length + 1}`));
      this.store.commitEdit();
    });
    sec.appendChild(addEm);

    const meshLayers = comp.layers.filter((l) => l.type === 'mesh3d');
    const curveLayers = comp.layers.filter((l) => l.type === 'shape' || l.type === 'text');
    const fieldLayers = comp.layers.filter((l) => l.type === 'field');

    pc.emitters.forEach((em, idx) => {
      const card = document.createElement('div');
      card.className = 'insp-subcard';
      const srcOpts = em.sourceKind === 'surface' ? meshLayers : em.sourceKind === 'curve' ? curveLayers : [];
      card.innerHTML = `
        <div class="subcard-head">
          <label><input type="checkbox" ${em.enabled ? 'checked' : ''} data-act="en" /> ${this.esc(em.name)}</label>
          <button class="tiny-btn danger" data-act="del">✕</button>
        </div>
        <div class="insp-grid-2">
          <label class="insp-inline-field"><span>发射源</span>
            <select data-act="kind">
              <option value="point" ${em.sourceKind === 'point' ? 'selected' : ''}>点发射</option>
              <option value="curve" ${em.sourceKind === 'curve' ? 'selected' : ''}>曲线发射</option>
              <option value="surface" ${em.sourceKind === 'surface' ? 'selected' : ''}>变形表面发射</option>
            </select>
          </label>
          ${em.sourceKind !== 'point' ? `
            <label class="insp-inline-field"><span>绑定几何</span>
              <select data-act="src">
                <option value="">请选择</option>
                ${srcOpts.map((l) => `<option value="${l.id}" ${em.sourceLayerId === l.id ? 'selected' : ''}>${this.esc(l.name)}</option>`).join('')}
              </select>
            </label>
          ` : `<label class="insp-inline-field"><span>随机种子</span><input type="number" data-act="seed" value="${em.seed}" /></label>`}
        </div>
      `;
      card.querySelector('[data-act="en"]')!.addEventListener('change', (e) => { this.store.beginEdit(); em.enabled = (e.target as HTMLInputElement).checked; this.store.commitEdit(); });
      card.querySelector('[data-act="del"]')!.addEventListener('click', () => { this.store.beginEdit(); pc.emitters.splice(idx, 1); this.store.commitEdit(); });
      card.querySelector('[data-act="kind"]')!.addEventListener('change', (e) => { this.store.beginEdit(); em.sourceKind = (e.target as HTMLSelectElement).value as any; this.store.commitEdit(); });
      card.querySelector('[data-act="src"]')?.addEventListener('change', (e) => { this.store.beginEdit(); em.sourceLayerId = (e.target as HTMLSelectElement).value; em.sourceNodeRef = undefined; this.store.commitEdit(); });
      card.querySelector('[data-act="seed"]')?.addEventListener('change', (e) => { this.store.beginEdit(); em.seed = Number((e.target as HTMLInputElement).value); this.store.commitEdit(); });

      this.appendPropRow(card, layer, em.rate, `emt.${em.id}.rate`, false, ec, t);
      this.appendPropRow(card, layer, em.burst, `emt.${em.id}.burst`, false, ec, t);
      this.appendPropRow(card, layer, em.speed, `emt.${em.id}.speed`, false, ec, t);
      this.appendPropRow(card, layer, em.spread, `emt.${em.id}.spread`, false, ec, t);
      this.appendPropRow(card, layer, em.life, `emt.${em.id}.life`, false, ec, t);
      this.appendPropRow(card, layer, em.sizeStart, `emt.${em.id}.sizeStart`, false, ec, t);
      this.appendPropRow(card, layer, em.colorStart, `emt.${em.id}.colorStart`, false, ec, t);
      sec.appendChild(card);
    });

    // Forces, Attractors, Colliders & Trails
    this.appendPropRow(sec, layer, pc.gravity, 'particle.gravity', false, ec, t);
    this.appendPropRow(sec, layer, pc.directionalForce, 'particle.dirForce', false, ec, t);
    this.appendPropRow(sec, layer, pc.drag, 'particle.drag', false, ec, t);
    this.appendPropRow(sec, layer, pc.restitution, 'particle.restitution', false, ec, t);
    this.appendPropRow(sec, layer, pc.friction, 'particle.friction', false, ec, t);

    const attAdd = document.createElement('button');
    attAdd.className = 'mini-btn';
    attAdd.textContent = '+ 添加吸引/排斥点';
    attAdd.addEventListener('click', () => {
      this.store.beginEdit();
      pc.attractors.push({
        id: genId('att'),
        name: `吸引/排斥 ${pc.attractors.length + 1}`,
        enabled: true,
        position: makeProp('position', '力心位置', 'vec3', [0, 40, 20]),
        strength: makeProp('strength', '强度(+吸/-斥)', 'scalar', 650, { min: -4000, max: 4000 }),
        radius: makeProp('radius', '作用半径', 'scalar', 340, { min: 20, max: 2000 }),
      });
      this.store.commitEdit();
    });
    sec.appendChild(attAdd);

    pc.attractors.forEach((att, aidx) => {
      const ac = document.createElement('div');
      ac.className = 'insp-subcard';
      ac.innerHTML = `<div class="subcard-head"><label><input type="checkbox" ${att.enabled ? 'checked' : ''} data-a="en" /> ${this.esc(att.name)}</label><button class="tiny-btn danger" data-a="del">✕</button></div>`;
      ac.querySelector('[data-a="en"]')!.addEventListener('change', (e) => { this.store.beginEdit(); att.enabled = (e.target as HTMLInputElement).checked; this.store.commitEdit(); });
      ac.querySelector('[data-a="del"]')!.addEventListener('click', () => { this.store.beginEdit(); pc.attractors.splice(aidx, 1); this.store.commitEdit(); });
      this.appendPropRow(ac, layer, att.position, `att.${att.id}.pos`, false, ec, t);
      this.appendPropRow(ac, layer, att.strength, `att.${att.id}.str`, false, ec, t);
      this.appendPropRow(ac, layer, att.radius, `att.${att.id}.rad`, false, ec, t);
      sec.appendChild(ac);
    });

    const optRow = document.createElement('div');
    optRow.className = 'insp-row-checks';
    optRow.innerHTML = `
      <label><input type="checkbox" id="pt-sub" ${pc.subEmitOnCollision ? 'checked' : ''} /> 碰撞次级分裂</label>
      <label><input type="checkbox" id="pt-tr" ${pc.trailsEnabled ? 'checked' : ''} /> 三维轨迹拖尾</label>
    `;
    optRow.querySelector('#pt-sub')!.addEventListener('change', (e) => { this.store.beginEdit(); pc.subEmitOnCollision = (e.target as HTMLInputElement).checked; this.store.commitEdit(); });
    optRow.querySelector('#pt-tr')!.addEventListener('change', (e) => { this.store.beginEdit(); pc.trailsEnabled = (e.target as HTMLInputElement).checked; this.store.commitEdit(); });
    sec.appendChild(optRow);
    if (pc.trailsEnabled) {
      this.appendPropRow(sec, layer, pc.trailLength, 'particle.trailLength', false, ec, t);
      this.appendPropRow(sec, layer, pc.trailWidth, 'particle.trailWidth', false, ec, t);
    }

    // Space Fields & Colliders checklist
    if (fieldLayers.length > 0) {
      const fDiv = document.createElement('div');
      fDiv.className = 'insp-check-group';
      fDiv.innerHTML = `<div class="insp-sub-title">作用空间场</div>` + fieldLayers.map((fl) => `<label><input type="checkbox" value="${fl.id}" ${pc.fieldLayerIds.includes(fl.id) ? 'checked' : ''} /> ${this.esc(fl.name)}</label>`).join('');
      fDiv.querySelectorAll('input').forEach((inp) => inp.addEventListener('change', () => {
        this.store.beginEdit();
        const s = new Set(pc.fieldLayerIds);
        if (inp.checked) s.add(inp.value); else s.delete(inp.value);
        pc.fieldLayerIds = Array.from(s);
        this.store.commitEdit();
      }));
      sec.appendChild(fDiv);
    }
    if (meshLayers.length > 0) {
      const cDiv = document.createElement('div');
      cDiv.className = 'insp-check-group';
      cDiv.innerHTML = `<div class="insp-sub-title">碰撞实体表面</div>` + meshLayers.map((ml) => `<label><input type="checkbox" value="${ml.id}" ${pc.colliderLayerIds.includes(ml.id) ? 'checked' : ''} /> ${this.esc(ml.name)}</label>`).join('');
      cDiv.querySelectorAll('input').forEach((inp) => inp.addEventListener('change', () => {
        this.store.beginEdit();
        const s = new Set(pc.colliderLayerIds);
        if (inp.checked) s.add(inp.value); else s.delete(inp.value);
        pc.colliderLayerIds = Array.from(s);
        this.store.commitEdit();
      }));
      sec.appendChild(cDiv);
    }

    this.container.appendChild(sec);
  }

  private renderPrecompSection(layer: Layer, ec: EvalContext, t: number): void {
    const pr = layer.precomp!;
    const sec = this.makeSection('预合成与时间重映射', true);
    const comps = this.store.project.compositions.filter((c) => c.id !== this.store.getActiveComp().id);
    const box = document.createElement('div');
    box.innerHTML = `
      <div class="insp-grid-2">
        <label class="insp-inline-field"><span>引用合成</span>
          <select id="pc-comp">${comps.map((c) => `<option value="${c.id}" ${pr.compId === c.id ? 'selected' : ''}>${this.esc(c.name)}</option>`).join('')}</select>
        </label>
        <label class="insp-inline-field"><span>起始偏移(s)</span><input type="number" id="pc-st" value="${layer.startTime.toFixed(2)}" step="0.1" /></label>
      </div>
      <div class="insp-row-checks">
        <label><input type="checkbox" id="pc-tr-en" ${pr.timeRemapEnabled ? 'checked' : ''} /> 启用时间重映射（变速/倒放/定格）</label>
        <button class="mini-btn accent" id="pc-open">进入子合成 →</button>
      </div>
    `;
    box.querySelector('#pc-comp')!.addEventListener('change', (e) => { this.store.beginEdit(); pr.compId = (e.target as HTMLSelectElement).value; this.store.commitEdit(); });
    box.querySelector('#pc-st')!.addEventListener('change', (e) => { this.store.beginEdit(); layer.startTime = Number((e.target as HTMLInputElement).value); this.store.commitEdit(); });
    box.querySelector('#pc-tr-en')!.addEventListener('change', (e) => {
      this.store.beginEdit();
      pr.timeRemapEnabled = (e.target as HTMLInputElement).checked;
      if (pr.timeRemapEnabled && pr.timeRemap.keyframes.length === 0) {
        const sub = this.store.project.compositions.find((c) => c.id === pr.compId);
        const dur = sub?.duration ?? 5;
        pr.timeRemap.animated = true;
        pr.timeRemap.keyframes = [makeKeyframe(0, 0, 'linear'), makeKeyframe(dur, dur, 'linear')];
      }
      this.store.commitEdit();
    });
    box.querySelector('#pc-open')!.addEventListener('click', () => { if (pr.compId) this.store.switchComp(pr.compId); });
    sec.appendChild(box);
    if (pr.timeRemapEnabled) {
      this.appendPropRow(sec, layer, pr.timeRemap, 'precomp.timeRemap', false, ec, t);
    }
    this.container.appendChild(sec);
  }

  private renderAudioSection(layer: Layer, ec: EvalContext, t: number): void {
    const ac = layer.audio!;
    const comp = this.store.getActiveComp();
    const sec = this.makeSection('内置音色合成与事件', true);
    const presets: Array<[AudioPresetKind, string]> = [
      ['forgeStrike', '锻锤轰鸣'], ['metalRing', '淬火铁鸣'], ['brushStroke', '笔锋划音'],
      ['emberCrackle', '火星噼啪'], ['subBass', '低频铺底'], ['padDrone', '工坊暗涌'], ['synthArp', '金属音序'],
    ];
    const head = document.createElement('div');
    head.className = 'insp-grid-2';
    head.innerHTML = `
      <label class="insp-inline-field"><span>音色</span>
        <select id="au-pre">${presets.map(([k, lb]) => `<option value="${k}" ${ac.preset === k ? 'selected' : ''}>${lb}</option>`).join('')}</select>
      </label>
      <div class="insp-btn-row">
        <button class="mini-btn accent" id="au-test">🔊 试听</button>
        <label class="mini-chk"><input type="checkbox" id="au-mute" ${ac.muted ? 'checked' : ''} /> 静音</label>
      </div>
    `;
    head.querySelector('#au-pre')!.addEventListener('change', (e) => { this.store.beginEdit(); ac.preset = (e.target as HTMLSelectElement).value as AudioPresetKind; this.store.commitEdit(false); });
    head.querySelector('#au-mute')!.addEventListener('change', (e) => { this.store.beginEdit(); ac.muted = (e.target as HTMLInputElement).checked; this.store.commitEdit(false); });
    head.querySelector('#au-test')!.addEventListener('click', () => audioEngine.previewLayer(comp, layer, t));
    sec.appendChild(head);

    this.appendPropRow(sec, layer, ac.gain, 'audio.gain', false, ec, t);
    this.appendPropRow(sec, layer, ac.pitchShift, 'audio.pitchShift', false, ec, t);
    this.appendPropRow(sec, layer, ac.filterCutoff, 'audio.filterCutoff', false, ec, t);
    this.appendPropRow(sec, layer, ac.decay, 'audio.decay', false, ec, t);
    this.appendPropRow(sec, layer, ac.reverbMix, 'audio.reverbMix', false, ec, t);

    // Trigger Events list
    const evWrap = document.createElement('div');
    evWrap.innerHTML = `<div class="insp-sub-title">触发事件 (${ac.events.length}) <button class="tiny-btn accent" id="au-add-ev">+ 当前时刻添加</button></div>`;
    evWrap.querySelector('#au-add-ev')!.addEventListener('click', () => {
      this.store.beginEdit();
      ac.events.push({ id: genId('snd'), time: Number(t.toFixed(2)), duration: 1.4, pitch: 110, velocity: 0.9 });
      ac.events.sort((a, b) => a.time - b.time);
      this.store.commitEdit(false);
    });
    ac.events.forEach((ev, idx) => {
      const r = document.createElement('div');
      r.className = 'au-ev-row';
      r.innerHTML = `
        <span>t:</span><input type="number" value="${ev.time.toFixed(2)}" step="0.05" data-f="time" />
        <span>Hz:</span><input type="number" value="${Math.round(ev.pitch)}" step="10" data-f="pitch" />
        <span>力:</span><input type="number" value="${ev.velocity.toFixed(2)}" step="0.1" min="0" max="1" data-f="velocity" />
        <button class="tiny-btn danger">✕</button>
      `;
      r.querySelectorAll('input').forEach((inp) => inp.addEventListener('change', () => {
        this.store.beginEdit();
        (ev as any)[inp.dataset.f!] = Number(inp.value);
        this.store.commitEdit(false);
      }));
      r.querySelector('button')!.addEventListener('click', () => { this.store.beginEdit(); ac.events.splice(idx, 1); this.store.commitEdit(false); });
      evWrap.appendChild(r);
    });
    sec.appendChild(evWrap);
    this.container.appendChild(sec);
  }

  private renderMasksSection(layer: Layer, ec: EvalContext, t: number): void {
    const sec = this.makeSection(`蒙版 (${layer.masks.length})`, layer.masks.length > 0);
    const bar = document.createElement('div');
    bar.className = 'insp-btn-row';
    bar.innerHTML = `<button class="mini-btn" data-k="rect">+矩形蒙版</button><button class="mini-btn" data-k="ellipse">+椭圆蒙版</button>`;
    bar.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      this.store.beginEdit();
      layer.masks.push(createMask((b as HTMLElement).dataset.k as any));
      this.store.commitEdit(false);
    }));
    sec.appendChild(bar);

    layer.masks.forEach((m, idx) => {
      const card = document.createElement('div');
      card.className = 'insp-subcard';
      card.innerHTML = `
        <div class="subcard-head">
          <label><input type="checkbox" ${m.enabled ? 'checked' : ''} data-a="en" /> ${this.esc(m.name)}</label>
          <select data-a="mode" class="mini-select">
            <option value="add" ${m.mode === 'add' ? 'selected' : ''}>相加</option>
            <option value="subtract" ${m.mode === 'subtract' ? 'selected' : ''}>相减</option>
            <option value="intersect" ${m.mode === 'intersect' ? 'selected' : ''}>交集</option>
          </select>
          <label class="mini-chk"><input type="checkbox" ${m.inverted ? 'checked' : ''} data-a="inv" />反转</label>
          <button class="tiny-btn" data-a="kfpath" title="为蒙版路径打关键帧">◆路径</button>
          <button class="tiny-btn danger" data-a="del">✕</button>
        </div>
      `;
      card.querySelector('[data-a="en"]')!.addEventListener('change', (e) => { this.store.beginEdit(); m.enabled = (e.target as HTMLInputElement).checked; this.store.commitEdit(false); });
      card.querySelector('[data-a="mode"]')!.addEventListener('change', (e) => { this.store.beginEdit(); m.mode = (e.target as HTMLSelectElement).value as MaskMode; this.store.commitEdit(false); });
      card.querySelector('[data-a="inv"]')!.addEventListener('change', (e) => { this.store.beginEdit(); m.inverted = (e.target as HTMLInputElement).checked; this.store.commitEdit(false); });
      card.querySelector('[data-a="kfpath"]')!.addEventListener('click', () => {
        this.store.beginEdit();
        m.path.animated = true;
        setPropValueAtTime(m.path, t, ec.evaluateProp(layer, m.path, `msk.${m.id}.path`, t));
        this.store.commitEdit(false);
        this.store.showToast('已记录当前时刻蒙版路径关键帧');
      });
      card.querySelector('[data-a="del"]')!.addEventListener('click', () => { this.store.beginEdit(); layer.masks.splice(idx, 1); this.store.commitEdit(false); });
      this.appendPropRow(card, layer, m.feather, `msk.${m.id}.feather`, false, ec, t);
      this.appendPropRow(card, layer, m.opacity, `msk.${m.id}.opacity`, false, ec, t);
      sec.appendChild(card);
    });
    this.container.appendChild(sec);
  }

  private renderEffectsSection(layer: Layer, ec: EvalContext, t: number): void {
    const sec = this.makeSection(`效果栈 (${layer.effects.length})`, layer.effects.length > 0);
    const bar = document.createElement('div');
    bar.className = 'insp-btn-row';
    bar.innerHTML = `
      <button class="mini-btn" data-fx="gaussianBlur">+高斯模糊</button>
      <button class="mini-btn" data-fx="glow">+发光</button>
      <button class="mini-btn" data-fx="dropShadow">+投影</button>
      <button class="mini-btn" data-fx="hsl">+色相/饱和度</button>
    `;
    bar.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      this.store.beginEdit();
      layer.effects.push(createEffect((b as HTMLElement).dataset.fx as EffectType));
      this.store.commitEdit(false);
    }));
    sec.appendChild(bar);

    layer.effects.forEach((fx, idx) => {
      const card = document.createElement('div');
      card.className = 'insp-subcard';
      card.innerHTML = `
        <div class="subcard-head">
          <label><input type="checkbox" ${fx.enabled ? 'checked' : ''} data-a="en" /> ${this.esc(fx.name)}</label>
          <div>
            <button class="tiny-btn" data-a="up">↑</button>
            <button class="tiny-btn" data-a="dn">↓</button>
            <button class="tiny-btn danger" data-a="del">✕</button>
          </div>
        </div>
      `;
      card.querySelector('[data-a="en"]')!.addEventListener('change', (e) => { this.store.beginEdit(); fx.enabled = (e.target as HTMLInputElement).checked; this.store.commitEdit(false); });
      card.querySelector('[data-a="up"]')!.addEventListener('click', () => { if (idx > 0) { this.store.beginEdit(); [layer.effects[idx - 1], layer.effects[idx]] = [layer.effects[idx], layer.effects[idx - 1]]; this.store.commitEdit(false); } });
      card.querySelector('[data-a="dn"]')!.addEventListener('click', () => { if (idx < layer.effects.length - 1) { this.store.beginEdit(); [layer.effects[idx + 1], layer.effects[idx]] = [layer.effects[idx], layer.effects[idx + 1]]; this.store.commitEdit(false); } });
      card.querySelector('[data-a="del"]')!.addEventListener('click', () => { this.store.beginEdit(); layer.effects.splice(idx, 1); this.store.commitEdit(false); });

      if (fx.blurRadius) this.appendPropRow(card, layer, fx.blurRadius, `fx.${fx.id}.blurRadius`, false, ec, t);
      if (fx.glowThreshold) this.appendPropRow(card, layer, fx.glowThreshold, `fx.${fx.id}.glowThreshold`, false, ec, t);
      if (fx.glowRadius) this.appendPropRow(card, layer, fx.glowRadius, `fx.${fx.id}.glowRadius`, false, ec, t);
      if (fx.glowIntensity) this.appendPropRow(card, layer, fx.glowIntensity, `fx.${fx.id}.glowIntensity`, false, ec, t);
      if (fx.glowColor) this.appendPropRow(card, layer, fx.glowColor, `fx.${fx.id}.glowColor`, false, ec, t);
      if (fx.shadowColor) this.appendPropRow(card, layer, fx.shadowColor, `fx.${fx.id}.shadowColor`, false, ec, t);
      if (fx.shadowOpacity) this.appendPropRow(card, layer, fx.shadowOpacity, `fx.${fx.id}.shadowOpacity`, false, ec, t);
      if (fx.shadowAngle) this.appendPropRow(card, layer, fx.shadowAngle, `fx.${fx.id}.shadowAngle`, false, ec, t);
      if (fx.shadowDistance) this.appendPropRow(card, layer, fx.shadowDistance, `fx.${fx.id}.shadowDistance`, false, ec, t);
      if (fx.shadowBlur) this.appendPropRow(card, layer, fx.shadowBlur, `fx.${fx.id}.shadowBlur`, false, ec, t);
      if (fx.hue) this.appendPropRow(card, layer, fx.hue, `fx.${fx.id}.hue`, false, ec, t);
      if (fx.saturation) this.appendPropRow(card, layer, fx.saturation, `fx.${fx.id}.saturation`, false, ec, t);
      if (fx.lightness) this.appendPropRow(card, layer, fx.lightness, `fx.${fx.id}.lightness`, false, ec, t);
      sec.appendChild(card);
    });
    this.container.appendChild(sec);
  }

  // ==========================================================================
  // Universal Animated Property Row + Inline Expression Editor!
  // ==========================================================================
  private appendPropRow(
    parent: HTMLElement,
    layer: Layer,
    prop: AnimProp<any>,
    propPath: string,
    isSpatial: boolean,
    ec: EvalContext,
    time: number,
    customApply?: (val: any) => void
  ): void {
    const comp = this.store.getActiveComp();
    const exprKey = `${layer.id}:${propPath}`;
    const curVal = ec.evaluateProp(layer, prop, propPath, time, isSpatial);
    const hasKfNow = prop.animated && prop.keyframes.some((k) => Math.abs(k.time - time) < 0.02);

    const wrap = document.createElement('div');
    wrap.className = 'prop-row-wrap';

    const row = document.createElement('div');
    row.className = 'prop-row';
    row.innerHTML = `
      <div class="prop-left">
        <button class="prop-sw ${prop.animated ? 'on' : ''}" data-a="watch" title="关键帧秒表">⏱</button>
        <button class="prop-kf ${hasKfNow ? 'on' : ''}" data-a="kf" title="在当前时刻打/删关键帧">◆</button>
        <span class="prop-lbl" title="${prop.label}">${prop.label}</span>
      </div>
      <div class="prop-inputs"></div>
      <div class="prop-right">
        <button class="prop-fx ${prop.expressionEnabled ? 'on' : ''}" data-a="fx" title="编辑表达式">fx</button>
        <button class="prop-gr" data-a="gr" title="在曲线视图中打开">📈</button>
      </div>
    `;

    const applyVal = (newVal: any) => {
      this.store.beginEdit();
      if (customApply) customApply(newVal);
      else setPropValueAtTime(prop, this.store.currentTime, newVal);
      this.store.commitEdit();
    };

    const inputsHost = row.querySelector('.prop-inputs') as HTMLElement;
    const step = prop.step ?? (prop.type === 'scalar' && (prop.max ?? 100) <= 10 ? 0.05 : 1);

    if (prop.type === 'scalar') {
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.name = `${layer.id}_${propPath}`;
      inp.className = 'num-in';
      inp.step = String(step);
      inp.value = Number(curVal).toFixed(step < 1 ? 2 : 1);
      inp.addEventListener('change', () => {
        let v = Number(inp.value);
        if (prop.min !== undefined) v = Math.max(prop.min, v);
        if (prop.max !== undefined) v = Math.min(prop.max, v);
        applyVal(v);
      });
      this.liveBindings.push({
        el: inp,
        evalFn: (tt) => {
          const v = new EvalContext(this.store.getActiveComp()).evaluateProp(layer, prop, propPath, tt, isSpatial) as number;
          return Number(v).toFixed(step < 1 ? 2 : 1);
        },
      });
      inputsHost.appendChild(inp);
    } else if (prop.type === 'vec2' || prop.type === 'vec3') {
      const count = prop.type === 'vec2' ? 2 : (!layer.is3D && (propPath === 'position' || propPath === 'scale' || propPath === 'anchor') ? 2 : 3);
      const is2DRot = !layer.is3D && propPath === 'rotation';
      const axes = is2DRot ? [2] : Array.from({ length: count }, (_, i) => i);
      for (const ai of axes) {
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.name = `${layer.id}_${propPath}_${ai}`;
        inp.className = 'num-in';
        inp.step = String(step);
        inp.value = Number((curVal as number[])[ai] ?? 0).toFixed(1);
        inp.addEventListener('change', () => {
          const latest = [...(new EvalContext(comp).evaluateProp(layer, prop, propPath, this.store.currentTime, isSpatial) as number[])];
          latest[ai] = Number(inp.value);
          applyVal(latest);
        });
        this.liveBindings.push({
          el: inp,
          evalFn: (tt) => {
            const arr = new EvalContext(this.store.getActiveComp()).evaluateProp(layer, prop, propPath, tt, isSpatial) as number[];
            return Number(arr[ai] ?? 0).toFixed(1);
          },
        });
        inputsHost.appendChild(inp);
      }
    } else if (prop.type === 'color') {
      const inp = document.createElement('input');
      inp.type = 'color';
      inp.className = 'color-in';
      inp.value = rgbaToHex(curVal as ColorRGBA);
      inp.addEventListener('input', () => {
        applyVal(hexToRgba(inp.value, (curVal as ColorRGBA)[3] ?? 1));
      });
      this.liveBindings.push({
        el: inp,
        evalFn: (tt) => rgbaToHex(new EvalContext(this.store.getActiveComp()).evaluateProp(layer, prop, propPath, tt, false) as ColorRGBA),
      });
      inputsHost.appendChild(inp);
    }

    row.querySelector('[data-a="watch"]')!.addEventListener('click', () => {
      this.store.beginEdit();
      togglePropAnimation(prop, this.store.currentTime, curVal);
      this.store.commitEdit();
    });
    row.querySelector('[data-a="kf"]')!.addEventListener('click', () => {
      this.store.beginEdit();
      prop.animated = true;
      const idx = prop.keyframes.findIndex((k) => Math.abs(k.time - this.store.currentTime) < 0.02);
      if (idx >= 0) prop.keyframes.splice(idx, 1);
      else setPropValueAtTime(prop, this.store.currentTime, curVal);
      this.store.commitEdit();
    });
    row.querySelector('[data-a="fx"]')!.addEventListener('click', () => {
      if (this.openExprKeys.has(exprKey)) this.openExprKeys.delete(exprKey);
      else this.openExprKeys.add(exprKey);
      this.update(true);
    });
    row.querySelector('[data-a="gr"]')!.addEventListener('click', () => {
      this.store.graphTarget = { layerId: layer.id, propPath, propLabel: `${layer.name} · ${prop.label}` };
      this.store.bottomTab = 'graph';
      this.store.notify('ui');
    });

    wrap.appendChild(row);

    // Inline Expression Editor Drawer
    if (this.openExprKeys.has(exprKey)) {
      const exDiv = document.createElement('div');
      exDiv.className = 'expr-drawer';
      const err = this.store.diagnostics.find((d) => d.layerId === layer.id && d.propPath === propPath);
      exDiv.innerHTML = `
        <div class="expr-head">
          <label><input type="checkbox" ${prop.expressionEnabled ? 'checked' : ''} data-ex="en" /> 启用表达式</label>
          <div class="expr-chips">
            <button data-sn="wiggle(4, 25)">wiggle</button>
            <button data-sn='loopOut("cycle")'>cycle</button>
            <button data-sn='loopOut("pingpong")'>pingpong</button>
            <button data-sn="ease(time, 0, 4, 0, 100)">ease</button>
            <button data-sn='thisComp.layer(1).transform.opacity.valueAtTime(time - 0.3)'>valueAtTime</button>
          </div>
        </div>
        <textarea class="expr-code" rows="2" placeholder="如：wiggle(5, 20) 或 thisComp.layer(&quot;控制器&quot;).transform.rotation">${this.esc(prop.expression)}</textarea>
        ${err ? `<div class="expr-err">⚠ ${this.esc(err.error)}</div>` : ''}
      `;
      const enChk = exDiv.querySelector('[data-ex="en"]') as HTMLInputElement;
      const ta = exDiv.querySelector('.expr-code') as HTMLTextAreaElement;
      enChk.addEventListener('change', () => {
        this.store.beginEdit();
        prop.expressionEnabled = enChk.checked;
        this.store.commitEdit();
      });
      ta.addEventListener('change', () => {
        this.store.beginEdit();
        prop.expression = ta.value;
        prop.expressionEnabled = ta.value.trim().length > 0;
        this.store.commitEdit();
      });
      exDiv.querySelectorAll('[data-sn]').forEach((b) => {
        b.addEventListener('click', () => {
          const sn = (b as HTMLElement).dataset.sn!;
          this.store.beginEdit();
          prop.expression = sn;
          prop.expressionEnabled = true;
          this.store.commitEdit();
        });
      });
      wrap.appendChild(exDiv);
    }

    parent.appendChild(wrap);
  }

  private makeSection(title: string, open = true): HTMLElement {
    const det = document.createElement('details');
    det.className = 'insp-section';
    det.open = open;
    const sum = document.createElement('summary');
    sum.textContent = title;
    det.appendChild(sum);
    return det;
  }

  private layerTypeLabel(t: Layer['type']): string {
    const map: Record<Layer['type'], string> = {
      shape: '形状', text: '文字', null: '空对象', adjustment: '调整层', precomp: '预合成',
      camera: '摄像机', light: '灯光', mesh3d: '三维实体', particle: '粒子', audio: '音色', field: '空间场',
    };
    return map[t] || t;
  }

  private esc(s: string): string {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
