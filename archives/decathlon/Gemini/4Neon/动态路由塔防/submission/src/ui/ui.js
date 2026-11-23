import {
  DIRECTION_VECTORS,
  ENEMY_SPECS,
  ENTRY_COLORS,
  ITEM_SPECS,
  STATUS_SPECS,
  TERRAIN_SPECS,
  TOWER_SPECS,
} from '../data/specs.js';
import { MAPS } from '../data/maps.js';
import { DEMO_DEFS } from '../data/demos.js';
import { iconHtml } from './icons.js';
import { tileKey } from '../core/pathfinding.js';

export class UIManager {
  constructor({ engine, scene, audio, callbacks }) {
    this.engine = engine;
    this.scene = scene;
    this.audio = audio;
    this.cb = callbacks;

    this.selection = null; // { kind: 'tower', towerId } | { kind: 'enemy', enemyId } | { kind: 'tile', x, y }
    this.forecastOpen = false;
    this.audioOpen = false;
    this.codexOpen = false;
    this.codexTab = 'devices';
    this.pauseMenuOpen = false;

    this.dragState = null; // { kind: 'tower'|'item', id, hoverX, hoverY, aimingDir?, awaitingDir? }
    this.floatingTexts = []; // { gx, gy, alt, text, color, age, duration }
    this.bannerTimer = 0;
    this.sysLogs = [];
    this.lastInspectorKey = '';
    this.routePreviewState = null; // { changedEntries, previewRoutes, sealedEntries }
    this.routeChangedFlash = {}; // entryId -> remaining seconds

    this.cacheElements();
    this.renderMainMenu();
    this.renderDeployDock();
    this.bindEvents();
  }

  cacheElements() {
    this.el = {
      menuOverlay: document.getElementById('menu-overlay'),
      mapGrid: document.getElementById('map-select-grid'),
      demoGrid: document.getElementById('demo-select-grid'),
      hudRoot: document.getElementById('hud-root'),
      worldOverlay: document.getElementById('world-overlay'),
      // Top telemetry
      hudMapName: document.getElementById('hud-map-name'),
      hudMapType: document.getElementById('hud-map-type'),
      hudCompute: document.getElementById('hud-compute'),
      hudIntel: document.getElementById('hud-intel'),
      hudIntegrityVal: document.getElementById('hud-integrity-val'),
      hudIntegrityBar: document.getElementById('hud-integrity-bar'),
      hudWaveNum: document.getElementById('hud-wave-num'),
      hudWaveName: document.getElementById('hud-wave-name'),
      btnCallWave: document.getElementById('btn-call-wave'),
      btnForecast: document.getElementById('btn-forecast'),
      forecastPanel: document.getElementById('forecast-panel'),
      btnPause: document.getElementById('btn-pause'),
      btnSpeed: document.getElementById('btn-speed'),
      btnResetCam: document.getElementById('btn-reset-cam'),
      btnAudio: document.getElementById('btn-audio'),
      audioPopover: document.getElementById('audio-popover'),
      btnCodex: document.getElementById('btn-codex'),
      btnMenu: document.getElementById('btn-menu'),
      // Banners & Logs
      alertBanner: document.getElementById('alert-banner'),
      bossBarWrap: document.getElementById('boss-bar-wrap'),
      routeStrip: document.getElementById('route-strip'),
      sysLogBox: document.getElementById('sys-log-box'),
      dragTooltip: document.getElementById('drag-tooltip'),
      // Dock & Inspector
      deployDock: document.getElementById('deploy-dock'),
      inspectorPanel: document.getElementById('inspector-panel'),
      dirPrompt: document.getElementById('dir-prompt'),
      // Modals
      codexModal: document.getElementById('codex-modal'),
      codexBody: document.getElementById('codex-body'),
      pauseModal: document.getElementById('pause-modal'),
      reportModal: document.getElementById('report-modal'),
      reportContent: document.getElementById('report-content'),
      // Demo overlays
      demoBanner: document.getElementById('demo-subtitle-bar'),
      demoTag: document.getElementById('demo-tag'),
      demoText: document.getElementById('demo-subtitle-text'),
      demoProgress: document.getElementById('demo-progress-fill'),
      demoCursor: document.getElementById('demo-cursor'),
      demoCursorBadge: document.getElementById('demo-cursor-badge'),
      btnExitDemo: document.getElementById('btn-exit-demo'),
    };
  }

  // ==================== MAIN MENU & LEVEL SELECT ====================

  renderMainMenu() {
    // 3 Map Cards with custom mini-topology schematics
    const schematics = {
      intranet: `<svg viewBox="0 0 180 96" class="map-svg">
        <path d="M46 10 V76 H90 V90 M134 10 V76 H90" stroke="#28d8ff" stroke-width="2.5" fill="none"/>
        <path d="M46 22 H134" stroke="#63f5ff" stroke-width="2.5" stroke-dasharray="4 3" fill="none"/>
        <path d="M46 48 H134" stroke="#f59e0b" stroke-width="2.5" stroke-dasharray="3 2" fill="none"/>
        <path d="M46 22 H16 V82 H90 M134 22 H164 V82 H90" stroke="#487ea3" stroke-width="2" fill="none"/>
        <circle cx="46" cy="34" r="5" fill="#28f2b2"/><circle cx="134" cy="34" r="5" fill="#28f2b2"/>
        <circle cx="46" cy="60" r="5" fill="#28f2b2"/><circle cx="90" cy="76" r="5" fill="#ffb830"/>
        <rect x="40" y="4" width="12" height="8" rx="2" fill="#22e6ff"/><rect x="128" y="4" width="12" height="8" rx="2" fill="#ffb830"/>
        <polygon points="90,82 97,92 83,92" fill="#38f29e"/>
      </svg>`,
      backbone: `<svg viewBox="0 0 180 96" class="map-svg">
        <rect x="4" y="42" width="172" height="16" fill="#0d4b7a" opacity="0.55"/>
        <path d="M26 10 V80 H42 V90 M74 22 V80 M134 22 V80 H134 V90" stroke="#36f0cf" stroke-width="2.5" fill="none"/>
        <path d="M134 40 V60" stroke="#f59e0b" stroke-width="3.5" fill="none"/>
        <path d="M26 22 H154 M26 80 H134 M110 10 V22 M154 10 V22" stroke="#28d8ff" stroke-width="2.2" fill="none"/>
        <circle cx="26" cy="35" r="5" fill="#28f2b2"/><circle cx="134" cy="30" r="5" fill="#ffb830"/>
        <circle cx="42" cy="84" r="4.5" fill="#28f2b2"/><circle cx="134" cy="84" r="4.5" fill="#28f2b2"/>
        <rect x="20" y="4" width="12" height="8" rx="2" fill="#22e6ff"/><rect x="104" y="4" width="12" height="8" rx="2" fill="#d466ff"/><rect x="148" y="4" width="12" height="8" rx="2" fill="#ffb830"/>
        <polygon points="42,86 49,95 35,95" fill="#38f29e"/><polygon points="134,86 141,95 127,95" fill="#38f29e"/>
      </svg>`,
      airgap: `<svg viewBox="0 0 180 96" class="map-svg">
        <rect x="58" y="28" width="64" height="40" rx="4" fill="#1d1812" stroke="#f59e0b" stroke-dasharray="4 3" stroke-width="1.8"/>
        <path d="M46 10 V90 M134 10 V90 M46 22 H134 M46 74 H134 M104 10 V22" stroke="#38f2a8" stroke-width="2.5" fill="none"/>
        <path d="M46 22 H18 V74 H46 M134 22 H162 V74 H134" stroke="#f59e0b" stroke-width="2.2" stroke-dasharray="3 2" fill="none"/>
        <circle cx="46" cy="48" r="5" fill="#28f2b2"/><circle cx="118" cy="22" r="5" fill="#28f2b2"/>
        <circle cx="134" cy="48" r="5" fill="#ffb830"/><circle cx="134" cy="82" r="4.5" fill="#28f2b2"/>
        <rect x="40" y="4" width="12" height="8" rx="2" fill="#22e6ff"/><rect x="98" y="4" width="12" height="8" rx="2" fill="#ffb830"/><rect x="128" y="4" width="12" height="8" rx="2" fill="#d466ff"/>
        <polygon points="46,84 53,94 39,94" fill="#38f29e"/><polygon points="134,84 141,94 127,94" fill="#38f29e"/>
      </svg>`,
    };

    this.el.mapGrid.innerHTML = MAPS.map((m) => {
      const boss = ENEMY_SPECS[m.bossId];
      return `
        <div class="map-card" data-start-map="${m.id}">
          <div class="map-card-top">
            <span class="map-badge">${m.networkType}</span>
            <span class="map-waves">${m.totalWaves} 波 · ${m.difficulty}</span>
          </div>
          <div class="map-schematic">${schematics[m.id] || ''}</div>
          <h3 class="map-card-title">${m.name}</h3>
          <div class="map-card-sub">${m.subtitle}</div>
          <p class="map-card-desc">${m.description}</p>
          <div class="map-card-meta">
            <span>入口 ${m.entries.map((e) => e.id).join('/')} → 核心 ${m.exits.map((e) => e.id).join('/')}</span>
            <span class="boss-pill">领主：${boss.name}</span>
          </div>
          <button class="btn-primary map-launch-btn">接入防线</button>
        </div>
      `;
    }).join('');

    this.el.demoGrid.innerHTML =
      DEMO_DEFS.map(
        (d, idx) => `
      <button class="demo-card-btn" data-start-demo="${d.id}">
        <div class="demo-card-head">
          <span class="demo-idx">0${idx + 1}</span>
          <span class="demo-title">${d.title}</span>
          <span class="demo-dur">${Math.round(d.duration)}s</span>
        </div>
        <div class="demo-card-sub">${d.subtitlePrefix}</div>
        <div class="demo-card-desc">${d.description}</div>
      </button>
    `
      ).join('') +
      `<button class="demo-card-btn demo-all-btn" data-start-demo="all">
        <div class="demo-card-head">
          <span class="demo-idx">ALL</span>
          <span class="demo-title">三段联播</span>
          <span class="demo-dur">58s</span>
        </div>
        <div class="demo-card-sub">全自动实时演出</div>
        <div class="demo-card-desc">依次实时演示分段取舍、旁路直通与蛰影现身全部三段战局。</div>
      </button>`;
  }

  // ==================== BOTTOM DEPLOYMENT & ITEM DOCK ====================

  renderDeployDock() {
    const groundTowers = ['firewall', 'honeypot', 'airgap'];
    const platformTowers = ['interceptor', 'sandbox', 'repair'];
    const items = ['isolator', 'downgrade', 'restore'];
    const hotkeys = {
      firewall: '1',
      honeypot: '2',
      airgap: '3',
      interceptor: '4',
      sandbox: '5',
      repair: '6',
      isolator: '7',
      downgrade: '8',
      restore: '9',
    };

    const renderTowerCard = (id) => {
      const s = TOWER_SPECS[id];
      const intelTag = s.nodeCostIntel > 0 ? `<span class="cost-intel">${iconHtml('intel', 'ico-xs')}+${s.nodeCostIntel}</span>` : '';
      return `
        <div class="dock-card tower-card" data-tower-card="${id}" title="${s.name} [快捷键 ${hotkeys[id]}]：${s.shortDesc}">
          <span class="card-key">${hotkeys[id]}</span>
          <div class="card-role">${s.role}</div>
          <div class="card-ico">${iconHtml(id, 'ico-lg')}</div>
          <div class="card-name">${s.name}</div>
          <div class="card-place">${s.placementText}</div>
          <div class="card-costs">
            <span class="cost-compute">${iconHtml('compute', 'ico-xs')}${s.costCompute}</span>
            ${intelTag}
          </div>
        </div>
      `;
    };

    const renderItemCard = (id) => {
      const s = ITEM_SPECS[id];
      const costCls = s.costType === 'intel' ? 'cost-intel' : 'cost-compute';
      const costIco = s.costType === 'intel' ? 'intel' : 'compute';
      return `
        <div class="dock-card item-card" data-item-card="${id}" title="${s.name} [快捷键 ${hotkeys[id]}]：${s.shortDesc}">
          <span class="card-key">${hotkeys[id]}</span>
          <div class="card-role item-role">战术道具</div>
          <div class="card-ico item-ico">${iconHtml(id, 'ico-lg')}</div>
          <div class="card-name">${s.name}</div>
          <div class="card-place">${s.targetText}</div>
          <div class="card-costs">
            <span class="${costCls}">${iconHtml(costIco, 'ico-xs')}${s.cost}</span>
            <span class="card-cd-text" data-item-cd="${id}">就绪</span>
          </div>
          <div class="card-cd-mask" data-item-mask="${id}"></div>
        </div>
      `;
    };

    this.el.deployDock.innerHTML = `
      <div class="dock-group">
        <div class="dock-group-label">链路 / 节点防线</div>
        <div class="dock-cards">${groundTowers.map(renderTowerCard).join('')}</div>
      </div>
      <div class="dock-divider"></div>
      <div class="dock-group">
        <div class="dock-group-label">设备平台支援</div>
        <div class="dock-cards">${platformTowers.map(renderTowerCard).join('')}</div>
      </div>
      <div class="dock-divider"></div>
      <div class="dock-group">
        <div class="dock-group-label">应急战术道具</div>
        <div class="dock-cards">${items.map(renderItemCard).join('')}</div>
      </div>
    `;
  }

  // ==================== EVENT BINDINGS ====================

  bindEvents() {
    // Menu map & demo launch
    this.el.mapGrid.addEventListener('click', (e) => {
      const card = e.target.closest('[data-start-map]');
      if (!card) return;
      this.audio.unlock();
      this.audio.playUI('click');
      this.cb.onStartMap(card.dataset.startMap);
    });

    this.el.demoGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-start-demo]');
      if (!btn) return;
      this.audio.unlock();
      this.audio.playUI('click');
      this.cb.onStartDemo(btn.dataset.startDemo);
    });

    document.getElementById('btn-menu-codex')?.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playUI('click');
      this.openCodex('devices');
    });

    // Top HUD Controls
    this.el.btnCallWave.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playUI('click');
      this.engine.startNextWave();
    });

    this.el.btnForecast.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playUI('click');
      this.forecastOpen = !this.forecastOpen;
      this.el.forecastPanel.classList.toggle('hidden', !this.forecastOpen);
      this.el.btnForecast.classList.toggle('active', this.forecastOpen);
      if (this.forecastOpen) this.renderForecast();
    });

    this.el.btnPause.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playUI('click');
      this.cb.onTogglePause();
    });

    this.el.btnSpeed.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playUI('click');
      this.cb.onToggleSpeed();
    });

    this.el.btnResetCam.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playUI('click');
      this.scene.resetCamera(false);
    });

    this.el.btnAudio.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playUI('click');
      this.audioOpen = !this.audioOpen;
      this.el.audioPopover.classList.toggle('hidden', !this.audioOpen);
    });

    document.getElementById('btn-mute-toggle')?.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.setMuted(!this.audio.muted);
      this.syncAudioUI();
    });
    document.getElementById('vol-master')?.addEventListener('input', (e) => {
      this.audio.setVolumes({ master: Number(e.target.value) / 100 });
    });
    document.getElementById('vol-bgm')?.addEventListener('input', (e) => {
      this.audio.setVolumes({ bgm: Number(e.target.value) / 100 });
    });
    document.getElementById('vol-sfx')?.addEventListener('input', (e) => {
      this.audio.setVolumes({ sfx: Number(e.target.value) / 100 });
    });

    this.el.btnCodex.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playUI('click');
      this.openCodex('devices');
    });

    this.el.btnMenu.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playUI('click');
      this.togglePauseMenu(true);
    });

    this.el.btnExitDemo.addEventListener('click', () => {
      this.audio.playUI('click');
      this.cb.onExitDemo();
    });

    // Pause Modal Buttons
    document.getElementById('btn-resume-game')?.addEventListener('click', () => {
      this.audio.playUI('click');
      this.togglePauseMenu(false);
    });
    document.getElementById('btn-restart-map')?.addEventListener('click', () => {
      this.audio.playUI('click');
      this.togglePauseMenu(false);
      this.cb.onRestartMap();
    });
    document.getElementById('btn-pause-codex')?.addEventListener('click', () => {
      this.audio.playUI('click');
      this.togglePauseMenu(false);
      this.openCodex('devices');
    });
    document.getElementById('btn-back-menu')?.addEventListener('click', () => {
      this.audio.playUI('click');
      this.togglePauseMenu(false);
      this.cb.onReturnMenu();
    });

    // Codex Modal Tabs & Close
    this.el.codexModal.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-codex-tab]');
      if (tab) {
        this.audio.playUI('click');
        this.codexTab = tab.dataset.codexTab;
        this.renderCodexContent();
      }
      if (e.target.closest('#btn-close-codex') || e.target === this.el.codexModal) {
        this.audio.playUI('click');
        this.closeCodex();
      }
    });

    // Dock Card Drag-and-Drop Initiation
    this.el.deployDock.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.engine.demoMode) return;
      this.audio.unlock();
      const tCard = e.target.closest('[data-tower-card]');
      const iCard = e.target.closest('[data-item-card]');
      if (tCard) {
        e.preventDefault();
        this.startDrag('tower', tCard.dataset.towerCard, e.clientX, e.clientY);
      } else if (iCard) {
        e.preventDefault();
        this.startDrag('item', iCard.dataset.itemCard, e.clientX, e.clientY);
      }
    });

    // Global Pointer Move / Up for Drag-and-Drop, Tile Hover Ring & Interceptor Direction Aiming
    window.addEventListener('pointermove', (e) => {
      if (this.engine.demoMode) return;
      if (this.dragState) {
        this.handleDragMove(e.clientX, e.clientY, e.target);
      } else if (this.el.menuOverlay.classList.contains('hidden') && !this.codexOpen && !this.pauseMenuOpen) {
        if (e.target && e.target !== this.scene.canvas) {
          this.scene.setHoverTile(this.engine.map, -1, -1);
          return;
        }
        const pick = this.scene.pickTile(e.clientX, e.clientY);
        if (pick) this.scene.setHoverTile(this.engine.map, pick.gx, pick.gy);
        else this.scene.setHoverTile(this.engine.map, -1, -1);
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (!this.dragState || e.button !== 0 || this.engine.demoMode) return;
      this.handleDragDrop(e.clientX, e.clientY, e.target);
    });

    // Canvas Left-Click Selection (and Interceptor Direction Confirm)
    this.scene.canvas.addEventListener('pointerdown', (e) => {
      if (this.engine.demoMode) return;
      this.audio.unlock();
      if (e.button === 2) {
        // Right-click cancels placement or deselects
        if (this.dragState) {
          this.cancelDrag();
          this.audio.playUI('click');
        } else if (this.selection) {
          this.clearSelection();
        }
        return;
      }
      if (e.button !== 0) return;

      if (this.dragState && this.dragState.awaitingDir) {
        // Confirm Interceptor facing direction!
        const { x, y, dir } = this.dragState;
        this.cancelDrag();
        const res = this.engine.deployTower('interceptor', x, y, dir);
        if (res.ok) this.selectTowerById(res.tower.id);
        return;
      }

      if (this.dragState) return;

      // 1. Check click on Tower / Enemy / Tile
      const pickedTile = this.scene.pickTile(e.clientX, e.clientY);
      if (pickedTile) {
        const tower = this.engine.getTowerAt(pickedTile.gx, pickedTile.gy);
        if (tower) {
          this.audio.playUI('click');
          this.selectTowerById(tower.id);
          return;
        }
      }
      const pickedEnemy = this.scene.pickEnemyNear(e.clientX, e.clientY, this.engine);
      if (pickedEnemy) {
        this.audio.playUI('click');
        this.selection = { kind: 'enemy', enemyId: pickedEnemy.id };
        this.lastInspectorKey = '';
        this.renderInspector();
        return;
      }
      if (pickedTile) {
        this.audio.playUI('click');
        this.selection = { kind: 'tile', x: pickedTile.gx, y: pickedTile.gy };
        this.lastInspectorKey = '';
        this.renderInspector();
        return;
      }
      this.clearSelection();
    });

    this.scene.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      this.audio.unlock();
      if (e.code === 'Escape') {
        if (this.codexOpen) return this.closeCodex();
        if (this.engine.demoMode) return this.cb.onExitDemo();
        if (this.dragState) return this.cancelDrag();
        if (this.selection) return this.clearSelection();
        if (!this.el.menuOverlay.classList.contains('hidden')) return;
        this.togglePauseMenu(!this.pauseMenuOpen);
      } else if (e.code === 'Space' && !this.codexOpen && this.el.menuOverlay.classList.contains('hidden') && !this.engine.demoMode) {
        e.preventDefault();
        this.cb.onTogglePause();
      } else if ((e.code === 'KeyR' || e.code === 'Home') && this.el.menuOverlay.classList.contains('hidden') && !this.engine.demoMode) {
        this.scene.resetCamera(false);
      } else if (e.code === 'F1') {
        e.preventDefault();
        if (this.codexOpen) this.closeCodex();
        else this.openCodex('devices');
      } else if (this.dragState && this.dragState.awaitingDir && !this.engine.demoMode) {
        const keyDir = { KeyW: 'N', ArrowUp: 'N', KeyD: 'E', ArrowRight: 'E', KeyS: 'S', ArrowDown: 'S', KeyA: 'W', ArrowLeft: 'W' }[e.code];
        if (keyDir) {
          e.preventDefault();
          this.dragState.dir = keyDir;
          this.refreshInterceptorAimPreview();
        } else if (e.code === 'Enter') {
          e.preventDefault();
          const { x, y, dir } = this.dragState;
          this.cancelDrag();
          const res = this.engine.deployTower('interceptor', x, y, dir);
          if (res.ok) this.selectTowerById(res.tower.id);
        }
      } else if (!this.codexOpen && !this.pauseMenuOpen && this.el.menuOverlay.classList.contains('hidden') && !this.engine.demoMode) {
        // Quick PC keyboard hotkeys: 1-6 Towers, 7-9 Items, F Active Skill, M Mute
        const digitMap = {
          Digit1: ['tower', 'firewall'],
          Digit2: ['tower', 'honeypot'],
          Digit3: ['tower', 'airgap'],
          Digit4: ['tower', 'interceptor'],
          Digit5: ['tower', 'sandbox'],
          Digit6: ['tower', 'repair'],
          Digit7: ['item', 'isolator'],
          Digit8: ['item', 'downgrade'],
          Digit9: ['item', 'restore'],
        };
        if (digitMap[e.code]) {
          const [kind, id] = digitMap[e.code];
          if (this.dragState && this.dragState.kind === kind && this.dragState.id === id) {
            this.cancelDrag();
          } else {
            this.startDrag(kind, id, -100, -100);
          }
        } else if (e.code === 'KeyF' && this.selection?.kind === 'tower') {
          this.audio.playUI('click');
          this.engine.activateSkill(this.selection.towerId);
          this.lastInspectorKey = '';
          this.renderInspector();
        } else if (e.code === 'KeyM') {
          this.audio.setMuted(!this.audio.muted);
          this.syncAudioUI();
        }
      }
    });
  }

  // ==================== DRAG & DROP + INTERCEPTOR DIRECTION ====================

  startDrag(kind, id, clientX, clientY) {
    this.clearSelection();
    this.audio.playUI('click');
    this.dragState = {
      kind,
      id,
      hoverX: -1,
      hoverY: -1,
      awaitingDir: false,
      x: -1,
      y: -1,
      dir: 'S',
      startedAtX: clientX,
      startedAtY: clientY,
    };
    document.querySelectorAll('.dock-card.armed').forEach((c) => c.classList.remove('armed'));
    const card = document.querySelector(kind === 'tower' ? `[data-tower-card="${id}"]` : `[data-item-card="${id}"]`);
    card?.classList.add('armed');

    // Immediately illuminate all eligible buildable/targetable tiles on the 3D battlefield!
    const validTiles = this.engine.getValidPlacementTiles(kind, id);
    const hlColor = kind === 'item' ? (id === 'restore' ? 0x36ffaa : 0xffb830) : id === 'airgap' ? 0xffc63d : 0x34f5c8;
    this.scene.vfx.showValidTiles(this.engine.map, validTiles, hlColor);
  }

  cancelDrag() {
    this.dragState = null;
    this.routePreviewState = null;
    this.scene.hideGhost();
    this.scene.vfx.clearValidTiles();
    this.scene.vfx.clearPlacementPreview();
    this.scene.vfx.clearRoutePreview();
    this.el.dirPrompt.classList.add('hidden');
    this.el.dragTooltip.classList.add('hidden');
    document.querySelectorAll('.dock-card.armed').forEach((c) => c.classList.remove('armed'));
  }

  renderDirPrompt(dir) {
    const dirs = [
      { id: 'N', label: '北 ↑' },
      { id: 'E', label: '东 →' },
      { id: 'S', label: '南 ↓' },
      { id: 'W', label: '西 ←' },
    ];
    this.el.dirPrompt.innerHTML = `
      <span>设定拦截器朝向：</span>
      ${dirs.map((d) => `<button class="dir-pill ${d.id === dir ? 'active' : ''}" data-pick-dir="${d.id}">${d.label}</button>`).join('')}
      <button class="dir-pill dir-confirm" id="btn-dir-confirm">确认部署</button>
      <button class="dir-pill dir-cancel" id="btn-dir-cancel">取消</button>
    `;
    this.el.dirPrompt.querySelectorAll('[data-pick-dir]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.dragState?.awaitingDir) return;
        this.dragState.dir = b.dataset.pickDir;
        this.refreshInterceptorAimPreview();
      });
    });
    document.getElementById('btn-dir-confirm')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.dragState?.awaitingDir) return;
      const { x, y, dir: d } = this.dragState;
      this.cancelDrag();
      const res = this.engine.deployTower('interceptor', x, y, d);
      if (res.ok) this.selectTowerById(res.tower.id);
    });
    document.getElementById('btn-dir-cancel')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancelDrag();
    });
  }

  refreshInterceptorAimPreview(forcePrompt = false) {
    if (!this.dragState?.awaitingDir) return;
    const { x, y, dir } = this.dragState;
    const spec = TOWER_SPECS.interceptor;
    this.scene.showGhostTower(this.engine.map, 'interceptor', x, y, dir, true);
    this.scene.vfx.showPlacementPreview(this.engine.map, {
      x,
      y,
      valid: true,
      directional: true,
      dir,
      rangeForward: spec.rangeForward,
      rangeSide: spec.rangeSide,
    });
    if (forcePrompt || this.lastAimPromptDir !== dir) {
      this.lastAimPromptDir = dir;
      this.renderDirPrompt(dir);
    }
  }

  setRoutePreviewState(state) {
    this.routePreviewState = state;
  }

  showDragTooltip(clientX, clientY, text, mode = 'valid') {
    if (!text) {
      this.el.dragTooltip.classList.add('hidden');
      return;
    }
    this.el.dragTooltip.textContent = text;
    this.el.dragTooltip.className = `drag-tooltip ${mode === 'invalid' ? 'invalid' : mode === 'reroute' ? 'reroute' : ''}`;
    const flipX = clientX > window.innerWidth - 300;
    const tx = flipX ? Math.max(12, clientX - 270) : clientX + 18;
    const ty = Math.max(60, Math.min(window.innerHeight - 48, clientY - 12));
    this.el.dragTooltip.style.transform = `translate3d(${Math.round(tx)}px, ${Math.round(ty)}px, 0)`;
  }

  isOverUIBlockingPanel(targetEl) {
    if (!targetEl || !targetEl.closest) return false;
    return !!targetEl.closest('#deploy-dock, .top-bar, #inspector-panel, #forecast-panel, .modal-window, #dir-prompt');
  }

  handleDragMove(clientX, clientY, targetEl = null) {
    const ds = this.dragState;
    if (!ds || !this.engine.map) return;

    // Mode B: Aiming Interceptor Facing Direction after dropping on a platform
    if (ds.awaitingDir) {
      this.el.dragTooltip.classList.add('hidden');
      // Do not fight mouse aiming when hovering over the clickable direction pill buttons!
      if (targetEl && targetEl.closest && targetEl.closest('#dir-prompt')) return;
      const worldPt = this.scene.pickWorldOnGround(clientX, clientY);
      if (worldPt) {
        const originX = (ds.x - (this.engine.map.width - 1) * 0.5) * 2.0;
        const originZ = (ds.y - (this.engine.map.height - 1) * 0.5) * 2.0;
        const dx = worldPt.x - originX;
        const dz = worldPt.z - originZ;
        if (Math.hypot(dx, dz) > 0.35) {
          ds.dir = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'E' : 'W') : dz > 0 ? 'S' : 'N';
        }
      }
      this.refreshInterceptorAimPreview(false);
      return;
    }

    // Never raycast through HUD dock/top bar/inspector onto hidden board tiles behind them!
    if (this.isOverUIBlockingPanel(targetEl)) {
      this.scene.hideGhost();
      this.scene.vfx.clearPlacementPreview();
      this.scene.vfx.clearRoutePreview();
      this.routePreviewState = null;
      this.el.dragTooltip.classList.add('hidden');
      ds.hoverX = -1;
      ds.hoverY = -1;
      return;
    }

    // Mode A: Dragging card over board
    const pick = this.scene.pickTile(clientX, clientY);
    if (!pick) {
      this.scene.hideGhost();
      this.scene.vfx.clearPlacementPreview();
      this.scene.vfx.clearRoutePreview();
      this.routePreviewState = null;
      this.el.dragTooltip.classList.add('hidden');
      ds.hoverX = -1;
      ds.hoverY = -1;
      return;
    }

    ds.hoverX = pick.gx;
    ds.hoverY = pick.gy;

    if (ds.kind === 'tower') {
      const spec = TOWER_SPECS[ds.id];
      const prev = this.engine.previewTowerPlacement(ds.id, pick.gx, pick.gy);
      this.scene.showGhostTower(this.engine.map, ds.id, pick.gx, pick.gy, 'S', prev.valid);
      this.scene.vfx.showPlacementPreview(this.engine.map, {
        x: pick.gx,
        y: pick.gy,
        valid: prev.valid,
        range:
          ds.id === 'firewall' && prev.onNode
            ? 1.65
            : ds.id === 'honeypot'
            ? spec.tauntRange
            : spec.range || spec.detectRange || 0,
        secondaryRange:
          ds.id === 'sandbox'
            ? spec.detectRange
            : ds.id === 'honeypot'
            ? spec.range
            : 0,
        secondaryColor: ds.id === 'sandbox' ? 0x3effd4 : 0xffc83b,
        directional: !!spec.directional,
        dir: 'S',
        rangeForward: spec.rangeForward || 0,
        rangeSide: spec.rangeSide || 0,
      });
      if (prev.sealed) {
        this.routePreviewState = { sealedEntries: prev.sealedEntries };
        this.scene.vfx.showRoutePreview(this.engine.map, null, [], {
          sealedEntries: prev.sealedEntries,
          sealedEnemies: prev.sealedEnemies,
          nodePos: { x: pick.gx, y: pick.gy },
        });
        this.showDragTooltip(clientX, clientY, prev.reason, 'invalid');
      } else if (prev.previewRoutes && prev.changedEntries?.length > 0) {
        this.routePreviewState = { changedEntries: prev.changedEntries, previewRoutes: prev.previewRoutes };
        this.scene.vfx.showRoutePreview(this.engine.map, prev.previewRoutes, prev.changedEntries);
        const ch = prev.changedEntries.join('/');
        this.showDragTooltip(
          clientX,
          clientY,
          prev.valid ? `预览：入口 ${ch} 改道 · ${prev.costCompute}算力${prev.costIntel ? ` +${prev.costIntel}情报` : ''}` : prev.reason,
          prev.valid ? 'reroute' : 'invalid'
        );
      } else {
        this.routePreviewState = null;
        this.scene.vfx.clearRoutePreview();
        this.showDragTooltip(
          clientX,
          clientY,
          prev.valid ? `部署「${spec.name}」· ${prev.costCompute}算力${prev.costIntel ? ` +${prev.costIntel}情报` : ''}` : prev.reason,
          prev.valid ? 'valid' : 'invalid'
        );
      }
    } else {
      const spec = ITEM_SPECS[ds.id];
      const prev = this.engine.previewItemUse(ds.id, pick.gx, pick.gy);
      this.scene.hideGhost();
      this.scene.vfx.showPlacementPreview(this.engine.map, {
        x: pick.gx,
        y: pick.gy,
        valid: prev.valid,
        affectedTiles: prev.affectedTiles || [{ x: pick.gx, y: pick.gy }],
      });
      if (prev.sealed) {
        this.routePreviewState = { sealedEntries: prev.sealedEntries };
        this.scene.vfx.showRoutePreview(this.engine.map, null, [], {
          sealedEntries: prev.sealedEntries,
          sealedEnemies: prev.sealedEnemies,
          nodePos: { x: pick.gx, y: pick.gy },
        });
        this.showDragTooltip(clientX, clientY, prev.reason, 'invalid');
      } else if (prev.previewRoutes && prev.changedEntries?.length > 0) {
        this.routePreviewState = { changedEntries: prev.changedEntries, previewRoutes: prev.previewRoutes };
        this.scene.vfx.showRoutePreview(this.engine.map, prev.previewRoutes, prev.changedEntries);
        this.showDragTooltip(
          clientX,
          clientY,
          prev.valid ? `预览：入口 ${prev.changedEntries.join('/')} 改道 · ${spec.cost}${spec.costType === 'intel' ? '情报' : '算力'}` : prev.reason,
          prev.valid ? 'reroute' : 'invalid'
        );
      } else {
        this.routePreviewState = null;
        this.scene.vfx.clearRoutePreview();
        this.showDragTooltip(
          clientX,
          clientY,
          prev.valid ? `投放「${spec.name}」· ${spec.cost}${spec.costType === 'intel' ? '情报' : '算力'}` : prev.reason,
          prev.valid ? 'valid' : 'invalid'
        );
      }
    }
  }

  handleDragDrop(clientX, clientY, targetEl = null) {
    const ds = this.dragState;
    if (!ds || ds.awaitingDir) return;

    // If user barely moved mouse (clicked card on dock), keep armed so click-to-place also works!
    const moved = Math.hypot(clientX - ds.startedAtX, clientY - ds.startedAtY);
    if (moved < 18 && ds.hoverX < 0) return;

    // If user dragged back onto the HUD/dock to abort, cancel cleanly without raycasting through the dock!
    if (this.isOverUIBlockingPanel(targetEl)) {
      this.cancelDrag();
      return;
    }

    const pick = this.scene.pickTile(clientX, clientY);
    if (!pick) {
      this.cancelDrag();
      return;
    }

    if (ds.kind === 'tower') {
      const check = this.engine.previewTowerPlacement(ds.id, pick.gx, pick.gy);
      if (!check.valid) {
        this.engine.emit('action_rejected', {
          reason: check.reason,
          sealed: check.sealed,
          sealedEntries: check.sealedEntries,
          sealedEnemies: check.sealedEnemies,
          x: pick.gx,
          y: pick.gy,
        });
        this.cancelDrag();
        return;
      }
      if (ds.id === 'interceptor') {
        // Enter Directional Facing Selection Phase before confirming!
        ds.awaitingDir = true;
        ds.x = pick.gx;
        ds.y = pick.gy;
        ds.dir = 'S';
        this.lastAimPromptDir = '';
        this.el.dirPrompt.classList.remove('hidden');
        this.refreshInterceptorAimPreview(true);
        return;
      }
      this.cancelDrag();
      const res = this.engine.deployTower(ds.id, pick.gx, pick.gy, 'S');
      if (res.ok) this.selectTowerById(res.tower.id);
    } else {
      const res = this.engine.useItem(ds.id, pick.gx, pick.gy);
      this.cancelDrag();
      if (!res.ok && res.reason) {
        this.showBanner(res.reason, 'warn');
      }
    }
  }

  // ==================== SELECTION & INSPECTOR ====================

  selectTowerById(towerId) {
    this.selection = { kind: 'tower', towerId };
    this.lastInspectorKey = '';
    this.renderInspector();
  }

  clearSelection() {
    this.selection = null;
    this.lastInspectorKey = '';
    this.el.inspectorPanel.classList.add('hidden');
    this.scene.setSelectedHighlight(this.engine.map, null);
    this.scene.vfx.clearPlacementPreview();
    this.scene.vfx.clearRoutePreview();
  }

  renderInspector() {
    if (!this.selection || !this.engine.map) {
      this.el.inspectorPanel.classList.add('hidden');
      return;
    }

    if (this.selection.kind === 'tower') {
      const tower = this.engine.towers.find((t) => t.id === this.selection.towerId && t.hp > 0);
      if (!tower) return this.clearSelection();

      const spec = TOWER_SPECS[tower.type];
      const stats = this.engine.getEffectiveTowerStats(tower);
      const key = `T:${tower.id}:${tower.level}:${tower.branch}:${Math.round(tower.hp)}:${Math.round(tower.shield)}:${tower.encryptedTimer > 0}:${Math.ceil(tower.skillCd)}:${Math.floor(this.engine.compute)}:${Math.floor(this.engine.intel)}`;
      this.scene.setSelectedHighlight(this.engine.map, { kind: 'tower', x: tower.x, y: tower.y });

      // Show selected tower range preview cleanly on map (including Honeypot taunt & Sandbox detect rings!)
      if (!this.dragState) {
        this.scene.vfx.showPlacementPreview(this.engine.map, {
          x: tower.x,
          y: tower.y,
          valid: true,
          range:
            tower.type === 'firewall' && tower.onNode
              ? 1.65
              : tower.type === 'honeypot'
              ? stats.tauntRange
              : stats.range || stats.detectRange || 0,
          secondaryRange:
            tower.type === 'sandbox'
              ? stats.detectRange
              : tower.type === 'honeypot'
              ? stats.range
              : 0,
          secondaryColor: tower.type === 'sandbox' ? 0x3effd4 : 0xffc83b,
          directional: !!spec.directional,
          dir: tower.dir,
          rangeForward: stats.rangeForward,
          rangeSide: stats.rangeSide,
        });
      }

      if (key === this.lastInspectorKey) return;
      this.lastInspectorKey = key;

      const hpPct = Math.max(0, Math.min(100, (tower.hp / tower.maxHp) * 100));
      const branchLabel =
        tower.level >= 2
          ? spec.upgrade.type === 'single'
            ? spec.upgrade.name
            : spec.upgrade.branches[tower.branch]?.name || 'Lv.2'
          : 'Lv.1 基础型';

      const statusBadges = [];
      if (tower.onNode) statusBadges.push(`<span class="st-badge st-node">节点隔离中</span>`);
      if (tower.encryptedTimer > 0) statusBadges.push(`<span class="st-badge st-enc">已加密 ${tower.encryptedTimer.toFixed(1)}s</span>`);
      if (tower.shield > 1) statusBadges.push(`<span class="st-badge st-sh">护盾 ${Math.round(tower.shield)}</span>`);
      if (spec.immuneEncrypt) statusBadges.push(`<span class="st-badge st-imm">免疫加密</span>`);
      if (spec.directional) statusBadges.push(`<span class="st-badge st-dir">朝向：${DIRECTION_VECTORS[tower.dir].label}</span>`);

      // Upgrade / Branch buttons
      let upgradeHtml = '';
      if (tower.level < 2) {
        if (spec.upgrade.type === 'single') {
          const u = spec.upgrade;
          const can = this.engine.compute >= u.costCompute && this.engine.intel >= (u.costIntel || 0);
          upgradeHtml = `
            <div class="insp-section">
              <div class="insp-sec-title">设备升级 → Lv.2</div>
              <button class="insp-action-btn ${can ? '' : 'disabled'}" id="btn-tower-upgrade">
                <div class="act-head"><span>${u.name}</span><span class="act-cost">${u.costCompute} 算力</span></div>
                <div class="act-desc">${u.desc}</div>
              </button>
            </div>
          `;
        } else {
          const branches = Object.values(spec.upgrade.branches);
          upgradeHtml = `
            <div class="insp-section">
              <div class="insp-sec-title">Lv.2 专精分支（二选一）</div>
              <div class="branch-grid">
                ${branches
                  .map((b) => {
                    const can = this.engine.compute >= b.costCompute && this.engine.intel >= (b.costIntel || 0);
                    return `
                      <button class="insp-action-btn branch-btn ${can ? '' : 'disabled'}" data-upgrade-branch="${b.id}">
                        <div class="act-head"><span>${b.name}</span><span class="act-cost">${b.costCompute}算 / ${b.costIntel}情</span></div>
                        <div class="act-desc">${b.desc}</div>
                      </button>
                    `;
                  })
                  .join('')}
              </div>
            </div>
          `;
        }
      }

      // Active Skill button (dynamically synced with Lv.2 & branch stats!)
      let skillHtml = '';
      if (spec.skill) {
        const ready = tower.skillCd <= 0.05 && tower.encryptedTimer <= 0;
        const skillState =
          tower.encryptedTimer > 0
            ? '加密禁用'
            : tower.skillCd > 0.05
            ? `冷却 ${tower.skillCd.toFixed(1)}s`
            : '点击释放';
        let skillDesc = spec.skill.desc;
        if (tower.type === 'repair' && tower.level >= 2) {
          skillDesc = `立即解除范围内所有友塔的「加密」状态，瞬时恢复 ${stats.skillBurstHeal} 生命，并施加 ${stats.skillShield} 点护盾持续 ${spec.skill.duration} 秒。`;
        } else if (tower.type === 'honeypot' && tower.branch === 'trap') {
          skillDesc = `张开 ${stats.skillRadius} 格高压诱捕网，困住地面敌人 ${spec.skill.duration} 秒并施加 +30% 易伤与持续灼烧。`;
        }
        skillHtml = `
          <div class="insp-section">
            <div class="insp-sec-title">主动技能</div>
            <button class="insp-skill-btn ${ready ? 'ready' : 'disabled'}" id="btn-tower-skill">
              <div class="act-head"><span>${iconHtml('bolt', 'ico-xs')}${spec.skill.name}</span><span class="skill-state">${skillState}</span></div>
              <div class="act-desc">${skillDesc}</div>
            </button>
          </div>
        `;
      }

      // Live active effect summary synced with Lv2 / Branch!
      const liveTrait =
        tower.level >= 2
          ? spec.upgrade.type === 'single'
            ? spec.upgrade.desc
            : spec.upgrade.branches[tower.branch]?.desc || spec.shortDesc
          : spec.shortDesc;

      const refund = Math.round(tower.totalComputeSpent * 0.6);

      this.el.inspectorPanel.innerHTML = `
        <div class="insp-header">
          <div class="insp-ico">${iconHtml(tower.type, 'ico-lg')}</div>
          <div class="insp-titles">
            <div class="insp-name">${spec.name} <span class="insp-lv">Lv.${tower.level}</span></div>
            <div class="insp-sub">${branchLabel} · ${spec.role}</div>
          </div>
          <button class="insp-close" id="btn-close-insp">✕</button>
        </div>
        <div class="insp-hp-wrap">
          <div class="insp-hp-row"><span>耐久度</span><span>${Math.ceil(tower.hp)} / ${tower.maxHp}${tower.shield > 1 ? ` (+${Math.round(tower.shield)}盾)` : ''}</span></div>
          <div class="insp-hp-bar"><div class="insp-hp-fill" style="width:${hpPct}%"></div></div>
        </div>
        <div class="insp-badges">${statusBadges.join('')}</div>
        <div class="insp-stats">
          ${stats.atk > 0 ? `<div><span>攻击</span><b>${stats.atk}</b></div>` : ''}
          ${stats.healAmount > 0 ? `<div><span>单次修复</span><b>${stats.healAmount} ×${stats.healTargets}</b></div>` : ''}
          ${stats.blockCap > 0 ? `<div><span>${tower.onNode ? '相邻拦截' : '阻挡容量'}</span><b>${stats.blockCap}</b></div>` : ''}
          <div><span>减伤</span><b>${Math.round(stats.armor * 100)}%</b></div>
        </div>
        <p class="insp-detail-text" style="margin-bottom:0.6em">${liveTrait}</p>
        ${skillHtml}
        ${upgradeHtml}
        <div class="insp-footer">
          <button class="btn-danger-outline" id="btn-tower-withdraw">撤下设备（退还 ${refund} 算力${tower.onNode ? ' · 解除隔离' : ''}）</button>
        </div>
      `;
      this.el.inspectorPanel.classList.remove('hidden');

      // Bind inspector buttons cleanly
      document.getElementById('btn-close-insp')?.addEventListener('click', () => this.clearSelection());
      document.getElementById('btn-tower-skill')?.addEventListener('click', () => {
        this.audio.playUI('click');
        this.engine.activateSkill(tower.id);
        this.lastInspectorKey = '';
        this.renderInspector();
      });
      document.getElementById('btn-tower-upgrade')?.addEventListener('click', () => {
        this.engine.upgradeTower(tower.id, null);
        this.lastInspectorKey = '';
        this.renderInspector();
      });
      this.el.inspectorPanel.querySelectorAll('[data-upgrade-branch]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.engine.upgradeTower(tower.id, btn.dataset.upgradeBranch);
          this.lastInspectorKey = '';
          this.renderInspector();
        });
      });
      const wBtn = document.getElementById('btn-tower-withdraw');
      if (wBtn) {
        wBtn.addEventListener('pointerenter', () => {
          if (tower.onNode) {
            const p = this.engine.previewWithdrawTower(tower.id);
            if (p && p.changedEntries.length > 0) {
              this.scene.vfx.showRoutePreview(this.engine.map, p.previewRoutes, p.changedEntries);
            }
          }
        });
        wBtn.addEventListener('pointerleave', () => this.scene.vfx.clearRoutePreview());
        wBtn.addEventListener('click', () => {
          this.audio.playUI('click');
          this.engine.withdrawTower(tower.id);
          this.clearSelection();
        });
      }
      return;
    }

    if (this.selection.kind === 'enemy') {
      const en = this.engine.enemies.find((e) => e.id === this.selection.enemyId && !e.dead);
      if (!en) return this.clearSelection();
      const spec = ENEMY_SPECS[en.type];
      this.scene.setSelectedHighlight(this.engine.map, { kind: 'enemy', enemy: en });

      const key = `E:${en.id}:${Math.round(en.hp)}:${Math.round(en.shield)}:${en.disguised}:${en.stealth}:${en.slowTimer > 0}:${en.entrappedTimer > 0}:${en.vulnTimer > 0}:${en.bossPhase}`;
      if (key === this.lastInspectorKey) return;
      this.lastInspectorKey = key;

      const hpPct = Math.max(0, Math.min(100, (en.hp / en.maxHp) * 100));
      const tags = [];
      if (en.disguised) tags.push(`<span class="st-badge st-dir">伪装封包（未显形）</span>`);
      if (en.stealth) tags.push(`<span class="st-badge st-enc">光学潜伏中</span>`);
      if (en.shield > 1) tags.push(`<span class="st-badge st-sh">加壳护盾 ${Math.round(en.shield)}</span>`);
      if (en.armor > 0.01) tags.push(`<span class="st-badge st-node">护甲 ${Math.round(en.armor * 100)}%</span>`);
      if (en.slowTimer > 0) tags.push(`<span class="st-badge st-dir">减速中</span>`);
      if (en.entrappedTimer > 0) tags.push(`<span class="st-badge st-node">诱捕禁锢</span>`);
      if (en.vulnTimer > 0) tags.push(`<span class="st-badge st-boss">易伤 +${Math.round((en.vulnMult - 1) * 100)}%</span>`);
      if (en.flying) tags.push(`<span class="st-badge st-enc">无线层飞行</span>`);
      if (en.isBoss) tags.push(`<span class="st-badge st-boss">阶段 ${en.bossPhase}</span>`);

      this.el.inspectorPanel.innerHTML = `
        <div class="insp-header">
          <div class="insp-ico enemy-ico">${iconHtml(en.type, 'ico-lg')}</div>
          <div class="insp-titles">
            <div class="insp-name">${spec.name} <span class="insp-threat">${spec.threat}</span></div>
            <div class="insp-sub">${spec.bossTitle || `编号 ${spec.code} · 来源通道 ${en.entryId}`}</div>
          </div>
          <button class="insp-close" id="btn-close-insp">✕</button>
        </div>
        <div class="insp-hp-wrap">
          <div class="insp-hp-row"><span>完整度</span><span>${Math.ceil(en.hp)} / ${en.maxHp}${en.shield > 1 ? ` (+${Math.round(en.shield)}盾)` : ''}</span></div>
          <div class="insp-hp-bar enemy-bar"><div class="insp-hp-fill" style="width:${hpPct}%"></div></div>
        </div>
        <div class="insp-badges">${tags.join('')}</div>
        <div class="insp-stats">
          <div><span>攻击</span><b>${en.atk}</b></div>
          <div><span>移速</span><b>${en.speed.toFixed(2)}</b></div>
          <div><span>占阻挡</span><b>${en.blockWeight}</b></div>
          <div><span>破核扣血</span><b>${spec.coreDamage}</b></div>
        </div>
        <p class="insp-detail-text">${spec.detail}</p>
      `;
      this.el.inspectorPanel.classList.remove('hidden');
      document.getElementById('btn-close-insp')?.addEventListener('click', () => this.clearSelection());
      return;
    }

    if (this.selection.kind === 'tile') {
      const { x, y } = this.selection;
      const tile = this.engine.getTile(x, y);
      if (!tile) return this.clearSelection();
      const spec = TERRAIN_SPECS[tile.type];
      this.scene.setSelectedHighlight(this.engine.map, { kind: 'tile', x, y });
      const activeIso = tile.type === 'node' ? this.engine.getIsolatorAt(x, y) : null;
      const key = `G:${x},${y}:${this.engine.isolatedNodes.has(tileKey(x, y))}:${Math.ceil(this.engine.nodeCooldowns.get(tileKey(x, y)) || 0)}:${activeIso ? `${Math.round(activeIso.hp)}:${Math.ceil(activeIso.remaining)}` : ''}:${Object.keys(this.engine.entryRoutes).map((e) => this.engine.entryRoutes[e]?.path?.length || 0).join(',')}`;
      if (key === this.lastInspectorKey) return;
      this.lastInspectorKey = key;

      let extra = '';
      if (tile.type === 'node') {
        const k = tileKey(x, y);
        const iso = this.engine.isolatedNodes.has(k);
        const cd = this.engine.nodeCooldowns.get(k) || 0;
        const passingEntries = Object.entries(this.engine.entryRoutes)
          .filter(([, r]) => r?.path?.some((p) => p.x === x && p.y === y))
          .map(([eid]) => `入口 ${eid}`);
        extra = `<div class="insp-badges">
          <span class="st-badge ${iso ? 'st-node' : cd > 0 ? 'st-dir' : 'st-sh'}">${
            iso ? '当前状态：已隔离（阻断通行）' : cd > 0 ? `旁路冷却中 ${cd.toFixed(1)}s` : '当前状态：直通'
          }</span>
          ${
            activeIso
              ? `<span class="st-badge st-dir">应急隔离器 · 耐久 ${Math.ceil(activeIso.hp)}/${activeIso.maxHp} · 剩余 ${activeIso.remaining.toFixed(1)}s</span>`
              : ''
          }
          ${
            !iso && passingEntries.length > 0
              ? `<span class="st-badge st-imm">当前通行：${passingEntries.join('、')}</span>`
              : ''
          }
        </div>`;
      } else if (tile.type === 'entry' || tile.type === 'exit') {
        extra = `<div class="insp-badges"><span class="st-badge st-dir">${tile.label}</span></div>`;
      }

      this.el.inspectorPanel.innerHTML = `
        <div class="insp-header">
          <div class="insp-titles">
            <div class="insp-name">${tile.label || spec.name}</div>
            <div class="insp-sub">地形类型：${spec.name} · 坐标 (${x}, ${y})</div>
          </div>
          <button class="insp-close" id="btn-close-insp">✕</button>
        </div>
        ${extra}
        <p class="insp-detail-text">${spec.detail}</p>
      `;
      this.el.inspectorPanel.classList.remove('hidden');
      document.getElementById('btn-close-insp')?.addEventListener('click', () => this.clearSelection());
    }
  }

  // ==================== TRAFFIC FORECAST PANEL ====================

  renderForecast() {
    const fc = this.engine.getNextWaveForecast();
    if (!fc) {
      this.el.forecastPanel.innerHTML = `<div class="fc-empty">全部攻击波次已结束</div>`;
      return;
    }
    const headerTag = fc.isBossWave
      ? `<span class="fc-tag boss">领主波次</span>`
      : fc.isSurgeWave
      ? `<span class="fc-tag surge">三口洪峰</span>`
      : `<span class="fc-tag">${fc.active ? '当前波次' : '即将来袭'}</span>`;

    const entriesHtml = Object.values(fc.byEntry)
      .map(({ entry, counts }) => {
        const route = this.engine.entryRoutes[entry.id];
        const targetExit = route ? `→ 核心 ${route.exitId}` : '';
        const col = (ENTRY_COLORS[entry.id] || ENTRY_COLORS.A).hex;
        const list = Object.entries(counts);
        return `
          <div class="fc-entry-row">
            <div class="fc-entry-head">
              <span class="fc-dot" style="background:${col}"></span>
              <b>${entry.id} · ${entry.name}</b>
              <span class="fc-route-dest">${targetExit}</span>
            </div>
            <div class="fc-enemies">
              ${
                list.length === 0
                  ? `<span class="fc-none">本波无来袭流量</span>`
                  : list
                      .map(([type, cnt]) => {
                        const sp = ENEMY_SPECS[type];
                        return `<span class="fc-chip ${sp.isBoss ? 'boss' : ''}">${iconHtml(type, 'ico-xs')}${sp.name} ×${cnt}</span>`;
                      })
                      .join('')
              }
            </div>
          </div>
        `;
      })
      .join('');

    this.el.forecastPanel.innerHTML = `
      <div class="fc-head">
        <div><b>第 ${fc.waveNumber} 波 · ${fc.name}</b></div>
        ${headerTag}
      </div>
      ${fc.tip ? `<div class="fc-tip">▸ ${fc.tip}</div>` : ''}
      <div class="fc-body">${entriesHtml}</div>
    `;
  }

  // ==================== CODEX (设备手册 & 威胁档案 & 拓扑说明) ====================

  openCodex(tab = 'devices') {
    if (!this.codexOpen && !this.engine.demoMode && this.engine.status === 'playing' && this.el.menuOverlay.classList.contains('hidden')) {
      this.pausedBeforeCodex = this.engine.paused;
      this.cb.onSetPaused(true);
    }
    this.codexOpen = true;
    this.codexTab = tab;
    this.el.codexModal.classList.remove('hidden');
    this.renderCodexContent();
  }

  closeCodex() {
    const wasOpen = this.codexOpen;
    this.codexOpen = false;
    this.el.codexModal.classList.add('hidden');
    if (wasOpen && !this.pauseMenuOpen && !this.engine.demoMode && this.engine.status === 'playing' && this.el.menuOverlay.classList.contains('hidden')) {
      this.cb.onSetPaused(!!this.pausedBeforeCodex);
    }
  }

  renderCodexContent() {
    this.el.codexModal.querySelectorAll('[data-codex-tab]').forEach((b) => {
      b.classList.toggle('active', b.dataset.codexTab === this.codexTab);
    });

    if (this.codexTab === 'devices') {
      const towersHtml = Object.values(TOWER_SPECS)
        .map((t) => {
          const upHtml =
            t.upgrade.type === 'single'
              ? `<div class="cdx-up"><b>Lv.2 ${t.upgrade.name}</b>（${t.upgrade.costCompute}算力）：${t.upgrade.desc}</div>`
              : Object.values(t.upgrade.branches)
                  .map(
                    (b) =>
                      `<div class="cdx-up"><b>Lv.2 分支·${b.name}</b>（${b.costCompute}算力 / ${b.costIntel}情报）：${b.desc}</div>`
                  )
                  .join('');
          return `
            <div class="cdx-card">
              <div class="cdx-card-head">
                <div class="cdx-ico">${iconHtml(t.id, 'ico-lg')}</div>
                <div>
                  <div class="cdx-title">${t.name} <span class="cdx-code">${t.code} · ${t.role}</span></div>
                  <div class="cdx-meta">部署：${t.placementText} ｜ 算力 ${t.costCompute}${t.nodeCostIntel ? ` ｜ 节点情报 +${t.nodeCostIntel}` : ''} ｜ 生命 ${t.maxHp}</div>
                </div>
              </div>
              <p class="cdx-desc">${t.detail}</p>
              ${t.skill ? `<div class="cdx-skill"><b>主动技能·${t.skill.name}</b>（冷却 ${t.skill.cooldown}s）：${t.skill.desc}</div>` : ''}
              ${upHtml}
            </div>
          `;
        })
        .join('');

      const itemsHtml = Object.values(ITEM_SPECS)
        .map(
          (it) => `
          <div class="cdx-card item-cdx">
            <div class="cdx-card-head">
              <div class="cdx-ico item-ico">${iconHtml(it.id, 'ico-lg')}</div>
              <div>
                <div class="cdx-title">${it.name} <span class="cdx-code">战术道具</span></div>
                <div class="cdx-meta">投放：${it.targetText} ｜ 消耗 ${it.cost} ${it.costType === 'intel' ? '情报' : '算力'} ｜ 冷却 ${it.cooldown}s</div>
              </div>
            </div>
            <p class="cdx-desc">${it.detail}</p>
          </div>
        `
        )
        .join('');

      this.el.codexBody.innerHTML = `
        <h4 class="cdx-section-h">守方防御设备（6 类）</h4>
        <div class="cdx-grid">${towersHtml}</div>
        <h4 class="cdx-section-h">应急战术道具（3 类）</h4>
        <div class="cdx-grid">${itemsHtml}</div>
      `;
    } else if (this.codexTab === 'threats') {
      const normals = Object.values(ENEMY_SPECS).filter((e) => !e.isBoss);
      const bosses = Object.values(ENEMY_SPECS).filter((e) => e.isBoss);
      const card = (e) => `
        <div class="cdx-card ${e.isBoss ? 'boss-cdx' : 'enemy-cdx'}">
          <div class="cdx-card-head">
            <div class="cdx-ico enemy-ico">${iconHtml(e.id, 'ico-lg')}</div>
            <div>
              <div class="cdx-title">${e.name} <span class="cdx-code">${e.threat}${e.bossTitle ? ` · ${e.bossTitle}` : ''}</span></div>
              <div class="cdx-meta">生命 ${e.maxHp} ｜ 攻 ${e.atk} ｜ 速 ${e.speed} ｜ 占阻挡 ${e.blockWeight} ｜ 破核 -${e.coreDamage}</div>
            </div>
          </div>
          <p class="cdx-desc">${e.detail}</p>
        </div>
      `;
      this.el.codexBody.innerHTML = `
        <h4 class="cdx-section-h">蛰影入侵单位（6 类）</h4>
        <div class="cdx-grid">${normals.map(card).join('')}</div>
        <h4 class="cdx-section-h">海域领主单位（3 位）</h4>
        <div class="cdx-grid">${bosses.map(card).join('')}</div>
      `;
    } else {
      const terrains = Object.values(TERRAIN_SPECS)
        .map(
          (tr) => `
          <div class="cdx-card">
            <div class="cdx-title"><span class="cdx-swatch" style="background:${tr.color}"></span>${tr.name}</div>
            <p class="cdx-desc">${tr.detail}</p>
          </div>
        `
        )
        .join('');
      const statuses = Object.values(STATUS_SPECS)
        .map(
          (st) => `
          <div class="cdx-card">
            <div class="cdx-title"><span class="cdx-swatch" style="background:${st.color}"></span>${st.name}</div>
            <p class="cdx-desc">${st.desc}</p>
            <div class="cdx-meta">来源/解除：${st.source}</div>
          </div>
        `
        )
        .join('');
      this.el.codexBody.innerHTML = `
        <h4 class="cdx-section-h">地形与路由规则</h4>
        <div class="cdx-grid">${terrains}</div>
        <h4 class="cdx-section-h">战斗状态与反制手段</h4>
        <div class="cdx-grid">${statuses}</div>
        <h4 class="cdx-section-h">镜头与快捷操作（Blender 视图规范）</h4>
        <div class="cdx-controls-box">
          <div><b>鼠标中键拖动</b>：围绕战场环绕旋转视角</div>
          <div><b>Shift + 中键拖动</b>：平移战场观察焦点</div>
          <div><b>鼠标滚轮</b>：自由缩放镜头（支持特写观察细节）</div>
          <div><b>鼠标左键</b>：仅用于点选单位、拖放部署卡片与确认拦截器朝向</div>
          <div><b>数字键 1–6 / 7–9</b>：快速武装防御塔或战术道具 ｜ <b>F</b>：释放选中塔主动技能 ｜ <b>M</b>：快捷静音</div>
          <div><b>右键 / ESC</b>：取消部署或关闭菜单 ｜ <b>空格</b>：暂停/继续 ｜ <b>R</b>：回归默认全景视角</div>
        </div>
      `;
    }
  }

  // ==================== MODALS & INCIDENT REPORT ====================

  showMenu() {
    this.clearSelection();
    this.cancelDrag();
    this.hideDemoOverlays();
    this.el.menuOverlay.classList.remove('hidden');
    this.el.hudRoot.classList.add('hidden');
    this.el.reportModal.classList.add('hidden');
    this.el.pauseModal.classList.add('hidden');
    this.el.worldOverlay.innerHTML = '';
  }

  showGameplayHUD(map) {
    this.el.menuOverlay.classList.add('hidden');
    this.el.hudRoot.classList.remove('hidden');
    this.el.reportModal.classList.add('hidden');
    this.el.pauseModal.classList.add('hidden');
    this.forecastOpen = false;
    this.el.forecastPanel.classList.add('hidden');
    this.el.btnForecast.classList.remove('active');
    this.audioOpen = false;
    this.el.audioPopover.classList.add('hidden');
    this.el.hudMapName.textContent = map.name;
    this.el.hudMapType.textContent = map.networkType;
    this.sysLogs = [];
    this.routeChangedFlash = {};
    this.routePreviewState = null;
    this.pushLog(`已接入【${map.name}】守护进程控制台，拓扑路由已收敛。`, 'sys');
    this.syncAudioUI();
  }

  togglePauseMenu(show) {
    this.pauseMenuOpen = show;
    this.el.pauseModal.classList.toggle('hidden', !show);
    if (show) this.cb.onSetPaused(true);
    else this.cb.onSetPaused(false);
  }

  showEventReport(victory, stats, map) {
    this.clearSelection();
    this.cancelDrag();
    this.codexOpen = false;
    this.el.codexModal.classList.add('hidden');
    this.el.reportModal.classList.remove('hidden');
    const title = victory ? '安全事件处置报告 · 防御成功' : '安全事件告警报告 · 中枢失守';
    const cls = victory ? 'report-win' : 'report-lose';
    this.el.reportContent.innerHTML = `
      <div class="report-head ${cls}">
        <div>
          <div class="report-kicker">XIYU AUTONOMOUS SYSTEM // INCIDENT REPORT</div>
          <h2>${title}</h2>
          <div class="report-sub">受护网段：${map.name}（${map.networkType}） ｜ 抵御波次：${stats.waveReached} / ${stats.totalWaves}</div>
        </div>
        <div class="report-grade ${cls}">${stats.grade}</div>
      </div>
      <div class="report-stats-grid">
        <div class="rep-stat"><span>中枢完整度</span><b>${stats.integrity} / ${stats.maxIntegrity}</b></div>
        <div class="rep-stat"><span>拦截恶意程序</span><b>${stats.kills}</b></div>
        <div class="rep-stat"><span>累计输出伤害</span><b>${Math.round(stats.damageDealt)}</b></div>
        <div class="rep-stat"><span>设备修复总量</span><b>${Math.round(stats.healingDone)}</b></div>
        <div class="rep-stat"><span>执行动态改道</span><b>${stats.reroutes} 次</b></div>
        <div class="rep-stat"><span>守方设备损毁</span><b>${stats.towersLost} 座</b></div>
        <div class="rep-stat"><span>回收情报总量</span><b>${Math.round(stats.intelEarned)}</b></div>
        <div class="rep-stat"><span>战斗总耗时</span><b>${stats.durationSec}s</b></div>
      </div>
      <div class="report-actions">
        <button class="btn-primary" id="btn-rep-restart">重新部署本图</button>
        <button class="btn-secondary" id="btn-rep-menu">返回关卡选择</button>
      </div>
    `;
    document.getElementById('btn-rep-restart')?.addEventListener('click', () => {
      this.audio.playUI('click');
      this.el.reportModal.classList.add('hidden');
      this.cb.onRestartMap();
    });
    document.getElementById('btn-rep-menu')?.addEventListener('click', () => {
      this.audio.playUI('click');
      this.el.reportModal.classList.add('hidden');
      this.cb.onReturnMenu();
    });
  }

  // ==================== LOGS, BANNERS & FLOATING NUMBERS ====================

  pushLog(text, level = 'sys') {
    const tagMap = { sys: 'SYS', route: 'ROUTE', warn: 'WARN', boss: 'ALERT', kill: 'OPS' };
    const sec = Math.floor(this.engine.simTime);
    const ts = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    this.sysLogs.unshift({ ts, tag: tagMap[level] || 'SYS', text, level });
    if (this.sysLogs.length > 5) this.sysLogs.pop();

    this.el.sysLogBox.innerHTML = this.sysLogs
      .map((l) => `<div class="log-line log-${l.level}"><span class="log-ts">${l.ts}</span><span class="log-tag">[${l.tag}]</span>${l.text}</div>`)
      .join('');
  }

  showBanner(text, level = 'info', duration = 3.2) {
    this.el.alertBanner.textContent = text;
    this.el.alertBanner.className = `alert-banner banner-${level}`;
    this.bannerTimer = duration;
  }

  spawnFloatingText(gx, gy, alt, text, color = '#4df5ff') {
    if (this.floatingTexts.length > 26) this.floatingTexts.shift();
    this.floatingTexts.push({ gx, gy, alt, text, color, age: 0, duration: 1.05 });
  }

  handleEngineEvents(events) {
    for (const ev of events) {
      if (ev.type === 'route_changed') {
        const names = ev.changedEntries.map((id) => `入口 ${id}`).join('、');
        for (const eid of ev.changedEntries) this.routeChangedFlash[eid] = 3.2;
        this.pushLog(`路由重新收敛：${names} 流量已切换路径！`, 'route');
        if (!this.engine.demoMode) this.showBanner(`动态改道收敛：${names} 已切换行进路线`, 'route', 2.4);
        if (this.forecastOpen) this.renderForecast();
      } else if (ev.type === 'node_isolated') {
        this.pushLog(`${ev.nodeName || '交换节点'}已隔离，正在重算全网拓扑。`, 'route');
      } else if (ev.type === 'node_bypass_open') {
        this.pushLog(`${ev.nodeName || '交换节点'}旁路直通，道路恢复开放！`, 'warn');
        this.spawnFloatingText(ev.x, ev.y, 1.3, '旁路直通!', '#ffb830');
      } else if (ev.type === 'action_rejected') {
        this.pushLog(ev.reason, 'warn');
        this.showBanner(ev.reason, 'warn', 2.8);
      } else if (ev.type === 'new_enemy_spotted') {
        this.pushLog(`发现新威胁【${ev.name}】：${ev.shortDesc}`, ev.isBoss ? 'boss' : 'warn');
        if (!this.engine.demoMode) {
          this.showBanner(`新威胁告警 · ${ev.name}：${ev.shortDesc}`, ev.isBoss ? 'boss' : 'warn', 3.8);
        }
      } else if (ev.type === 'boss_warning') {
        this.pushLog(ev.label, 'boss');
        this.showBanner(`[警报] ${ev.label}`, 'boss', 2.8);
      } else if (ev.type === 'boss_phase') {
        this.pushLog(`领主阶段演进：${ev.label}`, 'boss');
        this.showBanner(`[阶段变化] ${ev.label}`, 'boss', 3.4);
      } else if (ev.type === 'tower_damaged' && ev.amount >= 20) {
        this.spawnFloatingText(ev.x, ev.y, 1.4, `-${ev.amount}`, ev.isSurge ? '#ff2b4a' : ev.ranged ? '#d466ff' : '#ff8c38');
      } else if (ev.type === 'isolator_damaged' && ev.amount >= 15) {
        this.spawnFloatingText(ev.x, ev.y, 1.45, `-${ev.amount}`, '#ff8c38');
      } else if (ev.type === 'heal_beam' && ev.amount >= 15) {
        this.spawnFloatingText(ev.toX, ev.toY, 1.4, `+${Math.round(ev.amount)}`, '#38ffaa');
      } else if (ev.type === 'node_intel_harvest') {
        this.spawnFloatingText(ev.x, ev.y, 1.6, `+${ev.amount} 情报`, '#ffd24d');
      } else if (ev.type === 'tower_encrypted') {
        this.spawnFloatingText(ev.x, ev.y, 1.7, '已加密!', '#d466ff');
      } else if (ev.type === 'encrypt_resisted') {
        this.spawnFloatingText(ev.x, ev.y, 1.7, '免疫加密!', '#ffd24d');
      } else if (ev.type === 'skill_repair_failover') {
        for (const a of ev.affected || []) {
          this.spawnFloatingText(a.x, a.y, 1.85, a.cleansed ? '解加密·护盾!' : '+护盾!', '#38ffaa');
        }
      } else if (ev.type === 'item_used' && ev.itemId === 'restore') {
        this.spawnFloatingText(ev.x, ev.y, 1.8, ev.cleansed ? `还原·解加密` : `+${Math.round(ev.healed || 0)} 还原`, '#38ffaa');
      } else if (ev.type === 'enemy_revealed') {
        this.spawnFloatingText(ev.x, ev.y, 1.25, '显形!', '#3ef2ff');
      } else if (ev.type === 'trojan_payload_blast') {
        this.pushLog('警告：未显形木马被波及击毁，隐蔽载荷引爆伤害友塔！', 'warn');
        this.spawnFloatingText(ev.x, ev.y, 1.5, '载荷引爆!', '#ff3658');
      } else if (ev.type === 'tower_destroyed') {
        this.pushLog(`守方设备【${ev.name}】已被摧毁！`, 'warn');
        this.spawnFloatingText(ev.x, ev.y, 1.5, '设备损毁!', '#ff3652');
      } else if (ev.type === 'wave_started') {
        this.pushLog(`第 ${ev.waveNumber} 波【${ev.name}】流量涌入！`, ev.isBossWave || ev.isSurgeWave ? 'boss' : 'sys');
        if (ev.isSurgeWave || ev.isBossWave) {
          this.showBanner(`第 ${ev.waveNumber} 波 · ${ev.name}`, 'boss', 3.6);
        }
        if (this.forecastOpen) this.renderForecast();
      } else if (ev.type === 'wave_cleared') {
        this.pushLog(`第 ${ev.waveNumber} 波已清剿（+${ev.computeReward} 算力 / +${ev.intelReward} 情报）`, 'kill');
        if (this.forecastOpen) this.renderForecast();
      } else if (ev.type === 'core_breached') {
        this.pushLog(`警告：${ev.name} 突破防线！中枢完整度 -${ev.damage}`, 'boss');
        this.showBanner(`核心告警：${ev.name} 侵入中枢（完整度 -${ev.damage}）`, 'boss', 2.4);
      } else if (ev.type === 'game_over') {
        this.showEventReport(ev.victory, ev.stats, this.engine.map);
      }
    }
  }

  // ==================== DEMO SUBTITLE & VIRTUAL CURSOR ====================

  setDemoSubtitle(text, tag, elapsed, duration) {
    this.el.demoBanner.classList.remove('hidden');
    this.el.demoTag.textContent = tag;
    this.el.demoText.textContent = text;
    const pct = Math.max(0, Math.min(100, (elapsed / Math.max(0.1, duration)) * 100));
    this.el.demoProgress.style.width = `${pct}%`;
  }

  setVirtualCursor({ visible, x = 0, y = 0, dragging = false, clicking = false, label = '' }) {
    if (!visible) {
      this.el.demoCursor.classList.add('hidden');
      return;
    }
    this.el.demoCursor.classList.remove('hidden');
    this.el.demoCursor.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    this.el.demoCursor.classList.toggle('clicking', !!clicking);
    this.el.demoCursor.classList.toggle('dragging', !!dragging);
    if (label) {
      this.el.demoCursorBadge.textContent = label;
      this.el.demoCursorBadge.classList.remove('hidden');
    } else {
      this.el.demoCursorBadge.classList.add('hidden');
    }
  }

  hideDemoOverlays() {
    this.el.demoBanner.classList.add('hidden');
    this.el.demoCursor.classList.add('hidden');
    this.routePreviewState = null;
  }

  syncAudioUI() {
    this.el.btnAudio.innerHTML = iconHtml(this.audio.muted ? 'soundOff' : 'soundOn', 'ico');
    const mb = document.getElementById('btn-mute-toggle');
    if (mb) mb.textContent = this.audio.muted ? '取消静音' : '一键静音';
  }

  // ==================== PER-FRAME HUD & 3D PROJECTED OVERLAY UPDATE ====================

  updateFrame(dt) {
    if (!this.engine.map || this.el.hudRoot.classList.contains('hidden')) return;

    // 1. Top Telemetry
    this.el.hudCompute.textContent = Math.floor(this.engine.compute);
    this.el.hudIntel.textContent = Math.floor(this.engine.intel);
    this.el.hudIntegrityVal.textContent = `${this.engine.integrity} / ${this.engine.maxIntegrity}`;
    const intPct = (this.engine.integrity / this.engine.maxIntegrity) * 100;
    this.el.hudIntegrityBar.style.width = `${intPct}%`;
    this.el.hudIntegrityBar.classList.toggle('danger', intPct <= 35);

    const curWave = Math.max(1, this.engine.waveIndex + 1);
    const totalW = this.engine.map.waves.length;
    this.el.hudWaveNum.textContent = `${this.engine.waveIndex < 0 ? 0 : curWave} / ${totalW}`;
    const wObj = this.engine.map.waves[Math.max(0, this.engine.waveIndex)];
    const remEnemies = this.engine.enemies.filter((en) => !en.dead).length + this.engine.spawnQueue.length;
    if (this.engine.waveIndex < 0) {
      this.el.hudWaveName.textContent = '布防准备中';
    } else if (this.engine.waveActive && !this.engine.demoMode) {
      this.el.hudWaveName.textContent = `${wObj?.name || ''} · 余 ${remEnemies}`;
    } else {
      this.el.hudWaveName.textContent = wObj?.name || '';
    }

    if (this.engine.demoMode) {
      this.el.btnCallWave.classList.add('hidden');
    } else if (!this.engine.waveActive && this.engine.waveIndex + 1 < totalW) {
      this.el.btnCallWave.classList.remove('hidden');
      this.el.btnCallWave.textContent = `提前迎战 (${Math.ceil(this.engine.nextWaveTimer)}s)`;
    } else {
      this.el.btnCallWave.classList.add('hidden');
    }

    this.el.btnPause.innerHTML = iconHtml(this.engine.paused ? 'play' : 'pause', 'ico');
    this.el.btnPause.classList.toggle('active', this.engine.paused);
    this.el.btnSpeed.textContent = `${this.engine.speedMult}×`;
    this.el.btnSpeed.classList.toggle('active', this.engine.speedMult > 1);

    // 2. Dock affordability & item cooldowns
    document.querySelectorAll('[data-tower-card]').forEach((card) => {
      const s = TOWER_SPECS[card.dataset.towerCard];
      const cant = this.engine.compute < s.costCompute || (card.dataset.towerCard === 'airgap' && this.engine.intel < s.nodeCostIntel);
      card.classList.toggle('unaffordable', cant);
    });
    document.querySelectorAll('[data-item-card]').forEach((card) => {
      const id = card.dataset.itemCard;
      const s = ITEM_SPECS[id];
      const cd = this.engine.itemCooldowns[id] || 0;
      const cdEl = card.querySelector(`[data-item-cd="${id}"]`);
      const maskEl = card.querySelector(`[data-item-mask="${id}"]`);
      const cantAfford = s.costType === 'intel' ? this.engine.intel < s.cost : this.engine.compute < s.cost;
      card.classList.toggle('unaffordable', cantAfford || cd > 0.05);
      if (cdEl) cdEl.textContent = cd > 0.05 ? `${cd.toFixed(1)}s` : '就绪';
      if (maskEl) maskEl.style.height = `${Math.min(100, (cd / s.cooldown) * 100)}%`;
    });

    // 3. Banner fade timer
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {
        this.el.alertBanner.className = 'alert-banner hidden';
      }
    }

    // 4. Boss HP Top Bar
    const boss = this.engine.enemies.find((e) => e.isBoss && !e.dead);
    if (boss) {
      const sp = ENEMY_SPECS[boss.type];
      const pct = Math.max(0, (boss.hp / boss.maxHp) * 100);
      const phaseNames = {
        boss_wankui: ['', '一阶段 · 洪峰冲击', '二阶段 · 群控过载'],
        boss_shenlou: ['', '一阶段 · 伪路由黑洞', '二阶段 · 路由风暴'],
        boss_zheying: ['', '一阶段 · 光学潜伏', '二阶段 · 提权装甲', '三阶段 · 运维环破坏'],
      };
      const pName = phaseNames[boss.type]?.[boss.bossPhase] || `阶段 ${boss.bossPhase}`;
      this.el.bossBarWrap.classList.remove('hidden');
      this.el.bossBarWrap.innerHTML = `
        <div class="boss-hud-head">
          <span class="boss-hud-name">${iconHtml('warn', 'ico-xs')}领主 · ${sp.name}（${sp.bossTitle}）</span>
          <span class="boss-hud-phase">${pName}</span>
          <span class="boss-hud-hp">${Math.ceil(boss.hp)} / ${boss.maxHp}</span>
        </div>
        <div class="boss-hud-track"><div class="boss-hud-fill" style="width:${pct}%"></div></div>
      `;
    } else {
      this.el.bossBarWrap.classList.add('hidden');
    }

    // 5. Update Route Topology Status Strip & active Inspector
    this.renderRouteStrip(dt);
    if (this.selection) this.renderInspector();

    // 6. Render 3D-Projected Crisp World Badges, HP Bars & Floating Text
    this.renderWorldOverlay(dt);
  }

  renderRouteStrip(dt) {
    if (!this.engine.map || !this.el.routeStrip) return;
    for (const k of Object.keys(this.routeChangedFlash)) {
      if (this.routeChangedFlash[k] > 0) this.routeChangedFlash[k] = Math.max(0, this.routeChangedFlash[k] - dt);
    }

    const pv = this.routePreviewState;
    const sealedIds = new Set((pv?.sealedEntries || []).map((e) => e.id));
    const changedSet = new Set(pv?.changedEntries || []);

    this.el.routeStrip.innerHTML = this.engine.map.entries
      .map((entry) => {
        const col = (ENTRY_COLORS[entry.id] || ENTRY_COLORS.A).hex;
        const curR = this.engine.entryRoutes[entry.id];
        const curExit = curR ? curR.exitId : '?';

        let cls = '';
        let badge = '';
        if (sealedIds.has(entry.id)) {
          cls = 'sealed';
          badge = `<span class="rt-tag">✕ 将封死!</span>`;
        } else if (changedSet.has(entry.id)) {
          cls = 'preview';
          const newExit = pv?.previewRoutes?.[entry.id]?.exitId || curExit;
          badge = `<span class="rt-tag">${newExit !== curExit ? `预览→${newExit}` : '预览改道'}</span>`;
        } else if ((this.routeChangedFlash[entry.id] || 0) > 0) {
          cls = 'changed';
          badge = `<span class="rt-tag">已改道</span>`;
        }
        return `<div class="rt-chip ${cls}"><span class="rt-dot" style="background:${col}"></span>${entry.id}→${curExit}${badge}</div>`;
      })
      .join('');
  }

  renderWorldOverlay(dt) {
    const map = this.engine.map;
    const chunks = [];

    // Entry Portal Labels (showing live destination Exit; stagger B slightly higher on Air-Gap so adjacent B/C never overlap!)
    for (const entry of map.entries) {
      const yLift = map.id === 'airgap' && entry.id === 'B' ? 3.15 : 2.3;
      const p = this.scene.projectGridToScreen(map, entry.x, entry.y, yLift);
      if (!p.visible) continue;
      const col = (ENTRY_COLORS[entry.id] || ENTRY_COLORS.A).hex;
      const route = this.engine.entryRoutes[entry.id];
      const dest = route ? ` → ${route.exitId}` : '';
      chunks.push(
        `<div class="w-tag w-entry" style="left:${p.x}px;top:${p.y}px;border-color:${col};color:${col}"><b>${entry.id}</b> ${entry.name}<span class="w-dest">${dest}</span></div>`
      );
    }

    // Exit Core Labels (positioned cleanly below exit core plinth so adjacent south Switch Nodes never overlap!)
    for (const ex of map.exits) {
      const p = this.scene.projectGridToScreen(map, ex.x, ex.y + 0.56, 0.35);
      if (!p.visible) continue;
      chunks.push(
        `<div class="w-tag w-exit" style="left:${p.x}px;top:${p.y + 18}px">${iconHtml('core', 'ico-xs')}${ex.name}</div>`
      );
    }

    // Switch Node Status Pills (positioned slightly above node center so south exits stay clear)
    for (const node of map.nodes) {
      const p = this.scene.projectGridToScreen(map, node.x, node.y - 0.16, 0.2);
      if (!p.visible) continue;
      const k = tileKey(node.x, node.y);
      const iso = this.engine.isolatedNodes.has(k);
      const cd = this.engine.nodeCooldowns.get(k) || 0;
      const cls = iso ? 'iso' : cd > 0.05 ? 'cd' : 'open';
      const st = iso ? '已隔离' : cd > 0.05 ? `冷却 ${cd.toFixed(1)}s` : '直通';
      chunks.push(
        `<div class="w-node-pill ${cls}" style="left:${p.x}px;top:${p.y + 14}px">${node.name} · ${st}</div>`
      );
    }

    // Tower HP / Shield / Status Bars (plus contextual Repair Daemon Failover-Ready prompt when nearby allies are Encrypted!)
    for (const t of this.engine.towers) {
      if (t.hp <= 0) continue;
      let canCleanseNearby = false;
      if (t.type === 'repair' && t.skillCd <= 0.05 && t.encryptedTimer <= 0) {
        const st = this.engine.getEffectiveTowerStats(t);
        canCleanseNearby = this.engine.towers.some(
          (ally) => ally.hp > 0 && ally.encryptedTimer > 0 && Math.hypot(ally.x - t.x, ally.y - t.y) <= st.range
        );
      }
      const showBar =
        canCleanseNearby ||
        t.hp < t.maxHp - 1 ||
        t.shield > 1 ||
        t.encryptedTimer > 0 ||
        t.level >= 2 ||
        (this.selection?.kind === 'tower' && this.selection.towerId === t.id);
      if (!showBar) continue;
      const baseY = map.grid[t.y][t.x].type === 'platform' ? 2.2 : 1.75;
      const p = this.scene.projectGridToScreen(map, t.x, t.y, baseY);
      if (!p.visible) continue;
      const hpPct = Math.max(0, (t.hp / t.maxHp) * 100);
      const shPct = Math.min(100, (t.shield / t.maxHp) * 100);
      const encTag = t.encryptedTimer > 0 ? `<span class="w-mini-tag enc">${iconHtml('lock', 'ico-xs')}加密</span>` : '';
      const lvTag = t.level >= 2 ? `<span class="w-mini-tag lv2">Lv2</span>` : '';
      const cleanseTag = canCleanseNearby ? `<span class="w-mini-tag ben">冗余可解加密</span>` : '';
      chunks.push(`
        <div class="w-hp-wrap tower-hp" style="left:${p.x}px;top:${p.y}px">
          <div class="w-mini-tags">${lvTag}${encTag}${cleanseTag}</div>
          <div class="w-hp-bar">
            <div class="w-hp-fill ${hpPct < 35 ? 'low' : ''}" style="width:${hpPct}%"></div>
            ${shPct > 0.5 ? `<div class="w-sh-fill" style="width:${shPct}%"></div>` : ''}
          </div>
        </div>
      `);
    }

    // Emergency Isolator HP + Timer Bar
    for (const iso of this.engine.isolators) {
      if (iso.hp <= 0 || iso.remaining <= 0) continue;
      const p = this.scene.projectGridToScreen(map, iso.x, iso.y, 1.55);
      if (!p.visible) continue;
      const pct = Math.max(0, (iso.hp / iso.maxHp) * 100);
      chunks.push(`
        <div class="w-hp-wrap tower-hp" style="left:${p.x}px;top:${p.y}px">
          <div class="w-mini-tags"><span class="w-mini-tag iso">隔离器 ${iso.remaining.toFixed(0)}s</span></div>
          <div class="w-hp-bar"><div class="w-hp-fill" style="width:${pct}%;background:#ffae26"></div></div>
        </div>
      `);
    }

    // Enemy HP / Shield / State Bars
    for (const en of this.engine.enemies) {
      if (en.dead) continue;
      const yOff = en.isBoss ? 2.65 : en.flying ? en.altitude + 1.05 : 1.45;
      const p = this.scene.projectGridToScreen(map, en.gx, en.gy, yOff);
      if (!p.visible) continue;
      const hpPct = Math.max(0, (en.hp / en.maxHp) * 100);
      const shPct = en.shield > 1 ? Math.min(100, (en.shield / en.maxHp) * 100) : 0;

      let tag = '';
      if (en.disguised) tag = `<span class="w-mini-tag ben">封包</span>`;
      else if (en.stealth) tag = `<span class="w-mini-tag enc">潜伏</span>`;
      else if (en.entrappedTimer > 0) tag = `<span class="w-mini-tag iso">诱捕</span>`;
      else if (en.seekNodeKey?.startsWith('hp:')) tag = `<span class="w-mini-tag iso">被诱敌</span>`;
      else if (en.seekNodeKey) tag = `<span class="w-mini-tag warn">冲节点</span>`;

      chunks.push(`
        <div class="w-hp-wrap enemy-hp ${en.isBoss ? 'boss-hp' : ''}" style="left:${p.x}px;top:${p.y}px">
          ${tag ? `<div class="w-mini-tags">${tag}</div>` : ''}
          <div class="w-hp-bar">
            <div class="w-hp-fill" style="width:${hpPct}%"></div>
            ${shPct > 0.5 ? `<div class="w-sh-fill enemy-sh" style="width:${shPct}%"></div>` : ''}
          </div>
        </div>
      `);
    }

    // Floating Damage / Heal / Status Popups
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.age += dt;
      if (ft.age >= ft.duration) {
        this.floatingTexts.splice(i, 1);
        continue;
      }
      const u = ft.age / ft.duration;
      const p = this.scene.projectGridToScreen(map, ft.gx, ft.gy, ft.alt + u * 1.15);
      if (!p.visible) continue;
      chunks.push(
        `<div class="w-float-txt" style="left:${p.x}px;top:${p.y}px;color:${ft.color};opacity:${(1 - u).toFixed(2)}">${ft.text}</div>`
      );
    }

    this.el.worldOverlay.innerHTML = chunks.join('');
  }
}
