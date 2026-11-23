import { SeededRNG } from './rng.js';
import {
  DIRECTION_VECTORS,
  ENEMY_SPECS,
  ITEM_SPECS,
  LEGACY_SPEED_MULT,
  NODE_ISOLATION_INTEL_COST,
  NODE_REISOLATE_COOLDOWN,
  TOWER_SPECS,
  WITHDRAW_COMPUTE_REFUND,
} from '../data/specs.js';
import { getMapById } from '../data/maps.js';
import {
  computeAllEntryRoutes,
  diffEntryRoutes,
  findTilePath,
  getTileTraversal,
  tileKey,
  validateConnectivity,
} from './pathfinding.js';

const DIRS4 = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

export class GameEngine {
  constructor() {
    this.rng = new SeededRNG(0x51a7c0de);
    this.map = null;
    this.resetInternalState();
  }

  resetInternalState() {
    this.simTime = 0;
    this.paused = false;
    this.speedMult = 1;
    this.status = 'idle'; // 'idle' | 'playing' | 'victory' | 'defeat'
    this.demoMode = false;

    this.compute = 0;
    this.intel = 0;
    this.integrity = 20;
    this.maxIntegrity = 20;

    this.waveIndex = -1; // -1 = pre-wave 1 prep
    this.waveActive = false;
    this.nextWaveTimer = 8.0;
    this.waveElapsed = 0;
    this.waveIntelFromNodes = 0;
    this.spawnQueue = [];

    this.nextEntityId = 1;
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.isolators = [];
    this.downgradedZones = [];
    this.blockedTiles = new Map(); // "x,y" -> { kind, remaining, maxDuration }
    this.bossWarnings = [];
    this.nodeCooldowns = new Map(); // "x,y" -> remaining seconds

    this.isolatedNodes = new Set();
    this.downgradedTiles = new Set();
    this.flow = null;
    this.entryRoutes = {};

    this.seenEnemies = new Set();
    this.events = []; // drained by renderer/audio/UI each tick

    this.stats = {
      kills: 0,
      bossKills: 0,
      towersBuilt: 0,
      towersLost: 0,
      reroutes: 0,
      damageDealt: 0,
      healingDone: 0,
      intelEarned: 0,
      computeEarned: 0,
      itemsUsed: 0,
      skillsUsed: 0,
    };

    this.itemCooldowns = {
      isolator: 0,
      downgrade: 0,
      restore: 0,
    };
  }

  loadMap(mapId, seed = 0x51a7c0de, { demoMode = false } = {}) {
    this.resetInternalState();
    this.rng.setSeed(seed);
    this.map = getMapById(mapId);
    this.demoMode = demoMode;
    this.status = 'playing';

    this.compute = this.map.startCompute;
    this.intel = this.map.startIntel;
    this.integrity = this.map.startIntegrity;
    this.maxIntegrity = this.map.startIntegrity;
    this.nextWaveTimer = demoMode ? 9999 : 7.5;

    this.syncDynamicSets();
    const res = computeAllEntryRoutes(this.map, this.getDynamicRoutingState(), null);
    this.flow = res.flow;
    this.entryRoutes = res.routes;

    this.emit('map_loaded', { mapId: this.map.id });
  }

  emit(type, payload = {}) {
    this.events.push({ type, time: this.simTime, ...payload });
  }

  drainEvents() {
    if (this.events.length === 0) return [];
    const out = this.events;
    this.events = [];
    return out;
  }

  getDynamicRoutingState() {
    return {
      isolatedNodes: this.isolatedNodes,
      blockedTiles: this.blockedTiles,
      downgradedTiles: this.downgradedTiles,
    };
  }

  syncDynamicSets() {
    this.isolatedNodes.clear();
    for (const t of this.towers) {
      if (t.hp > 0 && t.onNode) {
        this.isolatedNodes.add(tileKey(t.x, t.y));
      }
    }
    for (const iso of this.isolators) {
      if (iso.hp > 0 && iso.remaining > 0) {
        this.isolatedNodes.add(tileKey(iso.x, iso.y));
      }
    }

    this.downgradedTiles.clear();
    for (const z of this.downgradedZones) {
      if (z.remaining > 0) {
        for (const k of z.tiles) this.downgradedTiles.add(k);
      }
    }
  }

  recomputeRoutes(reason = 'update') {
    this.syncDynamicSets();
    const oldRoutes = this.entryRoutes;
    const res = computeAllEntryRoutes(this.map, this.getDynamicRoutingState(), null);
    this.flow = res.flow;
    this.entryRoutes = res.routes;

    const changed = oldRoutes && Object.keys(oldRoutes).length > 0 ? diffEntryRoutes(oldRoutes, res.routes) : [];
    if (changed.length > 0) {
      this.stats.reroutes++;
      this.emit('route_changed', { reason, changedEntries: changed, routes: this.entryRoutes });
    } else {
      this.emit('routes_refreshed', { reason, routes: this.entryRoutes });
    }

    // Immediately redirect all live ground enemies cleanly from their current position
    for (const en of this.enemies) {
      if (en.dead || en.flying) continue;
      this.refreshEnemyPathing(en);
    }

    return changed;
  }

  refreshEnemyPathing(en) {
    // If enemy is currently standing on a newly impassable tile, gently step to nearest reachable neighbor
    let gx = Math.round(en.gx);
    let gy = Math.round(en.gy);
    if (
      gy < 0 ||
      gy >= this.map.height ||
      gx < 0 ||
      gx >= this.map.width ||
      !Number.isFinite(this.flow.dist[gy][gx])
    ) {
      let best = null;
      let bestDist = Infinity;
      for (const d of DIRS4) {
        const nx = gx + d.dx;
        const ny = gy + d.dy;
        if (ny >= 0 && ny < this.map.height && nx >= 0 && nx < this.map.width) {
          const fd = this.flow.dist[ny][nx];
          if (Number.isFinite(fd) && fd < bestDist) {
            bestDist = fd;
            best = { x: nx, y: ny };
          }
        }
      }
      if (best) {
        en.nextTile = best;
        en.overridePath = null;
        return;
      }
    }

    // Reset flood pack override if its target node is no longer isolated
    if (en.seekNodeKey && !this.isolatedNodes.has(en.seekNodeKey)) {
      en.seekNodeKey = null;
      en.overridePath = null;
    }

    const nxt = this.flow.nextStep[gy]?.[gx];
    if (nxt) {
      en.nextTile = { x: nxt.x, y: nxt.y };
    }
  }

  getTile(x, y) {
    if (!this.map || y < 0 || y >= this.map.height || x < 0 || x >= this.map.width) return null;
    return this.map.grid[y][x];
  }

  getTowerAt(x, y) {
    return this.towers.find((t) => t.hp > 0 && t.x === x && t.y === y) || null;
  }

  getIsolatorAt(x, y) {
    return this.isolators.find((iso) => iso.hp > 0 && iso.remaining > 0 && iso.x === x && iso.y === y) || null;
  }

  getEffectiveTowerStats(tower) {
    const spec = TOWER_SPECS[tower.type];
    const stats = {
      maxHp: spec.maxHp,
      atk: spec.atk || 0,
      healAmount: spec.healAmount || 0,
      healTargets: spec.healTargets || 1,
      attackInterval: spec.attackInterval || 1.0,
      range: spec.range || 0,
      detectRange: spec.detectRange || 0,
      tauntRange: spec.tauntRange || 0,
      rangeForward: spec.rangeForward || 0,
      rangeSide: spec.rangeSide || 0,
      blockCap: spec.blockCap || 0,
      armor: spec.armor || 0,
      pierceCount: 0,
      slowFactor: 1,
      slowDuration: 0,
      airBonus: 1,
      shockwaveEvery: 0,
      shieldRegen: 0,
      maxSelfShield: 0,
      enemySlowAtk: 0,
      trapDps: 0,
      vulnBonus: 0,
      vulnDuration: 0,
      skillRadius: spec.skill?.radius || 0,
      skillShield: spec.skill?.shieldAmount || 0,
      skillBurstHeal: spec.skill?.burstHeal || 0,
      intelBonusMult: 1,
    };

    if (tower.level >= 2) {
      if (spec.upgrade.type === 'single') {
        Object.assign(stats, spec.upgrade.stats);
      } else if (spec.upgrade.type === 'branch' && tower.branch && spec.upgrade.branches[tower.branch]) {
        Object.assign(stats, spec.upgrade.branches[tower.branch].stats);
      }
    }
    return stats;
  }

  getDowngradeTiles(cx, cy) {
    const rad = ITEM_SPECS.downgrade.radius;
    const out = [];
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const tile = this.map.grid[y][x];
        if (tile.type === 'link' || tile.type === 'legacy' || tile.type === 'node') {
          const d = Math.hypot(x - cx, y - cy);
          if (d <= rad) out.push({ x, y });
        }
      }
    }
    return out;
  }

  // ==================== PREVIEW & VALIDATION ====================

  previewTowerPlacement(typeId, x, y) {
    const spec = TOWER_SPECS[typeId];
    const tile = this.getTile(x, y);
    if (!spec || !tile) {
      return { valid: false, reason: '超出地图边界' };
    }
    if (!spec.placement.includes(tile.type)) {
      return { valid: false, reason: `「${spec.name}」仅可部署在：${spec.placementText}` };
    }
    if (this.getTowerAt(x, y) || this.getIsolatorAt(x, y)) {
      return { valid: false, reason: '该位置已部署其他设备' };
    }
    const key = tileKey(x, y);
    if (this.blockedTiles.has(key)) {
      return { valid: false, reason: '该链路已被领主封锁，无法部署' };
    }
    for (const w of this.bossWarnings) {
      if ((w.kind === 'blackhole' || w.kind === 'ops_lock') && w.tiles.some((t) => t.x === x && t.y === y)) {
        return { valid: false, reason: '该链路处于领主封锁预警区，暂不可部署' };
      }
    }

    const onNode = tile.type === 'node';
    const costCompute = spec.costCompute;
    const costIntel = onNode ? spec.nodeCostIntel : 0;

    if (onNode) {
      const cd = this.nodeCooldowns.get(key) || 0;
      if (cd > 0.05) {
        return { valid: false, reason: `该节点处于旁路冷却中（剩余 ${cd.toFixed(1)}s），暂不可再次隔离` };
      }
    }

    let connectivity = null;
    let changedEntries = [];
    if (onNode) {
      const overrides = { extraBlocked: new Set([key]) };
      connectivity = validateConnectivity(this.map, this.getDynamicRoutingState(), overrides, this.enemies);
      if (!connectivity.ok) {
        const sealedNames = connectivity.sealedEntries.map((e) => `入口 ${e.id}(${e.name})`);
        if (connectivity.sealedEnemies.length > 0) sealedNames.push('场上敌军单位');
        return {
          valid: false,
          sealed: true,
          reason: `无法隔离：将导致 ${sealedNames.join('、')} 无路可达核心！`,
          sealedEntries: connectivity.sealedEntries,
          sealedEnemies: connectivity.sealedEnemies,
        };
      }
      changedEntries = diffEntryRoutes(this.entryRoutes, connectivity.routes);
    }

    if (this.compute < costCompute) {
      return {
        valid: false,
        reason: `算力不足（需要 ${costCompute}，当前 ${Math.floor(this.compute)}）`,
        previewRoutes: connectivity?.routes || null,
        changedEntries,
      };
    }
    if (this.intel < costIntel) {
      return {
        valid: false,
        reason: `情报不足（节点隔离需要 ${costIntel} 情报，当前 ${Math.floor(this.intel)}）`,
        previewRoutes: connectivity?.routes || null,
        changedEntries,
      };
    }

    return {
      valid: true,
      onNode,
      costCompute,
      costIntel,
      previewRoutes: connectivity?.routes || null,
      changedEntries,
    };
  }

  previewItemUse(itemId, x, y) {
    const spec = ITEM_SPECS[itemId];
    const tile = this.getTile(x, y);
    if (!spec || !tile) return { valid: false, reason: '无效目标位置' };

    const cd = this.itemCooldowns[itemId] || 0;
    if (cd > 0.05) {
      return { valid: false, reason: `「${spec.name}」冷却中（剩余 ${cd.toFixed(1)}s）` };
    }

    const key = tileKey(x, y);

    if (itemId === 'isolator') {
      if (tile.type !== 'node') return { valid: false, reason: '应急隔离器只能插入直通的交换节点' };
      if (this.isolatedNodes.has(key) || this.getTowerAt(x, y) || this.getIsolatorAt(x, y)) {
        return { valid: false, reason: '该交换节点已处于隔离状态' };
      }
      const ncd = this.nodeCooldowns.get(key) || 0;
      if (ncd > 0.05) {
        return { valid: false, reason: `节点冷却中（剩余 ${ncd.toFixed(1)}s），暂不可隔离` };
      }
      const overrides = { extraBlocked: new Set([key]) };
      const conn = validateConnectivity(this.map, this.getDynamicRoutingState(), overrides, this.enemies);
      if (!conn.ok) {
        const sealedNames = conn.sealedEntries.map((e) => `入口 ${e.id}(${e.name})`);
        if (conn.sealedEnemies.length > 0) sealedNames.push('场上敌军');
        return {
          valid: false,
          sealed: true,
          reason: `无法插入：将封死 ${sealedNames.join('、')} 的唯一通路！`,
          sealedEntries: conn.sealedEntries,
          sealedEnemies: conn.sealedEnemies,
        };
      }
      const changedEntries = diffEntryRoutes(this.entryRoutes, conn.routes);
      if (this.intel < spec.cost) {
        return { valid: false, reason: `情报不足（需 ${spec.cost}）`, previewRoutes: conn.routes, changedEntries };
      }
      return { valid: true, previewRoutes: conn.routes, changedEntries, affectedTiles: [{ x, y }] };
    }

    if (itemId === 'downgrade') {
      if (tile.type !== 'link' && tile.type !== 'legacy' && tile.type !== 'node') {
        return { valid: false, reason: '协议降级需投放在链路区域' };
      }
      const affectedTiles = this.getDowngradeTiles(x, y);
      const extraDowngraded = new Set(affectedTiles.map((t) => tileKey(t.x, t.y)));
      const res = computeAllEntryRoutes(this.map, this.getDynamicRoutingState(), { extraDowngraded });
      const changedEntries = diffEntryRoutes(this.entryRoutes, res.routes);
      if (this.intel < spec.cost) {
        return { valid: false, reason: `情报不足（需 ${spec.cost}）`, affectedTiles, previewRoutes: res.routes, changedEntries };
      }
      return { valid: true, affectedTiles, previewRoutes: res.routes, changedEntries };
    }

    if (itemId === 'restore') {
      const tower = this.getTowerAt(x, y);
      if (!tower) return { valid: false, reason: '请选择一座友方防线塔进行备份还原' };
      if (tower.hp >= tower.maxHp - 1 && tower.encryptedTimer <= 0) {
        return { valid: false, reason: '该塔状态完好且未被加密，无需还原' };
      }
      if (this.compute < spec.cost) {
        return { valid: false, reason: `算力不足（需 ${spec.cost}）` };
      }
      return { valid: true, targetTower: tower, affectedTiles: [{ x, y }] };
    }

    return { valid: false, reason: '未知道具' };
  }

  previewWithdrawTower(towerId) {
    const tower = this.towers.find((t) => t.id === towerId && t.hp > 0);
    if (!tower || !tower.onNode) return null;
    const key = tileKey(tower.x, tower.y);
    const res = computeAllEntryRoutes(this.map, this.getDynamicRoutingState(), {
      extraUnblocked: new Set([key]),
    });
    const changedEntries = diffEntryRoutes(this.entryRoutes, res.routes);
    return { previewRoutes: res.routes, changedEntries };
  }

  // ==================== PLAYER ACTIONS ====================

  deployTower(typeId, x, y, dir = 'S', { free = false } = {}) {
    if (!free) {
      const check = this.previewTowerPlacement(typeId, x, y);
      if (!check.valid) {
        this.emit('action_rejected', {
          reason: check.reason,
          sealed: check.sealed,
          sealedEntries: check.sealedEntries,
          sealedEnemies: check.sealedEnemies,
          x,
          y,
        });
        return { ok: false, reason: check.reason };
      }
      this.compute -= check.costCompute;
      this.intel -= check.costIntel;
    }

    const spec = TOWER_SPECS[typeId];
    const tile = this.getTile(x, y);
    const onNode = tile.type === 'node';

    const tower = {
      id: this.nextEntityId++,
      type: typeId,
      x,
      y,
      onNode,
      dir: spec.directional ? dir : 'S',
      level: 1,
      branch: null,
      hp: spec.maxHp,
      maxHp: spec.maxHp,
      shield: 0,
      shieldTimer: 0,
      encryptedTimer: 0,
      attackCd: 0.2,
      skillCd: 0,
      skillActiveTimer: 0,
      hitCounter: 0,
      totalComputeSpent: spec.costCompute,
      animAttack: 0,
      animHit: 0,
      animHeal: 0,
      turretAngle: DIRECTION_VECTORS[dir]?.angle || 0,
      targetEnemyId: null,
      healTargetIds: [],
      disruptTimer: 0,
      intelHarvestAcc: 0,
    };

    this.towers.push(tower);
    this.stats.towersBuilt++;

    this.emit('tower_deployed', { tower });
    if (onNode) {
      this.emit('node_isolated', { x, y, by: typeId, nodeId: tile.nodeId, nodeName: tile.label });
      this.recomputeRoutes('node_isolated');
    }

    return { ok: true, tower };
  }

  upgradeTower(towerId, branchId = null, { free = false } = {}) {
    const tower = this.towers.find((t) => t.id === towerId && t.hp > 0);
    if (!tower) return { ok: false, reason: '目标设备不存在' };
    if (tower.level >= 2) return { ok: false, reason: '该设备已达最高等级' };

    const spec = TOWER_SPECS[tower.type];
    let costCompute = 0;
    let costIntel = 0;
    let upgradeName = '';

    if (spec.upgrade.type === 'single') {
      costCompute = spec.upgrade.costCompute;
      costIntel = spec.upgrade.costIntel || 0;
      upgradeName = spec.upgrade.name;
    } else {
      const b = spec.upgrade.branches[branchId];
      if (!b) return { ok: false, reason: '请选择一个升级分支' };
      costCompute = b.costCompute;
      costIntel = b.costIntel || 0;
      upgradeName = b.name;
    }

    if (!free) {
      if (this.compute < costCompute) {
        this.emit('action_rejected', { reason: `算力不足（升级需要 ${costCompute}）` });
        return { ok: false, reason: '算力不足' };
      }
      if (this.intel < costIntel) {
        this.emit('action_rejected', { reason: `情报不足（分支升级需要 ${costIntel}）` });
        return { ok: false, reason: '情报不足' };
      }
      this.compute -= costCompute;
      this.intel -= costIntel;
    }

    const oldMax = tower.maxHp;
    tower.level = 2;
    tower.branch = branchId;
    tower.totalComputeSpent += costCompute;

    const newStats = this.getEffectiveTowerStats(tower);
    tower.maxHp = newStats.maxHp;
    tower.hp = Math.min(tower.maxHp, tower.hp + Math.max(80, newStats.maxHp - oldMax));

    this.emit('tower_upgraded', { tower, upgradeName });
    return { ok: true, tower };
  }

  activateSkill(towerId) {
    const tower = this.towers.find((t) => t.id === towerId && t.hp > 0);
    if (!tower) return { ok: false, reason: '目标不存在' };
    const spec = TOWER_SPECS[tower.type];
    if (!spec.skill) return { ok: false, reason: '该设备无主动技能' };
    if (tower.encryptedTimer > 0) {
      this.emit('action_rejected', { reason: '设备处于加密锁定状态，无法释放技能！' });
      return { ok: false, reason: '已加密' };
    }
    if (tower.skillCd > 0.05) {
      this.emit('action_rejected', { reason: `技能冷却中（剩余 ${tower.skillCd.toFixed(1)}s）` });
      return { ok: false, reason: '冷却中' };
    }

    const stats = this.getEffectiveTowerStats(tower);
    tower.skillCd = spec.skill.cooldown;
    tower.skillActiveTimer = spec.skill.duration;
    this.stats.skillsUsed++;

    if (tower.type === 'firewall') {
      tower.shield = Math.max(tower.shield, spec.skill.shieldAmount);
      tower.shieldTimer = spec.skill.duration;
    } else if (tower.type === 'honeypot') {
      const rad = stats.skillRadius || spec.skill.radius;
      const hitEnemies = [];
      for (const en of this.enemies) {
        if (en.dead || en.flying) continue;
        if (Math.hypot(en.gx - tower.x, en.gy - tower.y) <= rad) {
          en.entrappedTimer = Math.max(en.entrappedTimer, spec.skill.duration);
          if (tower.branch === 'trap') {
            en.vulnTimer = Math.max(en.vulnTimer, spec.skill.duration + 1.5);
            en.vulnMult = Math.max(en.vulnMult, 1 + (stats.vulnBonus || 0.3));
          }
          this.damageEnemy(en, spec.skill.damage, { sourceTower: tower, isAoE: true });
          hitEnemies.push(en.id);
        }
      }
      this.emit('skill_honeypot_entrap', { x: tower.x, y: tower.y, radius: rad, hitCount: hitEnemies.length });
    } else if (tower.type === 'sandbox') {
      const rad = spec.skill.radius;
      for (const en of this.enemies) {
        if (en.dead) continue;
        if (Math.hypot(en.gx - tower.x, en.gy - tower.y) <= rad) {
          this.revealEnemy(en, 'sandbox_skill');
          if (!en.flying) {
            // Extra shield break damage
            if (en.shield > 0) {
              const extra = spec.skill.damage * (spec.skill.shieldDamageMult - 1);
              en.shield = Math.max(0, en.shield - extra);
            }
            this.damageEnemy(en, spec.skill.damage, { sourceTower: tower, isAoE: true });
          }
        }
      }
      this.emit('skill_sandbox_scan', { x: tower.x, y: tower.y, radius: rad });
    } else if (tower.type === 'repair') {
      const rad = stats.range;
      const shieldAmt = stats.skillShield || spec.skill.shieldAmount;
      const burstHeal = stats.skillBurstHeal || spec.skill.burstHeal;
      const affected = [];
      for (const ally of this.towers) {
        if (ally.hp <= 0) continue;
        if (Math.hypot(ally.x - tower.x, ally.y - tower.y) <= rad) {
          const wasEnc = ally.encryptedTimer > 0;
          ally.encryptedTimer = 0;
          const healed = Math.min(ally.maxHp - ally.hp, burstHeal);
          ally.hp += healed;
          this.stats.healingDone += healed;
          ally.shield = Math.max(ally.shield, shieldAmt);
          ally.shieldTimer = spec.skill.duration;
          ally.animHeal = 1.0;
          affected.push({ id: ally.id, x: ally.x, y: ally.y, cleansed: wasEnc });
        }
      }
      this.emit('skill_repair_failover', { x: tower.x, y: tower.y, radius: rad, affected });
    }

    this.emit('tower_skill', { tower, skillName: spec.skill.name });
    return { ok: true };
  }

  withdrawTower(towerId) {
    const idx = this.towers.findIndex((t) => t.id === towerId && t.hp > 0);
    if (idx === -1) return { ok: false };
    const tower = this.towers[idx];
    const refund = Math.round(tower.totalComputeSpent * WITHDRAW_COMPUTE_REFUND);
    this.compute += refund;
    this.releaseBlockedByTower(tower.id);
    this.towers.splice(idx, 1);

    this.emit('tower_withdrawn', { tower, refund });
    if (tower.onNode) {
      this.onNodeOpened(tower.x, tower.y, 'withdraw');
    }
    return { ok: true, refund };
  }

  useItem(itemId, x, y, { free = false } = {}) {
    const spec = ITEM_SPECS[itemId];
    if (!free) {
      const check = this.previewItemUse(itemId, x, y);
      if (!check.valid) {
        this.emit('action_rejected', {
          reason: check.reason,
          sealed: check.sealed,
          sealedEntries: check.sealedEntries,
          sealedEnemies: check.sealedEnemies,
          x,
          y,
        });
        return { ok: false, reason: check.reason };
      }
      if (spec.costType === 'intel') this.intel -= spec.cost;
      else this.compute -= spec.cost;
    }

    this.itemCooldowns[itemId] = spec.cooldown;
    this.stats.itemsUsed++;

    if (itemId === 'isolator') {
      const tile = this.getTile(x, y);
      const iso = {
        id: this.nextEntityId++,
        x,
        y,
        hp: spec.hp,
        maxHp: spec.hp,
        remaining: spec.duration,
        maxDuration: spec.duration,
        animHit: 0,
      };
      this.isolators.push(iso);
      this.emit('item_used', { itemId, x, y });
      this.emit('node_isolated', { x, y, by: 'isolator', nodeId: tile.nodeId, nodeName: tile.label });
      this.recomputeRoutes('isolator_deployed');
      return { ok: true, isolator: iso };
    }

    if (itemId === 'downgrade') {
      const tilesArr = this.getDowngradeTiles(x, y);
      const tilesSet = new Set(tilesArr.map((t) => tileKey(t.x, t.y)));
      const zone = {
        id: this.nextEntityId++,
        cx: x,
        cy: y,
        radius: spec.radius,
        tiles: tilesSet,
        tilesArr,
        remaining: spec.duration,
        maxDuration: spec.duration,
      };
      this.downgradedZones.push(zone);
      // Immediately reveal disguised/stealth enemies inside the zone!
      for (const en of this.enemies) {
        if (en.dead || en.flying) continue;
        if (tilesSet.has(tileKey(Math.round(en.gx), Math.round(en.gy)))) {
          this.revealEnemy(en, 'protocol_downgrade');
        }
      }
      this.emit('item_used', { itemId, x, y, tiles: tilesArr });
      this.recomputeRoutes('protocol_downgrade');
      return { ok: true, zone };
    }

    if (itemId === 'restore') {
      const tower = this.getTowerAt(x, y);
      if (!tower) return { ok: false };
      const healAmt = Math.max(spec.minHeal, Math.round(tower.maxHp * spec.healRatio));
      const actual = Math.min(tower.maxHp - tower.hp, healAmt);
      tower.hp += actual;
      this.stats.healingDone += actual;
      const cleansed = tower.encryptedTimer > 0;
      tower.encryptedTimer = 0;
      tower.animHeal = 1.0;
      this.emit('item_used', { itemId, x, y, towerId: tower.id, healed: actual, cleansed });
      return { ok: true, healed: actual, cleansed };
    }

    return { ok: false };
  }

  onNodeOpened(x, y, reason) {
    const key = tileKey(x, y);
    const tile = this.getTile(x, y);
    this.nodeCooldowns.set(key, NODE_REISOLATE_COOLDOWN);
    this.emit('node_bypass_open', { x, y, reason, nodeId: tile?.nodeId, nodeName: tile?.label });
    this.recomputeRoutes(`node_open_${reason}`);
  }

  // ==================== WAVE CONTROL ====================

  startNextWave() {
    if (this.status !== 'playing') return false;
    if (this.waveIndex + 1 >= this.map.waves.length) return false;
    if (this.waveActive) return false;

    this.waveIndex++;
    this.waveActive = true;
    this.waveElapsed = 0;
    this.waveIntelFromNodes = 0;

    const wave = this.map.waves[this.waveIndex];
    this.spawnQueue = [];
    for (const grp of wave.groups) {
      for (let i = 0; i < grp.count; i++) {
        this.spawnQueue.push({
          time: grp.delay + i * grp.interval,
          entryId: grp.entry,
          type: grp.type,
        });
      }
    }
    this.spawnQueue.sort((a, b) => a.time - b.time);

    this.emit('wave_started', {
      waveIndex: this.waveIndex,
      waveNumber: this.waveIndex + 1,
      totalWaves: this.map.waves.length,
      name: wave.name,
      isBossWave: !!wave.isBossWave,
      isSurgeWave: !!wave.isSurgeWave,
      tip: wave.tip || null,
    });
    return true;
  }

  getNextWaveForecast() {
    const idx = this.waveActive ? this.waveIndex : this.waveIndex + 1;
    if (idx < 0 || idx >= this.map.waves.length) return null;
    const wave = this.map.waves[idx];
    const byEntry = {};
    for (const e of this.map.entries) {
      byEntry[e.id] = { entry: e, counts: {} };
    }
    for (const g of wave.groups) {
      if (!byEntry[g.entry]) continue;
      byEntry[g.entry].counts[g.type] = (byEntry[g.entry].counts[g.type] || 0) + g.count;
    }
    return {
      waveNumber: idx + 1,
      active: this.waveActive,
      name: wave.name,
      isBossWave: !!wave.isBossWave,
      isSurgeWave: !!wave.isSurgeWave,
      tip: wave.tip || '',
      byEntry,
    };
  }

  spawnEnemy(type, entryId, overrides = {}) {
    const spec = ENEMY_SPECS[type];
    const entry = this.map.entries.find((e) => e.id === entryId) || this.map.entries[0];
    const gx = overrides.gx !== undefined ? overrides.gx : entry.x;
    const gy = overrides.gy !== undefined ? overrides.gy : entry.y;

    // For flying units, pick closest exit as straight-line flight target
    let flyTarget = null;
    if (spec.flying) {
      let bestEx = this.map.exits[0];
      let bestD = Infinity;
      for (const ex of this.map.exits) {
        const d = Math.hypot(ex.x - gx, ex.y - gy);
        if (d < bestD) {
          bestD = d;
          bestEx = ex;
        }
      }
      flyTarget = { x: bestEx.x, y: bestEx.y, exitId: bestEx.id };
    }

    const hpScale = overrides.hpScale || 1.0;
    const maxHp = Math.round(spec.maxHp * hpScale);

    const enemy = {
      id: this.nextEntityId++,
      type,
      entryId,
      gx,
      gy,
      altitude: spec.flying ? 2.55 : 0,
      flying: !!spec.flying,
      flyTarget,
      isBoss: !!spec.isBoss,
      isClone: !!overrides.isClone,
      hasReplicated: !!overrides.isClone,
      hp: overrides.hp !== undefined ? overrides.hp : maxHp,
      maxHp,
      shield: overrides.shield || 0,
      maxShield: overrides.shield || 0,
      speed: spec.speed,
      atk: spec.atk,
      attackInterval: spec.attackInterval,
      attackCd: 0.4,
      blockWeight: spec.blockWeight,
      armor: 0,
      disguised: overrides.disguised !== undefined ? overrides.disguised : !!spec.disguisedStart,
      stealth: type === 'boss_zheying' ? true : false,
      revealGraceTimer: 0,
      slowFactor: 1,
      slowTimer: 0,
      entrappedTimer: 0,
      vulnMult: 1,
      vulnTimer: 0,
      blockedByTowerId: null,
      seekNodeKey: null,
      overridePath: null,
      nextTile: null,
      facingAngle: 0,
      walkPhase: this.rng.range(0, Math.PI * 2),
      animAttack: 0,
      animHit: 0,
      dead: false,
      // Special unit timers
      packagerCd: 2.2,
      bossPhase: 1,
      bossSkillCd: 4.5,
      bossSubCd: 6.0,
    };

    if (!enemy.flying) {
      const nxt = this.flow.nextStep[Math.round(gy)]?.[Math.round(gx)];
      if (nxt) enemy.nextTile = { x: nxt.x, y: nxt.y };
    }

    this.enemies.push(enemy);

    if (!this.seenEnemies.has(type)) {
      this.seenEnemies.add(type);
      this.emit('new_enemy_spotted', { type, name: spec.name, isBoss: !!spec.isBoss, shortDesc: spec.shortDesc });
    }
    if (spec.isBoss) {
      this.emit('boss_spawned', { enemy, spec });
    }
    return enemy;
  }

  // ==================== MAIN SIMULATION TICK ====================

  step(dt) {
    if (this.status !== 'playing' || dt <= 0) return;
    this.simTime += dt;

    // 1. Update cooldowns & timers
    for (const k of Object.keys(this.itemCooldowns)) {
      if (this.itemCooldowns[k] > 0) this.itemCooldowns[k] = Math.max(0, this.itemCooldowns[k] - dt);
    }
    for (const [k, rem] of this.nodeCooldowns.entries()) {
      if (rem - dt <= 0) this.nodeCooldowns.delete(k);
      else this.nodeCooldowns.set(k, rem - dt);
    }

    // 2. Update temporary terrain effects (Emergency Isolators, Protocol Downgrades, Boss Blocks, Boss Warnings)
    this.updateTemporaryZones(dt);

    // 3. Wave management & passive resources
    this.updateWavesAndResources(dt);

    // 4. Update towers (blocking assignment, attacks, healing, self-regen, animations)
    this.updateTowers(dt);

    // 5. Update enemies (movement, replication, flood pack node bashing, ransomware, packager, bosses)
    this.updateEnemies(dt);

    // 6. Update projectiles
    this.updateProjectiles(dt);

    // 7. Prune dead enemies & check win/loss
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.towers = this.towers.filter((t) => t.hp > 0);
    this.isolators = this.isolators.filter((iso) => iso.hp > 0 && iso.remaining > 0);

    if (this.integrity <= 0 && this.status === 'playing') {
      this.integrity = 0;
      this.status = 'defeat';
      this.emit('game_over', { victory: false, stats: this.getReportStats() });
    }
  }

  updateTemporaryZones(dt) {
    let routeDirty = false;
    let routeReason = '';

    // Emergency Isolators
    for (const iso of this.isolators) {
      iso.remaining -= dt;
      iso.animHit = Math.max(0, iso.animHit - dt * 3.5);
      if (iso.remaining <= 0 || iso.hp <= 0) {
        const reason = iso.hp <= 0 ? 'destroyed' : 'expired';
        iso.remaining = 0;
        this.onNodeOpened(iso.x, iso.y, reason);
      }
    }

    // Protocol Downgrade zones
    for (let i = this.downgradedZones.length - 1; i >= 0; i--) {
      const z = this.downgradedZones[i];
      z.remaining -= dt;
      if (z.remaining <= 0) {
        this.downgradedZones.splice(i, 1);
        routeDirty = true;
        routeReason = 'downgrade_expired';
      }
    }

    // Boss Blocked Tiles (Blackhole / Ops Ring Lockdown)
    for (const [key, info] of this.blockedTiles.entries()) {
      info.remaining -= dt;
      if (info.remaining <= 0) {
        this.blockedTiles.delete(key);
        routeDirty = true;
        routeReason = `${info.kind}_expired`;
      }
    }

    // Boss Warnings resolving into actions!
    for (let i = this.bossWarnings.length - 1; i >= 0; i--) {
      const w = this.bossWarnings[i];
      w.remaining -= dt;
      if (w.remaining <= 0) {
        this.bossWarnings.splice(i, 1);
        this.resolveBossWarning(w);
      }
    }

    if (routeDirty) {
      this.recomputeRoutes(routeReason);
    }
  }

  resolveBossWarning(w) {
    const boss = this.enemies.find((e) => e.id === w.bossId && !e.dead);
    if (!boss) return;

    if (w.kind === 'flood_surge') {
      const { x, y } = w.tiles[0];
      const iso = this.getIsolatorAt(x, y);
      if (iso) {
        iso.hp = 0;
        iso.remaining = 0;
        this.emit('boss_impact', { kind: 'flood_surge', x, y, destroyedIsolator: true });
        this.onNodeOpened(x, y, 'boss_surge');
        return;
      }
      const tower = this.getTowerAt(x, y);
      if (tower) {
        this.damageTower(tower, 340, boss, { isSurge: true });
      }
      this.emit('boss_impact', { kind: 'flood_surge', x, y });
    } else if (w.kind === 'blackhole' || w.kind === 'ops_lock') {
      // Never lock a tile currently occupied by a player tower, and verify connectivity!
      w.tiles = w.tiles.filter((t) => !this.getTowerAt(t.x, t.y));
      if (w.tiles.length === 0) return;
      const extraBlocked = new Set(w.tiles.map((t) => tileKey(t.x, t.y)));
      const conn = validateConnectivity(this.map, this.getDynamicRoutingState(), { extraBlocked }, this.enemies);
      if (!conn.ok) {
        // Fallback: try individual tiles that remain safe
        const safe = [];
        for (const t of w.tiles) {
          const single = new Set([tileKey(t.x, t.y)]);
          if (validateConnectivity(this.map, this.getDynamicRoutingState(), { extraBlocked: single }, this.enemies).ok) {
            safe.push(t);
          }
        }
        if (safe.length === 0) return;
        w.tiles = safe;
      }
      const dur = w.kind === 'blackhole' ? 10.0 : 12.0;
      for (const t of w.tiles) {
        this.blockedTiles.set(tileKey(t.x, t.y), { kind: w.kind, remaining: dur, maxDuration: dur });
      }
      if (w.kind === 'ops_lock') {
        // Zheying Phase 3 sabotage pulse damages nearby towers when locking the Ops Ring!
        for (const tw of this.towers) {
          if (tw.hp <= 0) continue;
          if (Math.hypot(tw.x - boss.gx, tw.y - boss.gy) <= 3.4) {
            this.damageTower(tw, 55, boss, { isSurge: true });
          }
        }
      }
      this.emit('boss_terrain_changed', { kind: w.kind, tiles: w.tiles, duration: dur });
      this.recomputeRoutes(w.kind);
    }
  }

  updateWavesAndResources(dt) {
    if (this.demoMode) {
      // Demo mode still grants modest trickle so HUD numbers feel alive
      this.compute += 1.8 * dt;
      return;
    }

    if (!this.waveActive) {
      this.nextWaveTimer -= dt;
      if (this.nextWaveTimer <= 0) {
        this.startNextWave();
      }
      return;
    }

    this.waveElapsed += dt;
    // Passive Compute trickle during active combat
    const cGain = 2.0 * dt;
    this.compute += cGain;
    this.stats.computeEarned += cGain;

    // Spawn scheduled enemies
    while (this.spawnQueue.length > 0 && this.spawnQueue[0].time <= this.waveElapsed) {
      const item = this.spawnQueue.shift();
      this.spawnEnemy(item.type, item.entryId);
    }

    // Passive Intel from holding isolated nodes with player towers (NOT emergency isolators!) during combat
    const hasAliveEnemies = this.enemies.some((e) => !e.dead);
    if (hasAliveEnemies && this.waveIntelFromNodes < 18) {
      for (const t of this.towers) {
        if (t.hp <= 0 || !t.onNode) continue;
        if (this.waveIntelFromNodes >= 18) break;
        const stats = this.getEffectiveTowerStats(t);
        const rate = 1.0 * (stats.intelBonusMult || 1);
        const gain = Math.min(18 - this.waveIntelFromNodes, rate * dt);
        if (gain > 0) {
          this.intel += gain;
          this.waveIntelFromNodes += gain;
          this.stats.intelEarned += gain;
          t.intelHarvestAcc = (t.intelHarvestAcc || 0) + gain;
          if (t.intelHarvestAcc >= 3.0) {
            t.intelHarvestAcc -= 3.0;
            this.emit('node_intel_harvest', { x: t.x, y: t.y, amount: 3 });
          }
        }
      }
    }

    // Check wave completion
    if (this.spawnQueue.length === 0 && !hasAliveEnemies) {
      const wave = this.map.waves[this.waveIndex];
      const intelReward = Math.max(6, Math.round((wave.intelBonus || 12) * 0.55));
      const computeReward = 32 + this.waveIndex * 3;
      this.intel += intelReward;
      this.compute += computeReward;
      this.stats.intelEarned += intelReward;
      this.stats.computeEarned += computeReward;
      this.waveActive = false;

      this.emit('wave_cleared', {
        waveNumber: this.waveIndex + 1,
        intelReward,
        computeReward,
      });

      if (this.waveIndex + 1 >= this.map.waves.length) {
        this.status = 'victory';
        this.emit('game_over', { victory: true, stats: this.getReportStats() });
      } else {
        this.nextWaveTimer = 9.0;
      }
    }
  }

  // ==================== TOWERS UPDATE ====================

  releaseBlockedByTower(towerId) {
    for (const en of this.enemies) {
      if (en.blockedByTowerId === towerId) {
        en.blockedByTowerId = null;
      }
    }
  }

  updateTowers(dt) {
    // Pass 1: clean stale block references & compute current block loads
    const blockLoads = new Map();
    for (const t of this.towers) {
      blockLoads.set(t.id, 0);
      t.animAttack = Math.max(0, t.animAttack - dt * 4.0);
      t.animHit = Math.max(0, t.animHit - dt * 3.5);
      t.animHeal = Math.max(0, t.animHeal - dt * 2.2);
      if (t.skillCd > 0) t.skillCd = Math.max(0, t.skillCd - dt);
      if (t.skillActiveTimer > 0) t.skillActiveTimer = Math.max(0, t.skillActiveTimer - dt);
      if (t.encryptedTimer > 0) t.encryptedTimer = Math.max(0, t.encryptedTimer - dt);
      if (t.disruptTimer > 0) t.disruptTimer = Math.max(0, t.disruptTimer - dt);
      if (t.shieldTimer > 0) {
        t.shieldTimer -= dt;
        if (t.shieldTimer <= 0) {
          t.shield = 0;
        }
      }
    }

    for (const en of this.enemies) {
      if (en.dead || en.flying) continue;
      if (en.blockedByTowerId != null) {
        const blocker = this.towers.find((t) => t.id === en.blockedByTowerId && t.hp > 0);
        const maxHold = blocker && blocker.onNode ? 1.48 : 0.95;
        if (!blocker || Math.hypot(en.gx - blocker.x, en.gy - blocker.y) > maxHold) {
          en.blockedByTowerId = null;
        } else {
          blockLoads.set(blocker.id, (blockLoads.get(blocker.id) || 0) + en.blockWeight);
        }
      }
    }

    // Pass 2: assign blocking on link towers AND adjacent-link interception for Firewall on Switch Nodes! (Rule 2.4.1 & 2.8.3)
    for (const t of this.towers) {
      if (t.hp <= 0) continue;
      if (t.onNode && t.type !== 'firewall') continue;
      const stats = this.getEffectiveTowerStats(t);
      if (stats.blockCap <= 0) continue;

      let used = blockLoads.get(t.id) || 0;
      if (used >= stats.blockCap) continue;

      for (const en of this.enemies) {
        if (en.dead || en.flying || en.blockedByTowerId != null) continue;
        const dx = Math.abs(en.gx - t.x);
        const dy = Math.abs(en.gy - t.y);
        const dist = Math.hypot(dx, dy);
        const canIntercept = t.onNode
          ? dist <= 1.28 && (dx <= 0.55 || dy <= 0.55)
          : dist <= 0.62;
        if (canIntercept) {
          if (used + en.blockWeight <= stats.blockCap) {
            en.blockedByTowerId = t.id;
            used += en.blockWeight;
            blockLoads.set(t.id, used);
            this.revealEnemy(en, 'blocked');
            if (used >= stats.blockCap) break;
          }
        }
      }
    }

    // Pass 3: execute each tower's detection, regen, attack, or healing
    for (const t of this.towers) {
      if (t.hp <= 0) continue;
      const stats = this.getEffectiveTowerStats(t);

      // Honeypot Mirror Decoy passive self-shield regen
      if (t.type === 'honeypot' && t.branch === 'decoy' && stats.shieldRegen > 0 && t.encryptedTimer <= 0) {
        t.shield = Math.min(stats.maxSelfShield, t.shield + stats.shieldRegen * dt);
        t.shieldTimer = Math.max(t.shieldTimer, 1.0);
      }

      // Honeypot Counter-Trap passive DoT on entrapped or attacking nearby enemies
      if (t.type === 'honeypot' && t.branch === 'trap' && t.encryptedTimer <= 0) {
        for (const en of this.enemies) {
          if (en.dead || en.flying) continue;
          const dist = Math.hypot(en.gx - t.x, en.gy - t.y);
          if (en.blockedByTowerId === t.id || (en.entrappedTimer > 0 && dist <= 3.1)) {
            this.damageEnemy(en, stats.trapDps * dt, { sourceTower: t, isAoE: true, quiet: true });
          }
        }
      }

      // Sandbox continuous detection (halted if encrypted)
      if (t.type === 'sandbox' && t.encryptedTimer <= 0) {
        for (const en of this.enemies) {
          if (en.dead) continue;
          if ((en.disguised || en.stealth) && Math.hypot(en.gx - t.x, en.gy - t.y) <= stats.detectRange) {
            this.revealEnemy(en, 'sandbox');
          }
        }
      }

      // Encrypted towers cannot attack or heal!
      if (t.encryptedTimer > 0) {
        t.healTargetIds = [];
        t.targetEnemyId = null;
        continue;
      }

      const speedFactor =
        (t.type === 'interceptor' && t.skillActiveTimer > 0 ? TOWER_SPECS.interceptor.skill.atkSpeedMult : 1.0) *
        (t.disruptTimer > 0 ? 0.65 : 1.0);

      t.attackCd -= dt * speedFactor;
      if (t.attackCd > 0) continue;

      // REPAIR DAEMON: heal lowest HP-ratio OTHER damaged allies in range (Rule 2.4.6)
      if (t.type === 'repair') {
        const candidates = this.towers
          .filter((ally) => ally.id !== t.id && ally.hp > 0 && ally.hp < ally.maxHp - 0.5 && Math.hypot(ally.x - t.x, ally.y - t.y) <= stats.range)
          .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);

        if (candidates.length > 0) {
          const picked = candidates.slice(0, stats.healTargets);
          t.healTargetIds = picked.map((p) => p.id);
          for (const ally of picked) {
            const actual = Math.min(ally.maxHp - ally.hp, stats.healAmount);
            ally.hp += actual;
            ally.animHeal = 0.8;
            this.stats.healingDone += actual;
            this.emit('heal_beam', { fromX: t.x, fromY: t.y, toX: ally.x, toY: ally.y, amount: actual });
          }
          t.animAttack = 0.7;
          t.attackCd = stats.attackInterval;
        } else {
          t.healTargetIds = [];
          t.attackCd = 0.15;
        }
        continue;
      }

      // AIR-GAPPER: does not attack
      if (t.type === 'airgap') continue;

      // SANDBOX: AoE pulse against all ground enemies in range
      if (t.type === 'sandbox') {
        const hits = this.enemies.filter(
          (en) => !en.dead && !en.flying && Math.hypot(en.gx - t.x, en.gy - t.y) <= stats.range
        );
        if (hits.length > 0) {
          for (const en of hits) {
            this.revealEnemy(en, 'sandbox');
            if (stats.vulnBonus > 0) {
              en.vulnTimer = Math.max(en.vulnTimer, stats.vulnDuration);
              en.vulnMult = Math.max(en.vulnMult, 1 + stats.vulnBonus);
            }
            this.damageEnemy(en, stats.atk, { sourceTower: t, isAoE: true });
          }
          t.animAttack = 1.0;
          t.attackCd = stats.attackInterval;
          this.emit('sandbox_pulse', { x: t.x, y: t.y, radius: stats.range, level: t.level });
        } else {
          t.attackCd = 0.12;
        }
        continue;
      }

      // INTERCEPTOR: directional ranged single-target (ground & air), targets closest to exit
      if (t.type === 'interceptor') {
        const target = this.pickBestTargetForInterceptor(t, stats);
        if (target) {
          t.targetEnemyId = target.id;
          t.turretAngle = Math.atan2(target.gx - t.x, target.gy - t.y);
          t.animAttack = 1.0;
          t.attackCd = stats.attackInterval;

          let dmg = stats.atk;
          if (target.flying && stats.airBonus > 1) dmg = Math.round(dmg * stats.airBonus);

          if (t.branch === 'pierce') {
            // Instant hyper-velocity piercing rail beam hitting primary + up to 3 behind!
            const dx = target.gx - t.x;
            const dy = target.gy - t.y;
            const len = Math.max(0.001, Math.hypot(dx, dy));
            const ux = dx / len;
            const uy = dy / len;
            const beamLen = Math.max(len + 1.4, stats.rangeForward);
            const endX = t.x + ux * beamLen;
            const endY = t.y + uy * beamLen;

            this.damageEnemy(target, dmg, { sourceTower: t });
            let pierced = 0;
            for (const other of this.enemies) {
              if (other.dead || other.id === target.id || other.stealth) continue;
              if (pierced >= stats.pierceCount) break;
              const ox = other.gx - t.x;
              const oy = other.gy - t.y;
              const proj = ox * ux + oy * uy;
              if (proj > len * 0.4 && proj <= beamLen + 0.4) {
                const perp = Math.abs(ox * -uy + oy * ux);
                if (perp <= 0.65) {
                  const pDmg = other.flying && stats.airBonus > 1 ? Math.round(dmg * 0.82 * stats.airBonus) : Math.round(dmg * 0.82);
                  this.damageEnemy(other, pDmg, { sourceTower: t, isAoE: true });
                  pierced++;
                }
              }
            }
            this.emit('rail_beam', {
              fromX: t.x,
              fromY: t.y,
              fromAlt: 1.25,
              toX: endX,
              toY: endY,
              toAlt: target.flying ? target.altitude : 0.45,
            });
          } else {
            // Standard or Suppressor projectile
            this.projectiles.push({
              id: this.nextEntityId++,
              kind: t.branch === 'suppress' ? 'suppress' : 'interceptor',
              x: t.x,
              y: t.y,
              alt: 1.2,
              targetId: target.id,
              speed: t.branch === 'suppress' ? 17 : 15,
              dmg,
              slowFactor: stats.slowFactor,
              slowDuration: stats.slowDuration,
              sourceTowerId: t.id,
            });
            this.emit('tower_fire', { towerType: 'interceptor', branch: t.branch, x: t.x, y: t.y });
          }
        } else {
          t.targetEnemyId = null;
          t.attackCd = 0.1;
        }
        continue;
      }

      // FIREWALL & HONEYPOT: melee attack on blocked enemies (or adjacent enemies if Firewall is on a Node!)
      const range = t.onNode ? 1.65 : stats.range;
      const meleeCandidates = this.enemies
        .filter((en) => {
          if (en.dead || en.flying) return false;
          if (en.blockedByTowerId === t.id) return true;
          return Math.hypot(en.gx - t.x, en.gy - t.y) <= range;
        })
        .sort((a, b) => {
          // Prioritize enemies bashing this tower / blocked by it, then closest to exit
          const aBlock = a.blockedByTowerId === t.id ? 0 : 1;
          const bBlock = b.blockedByTowerId === t.id ? 0 : 1;
          if (aBlock !== bBlock) return aBlock - bBlock;
          return this.getEnemyDistToExit(a) - this.getEnemyDistToExit(b);
        });

      if (meleeCandidates.length > 0) {
        const target = meleeCandidates[0];
        t.targetEnemyId = target.id;
        t.turretAngle = Math.atan2(target.gx - t.x, target.gy - t.y);
        t.animAttack = 1.0;
        t.attackCd = stats.attackInterval;
        t.hitCounter++;

        this.damageEnemy(target, stats.atk, { sourceTower: t });
        this.emit('melee_strike', { fromX: t.x, fromY: t.y, toX: target.gx, toY: target.gy, towerType: t.type });

        // Firewall Lv2 AoE shockwave every 3rd attack (damages, briefly staggers/slows & weakens nearby ground enemies!)
        if (t.type === 'firewall' && stats.shockwaveEvery > 0 && t.hitCounter % stats.shockwaveEvery === 0) {
          for (const other of this.enemies) {
            if (other.dead || other.flying) continue;
            if (Math.hypot(other.gx - t.x, other.gy - t.y) <= 1.85) {
              if (other.id !== target.id) {
                this.damageEnemy(other, Math.round(stats.atk * 0.7), { sourceTower: t, isAoE: true });
              }
              other.slowFactor = Math.min(other.slowFactor, 0.55);
              other.slowTimer = Math.max(other.slowTimer, 1.4);
              other.vulnMult = Math.max(other.vulnMult, 1.15);
              other.vulnTimer = Math.max(other.vulnTimer, 2.0);
            }
          }
          this.emit('firewall_shockwave', { x: t.x, y: t.y });
        }
      } else {
        t.targetEnemyId = null;
        t.attackCd = 0.12;
      }
    }
  }

  pickBestTargetForInterceptor(tower, stats) {
    const dv = DIRECTION_VECTORS[tower.dir] || DIRECTION_VECTORS.S;
    const fx = dv.dx;
    const fy = dv.dz;
    const rx = -fy;
    const ry = fx;

    let best = null;
    let bestScore = Infinity;

    for (const en of this.enemies) {
      if (en.dead) continue;
      // Single-target ranged cannot actively lock onto disguised Trojans or cloaked Boss!
      if (en.disguised || en.stealth) continue;

      const ox = en.gx - tower.x;
      const oy = en.gy - tower.y;
      const fwd = ox * fx + oy * fy;
      const side = Math.abs(ox * rx + oy * ry);

      if (fwd >= -0.35 && fwd <= stats.rangeForward + 0.35 && side <= stats.rangeSide + 0.35) {
        const distExit = this.getEnemyDistToExit(en);
        if (distExit < bestScore) {
          bestScore = distExit;
          best = en;
        }
      }
    }
    return best;
  }

  getEnemyDistToExit(en) {
    if (en.flying && en.flyTarget) {
      return Math.hypot(en.flyTarget.x - en.gx, en.flyTarget.y - en.gy);
    }
    const gx = Math.max(0, Math.min(this.map.width - 1, Math.round(en.gx)));
    const gy = Math.max(0, Math.min(this.map.height - 1, Math.round(en.gy)));
    const d = this.flow.dist[gy]?.[gx];
    return Number.isFinite(d) ? d : 999;
  }

  // ==================== ENEMIES & BOSSES UPDATE ====================

  revealEnemy(en, source) {
    if (en.disguised) {
      en.disguised = false;
      this.emit('enemy_revealed', { enemyId: en.id, x: en.gx, y: en.gy, source, type: en.type });
    }
    if (en.stealth) {
      en.stealth = false;
      en.revealGraceTimer = 3.2;
      this.emit('enemy_revealed', { enemyId: en.id, x: en.gx, y: en.gy, source, type: en.type });
    }
  }

  damageEnemy(en, rawDamage, { sourceTower = null, isAoE = false, quiet = false } = {}) {
    if (en.dead || rawDamage <= 0) return;
    let dmg = rawDamage * (1 - (en.armor || 0)) * (en.vulnTimer > 0 ? en.vulnMult : 1.0);
    if (dmg < 1 && !quiet) dmg = 1;

    if (en.shield > 0) {
      const absorbed = Math.min(en.shield, dmg);
      en.shield -= absorbed;
      dmg -= absorbed;
    }

    if (dmg > 0) {
      en.hp -= dmg;
      this.stats.damageDealt += dmg;
      if (!quiet) en.animHit = 1.0;
    }

    if (en.hp <= 0) {
      en.hp = 0;
      en.dead = true;
      this.onEnemyKilled(en, { isAoE });
    }
  }

  onEnemyKilled(en, { isAoE = false } = {}) {
    const spec = ENEMY_SPECS[en.type];
    this.stats.kills++;
    if (spec.isBoss) this.stats.bossKills++;

    const cGain = en.isClone ? Math.round(spec.rewardCompute * 0.5) : spec.rewardCompute;
    const iGain = spec.rewardIntel || 0;
    this.compute += cGain;
    this.intel += iGain;
    this.stats.computeEarned += cGain;
    this.stats.intelEarned += iGain;

    // Trojan Covert Payload Detonation if killed while STILL disguised!
    if (en.type === 'trojan' && en.disguised) {
      for (const t of this.towers) {
        if (t.hp <= 0) continue;
        if (Math.hypot(t.x - en.gx, t.y - en.gy) <= spec.payloadRadius) {
          this.damageTower(t, spec.payloadDamage, en, { isPayload: true });
        }
      }
      this.emit('trojan_payload_blast', { x: en.gx, y: en.gy, radius: spec.payloadRadius });
    }

    this.emit('enemy_killed', {
      enemyId: en.id,
      type: en.type,
      x: en.gx,
      y: en.gy,
      alt: en.altitude,
      isBoss: !!spec.isBoss,
      compute: cGain,
      intel: iGain,
    });
  }

  damageTower(tower, rawDamage, attacker = null, opts = {}) {
    if (!tower || tower.hp <= 0) return;
    const stats = this.getEffectiveTowerStats(tower);
    let reduction = stats.armor || 0;
    if (tower.type === 'airgap' && tower.skillActiveTimer > 0) {
      reduction = Math.min(0.8, reduction + TOWER_SPECS.airgap.skill.damageReduction);
    }

    let dmg = Math.max(1, rawDamage * (1 - reduction));
    if (tower.shield > 0) {
      const absorbed = Math.min(tower.shield, dmg);
      tower.shield -= absorbed;
      dmg -= absorbed;
    }

    if (dmg > 0) {
      tower.hp -= dmg;
    }
    tower.animHit = 1.0;

    // Firewall Active Surge melee reflect
    if (
      attacker &&
      !attacker.dead &&
      !opts.ranged &&
      tower.type === 'firewall' &&
      tower.skillActiveTimer > 0
    ) {
      this.damageEnemy(attacker, rawDamage * TOWER_SPECS.firewall.skill.reflectRatio, { sourceTower: tower });
    }

    // Honeypot Mirror Decoy slows attacker's attack cadence by 35% (interval * ~1.54)
    if (attacker && !attacker.dead && tower.type === 'honeypot' && tower.branch === 'decoy') {
      attacker.attackCd += (attacker.attackInterval || 1.1) * 0.54;
    }

    // Honeypot Counter-Trap retaliates with high-voltage burn + 30% vulnerability mark against any attacker!
    if (attacker && !attacker.dead && tower.type === 'honeypot' && tower.branch === 'trap') {
      attacker.vulnTimer = Math.max(attacker.vulnTimer, 3.0);
      attacker.vulnMult = Math.max(attacker.vulnMult, 1 + (stats.vulnBonus || 0.3));
      this.damageEnemy(attacker, Math.round((stats.trapDps || 38) * 0.85), { sourceTower: tower, isAoE: true });
    }

    this.emit('tower_damaged', {
      towerId: tower.id,
      x: tower.x,
      y: tower.y,
      amount: Math.round(dmg),
      fromX: attacker ? attacker.gx : tower.x,
      fromY: attacker ? attacker.gy : tower.y,
      hpRatio: Math.max(0, tower.hp / tower.maxHp),
      isSurge: !!opts.isSurge,
      ranged: !!opts.ranged,
      isPayload: !!opts.isPayload,
    });

    if (tower.hp <= 0) {
      tower.hp = 0;
      this.stats.towersLost++;
      this.releaseBlockedByTower(tower.id);
      this.emit('tower_destroyed', {
        towerId: tower.id,
        type: tower.type,
        name: TOWER_SPECS[tower.type].name,
        x: tower.x,
        y: tower.y,
        onNode: tower.onNode,
      });
      if (tower.onNode) {
        this.onNodeOpened(tower.x, tower.y, 'destroyed');
      }
    }
  }

  damageIsolator(iso, rawDamage, attacker = null) {
    if (!iso || iso.hp <= 0) return;
    iso.hp -= rawDamage;
    iso.animHit = 1.0;
    this.emit('isolator_damaged', {
      id: iso.id,
      x: iso.x,
      y: iso.y,
      amount: Math.round(rawDamage),
      fromX: attacker ? attacker.gx : iso.x,
      fromY: attacker ? attacker.gy : iso.y,
    });
    if (iso.hp <= 0) {
      iso.hp = 0;
      iso.remaining = 0;
      this.onNodeOpened(iso.x, iso.y, 'destroyed');
    }
  }

  updateEnemies(dt) {
    // Snapshot array length so worms spawned mid-tick don't get double-stepped
    const list = [...this.enemies];
    for (const en of list) {
      if (en.dead) continue;

      en.animAttack = Math.max(0, en.animAttack - dt * 3.5);
      en.animHit = Math.max(0, en.animHit - dt * 4.0);
      if (en.slowTimer > 0) {
        en.slowTimer -= dt;
        if (en.slowTimer <= 0) en.slowFactor = 1;
      }
      if (en.entrappedTimer > 0) en.entrappedTimer = Math.max(0, en.entrappedTimer - dt);
      if (en.vulnTimer > 0) {
        en.vulnTimer -= dt;
        if (en.vulnTimer <= 0) en.vulnMult = 1;
      }
      if (en.revealGraceTimer > 0) {
        en.revealGraceTimer -= dt;
        if (en.revealGraceTimer <= 0 && en.type === 'boss_zheying' && en.bossPhase === 1) {
          en.stealth = true;
        }
      }

      // === FLYING UNIT (伪热点) ===
      if (en.flying) {
        const tx = en.flyTarget.x;
        const ty = en.flyTarget.y;
        const dx = tx - en.gx;
        const dy = ty - en.gy;
        const dist = Math.hypot(dx, dy);
        const stepDist = en.speed * en.slowFactor * dt;
        en.facingAngle = Math.atan2(dx, dy);
        en.walkPhase += dt * 7;
        if (dist <= stepDist + 0.12) {
          this.onEnemyReachExit(en);
        } else {
          en.gx += (dx / dist) * stepDist;
          en.gy += (dy / dist) * stepDist;
        }
        continue;
      }

      // === SPECIAL RANGED/SUPPORT/BOSS ABILITIES ===
      if (en.type === 'ransom') {
        this.updateRansomwareAttack(en, dt);
      } else if (en.type === 'packager') {
        this.updatePackagerShield(en, dt);
      } else if (en.isBoss) {
        this.updateBossAI(en, dt);
      }

      // === BLOCKED MELEE COMBAT ===
      if (en.blockedByTowerId != null) {
        const blocker = this.towers.find((t) => t.id === en.blockedByTowerId && t.hp > 0);
        if (blocker) {
          en.facingAngle = Math.atan2(blocker.x - en.gx, blocker.y - en.gy);
          en.attackCd -= dt;
          if (en.attackCd <= 0 && en.atk > 0) {
            en.attackCd = en.attackInterval;
            en.animAttack = 1.0;
            if (en.type === 'flood' && blocker.onNode) {
              const slamDmg = Math.round(en.atk * ENEMY_SPECS.flood.nodeBonusMult);
              this.damageTower(blocker, slamDmg, en);
              this.emit('node_bashed', { fromX: en.gx, fromY: en.gy, nodeX: blocker.x, nodeY: blocker.y });
            } else {
              this.damageTower(blocker, en.atk, en);
            }
          }
          continue;
        } else {
          en.blockedByTowerId = null;
        }
      }

      // === FLOOD PACK: SEEK & BASH ISOLATED SWITCH NODES ===
      if (en.type === 'flood' && en.entrappedTimer <= 0) {
        if (this.updateFloodPackNodeBash(en, dt)) {
          continue;
        }
      }

      // === ENTRAPPED (HONEYPOT SKILL) ===
      if (en.entrappedTimer > 0) {
        continue;
      }

      // === NORMAL GROUND MOVEMENT ALONG FLOW FIELD ===
      this.moveGroundEnemy(en, dt);
    }
  }

  moveGroundEnemy(en, dt) {
    const curX = Math.max(0, Math.min(this.map.width - 1, Math.round(en.gx)));
    const curY = Math.max(0, Math.min(this.map.height - 1, Math.round(en.gy)));
    const curTile = this.map.grid[curY][curX];
    const curKey = tileKey(curX, curY);

    // Check Exit reached!
    if (curTile.type === 'exit' && Math.hypot(en.gx - curX, en.gy - curY) <= 0.35) {
      this.onEnemyReachExit(en);
      return;
    }

    // Legacy link / Protocol Downgrade effects
    const onLegacy = curTile.type === 'legacy' || this.downgradedTiles.has(curKey);
    if (onLegacy) {
      this.revealEnemy(en, 'legacy_link');
    }

    // Worm Replication on first pass-through Switch Node!
    if (
      en.type === 'worm' &&
      !en.hasReplicated &&
      !en.isClone &&
      curTile.type === 'node' &&
      !this.isolatedNodes.has(curKey) &&
      Math.hypot(en.gx - curX, en.gy - curY) <= 0.35
    ) {
      en.hasReplicated = true;
      const offsetX = (this.rng.next() - 0.5) * 0.28;
      const offsetY = (this.rng.next() - 0.5) * 0.28;
      this.spawnEnemy('worm', en.entryId, {
        gx: en.gx + offsetX,
        gy: en.gy + offsetY,
        isClone: true,
        hpScale: 0.78,
      });
      this.emit('worm_split', { x: curX, y: curY });
    }

    // Determine next waypoint tile
    if (
      !en.nextTile ||
      !getTileTraversal(this.map.grid, en.nextTile.x, en.nextTile.y, this.getDynamicRoutingState(), null).passable
    ) {
      const nxt = this.flow.nextStep[curY]?.[curX];
      if (nxt) en.nextTile = { x: nxt.x, y: nxt.y };
      else return;
    }

    const tx = en.nextTile.x;
    const ty = en.nextTile.y;
    const dx = tx - en.gx;
    const dy = ty - en.gy;
    const dist = Math.hypot(dx, dy);

    const terrainMult = onLegacy ? LEGACY_SPEED_MULT : 1.0;
    const moveSpeed = en.speed * terrainMult * en.slowFactor;
    const stepDist = moveSpeed * dt;

    en.walkPhase += dt * (4.5 + moveSpeed * 2.5);
    if (dist > 0.001) {
      en.facingAngle = Math.atan2(dx, dy);
    }

    if (dist <= stepDist) {
      en.gx = tx;
      en.gy = ty;
      const destTile = this.map.grid[ty]?.[tx];
      if (destTile && destTile.type === 'exit') {
        this.onEnemyReachExit(en);
        return;
      }
      const nxt = this.flow.nextStep[ty]?.[tx];
      en.nextTile = nxt ? { x: nxt.x, y: nxt.y } : null;
    } else {
      en.gx += (dx / dist) * stepDist;
      en.gy += (dy / dist) * stepDist;
    }
  }

  updateFloodPackNodeBash(en, dt) {
    const spec = ENEMY_SPECS.flood;

    // 0. Honeypot decoy aggro lure: a Honeypot within its tauntRange actively pulls nearby Flood Packs away from isolated nodes!
    let luredHp = null;
    let bestHpDist = Infinity;
    for (const t of this.towers) {
      if (t.hp <= 0 || t.type !== 'honeypot') continue;
      const tStats = this.getEffectiveTowerStats(t);
      const dHp = Math.hypot(t.x - en.gx, t.y - en.gy);
      if (dHp <= Math.min(tStats.tauntRange || 3.6, 3.8) && dHp < bestHpDist) {
        bestHpDist = dHp;
        luredHp = t;
      }
    }
    if (luredHp) {
      if (bestHpDist <= 0.92) {
        en.facingAngle = Math.atan2(luredHp.x - en.gx, luredHp.y - en.gy);
        en.attackCd -= dt;
        if (en.attackCd <= 0) {
          en.attackCd = en.attackInterval;
          en.animAttack = 1.0;
          this.damageTower(luredHp, en.atk, en);
        }
        return true;
      }
      const hpKey = `hp:${luredHp.id}`;
      if (!en.overridePath || en.overridePath.length === 0 || en.seekNodeKey !== hpKey) {
        const p = findTilePath(this.map.grid, Math.round(en.gx), Math.round(en.gy), luredHp.x, luredHp.y, this.getDynamicRoutingState());
        if (p && p.length <= 7) {
          en.seekNodeKey = hpKey;
          en.overridePath = p.slice(1);
        } else {
          luredHp = null;
        }
      }
      if (luredHp && en.overridePath && en.overridePath.length > 0) {
        const wp = en.overridePath[0];
        if (!getTileTraversal(this.map.grid, wp.x, wp.y, this.getDynamicRoutingState(), null).passable) {
          en.overridePath = null;
          en.seekNodeKey = null;
        } else {
          const dx = wp.x - en.gx;
          const dy = wp.y - en.gy;
          const dist = Math.hypot(dx, dy);
          const curKey = tileKey(Math.round(en.gx), Math.round(en.gy));
          const curTile = this.getTile(Math.round(en.gx), Math.round(en.gy));
          const onLegacy = (curTile && curTile.type === 'legacy') || this.downgradedTiles.has(curKey);
          const moveSpeed = en.speed * (onLegacy ? LEGACY_SPEED_MULT : 1.0) * en.slowFactor;
          const stepDist = moveSpeed * dt;
          en.walkPhase += dt * 6;
          if (dist > 0.001) en.facingAngle = Math.atan2(dx, dy);
          if (dist <= stepDist) {
            en.gx = wp.x;
            en.gy = wp.y;
            en.overridePath.shift();
          } else {
            en.gx += (dx / dist) * stepDist;
            en.gy += (dy / dist) * stepDist;
          }
          return true;
        }
      }
    }

    // 1. Find nearest isolated node within awareness radius (or keep existing seek target)
    let targetNode = null;
    if (en.seekNodeKey && this.isolatedNodes.has(en.seekNodeKey)) {
      const [nx, ny] = en.seekNodeKey.split(',').map(Number);
      targetNode = { x: nx, y: ny, key: en.seekNodeKey };
    } else {
      en.seekNodeKey = null;
      en.overridePath = null;
      let bestDist = spec.nodeSeekRadius;
      for (const k of this.isolatedNodes) {
        const [nx, ny] = k.split(',').map(Number);
        const d = Math.hypot(nx - en.gx, ny - en.gy);
        if (d <= bestDist) {
          bestDist = d;
          targetNode = { x: nx, y: ny, key: k };
        }
      }
    }

    if (!targetNode) return false;

    // 2. Check if already adjacent to targetNode -> RAM IT!
    const distToNode = Math.hypot(targetNode.x - en.gx, targetNode.y - en.gy);
    if (distToNode <= 1.25) {
      en.seekNodeKey = targetNode.key;
      en.facingAngle = Math.atan2(targetNode.x - en.gx, targetNode.y - en.gy);
      en.attackCd -= dt;
      if (en.attackCd <= 0) {
        en.attackCd = en.attackInterval;
        en.animAttack = 1.0;
        const slamDmg = Math.round(en.atk * spec.nodeBonusMult);
        const tower = this.getTowerAt(targetNode.x, targetNode.y);
        const iso = this.getIsolatorAt(targetNode.x, targetNode.y);
        if (tower) {
          this.damageTower(tower, slamDmg, en);
        } else if (iso) {
          this.damageIsolator(iso, slamDmg, en);
        }
        this.emit('node_bashed', { fromX: en.gx, fromY: en.gy, nodeX: targetNode.x, nodeY: targetNode.y });
      }
      return true;
    }

    // 3. Plot path to best passable adjacent tile of targetNode
    if (!en.overridePath || en.overridePath.length === 0 || en.seekNodeKey !== targetNode.key) {
      const sx = Math.round(en.gx);
      const sy = Math.round(en.gy);
      let bestPath = null;
      for (const d of DIRS4) {
        const ax = targetNode.x + d.dx;
        const ay = targetNode.y + d.dy;
        if (!getTileTraversal(this.map.grid, ax, ay, this.getDynamicRoutingState(), null).passable) continue;
        const p = findTilePath(this.map.grid, sx, sy, ax, ay, this.getDynamicRoutingState());
        if (p && (!bestPath || p.length < bestPath.length)) {
          bestPath = p;
        }
      }
      if (bestPath && bestPath.length <= 9) {
        en.seekNodeKey = targetNode.key;
        en.overridePath = bestPath.slice(1);
      } else {
        return false;
      }
    }

    // 4. Move along overridePath toward the node
    if (en.overridePath && en.overridePath.length > 0) {
      const wp = en.overridePath[0];
      if (!getTileTraversal(this.map.grid, wp.x, wp.y, this.getDynamicRoutingState(), null).passable) {
        en.overridePath = null;
        return false;
      }
      const dx = wp.x - en.gx;
      const dy = wp.y - en.gy;
      const dist = Math.hypot(dx, dy);
      const curKey = tileKey(Math.round(en.gx), Math.round(en.gy));
      const curTile = this.getTile(Math.round(en.gx), Math.round(en.gy));
      const onLegacy = (curTile && curTile.type === 'legacy') || this.downgradedTiles.has(curKey);
      const moveSpeed = en.speed * (onLegacy ? LEGACY_SPEED_MULT : 1.0) * en.slowFactor;
      const stepDist = moveSpeed * dt;
      en.walkPhase += dt * 6;
      if (dist > 0.001) en.facingAngle = Math.atan2(dx, dy);
      if (dist <= stepDist) {
        en.gx = wp.x;
        en.gy = wp.y;
        en.overridePath.shift();
      } else {
        en.gx += (dx / dist) * stepDist;
        en.gy += (dy / dist) * stepDist;
      }
      return true;
    }

    return false;
  }

  updateRansomwareAttack(en, dt) {
    const spec = ENEMY_SPECS.ransom;
    en.attackCd -= dt;
    if (en.attackCd > 0) return;

    // 1. Prioritize Honeypot inside Ransomware range OR inside Honeypot's tauntRange!
    let target = null;
    let bestHoneypotDist = Infinity;
    for (const t of this.towers) {
      if (t.hp <= 0 || t.type !== 'honeypot') continue;
      const stats = this.getEffectiveTowerStats(t);
      const d = Math.hypot(t.x - en.gx, t.y - en.gy);
      if (d <= Math.max(spec.rangedRadius, stats.tauntRange) && d < bestHoneypotDist) {
        bestHoneypotDist = d;
        target = t;
      }
    }

    // 2. Otherwise pick closest tower in rangedRadius (preferring unencrypted towers to spread disruption)
    if (!target) {
      let bestScore = Infinity;
      for (const t of this.towers) {
        if (t.hp <= 0) continue;
        const d = Math.hypot(t.x - en.gx, t.y - en.gy);
        if (d <= spec.rangedRadius) {
          const score = d + (t.encryptedTimer > 1.0 ? 2.5 : 0);
          if (score < bestScore) {
            bestScore = score;
            target = t;
          }
        }
      }
    }

    if (target) {
      en.attackCd = en.attackInterval;
      en.animAttack = 1.0;
      this.projectiles.push({
        id: this.nextEntityId++,
        kind: 'ransom_bolt',
        x: en.gx,
        y: en.gy,
        alt: 0.9,
        targetTowerId: target.id,
        speed: 9.5,
        dmg: en.atk,
        encryptDuration: spec.encryptDuration,
        sourceEnemyId: en.id,
      });
      this.emit('enemy_ranged_fire', { type: 'ransom', fromX: en.gx, fromY: en.gy, toX: target.x, toY: target.y });
    } else {
      en.attackCd = 0.25;
    }
  }

  updatePackagerShield(en, dt) {
    const spec = ENEMY_SPECS.packager;
    en.packagerCd -= dt;
    if (en.packagerCd > 0) return;

    const allies = this.enemies
      .filter((o) => !o.dead && o.id !== en.id && !o.flying && Math.hypot(o.gx - en.gx, o.gy - en.gy) <= spec.shieldRadius)
      .sort((a, b) => a.shield - b.shield)
      .slice(0, 3);

    if (allies.length > 0) {
      en.packagerCd = spec.shieldInterval;
      en.animAttack = 1.0;
      for (const a of allies) {
        a.shield = Math.max(a.shield, spec.shieldAmount);
        a.maxShield = Math.max(a.maxShield, a.shield);
      }
      this.emit('packager_shield', {
        fromX: en.gx,
        fromY: en.gy,
        targets: allies.map((a) => ({ x: a.gx, y: a.gy })),
      });
    } else {
      en.packagerCd = 0.5;
    }
  }

  updateBossAI(en, dt) {
    const hpRatio = en.hp / en.maxHp;

    // === BOSS 1: 万傀 (Map 1) ===
    if (en.type === 'boss_wankui') {
      if (en.bossPhase === 1 && hpRatio < 0.55) {
        en.bossPhase = 2;
        this.emit('boss_phase', { boss: en, phase: 2, label: '群控过载 — 释放蠕虫潮！' });
        for (let i = 0; i < 4; i++) {
          this.spawnEnemy('worm', en.entryId, {
            gx: en.gx + (this.rng.next() - 0.5) * 0.6,
            gy: en.gy + (this.rng.next() - 0.5) * 0.6,
            isClone: true,
            hpScale: 0.9,
          });
        }
      }

      en.bossSkillCd -= dt;
      if (en.bossSkillCd <= 0) {
        // Pick closest isolated node to strike with 洪峰
        let targetNode = null;
        let bestD = Infinity;
        for (const k of this.isolatedNodes) {
          const [nx, ny] = k.split(',').map(Number);
          const d = Math.hypot(nx - en.gx, ny - en.gy);
          if (d < bestD) {
            bestD = d;
            targetNode = { x: nx, y: ny };
          }
        }
        if (targetNode) {
          en.bossSkillCd = 8.5;
          this.bossWarnings.push({
            id: this.nextEntityId++,
            kind: 'flood_surge',
            tiles: [targetNode],
            remaining: 2.4,
            duration: 2.4,
            bossId: en.id,
          });
          this.emit('boss_warning', { kind: 'flood_surge', tiles: [targetNode], label: '万傀正在蓄力「洪峰」冲击隔离节点！' });
        } else {
          en.bossSkillCd = 2.0;
        }
      }

      if (en.bossPhase >= 2) {
        en.bossSubCd -= dt;
        if (en.bossSubCd <= 0) {
          en.bossSubCd = 7.2;
          for (let i = 0; i < 2; i++) {
            this.spawnEnemy('worm', en.entryId, {
              gx: en.gx + (this.rng.next() - 0.5) * 0.5,
              gy: en.gy + (this.rng.next() - 0.5) * 0.5,
              isClone: true,
              hpScale: 0.85,
            });
          }
        }
      }
      return;
    }

    // === BOSS 2: 蜃楼 (Map 2) ===
    if (en.type === 'boss_shenlou') {
      if (en.bossPhase === 1 && hpRatio < 0.55) {
        en.bossPhase = 2;
        this.emit('boss_phase', { boss: en, phase: 2, label: '路由风暴 — 护盾削弱与干扰！' });
        this.triggerRoutingStorm(en);
      }

      en.bossSkillCd -= dt;
      if (en.bossSkillCd <= 0) {
        // Find safe non-sealing road tile ahead of boss or on active entry path
        const candidate = this.findSafeBossBlockTile(en, 1);
        if (candidate && candidate.length > 0) {
          en.bossSkillCd = en.bossPhase >= 2 ? 8.5 : 10.5;
          this.bossWarnings.push({
            id: this.nextEntityId++,
            kind: 'blackhole',
            tiles: candidate,
            remaining: 2.4,
            duration: 2.4,
            bossId: en.id,
          });
          this.emit('boss_warning', { kind: 'blackhole', tiles: candidate, label: '蜃楼正在生成「伪路由黑洞」，即将截断链路！' });
        } else {
          en.bossSkillCd = 2.5;
        }
      }

      if (en.bossPhase >= 2) {
        en.bossSubCd -= dt;
        if (en.bossSubCd <= 0) {
          en.bossSubCd = 8.5;
          this.triggerRoutingStorm(en);
        }
      }
      return;
    }

    // === BOSS 3: 蛰影 (Map 3) ===
    if (en.type === 'boss_zheying') {
      if (en.bossPhase === 1 && hpRatio < 0.7) {
        en.bossPhase = 2;
        en.stealth = false;
        en.armor = 0.3;
        this.emit('boss_phase', { boss: en, phase: 2, label: '提权阶段 — 护甲强化并释放伪装木马！' });
        for (let i = 0; i < 3; i++) {
          this.spawnEnemy('trojan', en.entryId, {
            gx: en.gx + (this.rng.next() - 0.5) * 0.55,
            gy: en.gy + (this.rng.next() - 0.5) * 0.55,
            hpScale: 0.9,
          });
        }
      }
      if (en.bossPhase < 3 && hpRatio < 0.38) {
        en.bossPhase = 3;
        en.stealth = false;
        en.armor = 0.22;
        this.emit('boss_phase', { boss: en, phase: 3, label: '破坏阶段 — 即将锁死运维环并强行改道！' });
        en.bossSkillCd = 0.4; // trigger ops ring lockdown quickly on phase 3!
      }

      if (en.bossPhase === 2) {
        en.bossSubCd -= dt;
        if (en.bossSubCd <= 0) {
          en.bossSubCd = 9.0;
          for (let i = 0; i < 2; i++) {
            this.spawnEnemy('trojan', en.entryId, {
              gx: en.gx + (this.rng.next() - 0.5) * 0.4,
              gy: en.gy + (this.rng.next() - 0.5) * 0.4,
              hpScale: 0.85,
            });
          }
        }
      }

      if (en.bossPhase >= 3) {
        en.bossSkillCd -= dt;
        if (en.bossSkillCd <= 0) {
          const tiles = this.findSafeBossBlockTile(en, 2);
          if (tiles && tiles.length > 0) {
            en.bossSkillCd = 13.0;
            this.bossWarnings.push({
              id: this.nextEntityId++,
              kind: 'ops_lock',
              tiles,
              remaining: 2.3,
              duration: 2.3,
              bossId: en.id,
            });
            this.emit('boss_warning', { kind: 'ops_lock', tiles, label: '蛰影正在锁死前方运维环，全图路线即将重新收敛！' });
          } else {
            en.bossSkillCd = 3.0;
          }
        }
      }
    }
  }

  triggerRoutingStorm(boss) {
    for (const t of this.towers) {
      if (t.hp <= 0) continue;
      if (Math.hypot(t.x - boss.gx, t.y - boss.gy) <= 4.6) {
        t.shield = Math.floor(t.shield * 0.25);
        t.disruptTimer = 3.5;
        this.damageTower(t, 45, boss, { ranged: true });
      }
    }
    this.emit('boss_routing_storm', { x: boss.gx, y: boss.gy, radius: 4.6 });
  }

  /**
   * Finds 1 or 2 consecutive link tiles ahead of the Boss (or along active entry routes)
   * that are guaranteed NEVER to seal off any entry or live ground enemy.
   */
  findSafeBossBlockTile(boss, desiredCount = 1) {
    const candidates = [];
    // Walk 2..5 steps ahead of boss along flow field
    let cx = Math.round(boss.gx);
    let cy = Math.round(boss.gy);
    for (let step = 0; step < 6; step++) {
      const nxt = this.flow.nextStep[cy]?.[cx];
      if (!nxt) break;
      cx = nxt.x;
      cy = nxt.y;
      if (step >= 1) {
        const tile = this.getTile(cx, cy);
        if (tile && (tile.type === 'link' || tile.type === 'legacy') && !this.getTowerAt(cx, cy)) {
          candidates.push({ x: cx, y: cy });
        }
      }
    }

    // Fallback: also consider active entry route link tiles
    for (const r of Object.values(this.entryRoutes)) {
      if (!r) continue;
      for (let i = 2; i < r.path.length - 2; i++) {
        const p = r.path[i];
        const tile = this.getTile(p.x, p.y);
        if (tile && tile.type === 'link' && !this.getTowerAt(p.x, p.y)) {
          if (!candidates.some((c) => c.x === p.x && c.y === p.y)) {
            candidates.push({ x: p.x, y: p.y });
          }
        }
      }
    }

    for (let i = 0; i < candidates.length; i++) {
      const groupTiles = [candidates[i]];
      if (desiredCount > 1 && i + 1 < candidates.length) {
        const a = candidates[i];
        const b = candidates[i + 1];
        if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1) {
          groupTiles.push(b);
        }
      }
      const extraBlocked = new Set(groupTiles.map((t) => tileKey(t.x, t.y)));
      const conn = validateConnectivity(this.map, this.getDynamicRoutingState(), { extraBlocked }, this.enemies);
      if (conn.ok) {
        // Prefer tiles that actually cause a reroute!
        const changed = diffEntryRoutes(this.entryRoutes, conn.routes);
        if (changed.length > 0) return groupTiles;
      }
    }

    // Second pass: any single safe tile
    for (const c of candidates) {
      const extraBlocked = new Set([tileKey(c.x, c.y)]);
      if (validateConnectivity(this.map, this.getDynamicRoutingState(), { extraBlocked }, this.enemies).ok) {
        return [c];
      }
    }
    return [];
  }

  onEnemyReachExit(en) {
    en.dead = true;
    const spec = ENEMY_SPECS[en.type];
    const dmg = spec.coreDamage || 1;
    this.integrity = Math.max(0, this.integrity - dmg);
    this.emit('core_breached', {
      enemyId: en.id,
      type: en.type,
      name: spec.name,
      damage: dmg,
      x: en.gx,
      y: en.gy,
      integrity: this.integrity,
    });
  }

  // ==================== PROJECTILES ====================

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];

      if (p.kind === 'ransom_bolt') {
        const tower = this.towers.find((t) => t.id === p.targetTowerId && t.hp > 0);
        if (!tower) {
          this.projectiles.splice(i, 1);
          continue;
        }
        const tx = tower.x;
        const ty = tower.y;
        const tAlt = tower.onNode ? 0.65 : this.getTile(tower.x, tower.y)?.type === 'platform' ? 1.15 : 0.65;
        const dx = tx - p.x;
        const dy = ty - p.y;
        const dz = tAlt - p.alt;
        const dist = Math.hypot(dx, dy, dz);
        const stepDist = p.speed * dt;
        if (dist <= stepDist + 0.15) {
          const attacker = this.enemies.find((e) => e.id === p.sourceEnemyId);
          this.damageTower(tower, p.dmg, attacker || null, { ranged: true });
          const tSpec = TOWER_SPECS[tower.type];
          if (!tSpec.immuneEncrypt && tower.hp > 0) {
            tower.encryptedTimer = Math.max(tower.encryptedTimer, p.encryptDuration);
            this.emit('tower_encrypted', { towerId: tower.id, x: tower.x, y: tower.y, duration: p.encryptDuration });
          } else if (tSpec.immuneEncrypt) {
            this.emit('encrypt_resisted', { towerId: tower.id, x: tower.x, y: tower.y });
          }
          this.projectiles.splice(i, 1);
        } else {
          p.x += (dx / dist) * stepDist;
          p.y += (dy / dist) * stepDist;
          p.alt += (dz / dist) * stepDist;
        }
        continue;
      }

      // Friendly projectile targeting an enemy
      const target = this.enemies.find((e) => e.id === p.targetId && !e.dead);
      if (!target) {
        this.projectiles.splice(i, 1);
        continue;
      }
      const tx = target.gx;
      const ty = target.gy;
      const tAlt = target.flying ? target.altitude : 0.45;
      const dx = tx - p.x;
      const dy = ty - p.y;
      const dz = tAlt - p.alt;
      const dist = Math.hypot(dx, dy, dz);
      const stepDist = p.speed * dt;
      if (dist <= stepDist + 0.18) {
        const srcTower = this.towers.find((t) => t.id === p.sourceTowerId);
        this.damageEnemy(target, p.dmg, { sourceTower: srcTower });
        if (p.slowFactor < 1 && p.slowDuration > 0 && !target.dead) {
          target.slowFactor = Math.min(target.slowFactor, p.slowFactor);
          target.slowTimer = Math.max(target.slowTimer, p.slowDuration);
        }
        this.emit('projectile_hit', { kind: p.kind, x: tx, y: ty, alt: tAlt });
        this.projectiles.splice(i, 1);
      } else {
        p.x += (dx / dist) * stepDist;
        p.y += (dy / dist) * stepDist;
        p.alt += (dz / dist) * stepDist;
      }
    }
  }

  getValidPlacementTiles(kind, id) {
    if (!this.map) return [];
    const out = [];
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const tile = this.map.grid[y][x];
        const k = tileKey(x, y);
        if (this.blockedTiles.has(k)) continue;
        if (kind === 'tower') {
          const spec = TOWER_SPECS[id];
          if (!spec || !spec.placement.includes(tile.type)) continue;
          if (this.getTowerAt(x, y) || this.getIsolatorAt(x, y)) continue;
          if (tile.type === 'node' && (this.nodeCooldowns.get(k) || 0) > 0.05) continue;
          out.push({ x, y });
        } else if (kind === 'item') {
          if (id === 'isolator') {
            if (tile.type === 'node' && !this.isolatedNodes.has(k) && (this.nodeCooldowns.get(k) || 0) <= 0.05) {
              out.push({ x, y });
            }
          } else if (id === 'downgrade') {
            if (tile.type === 'link' || tile.type === 'legacy') out.push({ x, y });
          } else if (id === 'restore') {
            const tw = this.getTowerAt(x, y);
            if (tw && (tw.hp < tw.maxHp - 1 || tw.encryptedTimer > 0)) out.push({ x, y });
          }
        }
      }
    }
    return out;
  }

  getReportStats() {
    let grade = 'F';
    if (this.status === 'victory') {
      const ratio = this.integrity / this.maxIntegrity;
      if (ratio >= 0.9 && this.stats.towersLost <= 2) grade = 'S';
      else if (ratio >= 0.7) grade = 'A';
      else if (ratio >= 0.45) grade = 'B';
      else grade = 'C';
    }
    return {
      ...this.stats,
      integrity: this.integrity,
      maxIntegrity: this.maxIntegrity,
      waveReached: this.waveIndex + 1,
      totalWaves: this.map.waves.length,
      durationSec: Math.round(this.simTime),
      grade,
    };
  }
}
