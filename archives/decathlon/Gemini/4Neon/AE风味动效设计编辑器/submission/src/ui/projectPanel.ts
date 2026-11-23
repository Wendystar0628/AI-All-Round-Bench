import { LayerType } from '../core/types';
import { EditorStore } from './store';

export class ProjectPanel {
  private container: HTMLElement;
  private store: EditorStore;

  constructor(container: HTMLElement, store: EditorStore) {
    this.container = container;
    this.store = store;
  }

  public render(): void {
    const project = this.store.project;
    const activeComp = this.store.getActiveComp();

    const compsHtml = project.compositions.map((c) => {
      const act = c.id === activeComp.id;
      return `
        <div class="proj-comp-item ${act ? 'active' : ''}" data-comp="${c.id}">
          <span class="comp-ic">🎬</span>
          <div class="comp-meta">
            <div class="comp-name">${this.esc(c.name)}</div>
            <div class="comp-sub">${c.width}×${c.height} · ${c.fps}fps · ${c.duration}s</div>
          </div>
          ${!act ? `<button class="tiny-btn" data-insert="${c.id}" title="作为预合成图层放入当前合成">+</button>` : ''}
        </div>
      `;
    }).join('');

    const createButtons: Array<{ type: LayerType; icon: string; label: string; opts?: any }> = [
      { type: 'shape', icon: '◇', label: '形状图层' },
      { type: 'text', icon: '字', label: '文字图层' },
      { type: 'mesh3d', icon: '🧊', label: '三维实体', opts: { primitiveKind: 'box' } },
      { type: 'particle', icon: '✦', label: '粒子系统' },
      { type: 'field', icon: '◎', label: '空间场', opts: { fieldKind: 'distance' } },
      { type: 'camera', icon: '🎥', label: '摄像机' },
      { type: 'light', icon: '☀', label: '平行光', opts: { lightType: 'directional' } },
      { type: 'light', icon: '💡', label: '点光源', opts: { lightType: 'point' } },
      { type: 'adjustment', icon: '◐', label: '调整图层' },
      { type: 'null', icon: '✛', label: '空对象' },
      { type: 'audio', icon: '♪', label: '音色图层', opts: { audioPreset: 'forgeStrike' } },
    ];

    this.container.innerHTML = `
      <div class="proj-section">
        <div class="proj-sec-head">
          <span>工程合成 (${project.compositions.length})</span>
          <button class="tiny-btn accent" id="pj-new-comp">+ 新建</button>
        </div>
        <div class="proj-comp-list">${compsHtml}</div>
      </div>

      <div class="proj-section">
        <div class="proj-sec-head"><span>新建图层</span></div>
        <div class="proj-layer-grid">
          ${createButtons.map((b, i) => `<button class="layer-add-btn" data-idx="${i}"><i>${b.icon}</i><span>${b.label}</span></button>`).join('')}
        </div>
      </div>

      <div class="proj-section">
        <div class="proj-sec-head"><span>工程文件</span></div>
        <div class="proj-file-actions">
          <button class="mini-btn" id="pj-empty">📄 新建空工程</button>
          <button class="mini-btn accent" id="pj-demo">🔥 载入「锻字」示例</button>
          <button class="mini-btn" id="pj-save">💾 保存工程 (.json)</button>
          <button class="mini-btn" id="pj-open">📂 打开工程文件</button>
          <input type="file" id="pj-file-in" accept=".json" style="display:none" />
        </div>
      </div>

      <div class="proj-section proj-tips">
        <div class="proj-sec-head"><span>快捷操作</span></div>
        <div class="shortcut-list">
          <div><b>空格</b> 播放 / 暂停</div>
          <div><b>F9</b> 关键帧缓入缓出</div>
          <div><b>Ctrl+Shift+C</b> 原位预合成</div>
          <div><b>Ctrl+Z / Y</b> 撤销 / 重做</div>
          <div><b>V / Y / G / P</b> 选择/锚点/钢笔/图钉</div>
          <div><b>Alt+左键</b> 旋转三维摄像机</div>
        </div>
      </div>
    `;

    this.container.querySelector('#pj-new-comp')!.addEventListener('click', () => {
      this.store.createNewComp();
    });

    this.container.querySelectorAll('.proj-comp-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('[data-insert]')) return;
        this.store.switchComp((el as HTMLElement).dataset.comp!);
      });
    });

    this.container.querySelectorAll('[data-insert]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cid = (btn as HTMLElement).dataset.insert!;
        const target = project.compositions.find((c) => c.id === cid);
        if (!target) return;
        const l = this.store.addLayer('precomp', { compId: cid });
        l.name = target.name;
        this.store.notify('full');
      });
    });

    this.container.querySelectorAll('.layer-add-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const spec = createButtons[Number((btn as HTMLElement).dataset.idx)];
        this.store.addLayer(spec.type, spec.opts);
      });
    });

    this.container.querySelector('#pj-empty')!.addEventListener('click', () => this.store.resetToEmptyProject());
    this.container.querySelector('#pj-demo')!.addEventListener('click', () => this.store.loadForgeDemo());
    this.container.querySelector('#pj-save')!.addEventListener('click', () => {
      const json = this.store.exportProjectJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.store.project.name.replace(/[^\w\u4e00-\u9fa5-]+/g, '_')}.fproj.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.store.showToast('工程文件已导出下载');
    });

    const fileIn = this.container.querySelector('#pj-file-in') as HTMLInputElement;
    this.container.querySelector('#pj-open')!.addEventListener('click', () => fileIn.click());
    fileIn.addEventListener('change', () => {
      const file = fileIn.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          this.store.importProjectJSON(String(reader.result));
        } catch (err: any) {
          this.store.showToast(`打开失败：${err?.message || err}`);
        }
      };
      reader.readAsText(file);
      fileIn.value = '';
    });
  }

  private esc(s: string): string {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
