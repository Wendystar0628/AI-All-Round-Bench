// Three live, real-time scripted combat demos matching Section 2.13 & 2.15.
// Total duration at 1x speed: 18s + 20s + 20s = 58s (<= 60s).
// Runs 100% on the actual GameEngine simulation + deterministic seeded RNG!

import { gridToWorld } from '../render/environment.js';
import { tileKey } from '../core/pathfinding.js';

export const DEMO_DEFS = [
  {
    id: 'demo-1',
    title: '分段取舍',
    mapId: 'intranet',
    subtitlePrefix: '分段内网 · 动态汇流',
    duration: 18.0,
    seed: 0x10102026,
    description: '将网闸拖至西边界节点，预览并确认入口 A 折向 DMZ 互联与 B 汇流，办公网段敌军即时掉头。',
  },
  {
    id: 'demo-2',
    title: '旁路直通',
    mapId: 'backbone',
    subtitlePrefix: '骨干流域 · 洪峰应急',
    duration: 20.0,
    seed: 0x20202026,
    description: '洪泛团冲垮东汇聚节点网闸令 C、B 路线改回原数据中心，同时在入口 A 链路投下协议降级。',
  },
  {
    id: 'demo-3',
    title: '蛰影现身',
    mapId: 'airgap',
    subtitlePrefix: '气隙深层 · 第 16 波领主战',
    duration: 20.0,
    seed: 0x30302026,
    description: '领主「蛰影」锁死一段运维环引发全图路由重收敛，选中修复进程释放「冗余切换」解加密保防线。',
  },
];

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}
function smoothstep(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/**
 * Computes interpolated camera pose from keyframes: [{ t, tx, tz, yaw, pitch, distance }]
 */
function sampleCamera(keyframes, t) {
  if (t <= keyframes[0].t) return keyframes[0];
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (t >= a.t && t <= b.t) {
      const u = smoothstep((t - a.t) / Math.max(0.001, b.t - a.t));
      return {
        tx: lerp(a.tx, b.tx, u),
        ty: 0,
        tz: lerp(a.tz, b.tz, u),
        yaw: lerp(a.yaw, b.yaw, u),
        pitch: lerp(a.pitch, b.pitch, u),
        distance: lerp(a.distance, b.distance, u),
      };
    }
  }
  return keyframes[keyframes.length - 1];
}

function getSubtitle(entries, t) {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (t >= entries[i].t) return entries[i].text;
  }
  return '';
}

export class DemoDirector {
  constructor(engine, gameScene, ui) {
    this.engine = engine;
    this.scene = gameScene;
    this.ui = ui;
    this.active = false;
    this.demoId = null;
    this.def = null;
    this.elapsed = 0;
    this.firedFlags = new Set();
    this.spawnSchedule = [];
    this.refs = {};
  }

  start(demoId) {
    const def = DEMO_DEFS.find((d) => d.id === demoId);
    if (!def) return null;

    this.active = true;
    this.demoId = demoId;
    this.def = def;
    this.elapsed = 0;
    this.firedFlags.clear();
    this.spawnSchedule = [];
    this.refs = {};

    this.engine.loadMap(def.mapId, def.seed, { demoMode: true });
    this.scene.loadMap(this.engine);

    if (demoId === 'demo-1') this.setupDemo1();
    else if (demoId === 'demo-2') this.setupDemo2();
    else if (demoId === 'demo-3') this.setupDemo3();

    // Sync initial routes & visuals at t = 0
    this.engine.recomputeRoutes('demo_init');
    const initEvents = this.engine.drainEvents();
    this.scene.syncAndRender(this.engine, initEvents, 0, 0.001);
    this.updateChoreography(0);
    return def;
  }

  stop() {
    this.active = false;
    this.demoId = null;
    this.def = null;
    this.scene.vfx.clearRoutePreview();
    this.scene.vfx.clearPlacementPreview();
    this.scene.hideGhost();
    this.ui.hideDemoOverlays();
  }

  // ============================================================================
  // DEMO 1 SETUP: 分段取舍 (Segmented Intranet)
  // ============================================================================
  setupDemo1() {
    const e = this.engine;
    e.waveIndex = 5; // Display Wave 6 / 14
    e.waveActive = true;
    e.compute = 165;
    e.intel = 48;
    e.integrity = 18;

    // Defenders across DMZ / Business / Office South / Core Approach (balanced back-and-forth!)
    const fwBiz = e.deployTower('firewall', 10, 5, 'S', { free: true }).tower;
    e.upgradeTower(fwBiz.id, null, { free: true });
    fwBiz.hp = 680; // Visibly in active battle
    const hpBiz = e.deployTower('honeypot', 10, 4, 'S', { free: true }).tower;
    hpBiz.hp = 320; // Draws Ransomware fire on Business flank!
    const fwOff = e.deployTower('firewall', 4, 7, 'S', { free: true }).tower;
    fwOff.hp = 260; // Heavily pressured on Office flank — collapses if not rerouted in time!
    const fwCore = e.deployTower('firewall', 7, 7, 'S', { free: true }).tower;
    e.upgradeTower(fwCore.id, null, { free: true });
    fwCore.hp = 640;
    const icDmz = e.deployTower('interceptor', 9, 3, 'W', { free: true }).tower;
    e.upgradeTower(icDmz.id, 'pierce', { free: true });
    const sbBiz = e.deployTower('sandbox', 8, 3, 'S', { free: true }).tower;
    e.upgradeTower(sbBiz.id, null, { free: true });
    const rpBiz = e.deployTower('repair', 11, 4, 'S', { free: true }).tower;
    e.upgradeTower(rpBiz.id, null, { free: true });
    const icMid = e.deployTower('interceptor', 6, 6, 'W', { free: true }).tower;
    const sbCore = e.deployTower('sandbox', 5, 8, 'S', { free: true }).tower;

    this.refs = { fwBiz, hpBiz, fwOff, fwCore, icDmz, sbBiz, rpBiz, icMid, sbCore };

    // Immediate enemies on both Office (A) and Business (B) fronts
    e.spawnEnemy('worm', 'A', { gx: 4.0, gy: 2.15 });
    e.spawnEnemy('worm', 'A', { gx: 4.0, gy: 2.65 });
    e.spawnEnemy('trojan', 'A', { gx: 4.0, gy: 1.15 });
    e.spawnEnemy('ransom', 'A', { gx: 4.0, gy: 5.4 });
    e.spawnEnemy('worm', 'A', { gx: 4.0, gy: 6.3 });
    e.spawnEnemy('worm', 'A', { gx: 4.0, gy: 6.7 });

    e.spawnEnemy('worm', 'B', { gx: 10.0, gy: 4.45 });
    e.spawnEnemy('flood', 'B', { gx: 10.0, gy: 3.1 });
    e.spawnEnemy('trojan', 'B', { gx: 10.0, gy: 1.9 });
    e.spawnEnemy('ransom', 'B', { gx: 10.0, gy: 2.45 });

    // Steady combat reinforcements so back-and-forth fight lasts cleanly through 18s
    this.spawnSchedule = [
      { t: 1.8, entry: 'A', type: 'worm' },
      { t: 2.7, entry: 'A', type: 'worm' },
      { t: 3.4, entry: 'B', type: 'worm' },
      { t: 4.5, entry: 'A', type: 'trojan' },
      { t: 5.3, entry: 'A', type: 'worm' },
      { t: 6.4, entry: 'A', type: 'worm' },
      { t: 7.2, entry: 'A', type: 'ransom' },
      { t: 7.8, entry: 'B', type: 'trojan' },
      { t: 8.8, entry: 'A', type: 'worm' },
      { t: 9.8, entry: 'A', type: 'trojan' },
      { t: 11.2, entry: 'B', type: 'flood' },
      { t: 12.2, entry: 'A', type: 'worm' },
      { t: 13.4, entry: 'B', type: 'ransom' },
    ];
  }

  // ============================================================================
  // DEMO 2 SETUP: 旁路直通 (Backbone Basin Surge Wave 11)
  // ============================================================================
  setupDemo2() {
    const e = this.engine;
    e.waveIndex = 10; // Display Wave 11 / 15 (【洪峰】三口并流)
    e.waveActive = true;
    e.compute = 190;
    e.intel = 56;
    e.integrity = 16;

    // N2 (11,3) starts isolated by a heavily battered Air-Gapper -> C & B are diverted west to DC X!
    const agN2 = e.deployTower('airgap', 11, 3, 'S', { free: true }).tower;
    agN2.hp = 195; // On the brink of collapsing under Flood Pack assault!

    // West Tunnel (A sector)
    const fwWest = e.deployTower('firewall', 2, 7, 'S', { free: true }).tower;
    e.upgradeTower(fwWest.id, null, { free: true });
    fwWest.hp = 540;
    const icWest = e.deployTower('interceptor', 3, 7, 'N', { free: true }).tower;
    e.upgradeTower(icWest.id, 'pierce', { free: true });
    const rpWest = e.deployTower('repair', 1, 7, 'S', { free: true }).tower;
    e.upgradeTower(rpWest.id, null, { free: true });

    // Central Tunnel (converged C & B pressure) + DC X anchor
    const sbMid = e.deployTower('sandbox', 7, 3, 'S', { free: true }).tower;
    e.upgradeTower(sbMid.id, null, { free: true });
    const fwMid = e.deployTower('firewall', 6, 8, 'S', { free: true }).tower;
    e.upgradeTower(fwMid.id, null, { free: true });
    fwMid.hp = 480;
    const icMid = e.deployTower('interceptor', 5, 7, 'E', { free: true }).tower;
    const fwXGate = e.deployTower('firewall', 4, 8, 'S', { free: true }).tower;
    fwXGate.hp = 440;

    // East Legacy Bridge (Data Center Y)
    const hpEast = e.deployTower('honeypot', 11, 7, 'S', { free: true }).tower;
    e.upgradeTower(hpEast.id, 'decoy', { free: true });
    const fwEast = e.deployTower('firewall', 11, 8, 'S', { free: true }).tower;
    fwEast.hp = 460;
    const icEast = e.deployTower('interceptor', 10, 7, 'N', { free: true }).tower;
    e.upgradeTower(icEast.id, 'suppress', { free: true });

    this.refs = { agN2, fwWest, icWest, rpWest, sbMid, fwMid, icMid, fwXGate, hpEast, fwEast, icEast };

    // Two Flood Packs right next to N2 (11,3) slamming the Air-Gapper!
    const fp1 = e.spawnEnemy('flood', 'C', { gx: 11.0, gy: 2.15 });
    fp1.seekNodeKey = tileKey(11, 3);
    const fp2 = e.spawnEnemy('flood', 'B', { gx: 11.1, gy: 2.35 });
    fp2.seekNodeKey = tileKey(11, 3);

    // Active Surge traffic across C, B, and A
    e.spawnEnemy('worm', 'C', { gx: 8.6, gy: 2.0 });
    e.spawnEnemy('ransom', 'C', { gx: 6.0, gy: 4.8 });
    e.spawnEnemy('worm', 'B', { gx: 12.2, gy: 2.0 });
    e.spawnEnemy('trojan', 'B', { gx: 10.2, gy: 2.0 });
    e.spawnEnemy('packager', 'C', { gx: 6.0, gy: 3.4 });

    e.spawnEnemy('worm', 'A', { gx: 2.0, gy: 6.2 });
    e.spawnEnemy('trojan', 'A', { gx: 2.0, gy: 4.4 });
    e.spawnEnemy('trojan', 'A', { gx: 2.0, gy: 3.1 });
    e.spawnEnemy('ransom', 'A', { gx: 2.0, gy: 2.1 });

    this.spawnSchedule = [
      { t: 1.8, entry: 'C', type: 'worm' },
      { t: 2.6, entry: 'B', type: 'worm' },
      { t: 3.4, entry: 'A', type: 'trojan' },
      { t: 4.6, entry: 'B', type: 'trojan' },
      { t: 5.6, entry: 'C', type: 'worm' },
      { t: 6.4, entry: 'B', type: 'ransom' },
      { t: 7.4, entry: 'A', type: 'trojan' },
      { t: 8.2, entry: 'A', type: 'worm' },
      { t: 9.0, entry: 'A', type: 'flood' },
      { t: 9.8, entry: 'A', type: 'trojan' },
      { t: 11.0, entry: 'C', type: 'packager' },
      { t: 12.0, entry: 'B', type: 'worm' },
      { t: 13.0, entry: 'A', type: 'worm' },
      { t: 14.2, entry: 'B', type: 'hotspot' },
    ];
  }

  // ============================================================================
  // DEMO 3 SETUP: 蛰影现身 (Air-Gap Depths Wave 16 Boss Battle)
  // ============================================================================
  setupDemo3() {
    const e = this.engine;
    e.waveIndex = 15; // Display Wave 16 / 16 (终极领主：蛰影)
    e.waveActive = true;
    e.compute = 210;
    e.intel = 64;
    e.integrity = 15;

    // West Core X Defense Cluster (will get Encrypted & rescued by Repair Daemon's 冗余切换!)
    const fwWest = e.deployTower('firewall', 4, 7, 'S', { free: true }).tower;
    e.upgradeTower(fwWest.id, null, { free: true });
    fwWest.hp = 440;
    fwWest.encryptedTimer = 8.5; // Locked by Ransomware!

    const hpWest = e.deployTower('honeypot', 4, 6, 'S', { free: true }).tower;
    e.upgradeTower(hpWest.id, 'trap', { free: true });
    hpWest.hp = 320;

    const icWest = e.deployTower('interceptor', 3, 7, 'N', { free: true }).tower;
    e.upgradeTower(icWest.id, 'suppress', { free: true });
    icWest.hp = 260;
    icWest.encryptedTimer = 8.5; // Locked by Ransomware!

    const sbWest = e.deployTower('sandbox', 3, 6, 'S', { free: true }).tower;
    e.upgradeTower(sbWest.id, null, { free: true });
    sbWest.hp = 310;
    sbWest.encryptedTimer = 8.5;

    const rpWest = e.deployTower('repair', 2, 7, 'S', { free: true }).tower;
    e.upgradeTower(rpWest.id, null, { free: true });
    rpWest.skillCd = 0; // Ready for 冗余切换!

    // East Ops Ring Defense Cluster contesting Boss 蛰影
    const icEast = e.deployTower('interceptor', 11, 3, 'W', { free: true }).tower;
    e.upgradeTower(icEast.id, 'pierce', { free: true });
    const sbEast = e.deployTower('sandbox', 11, 4, 'S', { free: true }).tower;
    e.upgradeTower(sbEast.id, null, { free: true });
    const fwEast = e.deployTower('firewall', 10, 7, 'S', { free: true }).tower;
    fwEast.hp = 230; // Heavily pressured by Boss 蛰影!
    const icSouthE = e.deployTower('interceptor', 11, 7, 'N', { free: true }).tower;

    this.refs = { fwWest, hpWest, icWest, sbWest, rpWest, icEast, sbEast, fwEast, icSouthE };

    // BOSS 蛰影 advancing down East Ops Ring, right on the verge of Phase 3 (破坏)!
    const boss = e.spawnEnemy('boss_zheying', 'C', { gx: 10.0, gy: 2.55 });
    boss.bossPhase = 2;
    boss.stealth = false;
    boss.armor = 0.36;
    boss.hp = Math.round(boss.maxHp * 0.78); // Survives dramatically through the 20s boss battle!
    boss.bossSkillCd = 99; // Demo triggers Phase 3 Ops Ring Lock cleanly on cue!
    boss.bossSubCd = 99;
    this.refs.boss = boss;

    // Active enemies across all 3 entries creating fierce pressure
    e.spawnEnemy('ransom', 'A', { gx: 4.0, gy: 4.2 });
    e.spawnEnemy('flood', 'A', { gx: 4.0, gy: 5.5 });
    e.spawnEnemy('worm', 'A', { gx: 4.0, gy: 3.1 });
    e.spawnEnemy('packager', 'B', { gx: 8.0, gy: 2.0 });
    e.spawnEnemy('trojan', 'B', { gx: 9.0, gy: 2.0 });
    e.spawnEnemy('worm', 'C', { gx: 10.0, gy: 1.5 });
    e.spawnEnemy('ransom', 'C', { gx: 10.0, gy: 3.6 });

    this.spawnSchedule = [
      { t: 1.8, entry: 'B', type: 'worm' },
      { t: 2.8, entry: 'A', type: 'trojan' },
      { t: 4.0, entry: 'C', type: 'worm' },
      { t: 5.5, entry: 'B', type: 'flood' },
      { t: 6.8, entry: 'B', type: 'ransom' },
      { t: 7.8, entry: 'C', type: 'trojan' },
      { t: 8.8, entry: 'A', type: 'worm' },
      { t: 10.0, entry: 'A', type: 'packager' },
      { t: 11.2, entry: 'B', type: 'worm' },
      { t: 12.6, entry: 'A', type: 'hotspot' },
      { t: 14.0, entry: 'C', type: 'worm' },
    ];
  }

  // ============================================================================
  // PER-TICK DEMO CHOREOGRAPHY (Deterministic for both Live Play & videoExport!)
  // ============================================================================

  step(dt) {
    if (!this.active) return;
    this.elapsed += dt;

    // Spawn scheduled demo reinforcements deterministically
    while (this.spawnSchedule.length > 0 && this.spawnSchedule[0].t <= this.elapsed) {
      const s = this.spawnSchedule.shift();
      this.engine.spawnEnemy(s.type, s.entry);
    }

    this.updateChoreography(this.elapsed);
  }

  updateChoreography(t) {
    if (this.demoId === 'demo-1') this.choreoDemo1(t);
    else if (this.demoId === 'demo-2') this.choreoDemo2(t);
    else if (this.demoId === 'demo-3') this.choreoDemo3(t);
  }

  getElementCenter(selector) {
    const el = document.querySelector(selector);
    if (!el) return { x: window.innerWidth * 0.5, y: window.innerHeight * 0.88 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 };
  }

  // -------------------- DEMO 1 CHOREOGRAPHY (18.0s) --------------------
  choreoDemo1(t) {
    const cams = [
      { t: 0.0, tx: 0.0, tz: 1.85, yaw: 0.0, pitch: 0.86, distance: 36.8 }, // Full map overview
      { t: 2.2, tx: 0.0, tz: 1.85, yaw: 0.0, pitch: 0.86, distance: 36.8 },
      { t: 4.8, tx: -3.2, tz: -3.2, yaw: -0.18, pitch: 0.82, distance: 22.0 }, // Focus West Boundary Node & DMZ
      { t: 8.8, tx: -2.0, tz: -3.2, yaw: -0.12, pitch: 0.82, distance: 22.5 },
      { t: 12.8, tx: 3.8, tz: -2.2, yaw: 0.16, pitch: 0.78, distance: 20.5 }, // Track redirected enemies across DMZ into Business firepower!
      { t: 15.8, tx: 2.2, tz: -1.4, yaw: 0.08, pitch: 0.84, distance: 25.0 },
      { t: 18.0, tx: 1.5, tz: -0.8, yaw: 0.04, pitch: 0.86, distance: 27.0 },
    ];
    this.scene.setCameraPose(sampleCamera(cams, t), true);

    const subs = [
      { t: 0.0, text: '【分段取舍】门户网站(A)与邮件网关(B)双口承压，办公网段防线告急' },
      { t: 3.0, text: '拖动「网闸」至西边界节点，观察实时路由改道预览' },
      { t: 5.5, text: '路线预览：隔离西边界节点后，入口 A 将折向 DMZ 互联与 B 汇流' },
      { t: 8.2, text: '确认部署！西边界节点封锁，办公网段敌军即时掉头转入 DMZ 互联' },
      { t: 11.4, text: '汇流敌军撞上东侧沙箱与磁轨拦截器交叉火力，双方展开拉锯激战' },
      { t: 15.2, text: '以低成本网闸完成流量整合，成功稳住企业内网主防线' },
    ];
    this.ui.setDemoSubtitle(getSubtitle(subs, t), '分段取舍 · 分段内网', t, this.def.duration);

    // Virtual Cursor Motion & Drag/Preview/Confirm!
    const cardPos = this.getElementCenter('[data-tower-card="airgap"]');
    const n1Proj = this.scene.projectGridToScreen(this.engine.map, 4, 3, 0.2);
    const startPos = { x: window.innerWidth * 0.56, y: window.innerHeight * 0.45 };

    if (t < 2.4) {
      this.ui.setVirtualCursor({ visible: false });
    } else if (t < 3.9) {
      const u = smoothstep((t - 2.4) / 1.5);
      this.ui.setVirtualCursor({
        visible: true,
        x: lerp(startPos.x, cardPos.x, u),
        y: lerp(startPos.y, cardPos.y, u),
        dragging: false,
      });
    } else if (t < 5.5) {
      const u = smoothstep((t - 3.9) / 1.6);
      this.ui.setVirtualCursor({
        visible: true,
        x: lerp(cardPos.x, n1Proj.x, u),
        y: lerp(cardPos.y, n1Proj.y, u),
        dragging: true,
        label: '网闸',
      });
      if (u > 0.72) {
        const prev = this.engine.previewTowerPlacement('airgap', 4, 3);
        this.scene.showGhostTower(this.engine.map, 'airgap', 4, 3, 'S', prev.valid);
        this.scene.vfx.showPlacementPreview(this.engine.map, { x: 4, y: 3, valid: prev.valid });
        this.scene.vfx.showRoutePreview(this.engine.map, prev.previewRoutes, prev.changedEntries);
      }
    } else if (t < 8.2) {
      // Hold steady over N1 (4,3) so viewer clearly sees route preview bending across DMZ!
      this.ui.setVirtualCursor({
        visible: true,
        x: n1Proj.x,
        y: n1Proj.y,
        dragging: true,
        label: '预览：A 改道 → DMZ 互联',
      });
      const prev = this.engine.previewTowerPlacement('airgap', 4, 3);
      this.scene.showGhostTower(this.engine.map, 'airgap', 4, 3, 'S', prev.valid);
      this.scene.vfx.showPlacementPreview(this.engine.map, { x: 4, y: 3, valid: prev.valid });
      this.scene.vfx.showRoutePreview(this.engine.map, prev.previewRoutes, prev.changedEntries);
      this.ui.setRoutePreviewState({ changedEntries: prev.changedEntries, previewRoutes: prev.previewRoutes });
    } else if (!this.firedFlags.has('deploy_n1')) {
      this.firedFlags.add('deploy_n1');
      this.scene.hideGhost();
      this.scene.vfx.clearPlacementPreview();
      this.scene.vfx.clearRoutePreview();
      this.ui.setRoutePreviewState(null);
      this.engine.deployTower('airgap', 4, 3, 'S');
      this.ui.setVirtualCursor({ visible: true, x: n1Proj.x, y: n1Proj.y, clicking: true });
    } else if (t < 9.4) {
      const u = smoothstep((t - 8.2) / 1.2);
      this.ui.setVirtualCursor({
        visible: true,
        x: lerp(n1Proj.x, window.innerWidth * 0.65, u),
        y: lerp(n1Proj.y, window.innerHeight * 0.42, u),
        clicking: t < 8.45,
      });
    } else {
      this.ui.setVirtualCursor({ visible: false });
    }
  }

  // -------------------- DEMO 2 CHOREOGRAPHY (20.0s) --------------------
  choreoDemo2(t) {
    const cams = [
      { t: 0.0, tx: 0.0, tz: 1.85, yaw: 0.0, pitch: 0.86, distance: 36.8 }, // Full map overview
      { t: 2.0, tx: 0.0, tz: 1.85, yaw: 0.0, pitch: 0.86, distance: 36.8 },
      { t: 4.0, tx: 6.2, tz: -3.2, yaw: 0.2, pitch: 0.8, distance: 20.5 }, // Focus N2 (11,3) Flood Pack smashing Air-Gapper!
      { t: 7.4, tx: 5.2, tz: -1.0, yaw: 0.14, pitch: 0.82, distance: 24.0 }, // Show C & B snapping back across Legacy Bridge -> Y!
      { t: 10.0, tx: -8.6, tz: 1.0, yaw: -0.22, pitch: 0.78, distance: 20.5 }, // Pan West to Entry A Tunnel!
      { t: 14.5, tx: -7.5, tz: 1.6, yaw: -0.18, pitch: 0.8, distance: 21.0 },
      { t: 18.2, tx: -1.0, tz: 1.2, yaw: 0.0, pitch: 0.86, distance: 29.0 }, // Pull back to Dual-DC active firefight
      { t: 20.0, tx: 0.0, tz: 0.8, yaw: 0.0, pitch: 0.88, distance: 31.0 },
    ];
    this.scene.setCameraPose(sampleCamera(cams, t), true);

    const subs = [
      { t: 0.0, text: '【旁路直通】骨干流域爆发三口洪峰！东汇聚节点网闸正承受洪泛团猛攻' },
      { t: 3.0, text: '洪泛团脱离常规路线重击东汇聚节点，网闸耐久濒临极限！' },
      { t: 4.8, text: '网闸被冲垮，节点旁路直通！C、B 路线即时改回东旧专线流向数据中心 Y' },
      { t: 8.6, text: '西专线隧道压力剧增：选中情报道具「协议降级」瞄准入口 A 通道' },
      { t: 12.3, text: '投下协议降级！伪装木马即刻裂壳显形，敌群减速，双活防线反击稳局' },
      { t: 16.5, text: '节点失守后灵活应对改道并辅以协议降级，成功顶住三口并发洪峰' },
    ];
    this.ui.setDemoSubtitle(getSubtitle(subs, t), '旁路直通 · 骨干流域', t, this.def.duration);

    // Guarantee Air-Gapper on N2 collapses right around t = 4.65s for dramatic sync with camera!
    if (t >= 4.65 && !this.firedFlags.has('smash_n2')) {
      this.firedFlags.add('smash_n2');
      const ag = this.engine.getTowerAt(11, 3);
      if (ag && ag.hp > 0) {
        const fp = this.engine.enemies.find((en) => !en.dead && en.type === 'flood') || null;
        this.engine.damageTower(ag, 9999, fp, { isSurge: true });
      }
    }

    // Virtual Cursor drags Protocol Downgrade onto Entry A's West Tunnel (2,5)!
    const itemPos = this.getElementCenter('[data-item-card="downgrade"]');
    const targetProj = this.scene.projectGridToScreen(this.engine.map, 2, 5, 0.15);
    const restPos = { x: window.innerWidth * 0.55, y: window.innerHeight * 0.5 };

    if (t < 8.4) {
      this.ui.setVirtualCursor({ visible: false });
    } else if (t < 9.8) {
      const u = smoothstep((t - 8.4) / 1.4);
      this.ui.setVirtualCursor({
        visible: true,
        x: lerp(restPos.x, itemPos.x, u),
        y: lerp(restPos.y, itemPos.y, u),
      });
    } else if (t < 11.2) {
      const u = smoothstep((t - 9.8) / 1.4);
      this.ui.setVirtualCursor({
        visible: true,
        x: lerp(itemPos.x, targetProj.x, u),
        y: lerp(itemPos.y, targetProj.y, u),
        dragging: true,
        label: '协议降级',
      });
      if (u > 0.65) {
        const prev = this.engine.previewItemUse('downgrade', 2, 5);
        this.scene.vfx.showPlacementPreview(this.engine.map, {
          x: 2,
          y: 5,
          valid: prev.valid,
          affectedTiles: prev.affectedTiles,
        });
        this.scene.vfx.showRoutePreview(this.engine.map, prev.previewRoutes, prev.changedEntries);
      }
    } else if (t < 12.4) {
      this.ui.setVirtualCursor({
        visible: true,
        x: targetProj.x,
        y: targetProj.y,
        dragging: true,
        label: '预览：降级减速 + 显形木马',
      });
      const prev = this.engine.previewItemUse('downgrade', 2, 5);
      this.scene.vfx.showPlacementPreview(this.engine.map, {
        x: 2,
        y: 5,
        valid: prev.valid,
        affectedTiles: prev.affectedTiles,
      });
      this.scene.vfx.showRoutePreview(this.engine.map, prev.previewRoutes, prev.changedEntries);
      this.ui.setRoutePreviewState({ changedEntries: prev.changedEntries, previewRoutes: prev.previewRoutes });
    } else if (!this.firedFlags.has('cast_downgrade')) {
      this.firedFlags.add('cast_downgrade');
      this.scene.vfx.clearPlacementPreview();
      this.scene.vfx.clearRoutePreview();
      this.ui.setRoutePreviewState(null);
      this.engine.useItem('downgrade', 2, 5);
      this.ui.setVirtualCursor({ visible: true, x: targetProj.x, y: targetProj.y, clicking: true });
    } else if (t < 13.8) {
      const u = smoothstep((t - 12.4) / 1.4);
      this.ui.setVirtualCursor({
        visible: true,
        x: lerp(targetProj.x, window.innerWidth * 0.45, u),
        y: lerp(targetProj.y, window.innerHeight * 0.42, u),
        clicking: t < 12.7,
      });
    } else {
      this.ui.setVirtualCursor({ visible: false });
    }
  }

  // -------------------- DEMO 3 CHOREOGRAPHY (20.0s) --------------------
  choreoDemo3(t) {
    const cams = [
      { t: 0.0, tx: 0.0, tz: 1.85, yaw: 0.0, pitch: 0.86, distance: 36.8 }, // Full Air-Gap overview
      { t: 2.0, tx: 0.0, tz: 1.85, yaw: 0.0, pitch: 0.86, distance: 36.8 },
      { t: 4.0, tx: 6.2, tz: -1.8, yaw: 0.22, pitch: 0.78, distance: 20.0 }, // Focus Boss 蛰影 on East Ops Ring!
      { t: 7.4, tx: 2.4, tz: -1.2, yaw: 0.08, pitch: 0.84, distance: 26.5 }, // Show all routes re-converging around Air-Gap!
      { t: 10.2, tx: -6.8, tz: 3.4, yaw: -0.2, pitch: 0.76, distance: 19.5 }, // Track to embattled West Channel Cluster!
      { t: 15.6, tx: -5.4, tz: 2.8, yaw: -0.14, pitch: 0.78, distance: 21.0 },
      { t: 18.8, tx: -0.5, tz: 1.0, yaw: 0.0, pitch: 0.86, distance: 30.0 },
      { t: 20.0, tx: 0.0, tz: 0.6, yaw: 0.0, pitch: 0.88, distance: 32.0 },
    ];
    this.scene.setCameraPose(sampleCamera(cams, t), true);

    const subs = [
      { t: 0.0, text: '【蛰影现身】气隙深层第 16 波！终极领主「蛰影」沿东运维环强突' },
      { t: 3.6, text: '蛰影切入「破坏」阶段！前方东运维环出现红色锁死预警' },
      { t: 6.4, text: '东运维环被锁死！各入口路线全线重收敛，敌军改道涌向西狭窄通道' },
      { t: 9.8, text: '西通道防线遭勒索者集体加密停摆！选中「修复进程」准备应急处置' },
      { t: 13.0, text: '释放「冗余切换」！瞬间解除加密并叠加厚盾，西线火力全面重启！' },
      { t: 16.8, text: '工控双核协同抗压，成功顶住蛰影改道突袭与加密危机' },
    ];
    this.ui.setDemoSubtitle(getSubtitle(subs, t), '蛰影现身 · 气隙深层', t, this.def.duration);

    // Cue 1 (t = 3.8s): Trigger Boss 蛰影 Phase 3 Warning on East Ops Ring (10,5)-(10,6)!
    if (t >= 3.8 && !this.firedFlags.has('boss_p3_warn')) {
      this.firedFlags.add('boss_p3_warn');
      const boss = this.refs.boss;
      if (boss && !boss.dead) {
        boss.bossPhase = 3;
        boss.hp = Math.max(Math.round(boss.maxHp * 0.34), Math.min(boss.hp, Math.round(boss.maxHp * 0.37)));
        boss.bossSkillCd = 99;
        boss.stealth = false;
        this.engine.emit('boss_phase', { boss, phase: 3, label: '破坏阶段 — 即将锁死东运维环！' });
        const lockTiles = [
          { x: 10, y: 5 },
          { x: 10, y: 6 },
        ];
        this.engine.bossWarnings.push({
          id: this.engine.nextEntityId++,
          kind: 'ops_lock',
          tiles: lockTiles,
          remaining: 2.4,
          duration: 2.4,
          bossId: boss.id,
        });
        this.engine.emit('boss_warning', {
          kind: 'ops_lock',
          tiles: lockTiles,
          label: '蛰影正在锁死东运维环，各入口路线即将重新收敛！',
        });
      }
    }

    // Also let East Firewall fall dramatically under Boss 蛰影's sabotage pulse right around t=7.2s so both sides trade real blows!
    if (t >= 7.2 && !this.firedFlags.has('boss_crush_east')) {
      this.firedFlags.add('boss_crush_east');
      const fwE = this.engine.getTowerAt(10, 7);
      if (fwE && fwE.hp > 0 && this.refs.boss && !this.refs.boss.dead) {
        this.engine.damageTower(fwE, 360, this.refs.boss, { isSurge: true });
      }
    }

    // Keep West towers visibly encrypted right up until Repair Daemon casts Failover Switch at 13.1s
    if (t < 13.0) {
      if (this.refs.fwWest && this.refs.fwWest.hp > 0) this.refs.fwWest.encryptedTimer = Math.max(this.refs.fwWest.encryptedTimer, 3.0);
      if (this.refs.icWest && this.refs.icWest.hp > 0) this.refs.icWest.encryptedTimer = Math.max(this.refs.icWest.encryptedTimer, 3.0);
    }

    // Virtual Cursor selects Repair Daemon at (2,7) -> clicks 「冗余切换」 skill button!
    const rpProj = this.scene.projectGridToScreen(this.engine.map, 2, 7, 0.75);
    const startPos = { x: window.innerWidth * 0.56, y: window.innerHeight * 0.45 };

    if (t < 9.8) {
      this.ui.setVirtualCursor({ visible: false });
    } else if (t < 11.2) {
      const u = smoothstep((t - 9.8) / 1.4);
      this.ui.setVirtualCursor({
        visible: true,
        x: lerp(startPos.x, rpProj.x, u),
        y: lerp(startPos.y, rpProj.y, u),
      });
    } else if (t < 11.6) {
      if (!this.firedFlags.has('select_repair')) {
        this.firedFlags.add('select_repair');
        this.ui.selectTowerById(this.refs.rpWest.id);
      }
      this.ui.setVirtualCursor({ visible: true, x: rpProj.x, y: rpProj.y, clicking: true });
    } else if (t < 13.0) {
      const btnPos = this.getElementCenter('#btn-tower-skill');
      const u = smoothstep((t - 11.6) / 1.4);
      this.ui.setVirtualCursor({
        visible: true,
        x: lerp(rpProj.x, btnPos.x, u),
        y: lerp(rpProj.y, btnPos.y, u),
      });
    } else if (!this.firedFlags.has('cast_failover')) {
      this.firedFlags.add('cast_failover');
      const btnPos = this.getElementCenter('#btn-tower-skill');
      this.engine.activateSkill(this.refs.rpWest.id);
      this.ui.setVirtualCursor({ visible: true, x: btnPos.x, y: btnPos.y, clicking: true });
    } else if (t < 14.4) {
      const btnPos = this.getElementCenter('#btn-tower-skill');
      const u = smoothstep((t - 13.0) / 1.4);
      this.ui.setVirtualCursor({
        visible: true,
        x: lerp(btnPos.x, window.innerWidth * 0.52, u),
        y: lerp(btnPos.y, window.innerHeight * 0.46, u),
        clicking: t < 13.35,
      });
    } else {
      this.ui.setVirtualCursor({ visible: false });
    }
  }
}
