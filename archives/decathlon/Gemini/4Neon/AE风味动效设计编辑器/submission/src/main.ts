import { ActiveTool } from './core/types';
import { clamp } from './core/math';
import { fontManager } from './geometry/fontEngine';
import { WebGL2StudioRenderer } from './render/renderer2d3d';
import { audioEngine } from './audio/audioEngine';
import { particleEngine } from './simulation/particleEngine';
import { EditorStore } from './ui/store';
import { ViewportOverlayController } from './ui/viewportOverlay';
import { TimelinePanel } from './ui/timelinePanel';
import { GraphPanel } from './ui/graphPanel';
import { NodePanel } from './ui/nodePanel';
import { InspectorPanel } from './ui/inspectorPanel';
import { ProjectPanel } from './ui/projectPanel';
import { bindGlobalShortcuts } from './ui/shortcuts';

declare global {
  interface Window {
    videoExport: {
      runs: string[];
      begin: (runId: string, opts?: { fps?: number }) => Promise<{ frames: number }>;
      frame: (i: number) => Promise<void>;
      end: () => void;
    };
    __FORGE_STORE__?: EditorStore;
  }
}

class ForgeMotionStudioApp {
  private store: EditorStore;
  private renderer!: WebGL2StudioRenderer;
  private overlay!: ViewportOverlayController;
  private projectPanel!: ProjectPanel;
  private inspectorPanel!: InspectorPanel;
  private timelinePanel!: TimelinePanel;
  private graphPanel!: GraphPanel;
  private nodePanel!: NodePanel;

  private glCanvas!: HTMLCanvasElement;
  private overlayCanvas!: HTMLCanvasElement;
  private stageFrameEl!: HTMLElement;
  private stageWrapEl!: HTMLElement;
  private hudStatusEl!: HTMLElement;
  private audioMeterFillEl!: HTMLElement;
  private toastEl!: HTMLElement;

  private rafId = 0;
  private lastRafMs = 0;
  private dirtyRender = true;
  private dirtyUi = true;
  private exportFps = 60;

  constructor() {
    fontManager.init();
    this.store = new EditorStore();
    window.__FORGE_STORE__ = this.store;

    this.buildShellDOM();
    this.initSubsystems();
    this.bindTopbarAndTabs();
    bindGlobalShortcuts(this.store, this.timelinePanel);
    this.registerVideoExportAPI();

    this.store.subscribe((reason) => {
      if (reason === 'render' || reason === 'full') this.dirtyRender = true;
      if (reason === 'ui' || reason === 'full') this.dirtyUi = true;
    });

    window.addEventListener('resize', () => {
      this.fitViewportStage();
      this.dirtyRender = true;
      this.dirtyUi = true;
    });

    this.fitViewportStage();
    this.fullRefresh();
    this.startLoop();
  }

  private buildShellDOM(): void {
    const app = document.getElementById('app')!;
    const tools: Array<{ id: ActiveTool; icon: string; tip: string }> = [
      { id: 'select', icon: '↖', tip: '选择与直接编辑 (V)' },
      { id: 'anchor', icon: '⊕', tip: '移动锚点(保持画面不动) (Y)' },
      { id: 'rotate', icon: '↻', tip: '旋转工具 (W)' },
      { id: 'scale', icon: '⤢', tip: '缩放工具 (S)' },
      { id: 'pen', icon: '✒', tip: '钢笔/贝塞尔节点编辑 (G)' },
      { id: 'rect', icon: '▭', tip: '绘制矩形 (R)' },
      { id: 'ellipse', icon: '◯', tip: '绘制椭圆 (E)' },
      { id: 'text', icon: '字', tip: '文字工具 (T)' },
      { id: 'puppet', icon: '📌', tip: '图钉变形工具 (P)' },
      { id: 'cameraOrbit', icon: '🎥', tip: '轨道旋转摄像机 (C / Alt+拖动)' },
    ];

    app.innerHTML = `
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark">锻</span>
          <div class="brand-text">
            <span class="brand-name">玄锻动效</span>
            <span class="brand-sub">FORGE MOTION AE</span>
          </div>
        </div>

        <div class="tool-palette" id="tool-palette">
          ${tools.map((t) => `<button class="tool-btn ${t.id === 'select' ? 'active' : ''}" data-tool="${t.id}" title="${t.tip}">${t.icon}</button>`).join('')}
        </div>

        <div class="top-actions">
          <button class="top-btn" id="act-undo" title="撤销 (Ctrl+Z)">↶ 撤销</button>
          <button class="top-btn" id="act-redo" title="重做 (Ctrl+Y)">↷ 重做</button>
          <span class="top-sep"></span>
          <button class="top-btn" id="act-precomp" title="原位预合成所选图层 (Ctrl+Shift+C)">📦 预合成</button>
          <button class="top-btn" id="act-overlays" title="显示/隐藏画布辅助线与手柄">◎ 辅助</button>
          <button class="top-btn" id="act-grid" title="显示/隐藏三维网格">⊞ 网格</button>
          <div class="audio-meter" title="实时合成音频电平">
            <span class="meter-ic">♪</span>
            <div class="meter-track"><div class="meter-fill" id="audio-meter-fill"></div></div>
          </div>
        </div>
      </header>

      <main class="workspace">
        <aside class="panel panel-left" id="panel-project"></aside>

        <section class="panel-center">
          <div class="viewport-header">
            <div class="vp-title-wrap">
              <span class="vp-title" id="vp-title">锻字 · 主合成</span>
              <button class="tiny-btn" id="vp-comp-cfg" title="编辑当前合成尺寸、帧率、时长与工作区">⚙ 合成设置</button>
            </div>
            <div class="vp-hud" id="vp-hud">1280×720 · 30fps · WebGL 2</div>
          </div>
          <div class="viewport-stage-wrap" id="vp-stage-wrap">
            <div class="viewport-stage-frame" id="vp-stage-frame">
              <canvas id="gl-canvas"></canvas>
              <canvas id="overlay-canvas"></canvas>
            </div>
          </div>
        </section>

        <aside class="panel panel-right">
          <div class="panel-head">属性与效果检查器</div>
          <div class="panel-scroll" id="panel-inspector"></div>
        </aside>
      </main>

      <section class="bottom-dock">
        <div class="dock-tabs">
          <button class="dock-tab active" data-tab="timeline">🎞 时间轴与图层</button>
          <button class="dock-tab" data-tab="graph">📈 曲线编辑器 (值/速度)</button>
          <button class="dock-tab" data-tab="nodes">⬡ 程序节点图</button>
          <div class="dock-hint" id="dock-hint">主合成 15s · 示例主题「锻字」 · 修改「主字形」文字或节点接线可实时重塑全片</div>
        </div>
        <div class="dock-pane active" id="pane-timeline"></div>
        <div class="dock-pane" id="pane-graph"></div>
        <div class="dock-pane" id="pane-nodes"></div>
      </section>

      <div class="toast" id="studio-toast"></div>
    `;

    this.glCanvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
    this.overlayCanvas = document.getElementById('overlay-canvas') as HTMLCanvasElement;
    this.stageFrameEl = document.getElementById('vp-stage-frame')!;
    this.stageWrapEl = document.getElementById('vp-stage-wrap')!;
    this.hudStatusEl = document.getElementById('vp-hud')!;
    this.audioMeterFillEl = document.getElementById('audio-meter-fill')!;
    this.toastEl = document.getElementById('studio-toast')!;
  }

  private initSubsystems(): void {
    this.renderer = new WebGL2StudioRenderer(this.glCanvas);
    this.overlay = new ViewportOverlayController(this.overlayCanvas, this.store);
    this.projectPanel = new ProjectPanel(document.getElementById('panel-project')!, this.store);
    this.inspectorPanel = new InspectorPanel(document.getElementById('panel-inspector')!, this.store);
    this.timelinePanel = new TimelinePanel(document.getElementById('pane-timeline')!, this.store);
    this.graphPanel = new GraphPanel(document.getElementById('pane-graph')!, this.store);
    this.nodePanel = new NodePanel(document.getElementById('pane-nodes')!, this.store);
  }

  private bindTopbarAndTabs(): void {
    document.querySelectorAll('#tool-palette .tool-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.store.activeTool = (btn as HTMLElement).dataset.tool as ActiveTool;
        this.store.notify('ui');
      });
    });

    document.getElementById('act-undo')!.addEventListener('click', () => this.store.undo());
    document.getElementById('act-redo')!.addEventListener('click', () => this.store.redo());
    document.getElementById('act-precomp')!.addEventListener('click', () => this.store.precomposeSelected());
    document.getElementById('act-overlays')!.addEventListener('click', () => {
      this.store.showOverlays = !this.store.showOverlays;
      this.store.notify('full');
    });
    document.getElementById('act-grid')!.addEventListener('click', () => {
      this.store.showGrid = !this.store.showGrid;
      this.store.notify('full');
    });

    document.getElementById('vp-comp-cfg')!.addEventListener('click', () => {
      this.store.selectLayer(null, false);
      this.store.showToast('已在右侧检查器打开当前合成设置');
    });

    document.querySelectorAll('.dock-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.store.bottomTab = (btn as HTMLElement).dataset.tab as any;
        this.store.notify('ui');
      });
    });
  }

  private fitViewportStage(): void {
    const comp = this.store.getActiveComp();
    const wrapW = Math.max(120, this.stageWrapEl.clientWidth - 20);
    const wrapH = Math.max(120, this.stageWrapEl.clientHeight - 16);
    const aspect = comp.width / comp.height;
    let cssW = wrapW;
    let cssH = cssW / aspect;
    if (cssH > wrapH) {
      cssH = wrapH;
      cssW = cssH * aspect;
    }
    this.stageFrameEl.style.width = `${Math.floor(cssW)}px`;
    this.stageFrameEl.style.height = `${Math.floor(cssH)}px`;
  }

  private renderViewportNow(): void {
    const comp = this.store.getActiveComp();
    this.fitViewportStage();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(160, this.stageFrameEl.clientWidth);
    const cssH = Math.max(90, this.stageFrameEl.clientHeight);
    // Crisp physical resolution matching viewport & up to 4K export clarity!
    const targetW = clamp(Math.round(Math.max(comp.width * 0.75, cssW * dpr)), 320, 3840);
    const targetH = clamp(Math.round(targetW * (comp.height / comp.width)), 180, 2160);

    const snap = this.renderer.renderFrame(this.store.project, comp, this.store.currentTime, targetW, targetH, true);
    this.store.lastSceneSnap = snap;
    this.store.diagnostics = snap.ec.diagnostics;
    this.overlay.render(snap);

    // Sync HUD & deterministic audio VU meter (4.2)
    const phaseLabel = this.getDemoPhaseLabel(comp.name, this.store.currentTime);
    this.hudStatusEl.textContent = `${comp.width}×${comp.height} · ${comp.fps}fps · ${phaseLabel}${comp.motionBlur ? ' · 运动模糊' : ''}`;
    document.getElementById('vp-title')!.textContent = `${comp.name}`;

    let maxAudio = 0;
    for (const l of comp.layers) {
      if (l.type === 'audio') {
        maxAudio = Math.max(maxAudio, audioEngine.computeLevelAtTime(comp, l, this.store.currentTime));
      }
    }
    this.audioMeterFillEl.style.width = `${Math.round(clamp(maxAudio, 0, 1) * 100)}%`;
  }

  private getDemoPhaseLabel(compName: string, t: number): string {
    if (!compName.includes('锻字')) return `${t.toFixed(2)}s`;
    if (t < 3.8) return '阶段 I · 写成';
    if (t < 6.6) return '阶段 II · 成块';
    if (t < 10.6) return '阶段 III · 锻打';
    return '阶段 IV · 冷却定型';
  }

  private syncTopbarAndTabs(): void {
    document.querySelectorAll('#tool-palette .tool-btn').forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.tool === this.store.activeTool);
    });
    document.getElementById('act-overlays')?.classList.toggle('active', this.store.showOverlays);
    document.getElementById('act-grid')?.classList.toggle('active', this.store.showGrid);
    (document.getElementById('act-undo') as HTMLButtonElement).disabled = !this.store.history.canUndo();
    (document.getElementById('act-redo') as HTMLButtonElement).disabled = !this.store.history.canRedo();

    const tab = this.store.bottomTab;
    document.querySelectorAll('.dock-tab').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.tab === tab));
    document.getElementById('pane-timeline')!.classList.toggle('active', tab === 'timeline');
    document.getElementById('pane-graph')!.classList.toggle('active', tab === 'graph');
    document.getElementById('pane-nodes')!.classList.toggle('active', tab === 'nodes');

    if (this.store.toastMsg) {
      this.toastEl.textContent = this.store.toastMsg;
      this.toastEl.classList.add('show');
    } else {
      this.toastEl.classList.remove('show');
    }
  }

  private fullRefresh(): void {
    this.syncTopbarAndTabs();
    this.renderViewportNow();
    this.projectPanel.render();
    this.inspectorPanel.update(false);
    if (this.store.bottomTab === 'timeline') this.timelinePanel.updateFull();
    else if (this.store.bottomTab === 'graph') this.graphPanel.render();
    else if (this.store.bottomTab === 'nodes') this.nodePanel.render();
  }

  private startLoop(): void {
    const tick = (nowMs: number) => {
      this.rafId = requestAnimationFrame(tick);
      if (this.store.isExportMode) return; // CRITICAL (4.2): Export mode controls time exclusively!

      const dtSec = this.lastRafMs > 0 ? Math.min(0.08, (nowMs - this.lastRafMs) / 1000) : 0;
      this.lastRafMs = nowMs;

      if (this.store.isPlaying && dtSec > 0) {
        const comp = this.store.getActiveComp();
        const prevT = this.store.currentTime;
        let nextT = prevT + dtSec;
        if (this.store.loopWorkArea) {
          if (nextT > comp.workAreaEnd) {
            nextT = comp.workAreaStart;
            audioEngine.stopAll();
          }
        } else if (nextT >= comp.duration) {
          nextT = comp.duration;
          this.store.isPlaying = false;
          audioEngine.stopAll();
        }
        this.store.currentTime = nextT;
        audioEngine.syncPlayback(comp, prevT, nextT, this.store.isPlaying, false);

        this.renderViewportNow();
        this.inspectorPanel.updateLiveValues();
        if (this.store.bottomTab === 'timeline') this.timelinePanel.updatePlayheadOnly();
        else if (this.store.bottomTab === 'graph') this.graphPanel.render();
        else if (this.store.bottomTab === 'nodes') this.nodePanel.render();
        this.dirtyRender = false;
        this.dirtyUi = false;
        return;
      }

      if (this.dirtyUi) {
        this.dirtyUi = false;
        this.dirtyRender = false;
        this.fullRefresh();
      } else if (this.dirtyRender) {
        this.dirtyRender = false;
        this.renderViewportNow();
        this.inspectorPanel.updateLiveValues();
        if (this.store.bottomTab === 'timeline') this.timelinePanel.updatePlayheadOnly();
        else if (this.store.bottomTab === 'graph') this.graphPanel.render();
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  // ==========================================================================
  // Section 4.2: Fixed Frame-by-Frame Export Interface (`window.videoExport`)
  // ==========================================================================
  private registerVideoExportAPI(): void {
    const waitPaint = () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });

    window.videoExport = {
      runs: ['demo'],
      begin: async (runId: string, opts?: { fps?: number }) => {
        if (runId !== 'demo') throw new Error(`Unknown runId: ${runId}`);
        this.store.isPlaying = false;
        this.store.isExportMode = true;
        audioEngine.stopAll();
        fontManager.init();

        // Ensure the main 15s Forge Demo composition is loaded and reset to t=0 cleanly
        const mainComp = this.store.project.compositions.find((c) => c.name.includes('锻字')) ?? this.store.project.compositions[0];
        if (!mainComp || Math.abs(mainComp.duration - 15) > 0.1) {
          this.store.loadForgeDemo();
        } else {
          this.store.project.activeCompId = mainComp.id;
        }
        this.store.bottomTab = 'timeline';
        this.store.currentTime = 0;
        particleEngine.clearAll();

        this.exportFps = Math.max(1, Number(opts?.fps ?? 60));
        const totalFrames = Math.round(15 * this.exportFps);

        this.fullRefresh();
        this.renderer.gl.finish();
        await waitPaint();
        return { frames: totalFrames };
      },

      frame: async (i: number) => {
        const comp = this.store.getActiveComp();
        const t = clamp(i / this.exportFps, 0, comp.duration);
        this.store.currentTime = t;

        // Render full WebGL 2 scene + synchronize Playhead, Timeline, Audio meters & Inspector values!
        this.renderViewportNow();
        this.timelinePanel.updatePlayheadOnly();
        this.inspectorPanel.updateLiveValues();
        this.renderer.gl.finish();
        await waitPaint();
      },

      end: () => {
        this.store.isExportMode = false;
        this.dirtyRender = true;
        this.dirtyUi = true;
        this.fullRefresh();
      },
    };
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new ForgeMotionStudioApp();
});
