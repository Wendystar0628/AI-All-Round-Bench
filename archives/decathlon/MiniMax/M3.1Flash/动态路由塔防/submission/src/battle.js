/* =========================================================================
 *  动态路由塔防 · 战斗模拟
 *  battle.js — 塔 / 敌人 / 波次 / 状态 / 资源 / Boss
 * ========================================================================= */
(function (global) {
  'use strict';
  const RT = (global.RT = global.RT || {});
  const T = THREE;
  const U = RT.util;
  const D = RT.DATA;

  const LEAK = { worm: 3, flood: 8, trojan: 4, extorter: 5, hotspot: 4, shell: 6, wankui: 28, shanlou: 28, zheyin: 32 };

  function Battle(opts) {
    this.net = opts.net;
    this.world = opts.world;
    this.scene = opts.scene;
    this.camera = opts.camera;
    this.bus = opts.bus;
    this.mapDef = opts.mapDef;
    this.audio = opts.audio;

    this.towers = [];
    this.enemies = [];
    this.bars = [];
    this.idSeq = 1;

    this.compute = 260;
    this.intel = 55;
    this.maxIntegrity = 100;
    this.integrity = 100;
    this.coreIntegrity = {};      // 每个出口独立计数
    this.wave = 0;
    this.waveState = 'ready';      // ready | spawning | fighting | intermission | over
    this.waveTimer = 3.0;
    this.spawnQueue = [];
    this.speed = 1;
    this.paused = false;
    this.over = false;
    this.result = null;
    this.time = 0;
    this.routeDirty = true;
    this.routes = {};
    this.isolated = {};            // vertexId -> {until, hp, source}
    this.blockedEdges = {};        // edgeId -> {until, source}
    this.degraded = {};            // edgeId -> until
    this.nodeCooldown = {};        // vertexId -> remaining seconds
    this.blockCells = {};          // "gx,gy" -> [tower]
    this.towerAt = {};             // "gx,gy" -> tower
    this.nodeTower = {};           // vertexId -> tower
    this.platformTower = {};       // "gx,gy" -> tower
    this.itemCd = { isolator: 0, downgrade: 0, restore: 0 };
    this.stats = { kills: 0, leaks: 0, damage: 0, deployed: 0, waves: 0, reroutes: 0, isolated: 0, items: 0, skills: 0 };
    this.hpScale = 1;
    this.pendingPreview = null;
    this.recomputeRoutes();
  }

  /* =====================================================================
   *  路由
   * ===================================================================== */
  Battle.prototype.state = function () {
    return {
      isolatedNodes: this.isolated, blockedEdges: this.blockedEdges
    };
  };

  Battle.prototype.recomputeRoutes = function () {
    const st = this.state();
    const before = this.routes;
    this.routes = RT.Net.computeRoutes(this.net, st);
    let changed = false;
    Object.keys(this.routes).forEach((k) => {
      if (!RT.Net.sameRoute(before[k], this.routes[k])) changed = true;
    });
    if (changed) {
      this.stats.reroutes++;
      this.repathEnemies();
      this.bus && this.bus.emit('routes', this.routes);
    }
    this.routeDirty = false;
    return changed;
  };

  Battle.prototype.previewRoutes = function (extraIsolated) {
    const st = { isolatedNodes: Object.assign({}, this.isolated), blockedEdges: this.blockedEdges };
    Object.assign(st.isolatedNodes, extraIsolated || {});
    const out = {};
    Object.keys(this.routes).forEach((k) => {
      const r = RT.Net.routeFor(this.net, st, k);
      out[k] = r;
    });
    return out;
  };

  // 敌人重新寻路：从当前位置走向新路线的最近点
  Battle.prototype.repathEnemies = function () {
    const self = this;
    this.enemies.forEach((e) => {
      if (e.dead || e.flying) return;
      const r = this.routes[e.entry];
      if (!r || !r.pts || r.pts.length < 2) return;
      let best = 0, bd = Infinity;
      for (let i = 0; i < r.pts.length; i++) {
        const p = r.pts[i];
        const d = (p.x - e.x) * (p.x - e.x) + (p.z - e.z) * (p.z - e.z);
        if (d < bd) { bd = d; best = i; }
      }
      const cur = { x: e.x, y: e.y, z: e.z, gx: e.gx, gy: e.gy, e: -1 };
      const pts = [cur].concat(r.pts.slice(best));
      e.path = pts; e.pi = 0; e.pt = 0;
      e.blocker = null; e.state = 'move';
      e.remaining = self.pathRemaining(e);
    });
  };

  Battle.prototype.pathRemaining = function (e) {
    let total = 0;
    const a = e.path[Math.min(e.pi, e.path.length - 1)];
    const b = e.path[Math.min(e.pi + 1, e.path.length - 1)];
    if (a && b) total += Math.hypot(b.x - a.x, b.z - a.z) * (1 - e.pt);
    for (let i = e.pi + 1; i < e.path.length - 1; i++) {
      const p = e.path[i], q = e.path[i + 1];
      total += Math.hypot(q.x - p.x, q.z - p.z);
    }
    return total;
  };

  /* =====================================================================
   *  部署
   * ===================================================================== */
  Battle.prototype.cellKey = function (gx, gy) { return gx + ',' + gy; };

  Battle.prototype.canDeploy = function (type, target) {
    const def = D.TOWERS[type];
    if (!def || !target) return { ok: false, reason: '无效目标' };
    if (target.kind === 'entry') return { ok: false, reason: '入口不能部署设备' };
    if (target.kind === 'exit') return { ok: false, reason: '中枢不能部署设备' };
    if (target.kind === 'obstacle') return { ok: false, reason: '障碍区域不能部署' };
    if (target.kind === 'platform') {
      if (def.place !== 'platform') return { ok: false, reason: def.name + ' 只能部署在链路上或节点上' };
      if (this.platformTower[this.cellKey(target.gx, target.gy)]) return { ok: false, reason: '该平台已有设备' };
    } else if (target.kind === 'node') {
      if (def.place !== 'node') return { ok: false, reason: def.name + ' 只能部署在交换节点上' };
      if (this.nodeTower[target.vertex.id]) return { ok: false, reason: '该节点已有设备' };
    } else if (target.kind === 'link') {
      if (def.place === 'node') return { ok: false, reason: def.name + ' 只能部署在交换节点上' };
      if (def.place === 'platform') return { ok: false, reason: def.name + ' 只能部署在设备平台上' };
      if (this.towerAt[this.cellKey(target.gx, target.gy)]) return { ok: false, reason: '该链路已有设备' };
    }
    if (this.compute < def.cost) return { ok: false, reason: '算力不足（需要 ' + def.cost + '）' };
    return { ok: true };
  };

  Battle.prototype.deploy = function (type, target, opts) {
    opts = opts || {};
    const def = D.TOWERS[type];
    const check = this.canDeploy(type, target);
    if (!check.ok) { this.bus && this.bus.emit('notice', { text: check.reason, level: 'warn' }); return check; }
    this.compute -= def.cost;
    const model = RT.Models.makeTower(type);
    const gx = target.gx !== undefined ? target.gx : target.vertex.gx;
    const gy = target.gy !== undefined ? target.gy : target.vertex.gy;
    const key = this.cellKey(gx, gy);
    const tower = {
      id: this.idSeq++, type: type, model: model, level: 1, branch: null,
      gx: gx, gy: gy, kind: target.kind, edge: target.edge || null,
      hp: def.hp[0], maxHp: def.hp[0], shield: 0, shieldUntil: 0,
      encrypted: 0, cool: 0, target: null, facing: 0, needFacing: !!def.oriented, aimed: false,
      blockedBy: [], skillCd: 0, flash: 0
    };
    let x, y, z;
    if (target.kind === 'node') {
      const v = target.vertex;
      tower.vertex = v;
      x = v.x; y = v.y; z = v.z;
      this.nodeTower[v.id] = tower;
      model.group.position.set(x, y, z);
      model.group.scale.setScalar(0.001);
      // 网闸 / 防火墙 隔离节点
      if (type === 'gateway' || type === 'firewall') {
        if (this.nodeCooldown[v.id] > 0) {
          this.compute += def.cost;
          this.bus && this.bus.emit('notice', { text: v.name + ' 处于再隔离间隔（' + Math.ceil(this.nodeCooldown[v.id]) + '秒），无法部署隔离设备', level: 'warn' });
          return { ok: false, reason: v.name + ' 处于再隔离间隔（' + Math.ceil(this.nodeCooldown[v.id]) + '秒）' };
        }
        if (this.intel < 10) {
          this.compute += def.cost;
          this.bus && this.bus.emit('notice', { text: '隔离节点需要 10 情报', level: 'warn' });
          return { ok: false, reason: '隔离节点需要 10 情报' };
        }
        this.intel -= 10;
        this.isolateVertex(v.id, { source: 'tower', towerId: tower.id, hp: type === 'firewall' ? 420 : 460 });
      }
    } else if (target.kind === 'platform') {
      const halfW = (this.net.cols - 1) / 2, halfH = (this.net.rows - 1) / 2;
      x = (gx - halfW) * RT.Net.CELL; y = 1.62; z = (gy - halfH) * RT.Net.CELL;
      model.group.position.set(x, y, z);
      this.platformTower[key] = tower;
    } else {
      const edge = target.edge;
      const idx = edge.cells.findIndex((c) => c.gx === gx && c.gy === gy);
      tower.edgeIdx = idx;
      const pt = edge.pts[Math.max(0, idx)];
      x = pt.x; y = pt.y; z = pt.z;
      const nx = edge.pts[Math.min(edge.pts.length - 1, idx + 1)];
      tower.facing = Math.atan2(nx.x - pt.x, nx.z - pt.z);
      model.group.position.set(x, y, z);
      model.group.rotation.y = tower.facing;
      if (type === 'firewall') {
        this.blockCells[key] = this.blockCells[key] || [];
        this.blockCells[key].push(tower);
      }
    }
    this.towerAt[key] = tower;
    model.group.userData.pick = { kind: 'tower', tower: tower };
    this.world.root.add(model.group);
    this.towers.push(tower);
    this.stats.deployed++;
    this.bus && this.bus.emit('towers', this.towers);
    this.bus && this.bus.emit('notice', { text: '已部署 ' + def.name, level: 'ok' });
    return { ok: true, tower: tower };
  };

  /* =====================================================================
   *  隔离 / 解除
   * ===================================================================== */
  Battle.prototype.isolateVertex = function (vid, info) {
    if (this.nodeCooldown[vid] > 0) return false;
    this.isolated[vid] = Object.assign({ until: Infinity }, info);
    this.stats.isolated++;
    this.applyIsolationVisual(vid, true);
    this.recomputeRoutes();
    return true;
  };

  Battle.prototype.releaseVertex = function (vid, cooldown) {
    if (!this.isolated[vid]) return;
    delete this.isolated[vid];
    this.nodeCooldown[vid] = cooldown === undefined ? 8 : cooldown;
    this.applyIsolationVisual(vid, false);
    this.recomputeRoutes();
  };

  Battle.prototype.applyIsolationVisual = function (vid, on) {
    const o = this.world.nodeObjs[vid];
    if (!o) return;
    o.isolated = on;
    o.barrier.visible = on;
    o.lock.visible = on;
    o.lock2.visible = on;
    o.accent.emissive.set(on ? '#ff4d6d' : (this.mapDef.theme.accent));
    o.accent.color.set(on ? '#ff4d6d' : (this.mapDef.theme.accent));
    o.core.material = o.core.material;
    o.halo.material.color.set(on ? '#ff4d6d' : (this.mapDef.theme.accent));
  };

  Battle.prototype.removeTower = function (tower) {
    const def = D.TOWERS[tower.type];
    const idx = this.towers.indexOf(tower);
    if (idx >= 0) this.towers.splice(idx, 1);
    this.world.root.remove(tower.model.group);
    this.compute += Math.floor(def.cost * 0.6);
    const key = this.cellKey(tower.gx, tower.gy);
    if (this.towerAt[key] === tower) delete this.towerAt[key];
    if (this.platformTower[key] === tower) delete this.platformTower[key];
    if (tower.kind === 'node' && this.nodeTower[tower.vertex.id] === tower) delete this.nodeTower[tower.vertex.id];
    if (this.blockCells[key]) {
      this.blockCells[key] = this.blockCells[key].filter((t) => t !== tower);
      if (!this.blockCells[key].length) delete this.blockCells[key];
    }
    if (tower.type === 'gateway' || tower.type === 'firewall') {
      if (tower.kind === 'node' && this.isolated[tower.vertex.id] && this.isolated[tower.vertex.id].source === 'tower') {
        this.releaseVertex(tower.vertex.id, 8);
      }
    }
    this.bus && this.bus.emit('towers', this.towers);
    this.bus && this.bus.emit('notice', { text: '已撤下 ' + def.name + '，返还算力 ' + Math.floor(def.cost * 0.6), level: 'info' });
  };

  // 取消部署（确认朝向前）：全额返还算力
  Battle.prototype.cancelDeploy = function (tower) {
    const def = D.TOWERS[tower.type];
    const idx = this.towers.indexOf(tower);
    if (idx >= 0) this.towers.splice(idx, 1);
    this.world.root.remove(tower.model.group);
    this.compute += def.cost;
    const key = this.cellKey(tower.gx, tower.gy);
    if (this.towerAt[key] === tower) delete this.towerAt[key];
    if (this.platformTower[key] === tower) delete this.platformTower[key];
    this.bus && this.bus.emit('notice', { text: '已取消部署 ' + def.name + '，全额返还算力 ' + def.cost, level: 'info' });
  };

  Battle.prototype.upgrade = function (tower) {    const def = D.TOWERS[tower.type];
    if (tower.level >= 2) return { ok: false, reason: '已达最高等级' };
    const hasBranch = def.branches && def.branches.length;
    if (hasBranch) {
      if (!tower.branch) return { ok: false, reason: '请先选择升级分支', needBranch: true };
      if (this.intel < 30) return { ok: false, reason: '选择升级分支需要 30 情报' };
      this.intel -= 30;
    } else {
      if (this.compute < Math.floor(def.cost * 0.8)) return { ok: false, reason: '算力不足' };
      this.compute -= Math.floor(def.cost * 0.8);
    }
    tower.level = 2;
    const branch = hasBranch ? def.branches.find((b) => b.id === tower.branch) : null;
    let maxHp = def.hp[1];
    if (branch && branch.hp) maxHp = branch.hp;
    tower.maxHp = maxHp; tower.hp = maxHp;
    tower.model.setLevel && tower.model.setLevel(2);
    if (branch) tower.model.setBranch && tower.model.setBranch(branch.id);
    this.bus && this.bus.emit('towers', this.towers);
    this.bus && this.bus.emit('notice', { text: def.name + ' 已升级至 2 级', level: 'ok' });
    return { ok: true };
  };

  Battle.prototype.chooseBranch = function (tower, branchId) {
    tower.branch = branchId;
    const def = D.TOWERS[tower.type];
    const b = def.branches.find((x) => x.id === branchId);
    if (b) {
      if (b.hp) { tower.maxHp = b.hp; tower.hp = Math.max(tower.hp, b.hp * 0.6); }
      tower.model.setBranch && tower.model.setBranch(branchId);
    }
    this.bus && this.bus.emit('towers', this.towers);
  };

  /* =====================================================================
   *  技能与道具
   * ===================================================================== */
  Battle.prototype.useSkill = function (tower) {
    const def = D.TOWERS[tower.type];
    if (!def.skill) return { ok: false, reason: '该设备没有主动技能' };
    if (tower.skillCd > 0) return { ok: false, reason: '技能冷却中' };
    if (tower.encrypted > 0) return { ok: false, reason: '设备被加密，无法释放技能' };
    if (this.intel < def.skill.cost) return { ok: false, reason: '情报不足' };
    this.intel -= def.skill.cost;
    tower.skillCd = def.skill.cd;
    this.stats.skills++;
    const p = tower.model.group.position;
    if (tower.type === 'honeypot') {
      RT.FX.ring(p.clone().setY(p.y + 0.4), '#ffc44d', def.skill.radius, 0.9);
      this.enemies.forEach((e) => {
        if (e.dead || e.flying) return;
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        if (d <= def.skill.radius) {
          e.stun = def.skill.duration;
          this.damageEnemy(e, def.skill.dmg, tower, 'trap');
          RT.FX.ring(e.model.group.position.clone(), '#ffd98a', 1.4, 0.6);
        }
      });
      this.bus && this.bus.emit('notice', { text: '蜜罐释放「诱捕」', level: 'ok' });
    } else if (tower.type === 'repair') {
      RT.FX.ring(p.clone().setY(p.y + 0.5), '#7ef0b4', def.skill.radius, 1.1);
      this.towers.forEach((t) => {
        if (t === tower || t.dead) return;
        const d = Math.hypot(t.model.group.position.x - p.x, t.model.group.position.z - p.z);
        if (d <= def.skill.radius) {
          t.shield = Math.max(t.shield, def.skill.shield);
          t.shieldUntil = this.time + def.skill.duration;
          if (t.encrypted > 0) { t.encrypted = 0; RT.FX.label('解密', t.model.group.position.clone().setY(t.model.group.position.y + 1.2), '#7ef0b4', null, 3); }
        }
      });
      this.bus && this.bus.emit('notice', { text: '修复进程释放「冗余切换」', level: 'ok' });
    }
    this.bus && this.bus.emit('towers', this.towers);
    return { ok: true };
  };

  Battle.prototype.useItem = function (itemId, target) {
    const item = D.ITEMS[itemId];
    if (!item) return { ok: false, reason: '无效道具' };
    if (this.itemCd[itemId] > 0) return { ok: false, reason: item.name + ' 冷却中' };
    if (item.res === 'intel' && this.intel < item.cost) return { ok: false, reason: '情报不足' };
    if (item.res === 'compute' && this.compute < item.cost) return { ok: false, reason: '算力不足' };
    if (!target) return { ok: false, reason: '请选择投放位置' };

    if (itemId === 'isolator') {
      const vid = target.vertex ? target.vertex.id : null;
      if (!vid) return { ok: false, reason: '应急隔离器只能投放在交换节点上' };
      const v = target.vertex;
      if (this.isolated[vid]) return { ok: false, reason: '该节点已被隔离' };
      if (this.nodeCooldown[vid] > 0) return { ok: false, reason: '该节点处于再隔离间隔（' + Math.ceil(this.nodeCooldown[vid]) + '秒）' };
      // 连通性检查
      const bad = RT.Net.strandedEntries(this.net, this.state(), { [vid]: true });
      if (bad.length) {
        this.bus && this.bus.emit('notice', { text: '无法隔离 ' + v.name + '：会导致 ' + bad.map((b) => b.name).join('、') + ' 无路可走', level: 'warn' });
        return { ok: false, reason: '会封死 ' + bad.map((b) => b.name).join('、'), blockedAt: bad.map((b) => b.id) };
      }
      this.intel -= item.cost;
      this.itemCd[itemId] = item.cd;
      this.isolated[vid] = { source: 'item', hp: 260, until: this.time + 12, towerId: null };
      this.applyIsolationVisual(vid, true);
      this.recomputeRoutes();
      const nodeObj = this.world.nodeObjs[vid];
      const labelPos = nodeObj
        ? nodeObj.group.position.clone().setY(nodeObj.group.position.y + 2.1)
        : new T.Vector3(v.x, v.y + 2.1, v.z);
      RT.FX.label('应急隔离器', labelPos, '#ff8a3d', null, 3.6);
      this.bus && this.bus.emit('notice', { text: v.name + ' 已临时隔离', level: 'ok' });
      return { ok: true };
    }
    if (itemId === 'downgrade') {
      const raw = target.pos;
      if (!raw) return { ok: false, reason: '请选择链路区域' };
      const p = raw.clone ? raw : new T.Vector3(raw.x, raw.y || 0, raw.z);
      this.intel -= item.cost;
      this.itemCd[itemId] = item.cd;
      let n = 0;
      this.net.edges.forEach((e) => {
        const mid = e.pts[Math.floor(e.pts.length / 2)];
        if (Math.hypot(mid.x - p.x, mid.z - p.z) <= 5.5) {
          this.degraded[e.id] = this.time + 14;
          n++;
        }
      });
      RT.FX.ring(p.clone().setY(p.y + 0.3), '#d8c05a', 5.5, 1.2);
      this.bus && this.bus.emit('notice', { text: '协议降级生效（' + n + ' 条链路）', level: 'ok' });
      return { ok: true };
    }
    if (itemId === 'restore') {
      const tower = target.tower;
      if (!tower) return { ok: false, reason: '请选择一座设备' };
      this.compute -= item.cost;
      this.itemCd[itemId] = item.cd;
      const heal = Math.floor(tower.maxHp * 0.55);
      tower.hp = Math.min(tower.maxHp, tower.hp + heal);
      tower.encrypted = 0;
      RT.FX.label('+' + heal, tower.model.group.position.clone().setY(tower.model.group.position.y + 1.4), '#7ef0b4', null, 3);
      RT.FX.ring(tower.model.group.position.clone(), '#7ef0b4', 1.8, 0.7);
      this.bus && this.bus.emit('notice', { text: D.TOWERS[tower.type].name + ' 已备份还原', level: 'ok' });
      return { ok: true };
    }
    return { ok: false, reason: '未知道具' };
  };

  /* =====================================================================
   *  波次
   * ===================================================================== */
  Battle.prototype.startWave = function () {
    if (this.waveState === 'over') return;
    const def = this.mapDef.waves[this.wave];
    if (!def) return;
    this.waveState = 'spawning';
    this.spawnQueue = [];
    const hpMul = 1 + 0.08 * this.wave;
    def.groups.forEach((g) => {
      const start = this.time + (g.d || 0);
      for (let i = 0; i < g.n; i++) {
        this.spawnQueue.push({ t: start + i * (g.gap || 1), e: g.e, type: g.t, hpMul: hpMul });
      }
    });
    if (def.boss) {
      // Boss 不随波次放大生命，保证终局可被击破
      this.spawnQueue.push({ t: this.time + 1.5, e: def.groups[0].e, type: def.boss, hpMul: 1, boss: true });
    }
    this.spawnQueue.sort((a, b) => a.t - b.t);
    this.bus && this.bus.emit('wave', { wave: this.wave + 1, total: this.mapDef.waves.length, note: def.note, flood: !!def.flood });
    this.bus && this.bus.emit('notice', {
      text: '第 ' + (this.wave + 1) + ' 波来袭 · ' + (def.note || ''),
      level: 'info'
    });
  };

  Battle.prototype.updateWaves = function (dt) {
    if (this.waveState === 'ready') {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        if (this.wave < this.mapDef.waves.length) {
          this.startWave();
          this.wave++;
        } else {
          this.finish(true);
        }
      }
      return;
    }
    if (this.waveState === 'intermission') {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this.waveState = 'ready';
        this.waveTimer = 2.0;
      }
      return;
    }
    // 生成
    while (this.spawnQueue.length && this.spawnQueue[0].t <= this.time) {
      const s = this.spawnQueue.shift();
      this.spawnEnemy(s);
    }
    if (!this.spawnQueue.length && !this.enemies.length) {
      if (this.wave >= this.mapDef.waves.length) {
        this.finish(true);
      } else {
        this.waveState = 'intermission';
        this.waveTimer = 7.0;
        this.stats.waves = this.wave;
        this.intel += 24;
        this.bus && this.bus.emit('notice', { text: '第 ' + this.wave + ' 波已清除 · 情报 +24', level: 'ok' });
      }
    }
  };

  Battle.prototype.finish = function (win) {
    if (this.over) return;
    this.over = true;
    this.waveState = 'over';
    this.result = { win: win, stats: this.stats, wave: this.wave, time: this.time };
    this.bus && this.bus.emit('gameover', this.result);
  };

  /* =====================================================================
   *  敌人
   * ===================================================================== */
  Battle.prototype.spawnEnemy = function (s) {
    const def = D.ENEMIES[s.type];
    const entry = this.net.v[s.e];
    if (!entry) return;
    const model = RT.Models.makeEnemy(s.type);
    const g = new T.Group();
    g.add(model.group);
    let path;
    if (def.flying) {
      const exit = this.routes[s.e] ? this.routes[s.e].exit : this.net.exits[0];
      path = [
        { x: entry.x, y: entry.y + 6.2, z: entry.z, gx: entry.gx, gy: entry.gy, e: -1 },
        { x: exit.x, y: exit.y + 6.2, z: exit.z, gx: exit.gx, gy: exit.gy, e: -1 }
      ];
    } else {
      const r = this.routes[s.e];
      if (!r || !r.pts || r.pts.length < 2) {
        // 无路由：退化为直线
        path = [{ x: entry.x, y: entry.y, z: entry.z }, { x: entry.x + 1, y: entry.y, z: entry.z }];
      } else {
        path = r.pts.map((p) => ({ x: p.x, y: p.y, z: p.z, gx: p.gx, gy: p.gy, e: p.e }));
      }
    }
    const hp = Math.round(def.hp * (s.hpMul || 1));
    const e = {
      id: this.idSeq++, type: s.type, def: def, model: model, group: g,
      x: path[0].x, y: path[0].y, z: path[0].z, gx: path[0].gx, gy: path[0].gy,
      hp: hp, maxHp: hp, speed: def.speed, baseSpeed: def.speed,
      path: path, pi: 0, pt: 0, state: 'move', blocker: null, atkCd: 0,
      revealed: !def.hidden, hidden: !!def.hidden, slowT: 0, slowF: 1,
      stun: 0, shield: 0, flash: 0, boss: !!def.boss, phase: 1,
      remaining: 9999, entry: s.e, exitId: null, dead: false, target: null,
      assaultNode: null, bossCd: 6, stormCd: 8, hideCd: 0, slowBy: null
    };
    if (def.hidden) model.setHidden && model.setHidden(true);
    // 蛰影以潜伏状态登场：需检测后才能被远程单体锁定
    if (s.type === 'zheyin') {
      e.hidden = true; e.revealed = false; e.stealth = true; e.hideCd = 18;
      model.setStealth && model.setStealth(true);
      this.bus && this.bus.emit('notice', { text: '蛰影进入潜伏状态 · 需沙箱检测后才能被远程单体锁定', level: 'danger' });
    }
    g.userData.pick = { kind: 'enemy', enemy: e };
    g.position.set(e.x, e.y, e.z);
    this.scene.add(g);
    this.enemies.push(e);
    e.remaining = this.pathRemaining(e);
    // 生命条
    const bar = RT.FX.makeBar(def.boss ? 4.2 : (def.radius > 0.8 ? 1.7 : 1.3), def.color);
    bar.position.y = def.boss ? 3.6 : (def.radius * 1.9 + 0.7);
    g.add(bar);
    e.bar = bar;
    if (def.boss) {
      RT.FX.label('⚠ ' + def.name, new T.Vector3(e.x, e.y + 4.4, e.z), '#ff6b8a', 'rgba(20,4,10,0.8)', 5.6);
      this.bus && this.bus.emit('notice', { text: 'BOSS 出现：' + def.name, level: 'danger' });
    }
    return e;
  };

  Battle.prototype.damageEnemy = function (e, dmg, src, kind) {
    if (e.dead) return;
    if (e.shield > 0) {
      const absorbed = Math.min(e.shield, dmg);
      e.shield -= absorbed; dmg -= absorbed;
      RT.FX.shieldBubble(e.model.group.position.clone().setY(e.y + 0.7), '#7fe6ff', e.def.radius * 1.4, 0.3);
    }
    if (dmg <= 0) return;
    // 蛰影提权后强化护甲（远程单体伤害降低）
    if (e.type === 'zheyin' && e.phase >= 2 && kind !== 'aoe') dmg *= 0.65;
    e.hp -= dmg;
    e.flash = 0.16;
    this.stats.damage += dmg;
    if (e.hp <= 0) this.killEnemy(e, src, kind);
  };

  Battle.prototype.killEnemy = function (e, src, kind) {
    if (e.dead) return;
    e.dead = true;
    const def = e.def;
    this.stats.kills++;
    this.compute += def.reward;
    this.intel += def.intel || 0;
    RT.FX.explode(new T.Vector3(e.x, e.y + 0.5, e.z), def.color, def.boss ? 3.4 : (def.radius * 2.2));
    if (def.payload && e.hidden) {
      // 未显形的木马释放载荷
      RT.FX.ring(new T.Vector3(e.x, e.y + 0.5, e.z), '#8bff6a', def.payload.radius, 0.9);
      this.towers.forEach((t) => {
        const d = Math.hypot(t.model.group.position.x - e.x, t.model.group.position.z - e.z);
        if (d <= def.payload.radius) this.damageTower(t, def.payload.dmg, e);
      });
      this.bus && this.bus.emit('notice', { text: '木马载荷释放，附近设备受损', level: 'warn' });
    }
    if (def.boss) {
      this.bus && this.bus.emit('notice', { text: def.name + ' 已被清除', level: 'ok' });
    }
    this.scene.remove(e.group);
    e.bar && e.bar.parent && e.bar.parent.remove(e.bar);
  };

  Battle.prototype.damageTower = function (t, dmg, src) {
    if (t.dead) return;
    if (t.shield > 0) {
      const absorbed = Math.min(t.shield, dmg);
      t.shield -= absorbed; dmg -= absorbed;
    }
    t.hp -= dmg;
    t.flash = 0.18;
    if (t.hp <= 0) {
      t.dead = true;
      RT.FX.explode(t.model.group.position.clone().setY(t.model.group.position.y + 0.4), '#ff7a4d', 1.6);
      this.bus && this.bus.emit('notice', { text: D.TOWERS[t.type].name + ' 被摧毁', level: 'danger' });
      this.removeTower(t);
    }
  };

  /* ---- 敌人 AI ---- */
  Battle.prototype.enemyTargetChoice = function (e, candidates) {
    if (!candidates.length) return null;
    // 蜜罐优先（勒索者）→ 其余按离出口最近
    let honeypot = null;
    for (let i = 0; i < candidates.length; i++) {
      const t = candidates[i];
      if (t.type === 'honeypot' && (!honeypot || this.distTo(e, t) < this.distTo(e, honeypot))) honeypot = t;
    }
    if (honeypot && e.def.ranged) return honeypot;
    let best = null, bestRem = Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const t = candidates[i];
      if (t.encrypted > 0) continue;
      const rem = t.remaining !== undefined ? t.remaining : 0;
      if (rem < bestRem) { bestRem = rem; best = t; }
    }
    return best || candidates[0];
  };

  Battle.prototype.distTo = function (e, t) {
    return Math.hypot(t.model.group.position.x - e.x, t.model.group.position.z - e.z);
  };

  Battle.prototype.updateEnemy = function (e, dt) {
    const def = e.def;
    if (e.dead) return;
    if (e.stun > 0) { e.stun -= dt; }
    e.flash = Math.max(0, e.flash - dt);

    // 速度修正
    let sp = e.speed;
    if (e.slowT > this.time) sp *= e.slowF;
    if (e.stun > 0) sp = 0;

    // Boss 阶段逻辑
    if (e.boss) this.updateBoss(e, dt);

    // 洪泛团：冲击被隔离节点
    if (e.type === 'flood') {
      if (!e.assaultNode) {
        let best = null, bd = 10.5;
        Object.keys(this.isolated).forEach((vid) => {
          const v = this.net.v[vid];
          if (!v) return;
          const d = Math.hypot(v.x - e.x, v.z - e.z);
          if (d < bd) { bd = d; best = v; }
        });
        if (best) {
          e.assaultNode = best;
          e.state = 'assault';
        }
      }
      if (e.assaultNode) {
        const v = e.assaultNode;
        if (!this.isolated[v.id]) { e.assaultNode = null; e.state = 'move'; }
        else {
          const d = Math.hypot(v.x - e.x, v.z - e.z);
          if (d > 2.2) {
            const a = Math.atan2(v.x - e.x, v.z - e.z);
            e.x += Math.sin(a) * sp * dt; e.z += Math.cos(a) * sp * dt;
            e.model.group.rotation.y = a;
            e.remaining = this.pathRemaining(e);
            return;
          } else {
            e.atkCd -= dt;
            const tower = this.nodeTower[v.id];
            if (tower) {
              // 持续重击节点上的设备
              this.damageTower(tower, def.dmg * dt, e);
              if (e.atkCd <= 0) {
                e.atkCd = 0.45;
                RT.FX.hitSpark(tower.model.group.position.clone().setY(tower.model.group.position.y + 0.8), '#ff9f2e');
              }
            } else {
              const iso = this.isolated[v.id];
              if (iso && iso.hp !== undefined) {
                iso.hp -= def.dmg * dt * def.atkRate;
                if (iso.hp <= 0) {
                  delete this.isolated[v.id];
                  this.applyIsolationVisual(v.id, false);
                  this.nodeCooldown[v.id] = 8;
                  this.recomputeRoutes();
                  this.bus && this.bus.emit('notice', { text: '隔离器被冲毁，' + this.net.v[v.id].name + ' 恢复直通', level: 'warn' });
                }
              }
            }
            e.remaining = this.pathRemaining(e);
            return;
          }
        }
      }
    }

    // 阻挡检测（按敌人占用的阻挡容量计权）
    if (e.state === 'move' && !e.flying) {
      const next = e.path[e.pi + 1];
      if (next) {
        const key = next.gx + ',' + next.gy;
        const blockers = this.blockCells[key];
        if (blockers && blockers.length) {
          const cost = def.blockCost || 1;
          const b = blockers.find((t) => {
            if (t.hp <= 0) return false;
            const cap = (D.TOWERS[t.type].block || [1, 1])[t.level - 1];
            return (t.blockUsed || 0) + cost <= cap;
          });
          if (b) {
            e.blocker = b; e.state = 'blocked';
            if (!b.blockedBy) b.blockedBy = [];
            b.blockedBy.push(e);
            b.blockUsed = (b.blockUsed || 0) + cost;
            if (e.hidden) this.reveal(e, '阻挡');
          }
        }
      }
    }
    // 节点上的防火墙拦截相邻链路
    if (e.state === 'move' && !e.flying) {
      const next = e.path[e.pi + 1];
      if (next) {
        const vtx = this.vertexAtCell(next.gx, next.gy);
        if (vtx && this.isolated[vtx.id] && this.isolated[vtx.id].source === 'tower') {
          const tower = this.nodeTower[vtx.id];
          const cost = def.blockCost || 1;
          if (tower && tower.type === 'firewall' && (tower.blockUsed || 0) + cost <= D.TOWERS.firewall.nodeBlock[tower.level - 1]) {
            e.blocker = tower; e.state = 'blocked';
            if (!tower.blockedBy) tower.blockedBy = [];
            tower.blockedBy.push(e);
            tower.blockUsed = (tower.blockUsed || 0) + cost;
          }
        }
      }
    }

    // 阻挡中：攻击阻挡物
    if (e.state === 'blocked' && e.blocker) {
      const b = e.blocker;
      if (b.hp <= 0 || (b.blockedBy || []).indexOf(e) < 0) {
        e.blocker = null; e.state = 'move';
      } else {
        if (def.dmg > 0) {
          e.atkCd -= dt;
          if (e.atkCd <= 0) {
            e.atkCd = 1 / def.atkRate;
            this.damageTower(b, def.dmg, e);
            RT.FX.hitSpark(b.model.group.position.clone().setY(b.model.group.position.y + 0.7), def.color);
            if (e.type === 'extorter') e.model.strike && e.model.strike();
          }
        }
        e.remaining = this.pathRemaining(e);
        this.placeEnemy(e);
        return;
      }
    }

    // 远程敌人攻击附近设备
    if (def.ranged && def.dmg > 0) {
      e.atkCd -= dt;
      if (e.atkCd <= 0) {
        const cands = this.towers.filter((t) => {
          if (t.hp <= 0) return false;
          const d = this.distTo(e, t);
          return d <= def.range;
        });
        const tgt = this.enemyTargetChoice(e, cands);
        if (tgt) {
          e.atkCd = 1 / def.atkRate;
          this.damageTower(tgt, def.dmg, e);
          if (def.encrypt && tgt.encrypted <= 0) {
            tgt.encrypted = def.encrypt;
            RT.FX.label('加密', tgt.model.group.position.clone().setY(tgt.model.group.position.y + 1.5), '#c07bff', null, 2.8);
          }
          const from = new T.Vector3(e.x, e.y + 0.8, e.z);
          const to = tgt.model.group.position.clone().setY(tgt.model.group.position.y + 0.5);
          RT.FX.projectile(from, to, '#c07bff', 26, (p) => {
            RT.FX.hitSpark(p, '#c07bff');
          });
          e.model.strike && e.model.strike();
        }
      }
    }

    // 移动
    if (e.state === 'move') {
      const seg = e.path[e.pi];
      const nxt = e.path[e.pi + 1];
      if (!nxt) {
        this.leak(e);
        return;
      }
      // 旧链路 / 协议降级：减速与显形
      let slow = 1, onOld = false;
      const edge = (seg.e !== undefined && seg.e >= 0) ? this.net.edges[seg.e] : null;
      if (edge && (edge.kind === 'old' || this.degraded[edge.id])) { slow = 0.62; onOld = true; }
      if (onOld && e.hidden) this.reveal(e, '旧链路');
      if (e.def.hidden && e.hidden) { /* 隐藏单位仍正常移动 */ }
      const spd = sp * slow;
      const dx = nxt.x - e.x, dz = nxt.z - e.z;
      const dist = Math.hypot(dx, dz);
      const step = spd * dt;
      if (dist <= step) {
        e.x = nxt.x; e.y = nxt.y; e.z = nxt.z;
        e.gx = nxt.gx; e.gy = nxt.gy;
        e.pi++; e.pt = 0;
        if (e.pi >= e.path.length - 1) { this.leak(e); return; }
      } else {
        e.x += dx / dist * step; e.z += dz / dist * step;
        e.y += (nxt.y - e.y) * Math.min(1, dt * 4);
        const ang = Math.atan2(dx, dz);
        const diff = U.shortAngle(e.model.group.rotation.y, ang);
        e.model.group.rotation.y += diff * Math.min(1, dt * 8);
      }
      e.remaining = this.pathRemaining(e);
    }
    this.placeEnemy(e);
  };

  Battle.prototype.vertexAtCell = function (gx, gy) {
    const list = this.net.cellEdges[gx + ',' + gy];
    if (!list) return null;
    for (let i = 0; i < this.net.vlist.length; i++) {
      const v = this.net.vlist[i];
      if (v.gx === gx && v.gy === gy) return v;
    }
    return null;
  };

  Battle.prototype.reveal = function (e, why) {
    if (!e.hidden) return;
    e.hidden = false; e.revealed = true;
    e.model.setHidden && e.model.setHidden(false);
    if (e.stealth) { e.stealth = false; e.model.setStealth && e.model.setStealth(false); }
    RT.FX.label('显形', e.model.group.position.clone().setY(e.y + 1.4), '#8bff6a', null, 2.8);
  };

  Battle.prototype.placeEnemy = function (e) {
    e.group.position.set(e.x, e.y, e.z);
    if (e.bar) {
      RT.FX.updateBar(e.bar, e.hp / e.maxHp, e.hp / e.maxHp > 0.35 ? e.def.color : '#ff5b6b');
      RT.FX.billboard(e.bar, this.camera);
      e.bar.visible = e.hp < e.maxHp || e.def.boss;
    }
  };

  Battle.prototype.leak = function (e) {
    const dmg = LEAK[e.type] || 5;
    this.integrity = Math.max(0, this.integrity - dmg);
    this.stats.leaks++;
    const exit = this.routes[e.entry] ? this.routes[e.entry].exit : null;
    if (exit) {
      RT.FX.explode(new T.Vector3(exit.x, exit.y + 2.6, exit.z), '#ff4d6d', 1.6);
      RT.FX.label('突破 -' + dmg, new T.Vector3(exit.x, exit.y + 4.2, exit.z), '#ff6b8a', 'rgba(30,4,12,0.85)', 4);
    }
    this.bus && this.bus.emit('integrity', this.integrity);
    this.scene.remove(e.group);
    e.dead = true;
    if (this.integrity <= 0) this.finish(false);
  };

  /* ---- Boss ---- */
  Battle.prototype.updateBoss = function (e, dt) {
    const def = e.def;
    const hpRatio = e.hp / e.maxHp;
    // 阶段
    let phase = 1;
    if (e.type === 'zheyin') phase = hpRatio < 0.34 ? 3 : (hpRatio < 0.67 ? 2 : 1);
    else if (hpRatio < 0.5) phase = 2;
    if (phase !== e.phase) {
      e.phase = phase;
      e.model.setPhase && e.model.setPhase(phase);
      this.bus && this.bus.emit('notice', { text: def.name + ' 进入第 ' + phase + ' 阶段', level: 'danger' });
      RT.FX.ring(new T.Vector3(e.x, e.y + 1.2, e.z), def.color, 6, 1.1);
    }
    e.bossCd -= dt;
    if (e.type === 'wankui') {
      if (phase >= 2 && e.bossCd <= 0) {
        e.bossCd = 7;
        for (let i = 0; i < 4; i++) {
          const s = { t: 'worm', e: e.entry, hpMul: 1.2 };
          setTimeout(() => {}, 0);
          this.spawnEnemy({ t: this.time + 0.2, e: e.entry, type: 'worm', hpMul: 1.3 });
        }
        this.bus && this.bus.emit('notice', { text: '万傀释放成群蠕虫！', level: 'danger' });
      }
      // 洪峰：冲击被隔离节点
      const isoIds = Object.keys(this.isolated);
      if (isoIds.length && e.bossCd > 3) {
        const vid = isoIds[0];
        const v = this.net.v[vid];
        const tower = this.nodeTower[vid];
        if (tower) {
          e.atkCd -= dt;
          if (e.atkCd <= 0) {
            e.atkCd = 0.9;
            this.damageTower(tower, 55, e);
            RT.FX.hitSpark(tower.model.group.position.clone().setY(tower.model.group.position.y + 1), '#ff2f6d');
          }
        }
      }
    } else if (e.type === 'shanlou') {
      // 伪路由：前方链路黑洞
      e.stormCd -= dt;
      if (e.stormCd <= 0 && phase === 1) {
        e.stormCd = 9;
        const r = this.routes[e.entry];
        if (r && r.edges.length > 1) {
          const edgeId = r.edges[Math.min(r.edges.length - 1, 1)];
          this.blockedEdges[edgeId] = { until: this.time + 7, source: 'shanlou' };
          RT.FX.label('伪路由 · 黑洞', new T.Vector3(this.net.edges[edgeId].pts[1].x, this.net.edges[edgeId].pts[1].y + 1.6, this.net.edges[edgeId].pts[1].z), '#ffe08a', 'rgba(40,30,4,0.85)', 4.4);
          this.bus && this.bus.emit('notice', { text: '蜃楼制造伪路由黑洞，前方链路被截断', level: 'danger' });
          this.recomputeRoutes();
        }
      }
      if (phase >= 2) {
        // 路由风暴：削弱附近护盾
        e.atkCd -= dt;
        if (e.atkCd <= 0) {
          e.atkCd = 1.1;
          this.towers.forEach((t) => {
            const d = Math.hypot(t.model.group.position.x - e.x, t.model.group.position.z - e.z);
            if (d < 9 && t.shield > 0) {
              t.shield = 0;
              RT.FX.label('护盾削弱', t.model.group.position.clone().setY(t.model.group.position.y + 1.4), '#ffe08a', null, 3);
            }
          });
        }
      }
    } else if (e.type === 'zheyin') {
      if (phase === 1) {
        e.hideCd -= dt;
        if (e.hideCd <= 0) {
          e.hideCd = 1;
          // 潜伏超时：主动暴露，玩家不会陷入无解局面
          if (e.hidden) {
            this.reveal(e, '潜伏结束');
            this.bus && this.bus.emit('notice', { text: '蛰影结束潜伏，开始主动突袭', level: 'danger' });
          }
        }
      }
      if (phase === 2 && e.bossCd <= 0) {
        e.bossCd = 6;
        this.spawnEnemy({ t: this.time, e: e.entry, type: 'trojan', hpMul: 1.2 });
        this.spawnEnemy({ t: this.time, e: e.entry, type: 'trojan', hpMul: 1.2 });
        this.bus && this.bus.emit('notice', { text: '蛰影提权并释放木马', level: 'danger' });
      }
      if (phase === 3 && e.bossCd <= 0) {
        e.bossCd = 12;
        const r = this.routes[e.entry];
        if (r && r.edges.length > 1) {
          const edgeId = r.edges[1];
          this.blockedEdges[edgeId] = { until: this.time + 9, source: 'zheyin' };
          RT.FX.label('破坏 · 锁死运维环', new T.Vector3(this.net.edges[edgeId].pts[0].x, this.net.edges[edgeId].pts[0].y + 1.8, this.net.edges[edgeId].pts[0].z), '#ff2f4a', 'rgba(30,2,10,0.88)', 4.8);
          this.bus && this.bus.emit('notice', { text: '蛰影锁死前方一段运维环', level: 'danger' });
          this.recomputeRoutes();
        }
      }
    }
  };

  /* =====================================================================
   *  塔
   * ===================================================================== */
  Battle.prototype.updateTower = function (t, dt) {
    const def = D.TOWERS[t.type];
    t.cool = Math.max(0, t.cool - dt);
    t.skillCd = Math.max(0, t.skillCd - dt);
    t.flash = Math.max(0, t.flash - dt);
    if (t.encrypted > 0) {
      t.encrypted -= dt;
      if (t.encrypted <= 0) RT.FX.label('解密', t.model.group.position.clone().setY(t.model.group.position.y + 1.4), '#7ef0b4', null, 2.6);
    }
    if (t.shieldUntil && t.shieldUntil < this.time) t.shield = 0;
    // 阻挡塔还击
    if (t.type === 'firewall' && t.blockedBy && t.blockedBy.length) {
      const dps = def.dps[t.level - 1];
      t.blockedBy.forEach((e) => {
        if (e.dead) return;
        this.damageEnemy(e, dps * dt, t, 'block');
      });
      t.blockedBy = t.blockedBy.filter((e) => !e.dead && e.blocker === t);
      let used = 0;
      t.blockedBy.forEach((e) => { used += (e.def.blockCost || 1); });
      t.blockUsed = used;
      if (t.blockedBy.length && Math.random() < dt * 6) {
        const e = t.blockedBy[0];
        RT.FX.hitSpark(e.model.group.position.clone().setY(e.y + 0.5), '#8fd0ff');
      }
    }
    if (t.encrypted > 0) return;   // 加密：停止攻击、治疗、技能

    const p = t.model.group.position;

    // 拦截器：朝向与攻击
    if (t.type === 'interceptor') {
      const range = def.range[t.level - 1];
      const dmg = def.dmg[t.level - 1];
      const cands = this.enemies.filter((e) => {
        if (e.dead) return false;
        if (e.hidden) return false;             // 伪装目标不能被远程单体锁定
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        if (d > range) return false;
        // 扇形朝向：玩家确认方向后，攻击范围限定在该扇形内
        if (!t.aimed) return true;
        const ang = Math.atan2(e.x - p.x, e.z - p.z);
        const diff = Math.abs(U.shortAngle(t.facing, ang));
        return diff <= (def.arc * Math.PI / 180) / 2;
      });
      if (cands.length) {
        cands.sort((a, b) => a.remaining - b.remaining);
        const tgt = cands[0];
        t.target = tgt;
        t.model.aim && t.model.aim(tgt.x, tgt.z);
        if (t.cool <= 0) {
          t.cool = 1 / def.rate[t.level - 1];
          t.model.anim.recoil = 1;
          const from = p.clone().setY(p.y + 0.6);
          const to = tgt.model.group.position.clone().setY(tgt.y + 0.5);
          if (t.branch === 'pierce') {
            RT.FX.beam(from, to, '#ff9ee8', 0.16, 0.07);
            const ang = Math.atan2(tgt.x - p.x, tgt.z - p.z);
            const hit = this.enemies.filter((e) => {
              if (e.dead || e.hidden) return false;
              const ex = e.x - p.x, ez = e.z - p.z;
              const proj = ex * Math.sin(ang) + ez * Math.cos(ang);
              if (proj < 0 || proj > range) return false;
              const perp = Math.abs(ex * Math.cos(ang) - ez * Math.sin(ang));
              return perp < 1.6;
            });
            hit.forEach((e) => this.damageEnemy(e, def.branches[0].dmg, t, 'pierce'));
            if (!hit.length) this.damageEnemy(tgt, def.branches[0].dmg, t, 'pierce');
            RT.FX.hitSpark(to, '#ff9ee8');
          } else if (t.branch === 'suppress') {
            RT.FX.projectile(from, to, '#ffb0e8', 30, (pp) => {
              RT.FX.hitSpark(pp, '#ffb0e8');
              this.damageEnemy(tgt, def.branches[1].dmg, t, 'suppress');
              tgt.slowT = this.time + 1.6; tgt.slowF = 1 - def.branches[1].slow;
            });
          } else {
            RT.FX.projectile(from, to, '#ff7bd5', 30, (pp) => {
              RT.FX.hitSpark(pp, '#ff7bd5');
              this.damageEnemy(tgt, dmg, t, 'shot');
            });
          }
          this.audio && this.audio.sfx('shot');
        }
      }
    }

    // 沙箱：检测 + 范围伤害
    if (t.type === 'sandbox') {
      const range = def.range[t.level - 1];
      const detect = def.detect[t.level - 1];
      this.enemies.forEach((e) => {
        if (e.dead || !e.hidden) return;
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        if (d <= detect) {
          this.reveal(e, '沙箱检测');
          RT.FX.ring(e.model.group.position.clone(), '#a78bfa', 1.6, 0.5);
        }
      });
      if (t.cool <= 0) {
        const aoe = def.aoe[t.level - 1];
        const hits = this.enemies.filter((e) => {
          if (e.dead || e.flying) return false;
          return Math.hypot(e.x - p.x, e.z - p.z) <= aoe;
        });
        if (hits.length) {
          t.cool = 1 / def.rate[t.level - 1];
          RT.FX.ring(p.clone().setY(p.y + 0.2), '#a78bfa', aoe, 0.6);
          hits.forEach((e) => {
            this.damageEnemy(e, def.dmg[t.level - 1], t, 'aoe');
            RT.FX.hitSpark(e.model.group.position.clone().setY(e.y + 0.5), '#c4b5fd');
          });
          this.audio && this.audio.sfx('aoe');
        }
      }
    }

    // 修复进程：治疗
    if (t.type === 'repair') {
      const range = def.range[t.level - 1];
      const heal = def.heal[t.level - 1];
      this.towers.forEach((o) => {
        if (o === t || o.hp <= 0 || o.hp >= o.maxHp) return;
        const d = Math.hypot(o.model.group.position.x - p.x, o.model.group.position.z - p.z);
        if (d <= range) {
          o.hp = Math.min(o.maxHp, o.hp + heal * dt);
          if (Math.random() < dt * 2.2) {
            RT.FX.beam(p.clone().setY(p.y + 0.5), o.model.group.position.clone().setY(o.model.group.position.y + 0.6), '#7ef0b4', 0.16, 0.04);
          }
        }
      });
    }

    // 网闸隔离状态
    if (t.type === 'gateway' || (t.type === 'firewall' && t.kind === 'node')) {
      const v = t.kind === 'node' ? t.vertex : null;
      if (v && t.model.setClosed) t.model.setClosed(!!this.isolated[v.id]);
    }
  };

  /* =====================================================================
   *  主循环
   * ===================================================================== */
  Battle.prototype.update = function (dt) {
    if (this.over) return;
    if (this.paused) return;
    this.time += dt;
    this.updateWaves(dt);

    // 资源
    this.compute += dt * 3.4;
    let isoCount = 0;
    Object.keys(this.isolated).forEach((vid) => {
      const iso = this.isolated[vid];
      if (iso.until !== Infinity && iso.until < this.time) {
        delete this.isolated[vid];
        this.applyIsolationVisual(vid, false);
        this.nodeCooldown[vid] = 8;
        this.recomputeRoutes();
        this.bus && this.bus.emit('notice', { text: this.net.v[vid].name + ' 的隔离已到期', level: 'info' });
      } else if (iso.source === 'tower') isoCount++;   // 情报道具的隔离不产生情报
    });
    if (isoCount > 0) this.intel += dt * 0.95 * isoCount;

    // 冷却
    Object.keys(this.itemCd).forEach((k) => { this.itemCd[k] = Math.max(0, this.itemCd[k] - dt); });
    Object.keys(this.nodeCooldown).forEach((k) => { this.nodeCooldown[k] = Math.max(0, this.nodeCooldown[k] - dt); });
    Object.keys(this.blockedEdges).forEach((eid) => {
      const b = this.blockedEdges[eid];
      if (b.until < this.time) { delete this.blockedEdges[eid]; this.recomputeRoutes(); }
    });
    Object.keys(this.degraded).forEach((eid) => {
      if (this.degraded[eid] < this.time) delete this.degraded[eid];
    });

    // 塔
    for (let i = this.towers.length - 1; i >= 0; i--) {
      const t = this.towers[i];
      if (t.dead) { this.towers.splice(i, 1); continue; }
      this.updateTower(t, dt);
      if (t.model.anim && t.model.anim.update) t.model.anim.update(dt);
      // 缩放出现动画
      if (t.model.group.scale.x < 1) {
        const s = Math.min(1, t.model.group.scale.x + dt * 3.5);
        t.model.group.scale.setScalar(s);
      }
    }

    // 敌人
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) { this.enemies.splice(i, 1); continue; }
      this.updateEnemy(e, dt);
      if (e.model.anim && e.model.anim.update) e.model.anim.update(dt);
      // 受击闪白
      if (e.flash > 0 && e.model.core) e.model.core.material.emissiveIntensity = 3.2;
      else if (e.model.core) e.model.core.material.emissiveIntensity = e.model.anim && e.model.anim.t ? (1.6 + Math.sin(e.model.anim.t * 4) * 0.4) : 1.6;
    }

    // 加壳器：给附近同伴护盾
    this.enemies.forEach((packer) => {
      if (packer.type !== 'shell' || packer.dead) return;
      this.enemies.forEach((e) => {
        if (e === packer || e.dead) return;
        const d = Math.hypot(e.x - packer.x, e.z - packer.z);
        if (d <= packer.def.shieldRadius && e.shield < packer.def.shield) {
          e.shield = packer.def.shield;
        }
      });
    });
  };

  Battle.prototype.reset = function () {
    this.enemies.slice().forEach((e) => this.scene.remove(e.group));
    this.enemies.length = 0;
    this.towers.slice().forEach((t) => this.world.root.remove(t.model.group));
    this.towers.length = 0;
    this.bars.length = 0;
    this.compute = 260; this.intel = 55;
    this.integrity = this.maxIntegrity;
    this.wave = 0; this.waveState = 'ready'; this.waveTimer = 3;
    this.spawnQueue.length = 0;
    this.isolated = {}; this.blockedEdges = {}; this.degraded = {}; this.nodeCooldown = {};
    this.blockCells = {}; this.towerAt = {}; this.nodeTower = {}; this.platformTower = {};
    this.itemCd = { isolator: 0, downgrade: 0, restore: 0 };
    this.stats = { kills: 0, leaks: 0, damage: 0, deployed: 0, waves: 0, reroutes: 0, isolated: 0, items: 0, skills: 0 };
    this.over = false; this.result = null; this.time = 0;
    this.recomputeRoutes();
  };

  RT.Battle = Battle;
})(typeof window !== 'undefined' ? window : globalThis);
