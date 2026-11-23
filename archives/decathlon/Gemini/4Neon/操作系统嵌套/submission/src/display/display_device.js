// Pure Dumb Display Device for Subsystem 2D Display Lists, Recursive Nested Desktops,
// 3D Scene Viewports (via Single Shared WebGL2 Renderer), & Projected Application Surfaces.
// Executes ZERO OS/app logic — strictly renders pure-JSON packets submitted by .nos programs
// and forwards raw pointer/keyboard/control events back into the OS input pipeline.

import { iconHtml } from './icons.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtBytes(b) {
  const n = Number(b || 0);
  if (n >= 1048576) return (n / 1048576).toFixed(2) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
  return n + ' B';
}

function fmtVTime(sec) {
  const s = Math.max(0, Number(sec || 0));
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(1).padStart(4, '0')}`;
}

export class SubsystemDisplayDevice {
  constructor(renderer3d, callbacks) {
    this.renderer3d = renderer3d;
    this.cb = callbacks; // { sendRawEvent, sendControlAction, startCrossFileDrag, getSystemPauseReason }
    this.mounts = new Map(); // containerEl -> { systemId, desktopEl, winMap, lastHash }
    this.sceneRenderKeys = new WeakMap(); // canvas -> last rendered key
  }

  // Render a subsystem desktop displayTree into `mountEl`
  // `isRootChild` indicates the top-level subsystem hosted inside outer (captures raw pointer/keyboard)
  renderDesktop(mountEl, displayTree, opts = {}) {
    if (!mountEl) return;
    const { isRootChild = false, frozenReason = null, errorText = null, systemIdHint = '' } = opts;

    if (errorText) {
      this._renderKernelError(mountEl, systemIdHint, errorText);
      return;
    }
    if (!displayTree) {
      if (!mountEl.querySelector('.sub-booting')) {
        mountEl.innerHTML = `<div class="sub-booting">正在引导子系统内核 ${esc(systemIdHint)}...</div>`;
      }
      return;
    }

    const sysId = displayTree.systemId;
    const depth = displayTree.depth || 1;
    let rec = this.mounts.get(mountEl);
    if (!rec || rec.systemId !== sysId || !mountEl.contains(rec.desktopEl)) {
      mountEl.innerHTML = '';
      const desktopEl = document.createElement('div');
      desktopEl.className = `sub-desktop layer-theme-${((depth - 1) % 4) + 1}`;
      desktopEl.dataset.testid = 'os-desktop';
      desktopEl.dataset.systemId = sysId;
      desktopEl.tabIndex = 0;

      const wallpaperLayer = document.createElement('div');
      wallpaperLayer.className = 'sub-wallpaper';
      const iconsLayer = document.createElement('div');
      iconsLayer.className = 'sub-icons';
      const windowsLayer = document.createElement('div');
      windowsLayer.className = 'sub-windows';
      const overlayLayer = document.createElement('div');
      overlayLayer.className = 'sub-overlays';
      const taskbarEl = document.createElement('div');
      taskbarEl.className = 'sub-taskbar';
      const frozenBanner = document.createElement('div');
      frozenBanner.className = 'sub-frozen-banner';
      frozenBanner.style.display = 'none';

      desktopEl.append(wallpaperLayer, iconsLayer, windowsLayer, overlayLayer, taskbarEl, frozenBanner);
      mountEl.appendChild(desktopEl);

      rec = {
        systemId: sysId,
        desktopEl,
        iconsLayer,
        windowsLayer,
        overlayLayer,
        taskbarEl,
        frozenBanner,
        winMap: new Map(), // winId -> { el, bodyEl, subMountEl, lastUiKey }
        lastIconsKey: '',
        lastTaskbarKey: '',
        lastOverlayKey: '',
      };
      this.mounts.set(mountEl, rec);

      if (isRootChild) {
        this._attachRawInputCapture(desktopEl, sysId);
      }
    }

    // Frozen overlay if this subsystem or any ancestor is paused
    if (frozenReason) {
      rec.frozenBanner.style.display = 'flex';
      rec.frozenBanner.textContent = frozenReason;
      rec.desktopEl.classList.add('is-frozen');
    } else {
      rec.frozenBanner.style.display = 'none';
      rec.desktopEl.classList.remove('is-frozen');
    }

    // 1. Desktop Icons
    const iconsKey = JSON.stringify([displayTree.desktopIcons, displayTree.selectedIcon]);
    if (iconsKey !== rec.lastIconsKey) {
      rec.lastIconsKey = iconsKey;
      rec.iconsLayer.innerHTML = (displayTree.desktopIcons || []).map((ic) => {
        const sel = displayTree.selectedIcon === ic.id ? ' selected' : '';
        const attr = ic.filePath
          ? `data-file-path="${esc(ic.filePath)}"`
          : `data-app-id="${esc(ic.appId)}"`;
        return `<div class="desktop-icon sub-icon${sel}"
          data-testid="desktop-icon"
          data-system-id="${esc(sysId)}"
          ${attr}
          data-nos-scope="wm"
          data-nos-action="desktop_icon_select"
          data-nos-dblaction="desktop_icon_open"
          data-nos-payload="${esc(JSON.stringify({ iconId: ic.id, appId: ic.appId, filePath: ic.filePath || null }))}"
          aria-label="${esc(ic.label)}">
          ${iconHtml(ic.icon, 'di-svg')}
          <span class="di-label">${esc(ic.label)}</span>
        </div>`;
      }).join('');
    }

    // 2. Reconcile Windows (in exact z-order & rect submitted by /sys/wm.nos!)
    const activeIds = new Set();
    const windows = displayTree.windows || [];
    for (const w of windows) {
      activeIds.add(w.id);
      let wRec = rec.winMap.get(w.id);
      if (!wRec) {
        const el = document.createElement('div');
        el.className = 'os-window sub-window';
        el.dataset.testid = 'app-window';
        el.dataset.systemId = sysId;
        el.dataset.windowId = w.id;
        el.dataset.appId = w.appId;
        if (w.appId === 'projection') {
          el.dataset.sourceSystemId = w.sourceSystemId || '';
          el.dataset.sourceWindowId = w.sourceWindowId || '';
          el.dataset.sourceAppId = w.sourceAppId || '';
        }

        const tb = document.createElement('div');
        tb.className = 'win-titlebar';
        tb.dataset.testid = 'window-titlebar';
        tb.dataset.systemId = sysId;
        tb.dataset.windowId = w.id;

        const body = document.createElement('div');
        body.className = 'win-body';

        // Resize border handles (visual affordance; actual hit-test runs in /sys/wm.nos!)
        const rse = document.createElement('div');
        rse.className = 'win-resize-se';
        rse.dataset.testid = 'window-resize';
        rse.dataset.systemId = sysId;
        rse.dataset.windowId = w.id;

        el.append(tb, body, rse);
        rec.windowsLayer.appendChild(el);
        wRec = { el, tb, body, subMountEl: null, lastChromeKey: '', lastUiKey: '' };
        rec.winMap.set(w.id, wRec);
      }

      // Position, size, z-index, visibility strictly from /sys/wm.nos!
      const el = wRec.el;
      el.style.left = `${w.x}px`;
      el.style.top = `${w.y}px`;
      el.style.width = `${w.w}px`;
      el.style.height = `${w.h}px`;
      el.style.zIndex = String(w.z);
      el.style.display = w.minimized ? 'none' : 'flex';
      el.classList.toggle('is-focused', Boolean(w.focused));
      el.classList.toggle('is-maximized', w.state === 'maximized');

      // Titlebar chrome
      const chromeKey = `${w.title}|${w.state}|${w.projectable}|${w.projectedTo}|${w.childId}|${w.childState}|${w.childVtime?.toFixed?.(1)}`;
      if (chromeKey !== wRec.lastChromeKey) {
        wRec.lastChromeKey = chromeKey;
        const projBtn = w.projectable
          ? `<button class="win-btn win-btn-proj" data-testid="window-project" data-system-id="${esc(sysId)}" data-window-id="${esc(w.id)}" data-nos-scope="wm" data-nos-win="${esc(w.id)}" data-nos-action="win_project_menu" data-nos-payload="${esc(JSON.stringify({ winId: w.id }))}" aria-label="投送到祖先桌面" title="投送到祖先桌面">投送</button>`
          : '';
        wRec.tb.innerHTML = `
          <div class="win-title-left">
            ${iconHtml(w.appId, 'win-ico')}
            <span class="win-title-text">${esc(w.title)}</span>
          </div>
          <div class="win-controls">
            ${projBtn}
            <button class="win-btn" data-testid="window-minimize" data-system-id="${esc(sysId)}" data-window-id="${esc(w.id)}" data-nos-scope="wm" data-nos-win="${esc(w.id)}" data-nos-action="win_minimize" data-nos-payload="${esc(JSON.stringify({ winId: w.id }))}" aria-label="最小化">—</button>
            <button class="win-btn" data-testid="window-maximize" data-system-id="${esc(sysId)}" data-window-id="${esc(w.id)}" data-nos-scope="wm" data-nos-win="${esc(w.id)}" data-nos-action="win_maximize" data-nos-payload="${esc(JSON.stringify({ winId: w.id }))}" aria-label="${w.state === 'maximized' ? '恢复' : '最大化'}">${w.state === 'maximized' ? '❐' : '□'}</button>
            <button class="win-btn win-btn-close" data-testid="window-close" data-system-id="${esc(sysId)}" data-window-id="${esc(w.id)}" data-nos-scope="wm" data-nos-win="${esc(w.id)}" data-nos-action="win_close" data-nos-payload="${esc(JSON.stringify({ winId: w.id }))}" aria-label="关闭">✕</button>
          </div>
        `;
      }

      // Window Client Area
      if (w.appId === 'subsystem') {
        this._renderChildSubsystemWindow(wRec, sysId, w, frozenReason);
      } else if (w.appId === 'projection') {
        const srcFrozen = frozenReason || this.cb.getSystemPauseReason?.(w.sourceSystemId);
        this.renderProjectedContent(wRec.body, {
          hostSystemId: sysId,
          hostWindowId: w.id,
          sourceSystemId: w.sourceSystemId,
          sourceWindowId: w.sourceWindowId,
          sourceAppId: w.sourceAppId,
          ui: w.ui,
          scene3d: w.scene3d,
          frozenReason: srcFrozen,
          onAction: (ev) => this.cb.sendControlAction(sysId, { ...ev, scope: 'app', winId: w.id }),
        });
      } else {
        this._renderAppBody(wRec, sysId, w.id, w.ui, w.scene3d, Boolean(frozenReason));
      }
    }

    // Remove closed windows
    for (const [wid, wRec] of rec.winMap.entries()) {
      if (!activeIds.has(wid)) {
        if (wRec.subMountEl) this.mounts.delete(wRec.subMountEl);
        wRec.el.remove();
        rec.winMap.delete(wid);
      }
    }

    // 3. Overlays (Start Menu, Context Menu, Projection Target Picker, Snap Preview, Modal, Toast)
    const overlayKey = JSON.stringify([
      displayTree.startMenuOpen,
      displayTree.contextMenu,
      displayTree.projectMenu,
      displayTree.ancestors,
      displayTree.snapPreview,
      displayTree.modal,
      displayTree.toast,
    ]);
    if (overlayKey !== rec.lastOverlayKey) {
      rec.lastOverlayKey = overlayKey;
      let html = '';
      if (displayTree.snapPreview) {
        const cls = displayTree.snapPreview === 'left' ? 'snap-left' : 'snap-right';
        html += `<div class="snap-preview ${cls}"></div>`;
      }
      if (displayTree.startMenuOpen) {
        html += `
          <div class="start-menu sub-start-menu" data-testid="start-menu" data-system-id="${esc(sysId)}">
            <div class="sm-header">
              <span class="sm-badge">L${depth + 1} · ${esc(sysId)}</span>
              <span class="sm-title">${esc(displayTree.name)}</span>
            </div>
            <div class="sm-grid">
              ${[
                ['player', '三维播放器', 'launch-player', 'player'],
                ['charts', '图表工作台', 'launch-charts', 'charts'],
                ['files', '文件管理器', 'launch-files', 'files'],
                ['editor', '程序编辑器', 'launch-editor', 'editor'],
                ['tasks', '进程管理器', 'launch-tasks', 'tasks'],
              ].map(([aid, lbl, tid, ico]) => `
                <button class="sm-app-btn" data-testid="${tid}" data-system-id="${esc(sysId)}"
                  data-nos-scope="wm" data-nos-action="launch_app" data-nos-payload="${esc(JSON.stringify({ appId: aid }))}"
                  aria-label="${lbl}">
                  ${iconHtml(ico, 'sm-ico')}<span>${lbl}</span>
                </button>
              `).join('')}
              <button class="sm-app-btn sm-app-accent" data-testid="system-new" data-system-id="${esc(sysId)}"
                data-nos-scope="wm" data-nos-action="system_new" data-nos-payload="{}" aria-label="新建子系统">
                ${iconHtml('subsystem', 'sm-ico')}<span>新建子系统</span>
              </button>
            </div>
          </div>`;
      }
      if (displayTree.contextMenu) {
        const cm = displayTree.contextMenu;
        html += `
          <div class="ctx-menu" style="left:${cm.x}px;top:${cm.y}px" data-system-id="${esc(sysId)}">
            <button class="ctx-item" data-nos-scope="wm" data-nos-action="ctx_new_sub" data-nos-payload="{}">新建直属子系统</button>
            <button class="ctx-item" data-nos-scope="wm" data-nos-action="launch_app" data-nos-payload="${esc(JSON.stringify({ appId: 'player' }))}">打开三维播放器</button>
            <button class="ctx-item" data-nos-scope="wm" data-nos-action="launch_app" data-nos-payload="${esc(JSON.stringify({ appId: 'charts' }))}">打开图表工作台</button>
            <button class="ctx-item" data-nos-scope="wm" data-nos-action="ctx_refresh" data-nos-payload="{}">刷新桌面</button>
          </div>`;
      }
      if (displayTree.projectMenu) {
        const pm = displayTree.projectMenu;
        const ancs = displayTree.ancestors || [];
        html += `
          <div class="ctx-menu proj-menu" style="left:${Math.max(4, pm.x)}px;top:${Math.max(4, pm.y)}px" data-system-id="${esc(sysId)}">
            <div class="ctx-title">选择投送目标祖先桌面</div>
            ${ancs.map((a) => `
              <button class="ctx-item" data-testid="project-target" data-system-id="${esc(sysId)}" data-target-system-id="${esc(a.id)}"
                data-nos-scope="wm" data-nos-action="project_target" data-nos-payload="${esc(JSON.stringify({ winId: pm.winId, targetSystemId: a.id }))}"
                aria-label="投送到 ${esc(a.name)} (${esc(a.id)})">
                投送到 ${esc(a.name)} (${esc(a.id)})
              </button>
            `).join('')}
          </div>`;
      }
      if (displayTree.modal) {
        const m = displayTree.modal;
        html += `
          <div class="os-modal-backdrop">
            <div class="os-modal">
              <div class="os-modal-title">${esc(m.title)}</div>
              <div class="os-modal-msg">${esc(m.message)}</div>
              <div class="os-modal-actions">
                <button class="btn-secondary" data-nos-scope="wm" data-nos-action="modal_cancel" data-nos-payload="{}">取消</button>
                <button class="btn-danger" data-nos-scope="wm" data-nos-action="modal_confirm" data-nos-payload="{}">确认</button>
              </div>
            </div>
          </div>`;
      }
      if (displayTree.toast) {
        html += `<div class="sub-toast toast-${esc(displayTree.toast.kind || 'info')}">${esc(displayTree.toast.text)}</div>`;
      }
      rec.overlayLayer.innerHTML = html;
    }

    // 4. Taskbar
    const tbKey = JSON.stringify([
      displayTree.startMenuOpen,
      Math.floor((displayTree.vtime || 0) * 10),
      displayTree.timeRate,
      windows.map((w) => [w.id, w.title, w.appId, w.focused, w.minimized]),
    ]);
    if (tbKey !== rec.lastTaskbarKey) {
      rec.lastTaskbarKey = tbKey;
      rec.taskbarEl.innerHTML = `
        <div class="tb-left">
          <button class="tb-start${displayTree.startMenuOpen ? ' active' : ''}" data-testid="start-toggle" data-system-id="${esc(sysId)}"
            data-nos-scope="wm" data-nos-action="start_toggle" data-nos-payload="{}" aria-label="开始菜单 (${esc(sysId)})">
            ${iconHtml('start', 'tb-ico')}<span>开始</span>
          </button>
          <button class="tb-pin" data-nos-scope="wm" data-nos-action="launch_app" data-nos-payload="${esc(JSON.stringify({ appId: 'player' }))}" title="三维播放器">${iconHtml('player', 'tb-ico')}</button>
          <button class="tb-pin" data-nos-scope="wm" data-nos-action="launch_app" data-nos-payload="${esc(JSON.stringify({ appId: 'charts' }))}" title="图表工作台">${iconHtml('charts', 'tb-ico')}</button>
          <button class="tb-pin" data-nos-scope="wm" data-nos-action="launch_app" data-nos-payload="${esc(JSON.stringify({ appId: 'files' }))}" title="文件管理器">${iconHtml('files', 'tb-ico')}</button>
        </div>
        <div class="tb-center">
          ${windows.map((w) => `
            <button class="tb-item${w.focused ? ' focused' : ''}${w.minimized ? ' minimized' : ''}"
              data-testid="taskbar-item" data-system-id="${esc(sysId)}" data-window-id="${esc(w.id)}"
              data-nos-scope="wm" data-nos-action="taskbar_click" data-nos-payload="${esc(JSON.stringify({ winId: w.id }))}"
              aria-label="${esc(w.title)}">
              ${iconHtml(w.appId, 'tb-ico')}<span class="tb-item-txt">${esc(w.title)}</span>
            </button>
          `).join('')}
        </div>
        <div class="tb-right">
          <button class="mini-btn tb-parent-btn" data-nos-scope="wm" data-nos-action="return_parent" data-nos-payload="{}" title="返回父桌面 (${esc(displayTree.parentId || 'outer')})" aria-label="返回父桌面">↑ 父桌面</button>
          <span class="tb-layer-pill">L${depth + 1} · ${esc(sysId)}</span>
          <span class="tb-vclock" title="虚拟时钟 (${displayTree.timeRate}x)">${fmtVTime(displayTree.vtime)} · ${Number(displayTree.timeRate || 1).toFixed(1)}x</span>
        </div>
      `;
    }
  }

  _renderKernelError(mountEl, sysId, errorText) {
    const existing = mountEl.querySelector('[data-testid="kernel-error"]');
    if (existing && existing.dataset.errText === errorText) return;
    mountEl.innerHTML = `
      <div class="kernel-error-screen" data-testid="kernel-error" data-system-id="${esc(sysId)}" data-err-text="${esc(errorText)}">
        <div class="ke-badge">KERNEL PANIC · ${esc(sysId)}</div>
        <div class="ke-title">子系统内核错误，已安全停止</div>
        <pre class="ke-msg">${esc(errorText)}</pre>
        <div class="ke-hint">父系统与兄弟子系统未受影响。请在父系统编辑器中修复 /Systems/${esc(sysId)}/kernel.nos 后重启。</div>
      </div>
    `;
  }

  _renderChildSubsystemWindow(wRec, parentSysId, w, parentFrozenReason) {
    const cid = w.childId;
    if (!wRec.subMountEl) {
      wRec.body.innerHTML = '';
      wRec.body.className = 'win-body win-body-sub';
      const bar = document.createElement('div');
      bar.className = 'sub-host-bar';
      const mount = document.createElement('div');
      mount.className = 'sub-host-viewport';
      wRec.body.append(bar, mount);
      wRec.subBarEl = bar;
      wRec.subMountEl = mount;
    }

    const isPaused = w.childState === 'paused';
    const isErr = w.childState === 'error';
    const barKey = `${cid}|${w.childState}|${w.childTimeRate}|${Math.floor((w.childVtime || 0) * 5)}`;
    if (barKey !== wRec.lastSubBarKey) {
      wRec.lastSubBarKey = barKey;
      wRec.subBarEl.innerHTML = `
        <span class="shb-status st-${esc(w.childState || 'running')}">${isErr ? '内核错误' : (isPaused ? '已暂停' : '运行中')} · ${esc(cid)}</span>
        <span class="shb-time">T ${fmtVTime(w.childVtime)} (${Number(w.childTimeRate || 1).toFixed(1)}x)</span>
        <div class="shb-btns">
          ${isPaused
            ? `<button class="mini-btn" data-testid="system-resume" data-system-id="${esc(parentSysId)}" data-target-system-id="${esc(cid)}" data-nos-scope="wm" data-nos-action="child_ctrl" data-nos-payload="${esc(JSON.stringify({ childId: cid, op: 'resume' }))}" aria-label="继续 ${esc(cid)}">继续</button>`
            : `<button class="mini-btn" data-testid="system-pause" data-system-id="${esc(parentSysId)}" data-target-system-id="${esc(cid)}" data-nos-scope="wm" data-nos-action="child_ctrl" data-nos-payload="${esc(JSON.stringify({ childId: cid, op: 'pause' }))}" aria-label="暂停 ${esc(cid)}">暂停</button>`}
          <button class="mini-btn" data-nos-scope="wm" data-nos-action="child_ctrl" data-nos-payload="${esc(JSON.stringify({ childId: cid, op: 'step' }))}" ${isPaused ? '' : 'disabled'} title="单步推进 33.3ms">单步</button>
          <button class="mini-btn" data-testid="system-restart" data-system-id="${esc(parentSysId)}" data-target-system-id="${esc(cid)}" data-nos-scope="wm" data-nos-action="child_ctrl" data-nos-payload="${esc(JSON.stringify({ childId: cid, op: 'restart' }))}" aria-label="重启 ${esc(cid)}">重启</button>
          <button class="mini-btn" data-testid="kernel-open" data-system-id="${esc(parentSysId)}" data-target-system-id="${esc(cid)}" data-nos-scope="wm" data-nos-action="child_ctrl" data-nos-payload="${esc(JSON.stringify({ childId: cid, op: 'open_kernel' }))}" aria-label="打开 ${esc(cid)} 内核源文件">内核</button>
          <button class="mini-btn" data-nos-scope="wm" data-nos-action="child_ctrl" data-nos-payload="${esc(JSON.stringify({ childId: cid, op: 'snapshot' }))}">快照</button>
        </div>
      `;
    }

    const childFrozen = parentFrozenReason || (isPaused ? `子系统 ${cid} 已暂停` : null);
    this.renderDesktop(wRec.subMountEl, w.childDisplay, {
      isRootChild: false,
      frozenReason: childFrozen,
      errorText: isErr ? (w.childError || '内核运行时异常') : null,
      systemIdHint: cid,
    });
  }

  _renderAppBody(wRec, sysId, winId, ui, scene3d, isFrozen) {
    if (!ui) {
      if (!wRec.body.dataset.init) {
        wRec.body.dataset.init = '1';
        wRec.body.innerHTML = `<div class="app-loading">正在启动应用进程...</div>`;
      }
      return;
    }

    if (ui.kind === 'player_app') {
      this._renderPlayerApp(wRec.body, sysId, winId, ui, scene3d, isFrozen, false);
      return;
    }
    if (ui.kind === 'charts_app') {
      this._renderChartsApp(wRec.body, sysId, winId, ui, isFrozen, false);
      return;
    }
    if (ui.kind === 'files_app') {
      this._renderFilesApp(wRec, sysId, winId, ui);
      return;
    }
    if (ui.kind === 'editor_app') {
      this._renderEditorApp(wRec, sysId, winId, ui);
      return;
    }
    if (ui.kind === 'tasks_app') {
      this._renderTasksApp(wRec, sysId, winId, ui);
      return;
    }
  }

  // Also used by Root OS ('outer') when hosting a Projected window!
  renderProjectedContent(bodyEl, opts) {
    const { hostSystemId, hostWindowId, sourceSystemId, sourceAppId, ui, scene3d, frozenReason, onAction } = opts;
    bodyEl._projHandler = onAction;
    bodyEl.dataset.projHostSys = hostSystemId;
    bodyEl.dataset.projHostWin = hostWindowId;

    let banner = bodyEl.querySelector(':scope > .proj-frozen-banner');
    if (frozenReason) {
      if (!banner) {
        banner = document.createElement('div');
        banner.className = 'proj-frozen-banner';
        bodyEl.prepend(banner);
      }
      banner.textContent = `${frozenReason} · 投送内容已冻结（外框仍可操作）`;
    } else if (banner) {
      banner.remove();
    }

    let inner = bodyEl.querySelector(':scope > .proj-inner');
    if (!inner) {
      inner = document.createElement('div');
      inner.className = 'proj-inner';
      bodyEl.appendChild(inner);
      if (hostSystemId === 'outer') {
        this._attachProjectedOuterListeners(inner, bodyEl);
      }
    }

    const isFrozen = Boolean(frozenReason);
    if (sourceAppId === 'player' && ui) {
      this._renderPlayerApp(inner, hostSystemId, hostWindowId, ui, scene3d, isFrozen, true);
    } else if (sourceAppId === 'charts' && ui) {
      this._renderChartsApp(inner, hostSystemId, hostWindowId, ui, isFrozen, true);
    } else {
      inner.innerHTML = `<div class="app-loading">等待源系统 (${esc(sourceSystemId)}) 提交显示帧...</div>`;
    }
  }

  _attachProjectedOuterListeners(innerEl, bodyEl) {
    if (innerEl._boundProj) return;
    innerEl._boundProj = true;

    innerEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-nos-action]');
      if (!btn || !bodyEl._projHandler) return;
      if (btn.disabled) return;
      const payload = btn.dataset.nosPayload ? JSON.parse(btn.dataset.nosPayload) : {};
      bodyEl._projHandler({
        type: 'control_action',
        action: btn.dataset.nosAction,
        payload,
        value: btn.value,
      });
    });

    const handleVal = (e) => {
      const el = e.target.closest('[data-nos-input]');
      if (!el || !bodyEl._projHandler || el.disabled) return;
      const payload = el.dataset.nosPayload ? JSON.parse(el.dataset.nosPayload) : {};
      bodyEl._projHandler({
        type: 'input_change',
        action: el.dataset.nosInput,
        payload,
        value: el.type === 'checkbox' ? el.checked : el.value,
      });
    };
    innerEl.addEventListener('change', handleVal);
    innerEl.addEventListener('input', (e) => {
      if (e.target.matches('input[type="range"], input[type="text"], input[type="number"]')) handleVal(e);
    });

    // 3D viewport drag / click / wheel forwarding for projected players!
    let downPos = null;
    innerEl.addEventListener('pointerdown', (e) => {
      const cv = e.target.closest('canvas[data-testid="player-view"]');
      if (!cv || !bodyEl._projHandler) return;
      const rect = cv.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
      const ny = (e.clientY - rect.top) / Math.max(1, rect.height);
      downPos = { x: e.clientX, y: e.clientY, cv };
      bodyEl._projHandler({ type: 'control_action', action: 'view3d_pointerdown', payload: { nx, ny, aspect: rect.width / Math.max(1, rect.height) } });
    });
    window.addEventListener('pointermove', (e) => {
      if (!downPos || !bodyEl._projHandler) return;
      const rect = downPos.cv.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
      const ny = (e.clientY - rect.top) / Math.max(1, rect.height);
      bodyEl._projHandler({ type: 'control_action', action: 'view3d_pointermove', payload: { nx, ny } });
    });
    window.addEventListener('pointerup', (e) => {
      if (!downPos || !bodyEl._projHandler) return;
      const dp = downPos;
      downPos = null;
      const rect = dp.cv.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
      const ny = (e.clientY - rect.top) / Math.max(1, rect.height);
      bodyEl._projHandler({ type: 'control_action', action: 'view3d_pointerup', payload: { nx, ny } });
      if (Math.hypot(e.clientX - dp.x, e.clientY - dp.y) < 6) {
        bodyEl._projHandler({ type: 'control_action', action: 'view3d_click', payload: { nx, ny, aspect: rect.width / Math.max(1, rect.height) } });
      }
    });
    innerEl.addEventListener('wheel', (e) => {
      const cv = e.target.closest('canvas[data-testid="player-view"]');
      if (!cv || !bodyEl._projHandler) return;
      e.preventDefault();
      bodyEl._projHandler({ type: 'control_action', action: 'view3d_wheel', payload: { deltaY: e.deltaY } });
    }, { passive: false });
  }

  // ==================== 3D Player Renderer (Preserves Canvas & Controls Smoothly!) ====================

  _renderPlayerApp(container, sysId, winId, ui, scene3d, isFrozen, isProjected) {
    const m = ui.meta || {};
    const tel = ui.telemetry;
    const sel = ui.selection;
    const dis = isFrozen ? 'disabled' : '';

    let root = container.querySelector(':scope > .player-shell');
    if (!root) {
      container.innerHTML = `
        <div class="player-shell">
          <div class="player-topbar">
            <input class="nos-input player-path-in" type="text" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-input="edit_path" aria-label="场景文件路径"/>
            <button class="btn-sm" data-testid="player-open" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="open_scene" aria-label="打开场景">打开</button>
            <select class="nos-select" data-testid="player-camera" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-input="set_camera" aria-label="切换镜头">
              <option value="cinematic">演出镜头</option>
              <option value="follow">跟随镜头</option>
              <option value="orbit">自由环绕</option>
            </select>
            <button class="btn-sm btn-accent" data-testid="rehearsal-start" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="rehearsal_start" aria-label="开始或从此续演飞行排演">排演/续演</button>
            <button class="btn-sm" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="save_replay" aria-label="保存排演记录">存回放</button>
          </div>
          <div class="player-stage">
            <canvas class="player-canvas" data-testid="player-view" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" aria-label="三维场景视图"></canvas>
            <div class="player-hud-tl"></div>
            <div class="player-hud-tr" data-testid="player-selection" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}"></div>
            <div class="player-err-banner" style="display:none"></div>
          </div>
          <div class="player-rehearsal-bar">
            <label class="rh-item">风速 <input type="range" min="0" max="15" step="0.5" data-testid="rehearsal-wind" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-input="rehearsal_wind" aria-label="排演风速"/><span class="rh-wind-val">0</span></label>
            <label class="rh-item">航向 <input type="number" class="nos-input-xs" step="15" data-testid="rehearsal-heading" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-input="rehearsal_heading" aria-label="目标航向"/></label>
            <select class="nos-select-xs" data-testid="rehearsal-fault" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-input="rehearsal_fault" aria-label="故障触发">
              <option value="none">无故障</option>
              <option value="tail_rotor">触发尾桨故障</option>
              <option value="engine">触发引擎故障</option>
            </select>
            <input type="text" class="nos-input-sm" data-testid="rehearsal-controller" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-input="rehearsal_controller" aria-label="飞控程序路径"/>
            <button class="btn-xs" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="rehearsal_helipad2" title="自主飞往 2 号停机坪并悬停降落">飞往2号坪</button>
          </div>
          <div class="player-controls">
            <button class="btn-sm btn-play" data-testid="player-play" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="play" aria-label="播放">▶</button>
            <button class="btn-sm" data-testid="player-pause" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="pause" aria-label="暂停">⏸</button>
            <button class="btn-sm" data-testid="player-stop" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="stop" aria-label="停止回开头">■</button>
            <button class="btn-sm" data-testid="player-step" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="step_frame" aria-label="逐帧前进">+1帧</button>
            <button class="btn-sm player-loop-btn" data-testid="player-loop" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="toggle_loop" aria-label="循环开关">循环</button>
            <input type="range" class="player-seek" min="0" max="15" step="0.033" data-testid="player-seek" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-input="seek" aria-label="播放进度"/>
            <input type="text" class="nos-input-xs player-time-in" data-testid="player-time" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-input="time_input" aria-label="当前时间(秒)"/>
            <span class="player-dur">/ 15.0s</span>
            <select class="nos-select-xs" data-testid="player-rate" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-input="set_rate" aria-label="播放速率">
              <option value="0.25">0.25x</option>
              <option value="0.5">0.5x</option>
              <option value="1">1.0x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2.0x</option>
            </select>
          </div>
          <div class="player-statusbar"></div>
        </div>
      `;
      root = container.querySelector(':scope > .player-shell');
    }

    // Update control values cleanly without clobbering focused user typing
    const setVal = (selStr, v) => {
      const el = root.querySelector(selStr);
      if (!el) return;
      el.disabled = isFrozen;
      if (document.activeElement !== el && String(el.value) !== String(v)) el.value = String(v);
    };
    root.querySelectorAll('button').forEach((b) => { b.disabled = isFrozen; });

    setVal('.player-path-in', m.pathInput || m.scenePath || '');
    setVal('[data-testid="player-camera"]', m.camera?.mode || 'cinematic');
    setVal('[data-testid="rehearsal-wind"]', m.windStrength ?? 0);
    setVal('[data-testid="rehearsal-heading"]', m.targetHeadingDeg ?? 0);
    setVal('[data-testid="rehearsal-fault"]', m.faultTrigger || 'none');
    setVal('[data-testid="rehearsal-controller"]', m.controllerPath || '/apps/flight_ctrl.nos');
    setVal('[data-testid="player-rate"]', String(m.rate ?? 1));

    const seekEl = root.querySelector('[data-testid="player-seek"]');
    if (seekEl) {
      seekEl.disabled = isFrozen;
      seekEl.max = String(Math.max(0.1, Number(m.duration || 15)));
      if (document.activeElement !== seekEl) seekEl.value = String(Number(m.position || 0).toFixed(3));
    }
    setVal('[data-testid="player-time"]', Number(m.position || 0).toFixed(2));

    const durEl = root.querySelector('.player-dur');
    if (durEl) durEl.textContent = `/ ${Number(m.duration || 15).toFixed(1)}s`;
    const windVal = root.querySelector('.rh-wind-val');
    if (windVal) windVal.textContent = `${Number(m.windStrength || 0).toFixed(1)}m/s`;
    const loopBtn = root.querySelector('.player-loop-btn');
    if (loopBtn) loopBtn.classList.toggle('active', Boolean(m.loop));

    const hudTL = root.querySelector('.player-hud-tl');
    if (hudTL) {
      const modeLbl = m.mode === 'rehearsal' ? '闭环排演' : (m.mode === 'replay' ? '排演回放' : '默认演出');
      const stLbl = m.playState === 'playing' ? '播放中' : (m.playState === 'stopped' ? '已停止' : '已暂停');
      const telHtml = tel
        ? `<span>高度 ${tel.altitude}m</span><span>速度 ${tel.speed}m/s</span><span>旋翼 ${tel.rpm}%</span><span>航向 ${tel.heading}°</span>${tel.crashed ? '<span class="hud-alert">已坠毁</span>' : (tel.faultType && tel.faultType !== 'none' ? '<span class="hud-warn">故障告警</span>' : '')}`
        : `<span>时刻 ${Number(ui.frameTime || 0).toFixed(2)}s</span>`;
      hudTL.innerHTML = `<span class="hud-mode">${modeLbl} · ${stLbl}</span>${telHtml}`;
    }

    const hudTR = root.querySelector('[data-testid="player-selection"]');
    if (hudTR) {
      hudTR.textContent = sel ? `点选: ${sel.partName} (${sel.status} · 完整度 ${sel.integrity}%)` : '点击部件查看状态 / 排演点地面设航向';
    }

    const errBanner = root.querySelector('.player-err-banner');
    if (errBanner) {
      if (ui.errorBanner) {
        errBanner.style.display = 'block';
        errBanner.textContent = ui.errorBanner;
      } else {
        errBanner.style.display = 'none';
      }
    }

    const sb = root.querySelector('.player-statusbar');
    if (sb) {
      sb.textContent = `${m.statusMsg || ''} · 画面时刻 ${Number(ui.frameTime || 0).toFixed(2)}s · ${m.fps || 30}fps`;
    }

    // Render 3D scene onto this viewport's 2D canvas using the SINGLE Shared WebGL2 Renderer!
    const canvas = root.querySelector('canvas[data-testid="player-view"]');
    if (canvas && scene3d) {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.max(160, Math.floor((rect.width || 480) * dpr));
      const ch = Math.max(100, Math.floor((rect.height || 270) * dpr));
      let sizeChanged = false;
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
        sizeChanged = true;
      }
      const renderKey = `${scene3d.resourceId}|${scene3d.frameTime}|${cw}x${ch}|${JSON.stringify(scene3d.camera)}|${scene3d.particles?.length}|${this.renderer3d.contextLost}`;
      if (sizeChanged || this.sceneRenderKeys.get(canvas) !== renderKey) {
        this.renderer3d.renderToCanvas(canvas, scene3d);
        this.sceneRenderKeys.set(canvas, renderKey);
      }
    }
  }

  // ==================== Chart Workbench Renderer ====================

  _renderChartsApp(container, sysId, winId, ui, isFrozen, isProjected) {
    let root = container.querySelector(':scope > .charts-shell');
    if (!root) {
      container.innerHTML = `
        <div class="charts-shell">
          <div class="charts-toolbar">
            <label class="ch-field">工作簿
              <select class="nos-select-sm" data-testid="chart-source" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-input="select_source" aria-label="选择根系统工作簿"></select>
            </label>
            <label class="ch-field">区域
              <input class="nos-input-xs" type="text" data-testid="chart-range" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-input="edit_range" aria-label="数据区域"/>
            </label>
            <label class="ch-field">标签列
              <input class="nos-input-xxs" type="text" data-testid="chart-label-column" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-input="select_label_col" aria-label="标签列"/>
            </label>
            <label class="ch-field">数值列
              <input class="nos-input-xs" type="text" data-testid="chart-series" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-input="edit_series_cols" aria-label="数值列（逗号分隔）"/>
            </label>
            <button class="btn-sm btn-accent" data-testid="chart-connect" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="connect" aria-label="连接数据源">连接</button>
            <button class="btn-sm" data-testid="chart-disconnect" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="disconnect" aria-label="断开连接">断开</button>
            <button class="btn-sm ch-type-btn" data-testid="chart-type" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="toggle_type" aria-label="切换图表类型">柱状图 / 折线图</button>
          </div>
          <div class="charts-status-bar"></div>
          <div class="charts-canvas-wrap"></div>
          <div class="charts-footer"></div>
        </div>
      `;
      root = container.querySelector(':scope > .charts-shell');
    }

    root.querySelectorAll('button, input, select').forEach((el) => { el.disabled = isFrozen; });

    // Sync workbook options
    const srcSel = root.querySelector('[data-testid="chart-source"]');
    if (srcSel) {
      const wbs = ui.workbooks || [];
      const optKey = JSON.stringify(wbs.map((w) => [w.docId, w.title]));
      if (srcSel.dataset.optKey !== optKey) {
        srcSel.dataset.optKey = optKey;
        srcSel.innerHTML = wbs.length === 0
          ? `<option value="">(无已打开工作簿)</option>`
          : wbs.map((w) => `<option value="${esc(w.docId)}">${esc(w.title)}</option>`).join('');
      }
      if (document.activeElement !== srcSel && ui.selectedDocId && srcSel.value !== ui.selectedDocId) {
        srcSel.value = ui.selectedDocId;
      }
    }

    const syncVal = (selStr, v) => {
      const el = root.querySelector(selStr);
      if (el && document.activeElement !== el && String(el.value) !== String(v)) el.value = String(v);
    };
    syncVal('[data-testid="chart-range"]', ui.rangeStr || 'A1:D4');
    syncVal('[data-testid="chart-label-column"]', ui.labelCol || 'A');
    syncVal('[data-testid="chart-series"]', ui.seriesColsStr || 'D');

    const typeBtn = root.querySelector('[data-testid="chart-type"]');
    if (typeBtn) typeBtn.textContent = ui.chartType === 'line' ? '当前：折线图 (切柱状)' : '当前：柱状图 (切折线)';

    const sb = root.querySelector('.charts-status-bar');
    if (sb) {
      sb.innerHTML = `<span class="ch-conn-pill st-${esc(ui.connectionState)}">${esc(ui.connLabel)}</span>
        <span class="ch-meta">来源：${esc(ui.sourceTitle || '未选择')} · 选区：${esc(ui.rangeStr || '')}</span>`;
    }

    // Render pure vector SVG computed in /apps/chart_ui.nos!
    const wrap = root.querySelector('.charts-canvas-wrap');
    const g = ui.geom;
    if (wrap && g) {
      const svgKey = JSON.stringify([ui.chartType, ui.selInfo, g]);
      if (wrap.dataset.svgKey !== svgKey) {
        wrap.dataset.svgKey = svgKey;
        if (g.xLabels.length === 0) {
          wrap.innerHTML = `<div class="charts-empty">请选择根系统已打开的工作簿与区域，点击“连接”建立实时数据流</div>`;
        } else {
          let shapes = '';
          // Grid & Y ticks
          for (const tk of g.yTicks) {
            shapes += `<line x1="${g.padL}" y1="${tk.y}" x2="${g.svgW - g.padR}" y2="${tk.y}" stroke="rgba(148,163,184,0.18)" stroke-dasharray="3 3"/>`;
            shapes += `<text x="${g.padL - 8}" y="${tk.y + 4}" text-anchor="end" fill="#94a3b8" font-size="11">${tk.value}</text>`;
          }
          // Axes
          shapes += `<line x1="${g.padL}" y1="${g.padT}" x2="${g.padL}" y2="${g.padT + g.plotH}" stroke="#64748b"/>`;
          shapes += `<line x1="${g.padL}" y1="${g.padT + g.plotH}" x2="${g.svgW - g.padR}" y2="${g.padT + g.plotH}" stroke="#64748b"/>`;

          // X labels
          for (const xl of g.xLabels) {
            shapes += `<text x="${xl.x}" y="${xl.y}" text-anchor="middle" fill="#cbd5e1" font-size="11">${esc(xl.text)}</text>`;
          }

          if (ui.chartType === 'bar') {
            for (const b of g.bars) {
              const isSel = ui.selectedPoint && ui.selectedPoint.seriesIdx === b.seriesIdx && ui.selectedPoint.itemIdx === b.itemIdx;
              shapes += `<g class="ch-bar-g" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="select_point" data-nos-payload="${esc(JSON.stringify({ seriesIdx: b.seriesIdx, itemIdx: b.itemIdx }))}">
                <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${Math.max(1, b.h)}" rx="4" fill="${b.color}" opacity="${isSel ? '1' : '0.88'}" stroke="${isSel ? '#ffffff' : 'none'}" stroke-width="2"><title>${esc(b.label)} · ${esc(b.seriesName)}: ${b.value}</title></rect>
                <text x="${b.x + b.w / 2}" y="${Math.max(14, b.y - 5)}" text-anchor="middle" fill="#e2e8f0" font-size="10.5" font-weight="600">${b.displayVal}</text>
              </g>`;
            }
          } else {
            for (const ln of g.lines) {
              const ptsAttr = ln.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
              shapes += `<polyline fill="none" stroke="${ln.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${ptsAttr}"/>`;
              for (const p of ln.points) {
                const isSel = ui.selectedPoint && ui.selectedPoint.seriesIdx === p.seriesIdx && ui.selectedPoint.itemIdx === p.itemIdx;
                shapes += `<circle cx="${p.x}" cy="${p.y}" r="${isSel ? 6.5 : 4.8}" fill="${ln.color}" stroke="#0f172a" stroke-width="2"
                  data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="select_point" data-nos-payload="${esc(JSON.stringify({ seriesIdx: p.seriesIdx, itemIdx: p.itemIdx }))}">
                  <title>${esc(p.label)} · ${esc(p.seriesName)}: ${p.value}</title></circle>`;
                shapes += `<text x="${p.x}" y="${Math.max(14, p.y - 9)}" text-anchor="middle" fill="#e2e8f0" font-size="10.5" font-weight="600">${p.value}</text>`;
              }
            }
          }

          const legendHtml = (g.legend || []).map((lg) =>
            `<span class="ch-legend-item"><i style="background:${lg.color}"></i>${esc(lg.name)} (${esc(lg.col)})</span>`
          ).join('');

          wrap.innerHTML = `
            <div class="ch-legend">${legendHtml}</div>
            <svg class="ch-svg" viewBox="0 0 ${g.svgW} ${g.svgH}" preserveAspectRatio="xMidYMid meet">${shapes}</svg>
          `;
        }
      }
    }

    const ft = root.querySelector('.charts-footer');
    if (ft) {
      ft.textContent = ui.selInfo
        ? `已选中：${ui.selInfo.label} · ${ui.selInfo.seriesName} = ${ui.selInfo.value}`
        : '提示：悬停或点击柱形/数据点查看数值，支持跨层投送至任意祖先桌面';
    }
  }

  // ==================== Subsystem File Manager Renderer ====================

  _renderFilesApp(wRec, sysId, winId, ui) {
    const uiKey = JSON.stringify(ui);
    if (wRec.lastUiKey === uiKey) return;
    wRec.lastUiKey = uiKey;

    const body = wRec.body;
    const structKey = JSON.stringify([ui.curDir, ui.inTrash, ui.entries, ui.navItems]);
    let shell = body.querySelector(':scope > .files-shell');

    if (!shell) {
      body.innerHTML = `
        <div class="files-shell" data-drop-system-id="${esc(sysId)}" data-drop-dir="${esc(ui.curDir)}">
          <div class="files-toolbar">
            <button class="btn-xs" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="up">上级</button>
            <input class="nos-input files-path-in" type="text" readonly value="${esc(ui.curDir)}" data-testid="files-path" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" aria-label="当前目录路径"/>
            <input class="nos-input-sm files-newname-in" type="text" placeholder="新文件名/目录名" value="${esc(ui.newNameInput || '')}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-input="new_name_input" aria-label="新建名称"/>
            <button class="btn-xs" data-testid="files-new-file" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="new_file">新建文件</button>
            <button class="btn-xs" data-testid="files-new-folder" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="new_folder">新建目录</button>
            <button class="btn-xs" data-testid="files-open" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="open">打开</button>
            <button class="btn-xs" data-testid="files-copy" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="copy">复制</button>
            <button class="btn-xs" data-testid="files-paste" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="paste">粘贴</button>
            <button class="btn-xs" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="delete">删除</button>
            <button class="btn-xs btn-accent files-restore-btn" style="display:none" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="restore">恢复</button>
          </div>
          <div class="files-main">
            <div class="files-sidebar"></div>
            <div class="files-list" data-testid="files-list" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}"
                 data-drop-system-id="${esc(sysId)}" data-drop-dir="${esc(ui.curDir)}"></div>
          </div>
          <div class="files-status"></div>
        </div>
      `;
      shell = body.querySelector(':scope > .files-shell');
      wRec.lastFilesStructKey = '';
    }

    shell.dataset.dropDir = ui.curDir || '/';
    const pathIn = shell.querySelector('.files-path-in');
    if (pathIn && pathIn.value !== (ui.curDir || '/')) pathIn.value = ui.curDir || '/';
    const nameIn = shell.querySelector('.files-newname-in');
    if (nameIn && document.activeElement !== nameIn && nameIn.value !== (ui.newNameInput || '')) {
      nameIn.value = ui.newNameInput || '';
    }
    const restBtn = shell.querySelector('.files-restore-btn');
    if (restBtn) restBtn.style.display = ui.inTrash ? '' : 'none';
    const listEl = shell.querySelector('.files-list');
    if (listEl) listEl.dataset.dropDir = ui.curDir || '/';

    if (wRec.lastFilesStructKey !== structKey) {
      wRec.lastFilesStructKey = structKey;
      const sideEl = shell.querySelector('.files-sidebar');
      if (sideEl) {
        sideEl.innerHTML = (ui.navItems || []).map((nv) => `
          <button class="files-nav-btn${ui.curDir === nv.path ? ' active' : ''}"
            data-testid="files-nav" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-file-path="${esc(nv.path)}"
            data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="nav" data-nos-payload="${esc(JSON.stringify({ path: nv.path }))}">
            ${iconHtml('folder', 'fn-ico')}<span>${esc(nv.label)}</span>
          </button>
        `).join('');
      }
      if (listEl) {
        listEl.innerHTML = (ui.entries || []).length === 0
          ? `<div class="files-empty">此目录为空（可直接从其他系统文件管理器拖放文件到此处）</div>`
          : ui.entries.map((ent) => {
            const isSel = ui.selectedPath === ent.path || (Array.isArray(ui.selectedPaths) && ui.selectedPaths.includes(ent.path));
            return `<div class="files-row${isSel ? ' selected' : ''}"
              draggable="${ent.kind === 'file' ? 'true' : 'false'}"
              data-drag-system-id="${esc(sysId)}"
              data-drag-file-path="${esc(ent.path)}"
              data-testid="files-item" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-file-path="${esc(ent.path)}"
              data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="select" data-nos-dblaction="open"
              data-nos-payload="${esc(JSON.stringify({ path: ent.path }))}">
              ${iconHtml(ent.kind === 'dir' ? 'folder' : (ent.name.endsWith('.scene') ? 'scene' : 'file'), 'fr-ico')}
              <span class="fr-name">${esc(ent.name)}</span>
              <span class="fr-size">${ent.kind === 'dir' ? '目录' : fmtBytes(ent.size)}</span>
            </div>`;
          }).join('');
      }
    } else if (listEl) {
      // Preserve row DOM nodes across selection updates so double-click is never dropped!
      listEl.querySelectorAll('.files-row').forEach((row) => {
        const p = row.dataset.filePath;
        const isSel = ui.selectedPath === p || (Array.isArray(ui.selectedPaths) && ui.selectedPaths.includes(p));
        row.classList.toggle('selected', Boolean(isSel));
      });
    }

    const stEl = shell.querySelector('.files-status');
    if (stEl) stEl.textContent = `${ui.statusMsg || ''} · 目标系统 ${sysId}`;
  }

  // ==================== Subsystem Editor Renderer ====================

  _renderEditorApp(wRec, sysId, winId, ui) {
    const body = wRec.body;
    let root = body.querySelector(':scope > .editor-shell');
    if (!root) {
      body.innerHTML = `
        <div class="editor-shell">
          <div class="editor-toolbar">
            <input class="nos-input editor-fn-in" type="text" data-testid="editor-filename" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-input="edit_path" aria-label="文件路径"/>
            <button class="btn-xs" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="open_file">打开</button>
            <button class="btn-xs" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="new_file">新建</button>
            <button class="btn-xs btn-accent" data-testid="editor-save" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="save_file">保存</button>
            <button class="btn-xs btn-green" data-testid="editor-run" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="run_file">运行程序</button>
            <button class="btn-xs btn-amber" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="self_host" title="使用当前编译器编译 /sys/compiler.nos 并热重载">自举编译</button>
          </div>
          <div class="editor-quickbar"></div>
          <textarea class="editor-textarea" spellcheck="false" data-testid="editor-text" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-input="edit_text" aria-label="程序代码编辑区"></textarea>
          <div class="editor-output"></div>
          <div class="editor-status"></div>
        </div>
      `;
      root = body.querySelector(':scope > .editor-shell');
    }

    const fnIn = root.querySelector('[data-testid="editor-filename"]');
    if (fnIn && document.activeElement !== fnIn && fnIn.value !== (ui.pathInput || '')) fnIn.value = ui.pathInput || '';
    const ta = root.querySelector('[data-testid="editor-text"]');
    if (ta && document.activeElement !== ta && ta.value !== (ui.content || '')) ta.value = ui.content || '';

    const qb = root.querySelector('.editor-quickbar');
    if (qb && !qb.dataset.built) {
      qb.dataset.built = '1';
      qb.innerHTML = (ui.quickFiles || []).map((qf) => `
        <button class="qb-chip" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="open_file" data-nos-payload="${esc(JSON.stringify({ path: qf }))}">${esc(qf.split('/').pop())}</button>
      `).join('');
    }
    const out = root.querySelector('.editor-output');
    if (out) {
      const txt = (ui.outputLogs || []).join('\n') || '运行输出将显示在此处';
      if (out.textContent !== txt) out.textContent = txt;
    }
    const st = root.querySelector('.editor-status');
    if (st) st.textContent = `${ui.isUnsaved ? '● 未保存 · ' : ''}${ui.statusMsg || ''}`;
  }

  // ==================== Subsystem Process & Resource Manager Renderer ====================

  _renderTasksApp(wRec, sysId, winId, ui) {
    const m = ui.metrics;
    if (!m) return;
    const body = wRec.body;

    // Avoid wiping focused numeric input while editing
    const active = document.activeElement;
    if (active && body.contains(active) && (active.tagName === 'INPUT' || active.tagName === 'SELECT')) {
      // Only update live readouts without rebuilding input elements
      const summ = body.querySelector('.tm-live-summary');
      if (summ) {
        summ.textContent = `实得预算 ${m.budgetGranted} | 内核自身 ${m.kernelSelfSteps} | 内部进程 ${m.childSteps} | 剩余工作 ${m.pendingWork} | 内存 ${fmtBytes(m.memUsed)} / ${fmtBytes(m.memQuota)} | 存储 ${fmtBytes(m.storageUsed)} / ${fmtBytes(m.storageQuota)}`;
      }
      return;
    }

    const uiKey = JSON.stringify([m.vtime?.toFixed?.(1), m.budgetConfig, m.budgetGranted, m.kernelSelfSteps, m.childSteps, m.pendingWork, m.memUsed, m.storageUsed, m.procs?.length, ui.statusMsg, m.procs?.map(p => [p.pid, p.state, p.stepsTick, p.pendingWork, p.error, p.childPaused])]);
    if (wRec.lastUiKey === uiKey) return;
    wRec.lastUiKey = uiKey;

    const procs = m.procs || [];
    const carriers = procs.filter((p) => p.kind === 'carrier' && p.state !== 'exited');

    body.innerHTML = `
      <div class="tasks-shell">
        <div class="tm-header-row">
          <div class="tm-live-summary">实得预算 ${m.budgetGranted} | 内核自身 ${m.kernelSelfSteps} | 内部进程 ${m.childSteps} | 剩余工作 ${m.pendingWork} | 内存 ${fmtBytes(m.memUsed)}/${fmtBytes(m.memQuota)} | 存储 ${fmtBytes(m.storageUsed)}/${fmtBytes(m.storageQuota)}</div>
          <div class="tm-cfg-row">
            <label>总预算 <input type="number" class="nos-input-xs" step="5000" value="${m.budgetConfig}" data-testid="tasks-budget" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-input="set_budget"/></label>
            <label>内存(MB) <input type="number" class="nos-input-xxs" step="8" value="${Math.round(m.memQuota / 1048576)}" data-testid="tasks-memory" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-input="set_memory"/></label>
            <label>存储(MB) <input type="number" class="nos-input-xxs" step="4" value="${Math.round(m.storageQuota / 1048576)}" data-testid="tasks-storage" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-input="set_storage"/></label>
            <button class="btn-xs btn-accent" data-testid="system-new" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="system_new">+ 新建子系统</button>
            <button class="btn-xs" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="run_demo" data-nos-payload="${esc(JSON.stringify({ path: '/Programs/busy.nos' }))}">运行 busy.nos</button>
            <button class="btn-xs" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="run_demo" data-nos-payload="${esc(JSON.stringify({ path: '/Programs/sum.nos' }))}">运行 sum.nos</button>
          </div>
        </div>

        ${carriers.length > 0 ? `
        <div class="tm-section">
          <div class="tm-sec-title">直属子系统 (${carriers.length})</div>
          <div class="tm-child-list">
            ${carriers.map((c) => `
              <div class="tm-child-row">
                <span class="tm-cid">${esc(c.childId)}</span>
                <span class="tm-st st-${c.state === 'error' ? 'error' : (c.childPaused ? 'paused' : 'running')}">${c.state === 'error' ? '错误' : (c.childPaused ? '暂停' : '运行')}</span>
                <label class="tm-grant-lbl">拨付 <input type="number" class="nos-input-xs" step="5000" value="${c.childGrantCap || 50000}" data-testid="tasks-grant" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-target-system-id="${esc(c.childId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-input="child_grant" data-nos-payload="${esc(JSON.stringify({ childId: c.childId }))}"/></label>
                ${c.childPaused
                  ? `<button class="btn-xs" data-testid="system-resume" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-target-system-id="${esc(c.childId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="child_resume" data-nos-payload="${esc(JSON.stringify({ childId: c.childId }))}">继续</button>`
                  : `<button class="btn-xs" data-testid="system-pause" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-target-system-id="${esc(c.childId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="child_pause" data-nos-payload="${esc(JSON.stringify({ childId: c.childId }))}">暂停</button>`}
                <button class="btn-xs" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="child_step" data-nos-payload="${esc(JSON.stringify({ childId: c.childId }))}">单步</button>
                <button class="btn-xs" data-testid="system-restart" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-target-system-id="${esc(c.childId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="child_restart" data-nos-payload="${esc(JSON.stringify({ childId: c.childId }))}">重启</button>
                <button class="btn-xs" data-testid="kernel-open" data-system-id="${esc(sysId)}" data-window-id="${esc(winId)}" data-target-system-id="${esc(c.childId)}" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="child_open_kernel" data-nos-payload="${esc(JSON.stringify({ childId: c.childId }))}">内核</button>
                <button class="btn-xs" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="child_snapshot" data-nos-payload="${esc(JSON.stringify({ childId: c.childId }))}">快照</button>
                <button class="btn-xs btn-danger-xs" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="child_close" data-nos-payload="${esc(JSON.stringify({ childId: c.childId }))}">关闭</button>
              </div>
            `).join('')}
          </div>
        </div>` : ''}

        <div class="tm-table-wrap">
          <table class="tm-table">
            <thead><tr><th>PID</th><th>名称</th><th>状态</th><th>本步(自/子)</th><th>累计</th><th>剩余工作</th><th>内存</th><th>操作</th></tr></thead>
            <tbody>
              ${procs.map((p) => `
                <tr class="tm-row st-row-${esc(p.state)}">
                  <td>${p.pid}</td>
                  <td title="${esc(p.path)}">${esc(p.name)}${p.error ? `<div class="tm-err">${esc(p.error)}</div>` : ''}</td>
                  <td><span class="tm-st st-${esc(p.state)}">${esc(p.state)}</span></td>
                  <td>${p.stepsTick} <small>(${p.selfStepsTick}/${p.childStepsTick})</small></td>
                  <td>${p.stepsTotal}</td>
                  <td>${p.pendingWork}</td>
                  <td>${fmtBytes(p.memBytes)}</td>
                  <td class="tm-ops">
                    ${p.state === 'suspended'
                      ? `<button class="btn-xxs" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="proc_resume" data-nos-payload="${esc(JSON.stringify({ pid: p.pid }))}">继续</button>`
                      : (p.state !== 'exited' ? `<button class="btn-xxs" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="proc_suspend" data-nos-payload="${esc(JSON.stringify({ pid: p.pid }))}">挂起</button>` : '')}
                    ${p.state !== 'exited' && p.kind !== 'wm' ? `<button class="btn-xxs btn-danger-xs" data-nos-scope="app" data-nos-win="${esc(winId)}" data-nos-action="proc_kill" data-nos-payload="${esc(JSON.stringify({ pid: p.pid }))}">结束</button>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="tm-status">${esc(ui.statusMsg)} · 编译器 ${esc(m.compilerTag || '')}</div>
      </div>
    `;
  }

  // ==================== Raw Event Capture on Top-Level Subsystem Mount ====================

  _attachRawInputCapture(rootDesktopEl, topSystemId) {
    // Helper: compute exact local (x, y) inside the nearest owning subsystem desktop
    const getLocalCoords = (el, clientX, clientY) => {
      const desk = el.closest('[data-testid="os-desktop"]') || rootDesktopEl;
      const rect = desk.getBoundingClientRect();
      return {
        sysId: desk.dataset.systemId || topSystemId,
        x: ((clientX - rect.left) / Math.max(1, rect.width)) * desk.clientWidth,
        y: ((clientY - rect.top) / Math.max(1, rect.height)) * desk.clientHeight,
      };
    };

    // Route pointerdown/move/up/dblclick/contextmenu/wheel into topSystemId (which cascades through each layer's /sys/wm.nos!)
    const emitTopPointer = (type, e) => {
      const rect = rootDesktopEl.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * rootDesktopEl.clientWidth;
      const y = ((e.clientY - rect.top) / Math.max(1, rect.height)) * rootDesktopEl.clientHeight;
      this.cb.sendRawEvent(topSystemId, {
        type,
        x,
        y,
        button: e.button || 0,
        shift: e.shiftKey,
        ctrl: e.ctrlKey,
        deltaY: e.deltaY || 0,
      });
    };

    let active3dCanvas = null;
    let active3dDown = null;

    rootDesktopEl.addEventListener('pointerdown', (e) => {
      // Check if clicking a 3D player canvas inside any nested subsystem
      const cv = e.target.closest('canvas[data-testid="player-view"]');
      if (cv) {
        const rect = cv.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
        const ny = (e.clientY - rect.top) / Math.max(1, rect.height);
        active3dCanvas = cv;
        active3dDown = { x: e.clientX, y: e.clientY, sysId: cv.dataset.systemId, winId: cv.dataset.windowId };
        this.cb.sendControlAction(cv.dataset.systemId, {
          type: 'control_action',
          scope: 'app',
          winId: cv.dataset.windowId,
          action: 'view3d_pointerdown',
          payload: { nx, ny, aspect: rect.width / Math.max(1, rect.height) },
        });
      }

      // Always send raw pointerdown through top-down WM chain so WM handles stacking, focus & drag!
      if (e.target.closest('[data-testid="window-titlebar"]') && !e.target.closest('button')) {
        e.preventDefault();
      }
      const isInteractiveInput = e.target.closest('button, input, textarea, select, [data-nos-action]');
      if (!isInteractiveInput || e.target.closest('[data-testid="window-titlebar"]')) {
        emitTopPointer('pointerdown', e);
      } else {
        const winEl = e.target.closest('[data-testid="app-window"]');
        if (winEl && !e.target.closest('button[data-nos-scope="wm"]')) {
          emitTopPointer('pointerdown', e);
        }
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (document.getElementById('root-os')?.classList.contains('is-dragging-win')) return;
      if (active3dCanvas && active3dDown) {
        const rect = active3dCanvas.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
        const ny = (e.clientY - rect.top) / Math.max(1, rect.height);
        this.cb.sendControlAction(active3dDown.sysId, {
          type: 'control_action',
          scope: 'app',
          winId: active3dDown.winId,
          action: 'view3d_pointermove',
          payload: { nx, ny },
        });
      }
      if (e.buttons > 0) {
        emitTopPointer('pointermove', e);
      }
    });

    const endActiveDrag = (e) => {
      if (active3dCanvas && active3dDown) {
        const dp = active3dDown;
        const rect = active3dCanvas.getBoundingClientRect();
        const nx = e ? (e.clientX - rect.left) / Math.max(1, rect.width) : 0.5;
        const ny = e ? (e.clientY - rect.top) / Math.max(1, rect.height) : 0.5;
        active3dCanvas = null;
        active3dDown = null;
        this.cb.sendControlAction(dp.sysId, {
          type: 'control_action',
          scope: 'app',
          winId: dp.winId,
          action: 'view3d_pointerup',
          payload: { nx, ny },
        });
        if (e && Math.hypot(e.clientX - dp.x, e.clientY - dp.y) < 6) {
          this.cb.sendControlAction(dp.sysId, {
            type: 'control_action',
            scope: 'app',
            winId: dp.winId,
            action: 'view3d_click',
            payload: { nx, ny, aspect: rect.width / Math.max(1, rect.height) },
          });
        }
      }
      if (e) emitTopPointer('pointerup', e);
      else this.cb.sendRawEvent(topSystemId, { type: 'pointerup', x: 0, y: 0, button: 0 });
    };
    window.addEventListener('pointerup', endActiveDrag);
    window.addEventListener('pointercancel', endActiveDrag);
    window.addEventListener('blur', () => endActiveDrag(null));

    rootDesktopEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-nos-action]');
      if (!btn || btn.disabled) return;
      let cx = e.clientX;
      let cy = e.clientY;
      if (cx === 0 && cy === 0) {
        const br = btn.getBoundingClientRect();
        cx = br.left + br.width * 0.5;
        cy = br.top + br.height * 0.5;
      }
      const loc = getLocalCoords(btn, cx, cy);
      const payload = btn.dataset.nosPayload ? JSON.parse(btn.dataset.nosPayload) : {};
      this.cb.sendControlAction(loc.sysId, {
        type: 'control_action',
        scope: btn.dataset.nosScope || 'app',
        winId: btn.dataset.nosWin || null,
        action: btn.dataset.nosAction,
        payload,
        value: btn.value,
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        x: loc.x,
        y: loc.y,
      });
    });

    rootDesktopEl.addEventListener('dblclick', (e) => {
      const dbl = e.target.closest('[data-nos-dblaction]');
      if (dbl) {
        let cx = e.clientX;
        let cy = e.clientY;
        if (cx === 0 && cy === 0) {
          const br = dbl.getBoundingClientRect();
          cx = br.left + br.width * 0.5;
          cy = br.top + br.height * 0.5;
        }
        const loc = getLocalCoords(dbl, cx, cy);
        const payload = dbl.dataset.nosPayload ? JSON.parse(dbl.dataset.nosPayload) : {};
        this.cb.sendControlAction(loc.sysId, {
          type: 'control_action',
          scope: dbl.dataset.nosScope || 'app',
          winId: dbl.dataset.nosWin || null,
          action: dbl.dataset.nosDblaction,
          payload,
          x: loc.x,
          y: loc.y,
        });
        return;
      }
      emitTopPointer('dblclick', e);
    });

    rootDesktopEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      emitTopPointer('contextmenu', e);
    });

    rootDesktopEl.addEventListener('wheel', (e) => {
      const cv = e.target.closest('canvas[data-testid="player-view"]');
      if (cv) {
        e.preventDefault();
        this.cb.sendControlAction(cv.dataset.systemId, {
          type: 'control_action',
          scope: 'app',
          winId: cv.dataset.windowId,
          action: 'view3d_wheel',
          payload: { deltaY: e.deltaY },
        });
      }
    }, { passive: false });

    const onInputVal = (e) => {
      const el = e.target.closest('[data-nos-input]');
      if (!el || el.disabled) return;
      const loc = getLocalCoords(el, 0, 0);
      const payload = el.dataset.nosPayload ? JSON.parse(el.dataset.nosPayload) : {};
      this.cb.sendControlAction(loc.sysId, {
        type: 'input_change',
        scope: el.dataset.nosScope || 'app',
        winId: el.dataset.nosWin || null,
        action: el.dataset.nosInput,
        payload,
        value: el.type === 'checkbox' ? el.checked : el.value,
      });
    };
    rootDesktopEl.addEventListener('change', onInputVal);
    rootDesktopEl.addEventListener('input', (e) => {
      if (e.target.matches('textarea, input[type="range"], input[type="text"], input[type="number"]')) {
        onInputVal(e);
      }
    });

    rootDesktopEl.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea, select')) {
        if (e.key === 'Escape') {
          emitTopPointer('keydown', e);
        }
        return;
      }
      this.cb.sendRawEvent(topSystemId, {
        type: 'keydown',
        key: e.key,
        code: e.code,
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
      });
    });
  }
}
