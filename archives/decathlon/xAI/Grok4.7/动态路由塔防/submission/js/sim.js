/* 战斗模拟。不依赖 DOM / Three，时间只由调用方传入的 dt 推进。 */
(function (root) {
  'use strict';
  var TD = root.TD = root.TD || {};
  var CELL = TD.CELL;

  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function hypot(x, z) { return Math.sqrt(x * x + z * z); }

  function Battle(map, seed) {
    this.map = map;
    this.rng = rng(seed || 1);
    this.waves = TD.WAVES[map.id];
    var st = TD.START[map.id];
    this.compute = st.c;
    this.intel = st.i;
    this.integrity = 100;
    this.waveIndex = 0;
    this.phase = 'prep';
    this.prepLeft = this.waves[0].prep;
    this.nodes = map.nodes.map(function (n) {
      return { id: n.id, name: n.name, c: n.c, r: n.r, isolated: false, lockT: 0, holder: null };
    });
    this.towers = [];
    this.enemies = [];
    this.holders = [];
    this.projectiles = [];
    this.fxs = [];
    this.logs = [];
    this.sfxQ = [];
    this.telegraphs = [];
    this.spawnQ = [];
    this.lateQ = [];
    this.tempBlocks = new Map();
    this.tempOld = new Map();
    this.slowMap = new Map();
    this.blocked = new Set();
    this.itemCd = { isolator: 0, downgrade: 0, restore: 0 };
    this.time = 0;
    this.seq = 1;
    this.over = false;
    this.suppressEnd = false;
    this.stats = { kills: 0, leaks: 0, built: 0, lost: 0, dealt: 0, taken: 0, earnedC: 0, hold: 0 };
    this.routeRev = 0;
    this.routes = {};
    this.repathAll();
    this.log('守护进程已接入「' + map.name + '」。链路保持连通。', 'info');
  }

  Battle.prototype.nid = function () { return this.seq++; };

  Battle.prototype.log = function (text, level) {
    this.logs.push({ t: this.time, text: text, level: level || 'info' });
    if (this.logs.length > 16) this.logs.shift();
  };

  Battle.prototype.sfx = function (name) {
    if (this.sfxQ.length < 14) this.sfxQ.push(name);
  };

  Battle.prototype.fx = function (x, y, z, kind, extra) {
    this.fxs.push({ id: this.nid(), x: x, y: y, z: z, kind: kind, extra: extra || null, age: 0, life: (extra && extra.life) || 0.55 });
    if (this.fxs.length > 90) this.fxs.splice(0, this.fxs.length - 90);
  };

  Battle.prototype.float = function (x, z, text, color) {
    this.fx(x, 1.8, z, 'text', { text: text, color: color || '#fff', life: 0.7 });
  };

  Battle.prototype.cellAt = function (c, r) { return this.map.cells[c + ',' + r] || null; };
  Battle.prototype.nodeById = function (id) {
    for (var i = 0; i < this.nodes.length; i++) if (this.nodes[i].id === id) return this.nodes[i];
    return null;
  };
  Battle.prototype.nodeAt = function (c, r) {
    for (var i = 0; i < this.nodes.length; i++) if (this.nodes[i].c === c && this.nodes[i].r === r) return this.nodes[i];
    return null;
  };
  Battle.prototype.towerById = function (id) {
    for (var i = 0; i < this.towers.length; i++) if (this.towers[i].id === id) return this.towers[i];
    return null;
  };
  Battle.prototype.enemyById = function (id) {
    for (var i = 0; i < this.enemies.length; i++) if (this.enemies[i].id === id) return this.enemies[i];
    return null;
  };
  Battle.prototype.towerAt = function (c, r) {
    for (var i = 0; i < this.towers.length; i++) {
      var t = this.towers[i];
      if (!t.dead && t.c === c && t.r === r) return t;
    }
    return null;
  };
  Battle.prototype.holderAt = function (c, r) {
    for (var i = 0; i < this.holders.length; i++) {
      var h = this.holders[i];
      if (!h.dead && h.c === c && h.r === r) return h;
    }
    return null;
  };

  Battle.prototype.living = function (e) {
    return e && e.state !== 'dead' && e.state !== 'leaked';
  };

  Battle.prototype.distCell = function (a, b) {
    return hypot(a.x - b.x, a.z - b.z) / CELL;
  };

  Battle.prototype.oldSet = function () { return new Set(this.tempOld.keys()); };

  Battle.prototype.exitKeys = function () {
    return this.map.exits.map(function (e) { return e.c + ',' + e.r; });
  };

  Battle.prototype.occupies = function (c, r) {
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!this.living(e) || e.flying) continue;
      if (e.c === c && e.r === r) return e;
    }
    return null;
  };

  Battle.prototype.rebuildBlocks = function () {
    var b = new Set();
    for (var i = 0; i < this.nodes.length; i++) {
      var n = this.nodes[i];
      if (n.isolated) b.add(n.c + ',' + n.r);
    }
    this.tempBlocks.forEach(function (v, k) { if (v.t > 0) b.add(k); });
    this.blocked = b;
  };

  Battle.prototype.rebuildSlow = function () {
    var m = new Map();
    for (var i = 0; i < this.towers.length; i++) {
      var t = this.towers[i];
      if (t.dead || t.type !== 'gate' || t.level < 2) continue;
      var ds = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var d = 0; d < 4; d++) {
        var c = t.c + ds[d][0], r = t.r + ds[d][1];
        var cell = this.cellAt(c, r);
        if (!cell || !TD.walkKind(cell.kind) || cell.kind === 'node') continue;
        m.set(c + ',' + r, 1.48);
      }
    }
    this.slowMap = m;
  };

  Battle.prototype.pathFrom = function (start, blocked, goalKey) {
    var exits = goalKey ? [goalKey] : this.exitKeys();
    return TD.dijkstra(this.map, start, exits, blocked, this.oldSet(), this.slowMap);
  };

  Battle.prototype.reachable = function (start, blocked) {
    var b = new Set(blocked);
    b.delete(start);
    return !!this.pathFrom(start, b, null);
  };

  Battle.prototype.sealReport = function (blocked) {
    var sealed = [];
    var self = this;
    this.map.entrances.forEach(function (ent) {
      var k = ent.c + ',' + ent.r;
      if (!self.pathFrom(k, blocked, null)) {
        sealed.push({ kind: 'entrance', id: ent.id, c: ent.c, r: ent.r, name: ent.name });
      }
    });
    this.enemies.forEach(function (e) {
      if (!self.living(e) || e.flying) return;
      var k = e.c + ',' + e.r;
      if (!self.reachable(k, blocked)) {
        sealed.push({ kind: 'enemy', id: e.id, c: e.c, r: e.r, name: e.def.name });
      }
    });
    return sealed;
  };

  Battle.prototype.repathAll = function () {
    this.rebuildBlocks();
    this.routes = TD.allRoutes(this.map, this.blocked, this.oldSet(), this.slowMap);
    this.routeRev++;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!this.living(e) || e.flying) continue;
      if (e.state === 'blocked' || e.state === 'attacknode') continue;
      this.repath(e, e.goalKey || null);
    }
  };

  Battle.prototype.repath = function (e, goalKey) {
    if (!e || e.flying) return false;
    e.c = Math.round(e.x / CELL);
    e.r = Math.round(e.z / CELL);
    if (!this.cellAt(e.c, e.r) || !TD.walkKind(this.cellAt(e.c, e.r).kind)) {
      e.c = Math.round(e.x / CELL);
      e.r = Math.round(e.z / CELL);
    }
    var start = e.c + ',' + e.r;
    var blocked = new Set(this.blocked);
    blocked.delete(start);
    var route = this.pathFrom(start, blocked, goalKey || null);
    if (!route) {
      e.stuck = true;
      e.wps = [];
      return false;
    }
    e.stuck = false;
    e.goalKey = goalKey || null;
    e.exitKey = route.exitKey;
    e.remain = route.cost;
    e.wps = route.path.map(function (k) {
      var p = k.split(',');
      return { c: +p[0], r: +p[1] };
    });
    e.wi = 0;
    if (e.wps.length > 1) {
      var dx = e.x - e.wps[0].c * CELL;
      var dz = e.z - e.wps[0].r * CELL;
      if (dx * dx + dz * dz < 0.09) e.wi = 1;
    }
    return true;
  };

  Battle.prototype.urgency = function (e) {
    if (e.flying) return e.ft || 0;
    var rem = e.remain == null ? 30 : e.remain;
    return 1 - Math.min(1, rem / 38);
  };

  Battle.prototype.makeEnemy = function (type, c, r, ent) {
    var def = TD.ENEMIES[type];
    if (!def) return null;
    var e = {
      id: this.nid(), type: type, def: def, ent: ent || 'A',
      c: c, r: r, x: c * CELL, z: r * CELL, y: def.flying ? 3.6 : 0,
      hp: def.hp, maxHp: def.hp, shield: 0,
      state: 'move', flying: !!def.flying,
      blocker: null, goalKey: null, goalNode: null, tauntTo: null,
      revealed: def.camo ? false : true,
      armorOn: false, phase: def.boss ? 1 : 0,
      duplicated: false, isCopy: false,
      attackCd: 0.4, shotWait: 0.6 + (this.rng() * 0.3), giveWait: 1.1,
      bossCd: 4, storm: 0, stormTick: 0, p2: false,
      slowT: 0, slowMul: 1, rootT: 0, tauntCd: 0,
      think: 0.2 + this.rng() * 0.3,
      hitFlash: 0, anim: 0, deathT: 0, yaw: 0, phase0: this.rng() * 6.28,
      wps: [], wi: 0, remain: 30, ft: 0, targetId: null, stuck: false,
      flyLen: 1, x0: c * CELL, z0: r * CELL, x1: c * CELL, z1: r * CELL
    };
    this.enemies.push(e);
    return e;
  };

  Battle.prototype.setupFly = function (e) {
    var route = this.routes[e.ent];
    var exit = null;
    if (route) {
      for (var i = 0; i < this.map.exits.length; i++) {
        if (this.map.exits[i].c + ',' + this.map.exits[i].r === route.exitKey) exit = this.map.exits[i];
      }
    }
    if (!exit) exit = this.map.exits[0];
    var ent = null;
    for (var j = 0; j < this.map.entrances.length; j++) if (this.map.entrances[j].id === e.ent) ent = this.map.entrances[j];
    e.x0 = ent ? ent.c * CELL : e.x;
    e.z0 = ent ? ent.r * CELL : e.z;
    e.x1 = exit.c * CELL;
    e.z1 = exit.r * CELL;
    e.exitKey = exit.c + ',' + exit.r;
    e.x = e.x0; e.z = e.z0;
    e.flyLen = Math.max(1, hypot(e.x1 - e.x0, e.z1 - e.z0) / CELL);
    e.ft = 0;
    e.y = 3.6;
    e.yaw = Math.atan2(e.x1 - e.x0, e.z1 - e.z0);
  };

  Battle.prototype.spawnAt = function (type, c, r, ent) {
    var e = this.makeEnemy(type, c, r, ent);
    if (!e) return null;
    if (e.flying) this.setupFly(e);
    else this.repath(e, null);
    return e;
  };

  Battle.prototype.spawnEntrance = function (type, entId) {
    var ent = null;
    for (var i = 0; i < this.map.entrances.length; i++) if (this.map.entrances[i].id === entId) ent = this.map.entrances[i];
    if (!ent) ent = this.map.entrances[0];
    var e = this.spawnAt(type, ent.c, ent.r, ent.id);
    if (e) this.sfx(TD.ENEMIES[type].boss ? 'boss' : 'spawn');
    if (e && TD.ENEMIES[type].boss) this.log('终局威胁「' + e.def.name + '」从' + ent.name + '接入', 'bad');
    else if (e && TD.ENEMIES[type].priority && this.stats._intro !== type) {
      /* 新威胁只提示一次 */
    }
    if (e && !this._seen) this._seen = {};
    if (e && !this._seen[type]) {
      this._seen[type] = true;
      if (!TD.ENEMIES[type].boss) this.log('新流量特征：' + e.def.name, 'warn');
    }
    return e;
  };

  Battle.prototype.queueNear = function (type, e, delay, hpMul, isCopy) {
    this.lateQ.push({ t: delay, type: type, c: e.c, r: e.r, ent: e.ent, hpMul: hpMul || 1, isCopy: !!isCopy });
  };

  Battle.prototype.makeTower = function (type, c, r, facing) {
    var def = TD.TOWERS[type];
    var t = {
      id: this.nid(), type: type, def: def, c: c, r: r,
      x: c * CELL, z: r * CELL,
      hp: def.hp, maxHp: def.hp, shield: 0, encryptT: 0,
      level: 1, branch: null, facing: facing || 0,
      cap: def.cap || 0, dmg: def.dmg || 0, range: def.range || 0,
      interval: def.interval || 1, attract: def.attract || 0,
      heal: def.heal || 0, cone: def.cone || 0,
      cd: 0.4, skillCd: 0, skillT: 0, bonusCap: 0,
      blocked: [], spentC: 0, spentI: 0,
      dead: false, deathT: 0, anim: 0, hitFlash: 0,
      targetId: null, healIds: [], nodeId: null, slowAmt: 0, slowDur: 0
    };
    var node = this.nodeAt(c, r);
    if (node) t.nodeId = node.id;
    this.towers.push(t);
    return t;
  };

  Battle.prototype.canPlace = function (type, c, r) {
    var def = TD.TOWERS[type];
    var cell = this.cellAt(c, r);
    if (!def || !cell) return { ok: false, reason: '这里没有可部署的位置' };
    var kind = cell.kind;
    var fit = false;
    if (type === 'firewall') fit = kind === 'path' || kind === 'old' || kind === 'node';
    else if (type === 'honeypot') fit = kind === 'path' || kind === 'old';
    else if (type === 'gate') fit = kind === 'node';
    else fit = kind === 'platform';
    if (!fit) return { ok: false, reason: type === 'gate' ? '网闸只能部署在交换节点' : (kind === 'platform' ? '这块平台不适合该设备' : '该地形不能部署这种设备') };
    if (this.towerAt(c, r) || this.holderAt(c, r)) return { ok: false, reason: '该格已经有设备' };
    if (kind === 'node') {
      var node = this.nodeAt(c, r);
      if (node.lockT > 0) return { ok: false, reason: '旁路刚直通，节点还在重构' };
      if (node.isolated) return { ok: false, reason: '节点已经处于隔离' };
      if (this.occupies(c, r)) return { ok: false, reason: '节点上还有入侵流量' };
    }
    var costI = kind === 'node' ? (def.nodeI || 0) : 0;
    if (this.compute < def.costC) return { ok: false, reason: '算力不足' };
    if (this.intel < costI) return { ok: false, reason: '情报不足' };
    if (kind === 'node') {
      var prev = this.previewIsolation(this.nodeAt(c, r).id);
      if (!prev.ok) return { ok: false, reason: '隔离后会有入口或敌人无路可走', sealed: prev.sealed, routes: prev.routes };
      return { ok: true, costC: def.costC, costI: costI, routes: prev.routes, sealed: [] };
    }
    return { ok: true, costC: def.costC, costI: 0, sealed: [] };
  };

  Battle.prototype.previewIsolation = function (nodeId) {
    var node = this.nodeById(nodeId);
    if (!node) return { ok: false, reason: '没有这个节点', sealed: [], routes: this.routes };
    var blocked = new Set(this.blocked);
    blocked.add(node.c + ',' + node.r);
    var sealed = [];
    if (this.occupies(node.c, node.r)) {
      sealed.push({ kind: 'cell', c: node.c, r: node.r, name: node.name });
    }
    var more = this.sealReport(blocked);
    for (var i = 0; i < more.length; i++) sealed.push(more[i]);
    var routes = TD.allRoutes(this.map, blocked, this.oldSet(), this.slowMap);
    return {
      ok: sealed.length === 0,
      reason: sealed.length ? '隔离后会有入口或敌人无路可走' : '',
      sealed: sealed,
      routes: routes
    };
  };

  Battle.prototype.place = function (type, c, r, facing, opt) {
    opt = opt || {};
    if (!opt.free) {
      var chk = this.canPlace(type, c, r);
      if (!chk.ok) {
        this.sfx('deny');
        if (chk.reason) this.log('拒绝部署：' + chk.reason, 'bad');
        return chk;
      }
    } else if (this.towerAt(c, r)) {
      return { ok: false, reason: '该格已经有设备' };
    }
    var def = TD.TOWERS[type];
    var cell = this.cellAt(c, r);
    var costC = opt.free ? 0 : def.costC;
    var costI = 0;
    if (!opt.free && cell && cell.kind === 'node') costI = def.nodeI || 0;
    this.compute -= costC;
    this.intel -= costI;
    var t = this.makeTower(type, c, r, facing || 0);
    t.spentC = opt.free ? 0 : costC;
    t.spentI = costI;
    if (opt.hpMul) t.hp = Math.max(1, t.maxHp * opt.hpMul);
    if (cell && cell.kind === 'node') this.closeNode(this.nodeAt(c, r), { kind: 'tower', id: t.id });
    this.stats.built++;
    this.sfx('place');
    this.fx(t.x, 0.4, t.z, 'place', { life: 0.6 });
    this.log('部署 ' + def.name + (cell && cell.kind === 'node' ? '，节点隔离' : ''));
    return { ok: true, tower: t };
  };

  Battle.prototype.applyLevel = function (t) {
    var def = t.def;
    var prev = t.maxHp;
    if (t.type === 'firewall') {
      t.maxHp = t.level >= 2 ? def.hp2 : def.hp;
      t.cap = t.level >= 2 ? def.cap2 : def.cap;
      t.dmg = t.level >= 2 ? def.dmg2 : def.dmg;
    } else if (t.type === 'honeypot') {
      if (t.branch === 'mirror') { t.attract = 5.25; t.cap = 4; t.maxHp = 220; }
      if (t.branch === 'reflect') { t.maxHp = 190; t.cap = 2; t.attract = def.attract; }
    } else if (t.type === 'gate') {
      t.maxHp = t.level >= 2 ? def.hp2 : def.hp;
    } else if (t.type === 'intercept') {
      if (t.branch === 'pierce') { t.dmg = 23; t.interval = 0.84; t.cone = 0.26; t.slowAmt = 0; }
      if (t.branch === 'suppress') { t.dmg = 15; t.interval = 0.46; t.cone = def.cone; t.slowAmt = 0.5; t.slowDur = 2.15; }
    } else if (t.type === 'sandbox') {
      if (t.level >= 2) { t.range = def.range2; t.dmg = def.dmg2; t.interval = def.interval2; }
    } else if (t.type === 'repair') {
      if (t.level >= 2) { t.range = def.range2; t.heal = def.heal2; }
    }
    t.hp += Math.max(0, t.maxHp - prev);
    if (t.hp > t.maxHp) t.hp = t.maxHp;
  };

  Battle.prototype.upgrade = function (id, branch) {
    var t = this.towerById(id);
    if (!t || t.dead) return { ok: false, reason: '设备不存在' };
    if (t.level >= 2) return { ok: false, reason: '已经是二级' };
    var needs = t.type === 'honeypot' || t.type === 'intercept';
    if (needs && !branch) return { ok: false, needBranch: true };
    if (branch && (!TD.BRANCHES[branch] || TD.BRANCHES[branch].tower !== t.type)) return { ok: false, reason: '分支不匹配' };
    var costC = t.def.upC || 0, costI = t.def.upI || 0;
    if (this.compute < costC) return { ok: false, reason: '算力不足' };
    if (this.intel < costI) return { ok: false, reason: '情报不足' };
    this.compute -= costC;
    this.intel -= costI;
    t.spentC += costC;
    t.level = 2;
    t.branch = branch || null;
    this.applyLevel(t);
    if (t.type === 'gate') { this.rebuildSlow(); this.repathAll(); }
    this.sfx('upgrade');
    this.fx(t.x, 1.2, t.z, 'upgrade', { life: 0.8 });
    this.log(t.def.name + ' 升级' + (branch ? ' · ' + TD.BRANCHES[branch].name : ''));
    return { ok: true };
  };

  Battle.prototype.sell = function (id) {
    var t = this.towerById(id);
    if (!t || t.dead) return { ok: false, reason: '设备不存在' };
    var refund = Math.floor(t.spentC * 0.5);
    this.compute += refund;
    this.stats.earnedC += refund;
    this.destroyTower(t, true);
    this.log('撤下 ' + t.def.name + '，返还算力 ' + refund);
    this.sfx('sell');
    return { ok: true, refund: refund };
  };

  Battle.prototype.castSkill = function (id) {
    var t = this.towerById(id);
    if (!t || t.dead) return { ok: false, reason: '设备不存在' };
    if (t.encryptT > 0) return { ok: false, reason: '加密锁定，无法释放技能' };
    if (t.skillCd > 0) return { ok: false, reason: '技能尚未就绪' };
    t.skillCd = t.def.skillCd;
    if (t.type === 'firewall') { t.skillT = t.def.skillDur; t.bonusCap = 1; }
    else if (t.type === 'honeypot') {
      t.skillT = t.def.skillDur;
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (!this.living(e)) continue;
        if (e.blocker === t.id || (e.tauntTo === t.id) || (this.distCell(e, t) <= t.attract + 0.2 && this.wantsTaunt(e, t))) {
          e.rootT = Math.max(e.rootT, t.def.skillDur);
        }
      }
    } else if (t.type === 'gate') {
      t.shield = Math.max(t.shield, t.def.skillShield);
    } else if (t.type === 'intercept') {
      t.skillT = t.def.skillDur;
    } else if (t.type === 'sandbox') {
      this.sandboxPulse(t, t.def.skillDmg);
    } else if (t.type === 'repair') {
      for (var j = 0; j < this.towers.length; j++) {
        var o = this.towers[j];
        if (o.dead || o.id === t.id) continue;
        if (this.distCell(o, t) <= t.range) {
          o.shield = Math.max(o.shield, t.def.skillShield);
          o.encryptT = 0;
          this.fx(o.x, 1.4, o.z, 'shield', { life: 0.6 });
        }
      }
    }
    this.sfx('skill');
    this.fx(t.x, 1.5, t.z, 'skill', { life: 0.7 });
    this.log(t.def.name + ' 释放「' + t.def.skill + '」');
    return { ok: true };
  };

  Battle.prototype.cellsIn = function (c, r, rad, pred) {
    var out = [];
    var R = Math.ceil(rad);
    for (var dc = -R; dc <= R; dc++) for (var dr = -R; dr <= R; dr++) {
      if (hypot(dc, dr) > rad) continue;
      var cell = this.cellAt(c + dc, r + dr);
      if (cell && (!pred || pred(cell))) out.push(cell);
    }
    return out;
  };

  Battle.prototype.previewDowngrade = function (c, r) {
    var cells = this.cellsIn(c, r, 2.2, function (cell) {
      return cell.kind === 'path' || cell.kind === 'old' || cell.kind === 'spawn';
    });
    var old = this.oldSet();
    cells.forEach(function (cell) { old.add(cell.c + ',' + cell.r); });
    var routes = TD.allRoutes(this.map, this.blocked, old, this.slowMap);
    return { ok: cells.length > 0, cells: cells, routes: routes, reason: cells.length ? '' : '附近没有链路' };
  };

  Battle.prototype.useItem = function (id, c, r) {
    var item = TD.ITEMS[id];
    if (!item) return { ok: false, reason: '没有这个道具' };
    if (this.itemCd[id] > 0) return { ok: false, reason: '道具冷却中' };
    if (id === 'isolator') {
      var node = this.nodeAt(c, r);
      if (!node) return { ok: false, reason: '需要投放到交换节点' };
      if (node.isolated) return { ok: false, reason: '节点已经隔离' };
      if (node.lockT > 0) return { ok: false, reason: '节点重构中' };
      if (this.occupies(c, r)) return { ok: false, reason: '节点上还有入侵流量' };
      var prev = this.previewIsolation(node.id);
      if (!prev.ok) {
        this.sfx('deny');
        this.log('拒绝隔离：' + prev.reason, 'bad');
        return { ok: false, reason: prev.reason, sealed: prev.sealed, routes: prev.routes };
      }
      if (this.intel < item.costI) return { ok: false, reason: '情报不足' };
      this.intel -= item.costI;
      this.itemCd[id] = item.cd;
      var h = { id: this.nid(), kind: 'isolator', c: c, r: r, nodeId: node.id, hp: 200, maxHp: 200, t: 11, dead: false, x: c * CELL, z: r * CELL };
      this.holders.push(h);
      this.closeNode(node, { kind: 'item', id: h.id });
      this.log('应急隔离器投入 ' + node.name + '（不产出情报）');
      return { ok: true, routes: prev.routes };
    }
    if (id === 'downgrade') {
      var view = this.previewDowngrade(c, r);
      if (!view.ok) return { ok: false, reason: view.reason };
      if (this.intel < item.costI) return { ok: false, reason: '情报不足' };
      this.intel -= item.costI;
      this.itemCd[id] = item.cd;
      var self = this;
      view.cells.forEach(function (cell) {
        var k = cell.c + ',' + cell.r;
        self.tempOld.set(k, Math.max(self.tempOld.get(k) || 0, 8.5));
      });
      this.enemies.forEach(function (e) {
        if (!self.living(e) || e.flying) return;
        if (self.tempOld.has(e.c + ',' + e.r) && e.def.camo) self.reveal(e);
      });
      this.repathAll();
      this.sfx('down');
      this.log('协议降级：一片链路改用旧协议');
      this.fx(c * CELL, 0.3, r * CELL, 'downgrade', { life: 0.8 });
      return { ok: true, cells: view.cells, routes: this.routes };
    }
    if (id === 'restore') {
      var t = this.towerAt(c, r);
      if (!t) return { ok: false, reason: '需要投放到设备上' };
      if (this.compute < item.costC) return { ok: false, reason: '算力不足' };
      this.compute -= item.costC;
      this.itemCd[id] = item.cd;
      t.hp = Math.min(t.maxHp, t.hp + t.maxHp * 0.46);
      t.encryptT = 0;
      this.fx(t.x, 1.6, t.z, 'restore', { life: 0.7 });
      this.sfx('heal');
      this.log('备份还原：' + t.def.name + ' 解除加密并恢复部分生命');
      return { ok: true };
    }
    return { ok: false, reason: '无法使用' };
  };

  Battle.prototype.closeNode = function (node, holder) {
    node.isolated = true;
    node.holder = holder;
    node.lockT = 0;
    this.rebuildBlocks();
    this.repathAll();
    this.fx(node.c * CELL, 1.1, node.r * CELL, 'iso', { life: 0.8 });
    this.sfx('iso');
  };

  Battle.prototype.openNode = function (node, lock) {
    node.isolated = false;
    node.holder = null;
    node.lockT = lock == null ? 11 : lock;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (e.goalNode === node.id || (e.state === 'attacknode' && e.goalNode === node.id)) {
        e.state = 'move';
        e.goalKey = null;
        e.goalNode = null;
      }
    }
    this.rebuildBlocks();
    this.repathAll();
    this.log(node.name + ' 旁路直通，短时间内不能再次隔离', 'warn');
    this.sfx('open');
    this.fx(node.c * CELL, 1.1, node.r * CELL, 'open', { life: 0.9 });
  };

  Battle.prototype.destroyTower = function (t, sold) {
    if (!t || t.dead) return;
    t.dead = true;
    t.deathT = sold ? 0.12 : 0.7;
    t.hp = 0;
    var ids = t.blocked.slice();
    t.blocked = [];
    for (var i = 0; i < ids.length; i++) {
      var e = this.enemyById(ids[i]);
      if (!e) continue;
      e.blocker = null;
      if (e.state === 'blocked') { e.state = 'move'; e.goalKey = null; this.repath(e, null); }
    }
    if (!sold && t.type === 'honeypot' && t.branch === 'reflect') {
      for (var j = 0; j < this.enemies.length; j++) {
        var o = this.enemies[j];
        if (this.living(o) && this.distCell(o, t) < 2.3) this.damageEnemy(o, 48, 'splash');
      }
      this.fx(t.x, 1, t.z, 'burst', { life: 0.6 });
    }
    if (t.nodeId) {
      var node = this.nodeById(t.nodeId);
      if (node && node.holder && node.holder.id === t.id) this.openNode(node, 11);
    }
    if (!sold) {
      this.stats.lost++;
      this.log(t.def.name + ' 被摧毁，隔离若存在则已解除', 'bad');
      this.sfx('crush');
      this.fx(t.x, 1, t.z, 'boom', { life: 0.7 });
    }
  };

  Battle.prototype.destroyHolder = function (h) {
    if (!h || h.dead) return;
    h.dead = true;
    h.hp = 0;
    var node = this.nodeById(h.nodeId);
    if (node && node.holder && node.holder.id === h.id) this.openNode(node, 8);
    this.fx(h.x, 1, h.z, 'boom', { life: 0.55 });
    this.sfx('crush');
  };

  Battle.prototype.damageHolder = function (node, dmg) {
    if (!node || !node.holder) return;
    if (node.holder.kind === 'tower') {
      var t = this.towerById(node.holder.id);
      if (t) this.damageTower(t, dmg, null);
    } else {
      var h = null;
      for (var i = 0; i < this.holders.length; i++) if (this.holders[i].id === node.holder.id) h = this.holders[i];
      if (!h || h.dead) return;
      h.hp -= dmg;
      this.fx(h.x, 1.2, h.z, 'hitred', { life: 0.3 });
      if (h.hp <= 0) this.destroyHolder(h);
    }
  };

  Battle.prototype.damageTower = function (t, dmg, src) {
    if (!t || t.dead) return;
    if (t.skillT > 0 && t.type === 'firewall') dmg *= 0.72;
    if (t.shield > 0) {
      var a = Math.min(t.shield, dmg);
      t.shield -= a;
      dmg -= a;
      if (t.shield <= 0) this.fx(t.x, 1.3, t.z, 'break', { life: 0.4 });
    }
    if (dmg <= 0) { t.hitFlash = 0.12; return; }
    t.hp -= dmg;
    t.hitFlash = 0.22;
    this.stats.taken += dmg;
    if (t.type === 'honeypot' && t.branch === 'reflect' && src && src.def) {
      this.damageEnemy(src, dmg * 0.65, 'hit');
    }
    this.fx(t.x, 1.2, t.z, 'hitred', { life: 0.25 });
    if (t.hp <= 0) this.destroyTower(t, false);
  };

  Battle.prototype.reveal = function (e) {
    if (!e || e.revealed) return;
    e.revealed = true;
    this.fx(e.x, 1.2, e.z, 'reveal', { life: 0.5 });
    this.sfx('reveal');
  };

  Battle.prototype.damageEnemy = function (e, dmg, cause) {
    if (!this.living(e)) return;
    if (e.shield > 0) {
      var a = Math.min(e.shield, dmg);
      e.shield -= a;
      dmg -= a;
      if (e.shield <= 0) this.fx(e.x, 1.1, e.z, 'break', { life: 0.35 });
    }
    if (dmg <= 0) return;
    if (e.armorOn && e.def.armor) dmg *= e.def.armor;
    e.hp -= dmg;
    e.hitFlash = 0.16;
    this.stats.dealt += dmg;
    if (dmg >= 8) this.float(e.x, e.z, Math.round(dmg).toString(), '#ffe7a0');
    if (e.hp <= 0) this.kill(e, cause);
  };

  Battle.prototype.kill = function (e, cause) {
    if (!this.living(e)) return;
    var payload = !!(e.def.camo && !e.revealed && cause === 'splash');
    e.state = 'dead';
    e.hp = 0;
    e.deathT = 0.65;
    if (e.blocker) {
      var t = this.towerById(e.blocker);
      if (t) t.blocked = t.blocked.filter(function (id) { return id !== e.id; });
      e.blocker = null;
    }
    this.compute += e.def.rewardC || 0;
    this.intel += e.def.rewardI || 0;
    this.stats.kills++;
    this.stats.earnedC += e.def.rewardC || 0;
    this.sfx(e.def.boss ? 'bossdie' : 'die');
    this.fx(e.x, 0.8, e.z, e.def.boss ? 'bossdie' : 'die', { life: 0.6 });
    if (e.def.boss) this.log(e.def.name + ' 已被清除', 'good');
    if (payload) this.payload(e);
  };

  Battle.prototype.payload = function (e) {
    this.log('未显形木马被波及击破，释放载荷', 'bad');
    this.fx(e.x, 0.6, e.z, 'payload', { life: 0.7 });
    this.sfx('payload');
    for (var i = 0; i < this.towers.length; i++) {
      var t = this.towers[i];
      if (t.dead) continue;
      if (this.distCell(e, t) <= (e.def.payloadR || 2)) this.damageTower(t, e.def.payload || 40, null);
    }
  };

  Battle.prototype.leak = function (e) {
    if (!this.living(e)) return;
    e.state = 'leaked';
    e.deathT = 0.7;
    if (e.blocker) {
      var t = this.towerById(e.blocker);
      if (t) t.blocked = t.blocked.filter(function (id) { return id !== e.id; });
      e.blocker = null;
    }
    this.integrity -= e.def.leak || 1;
    if (this.integrity < 0) this.integrity = 0;
    this.stats.leaks++;
    this.float(e.x, e.z, '-' + e.def.leak, '#ff5d73');
    this.sfx('leak');
    var exitName = '中枢';
    if (e.exitKey) {
      for (var i = 0; i < this.map.exits.length; i++) {
        if (this.map.exits[i].c + ',' + this.map.exits[i].r === e.exitKey) exitName = this.map.exits[i].name;
      }
    }
    this.log(e.def.name + ' 进入「' + exitName + '」，完整度 -' + e.def.leak, 'bad');
    if (this.integrity <= 0 && !this.suppressEnd) {
      this.phase = 'defeat';
      this.over = true;
      this.log('中枢完整度归零，守护失败', 'bad');
      this.sfx('lose');
    }
  };

  Battle.prototype.blockersFor = function (c, r) {
    var list = [];
    for (var i = 0; i < this.towers.length; i++) {
      var t = this.towers[i];
      if (t.dead) continue;
      if (t.type !== 'firewall' && t.type !== 'honeypot') continue;
      if (t.c === c && t.r === r) list.push(t);
      else if (t.type === 'firewall' && t.nodeId && (Math.abs(t.c - c) + Math.abs(t.r - r) === 1)) list.push(t);
    }
    return list;
  };

  Battle.prototype.usedCap = function (t) {
    var s = 0;
    for (var i = 0; i < t.blocked.length; i++) {
      var e = this.enemyById(t.blocked[i]);
      if (e && e.state === 'blocked') s += e.def.block || 1;
    }
    return s;
  };

  Battle.prototype.tryBlock = function (e, c, r) {
    var list = this.blockersFor(c, r);
    list.sort(function (a, b) {
      return (e.tauntTo === a.id ? -1 : 0) - (e.tauntTo === b.id ? -1 : 0);
    });
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      var cap = (t.cap || 0) + (t.bonusCap || 0);
      if (this.usedCap(t) + (e.def.block || 1) <= cap) {
        e.state = 'blocked';
        e.blocker = t.id;
        t.blocked.push(e.id);
        if (e.def.camo) this.reveal(e);
        this.fx(e.x, 0.5, e.z, 'block', { life: 0.35 });
        return true;
      }
    }
    return false;
  };

  Battle.prototype.onEnter = function (e) {
    var k = e.c + ',' + e.r;
    var cell = this.cellAt(e.c, e.r);
    if (!cell) return false;
    if ((cell.old || this.tempOld.has(k)) && e.def.camo) this.reveal(e);
    if (cell.kind === 'node' && e.def.split && !e.duplicated && !e.isCopy && !this.blocked.has(k)) {
      e.duplicated = true;
      this.queueNear('worm', e, 0.05, 0.68, true);
      this.fx(e.x, 0.8, e.z, 'split', { life: 0.45 });
      this.sfx('split');
    }
    if (e.goalKey === k && e.goalNode) {
      e.state = 'attacknode';
      e.anim = 0.8;
      return true;
    }
    if (this.tryBlock(e, e.c, e.r)) return true;
    if (e.goalKey === k && e.tauntTo) {
      e.tauntCd = 3.2;
      e.tauntTo = null;
      e.goalKey = null;
      this.repath(e, null);
      return true;
    }
    if (cell.kind === 'exit') { this.leak(e); return true; }
    e.remain = Math.max(0, (e.remain || 0) - TD.costOf(cell, this.oldSet(), this.slowMap));
    return false;
  };

  Battle.prototype.speedMul = function (e, c, r) {
    var cell = this.cellAt(c, r);
    var m = 1;
    var k = c + ',' + r;
    if (cell && (cell.old || this.tempOld.has(k))) m /= TD.OLD_COST;
    if (this.slowMap.has(k)) m /= this.slowMap.get(k);
    if (e.slowT > 0) m *= e.slowMul || 0.5;
    if (e.pace != null) m *= e.pace;
    return m;
  };

  Battle.prototype.wantsTaunt = function (e, pot) {
    if (!this.living(e) || e.flying || e.def.boss) return false;
    if (e.def.taunt) return true;
    if (e.def.id === 'flood' && pot && pot.branch === 'mirror') return true;
    return false;
  };

  Battle.prototype.nearestPot = function (e) {
    var best = null, bd = 1e9;
    for (var i = 0; i < this.towers.length; i++) {
      var t = this.towers[i];
      if (t.dead || t.type !== 'honeypot') continue;
      if (!this.wantsTaunt(e, t)) continue;
      var d = this.distCell(e, t);
      if (d <= (t.attract || 3) && d < bd) { bd = d; best = t; }
    }
    return best;
  };

  Battle.prototype.nearestIsolated = function (e, rad) {
    var best = null, bd = 1e9;
    for (var i = 0; i < this.nodes.length; i++) {
      var n = this.nodes[i];
      if (!n.isolated || !n.holder) continue;
      var d = Math.abs(n.c - e.c) + Math.abs(n.r - e.r);
      if (d <= rad && d < bd) { bd = d; best = n; }
    }
    return best;
  };

  Battle.prototype.bestAdj = function (node, e) {
    var ds = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    var best = null, bd = 1e9;
    for (var i = 0; i < 4; i++) {
      var c = node.c + ds[i][0], r = node.r + ds[i][1];
      var cell = this.cellAt(c, r);
      if (!cell || !TD.walkKind(cell.kind)) continue;
      if (this.blocked.has(c + ',' + r)) continue;
      var route = this.pathFrom(e.c + ',' + e.r, this.blocked, c + ',' + r);
      if (!route) continue;
      if (route.cost < bd) { bd = route.cost; best = { c: c, r: r }; }
    }
    return best;
  };

  Battle.prototype.thinkEnemy = function (e) {
    if (e.state !== 'move' || e.rootT > 0) return;
    var pot = this.nearestPot(e);
    if (pot) {
      var gk = pot.c + ',' + pot.r;
      if (e.goalKey !== gk) {
        e.tauntTo = pot.id;
        e.goalNode = null;
        this.repath(e, gk);
      }
      return;
    }
    if (e.tauntTo) { e.tauntTo = null; e.goalKey = null; this.repath(e, null); }
    if (e.def.divert) {
      var node = this.nearestIsolated(e, e.def.divert);
      if (node) {
        if (e.goalNode !== node.id) {
          var adj = this.bestAdj(node, e);
          if (adj) {
            e.goalNode = node.id;
            this.repath(e, adj.c + ',' + adj.r);
          }
        }
        return;
      }
      if (e.goalNode) { e.goalNode = null; e.goalKey = null; this.repath(e, null); }
    }
  };

  Battle.prototype.moveEnemy = function (e, dt) {
    if (e.rootT > 0) return;
    if (!e.wps || !e.wps.length || e.wi >= e.wps.length) {
      this.repath(e, e.goalKey || null);
      if (!e.wps || e.wi >= e.wps.length) return;
    }
    var wp = e.wps[e.wi];
    var tx = wp.c * CELL, tz = wp.r * CELL;
    var dx = tx - e.x, dz = tz - e.z;
    var dist = hypot(dx, dz);
    var step = e.def.speed * this.speedMul(e, wp.c, wp.r) * CELL * dt;
    if (dist <= Math.max(0.04, step)) {
      e.x = tx; e.z = tz; e.c = wp.c; e.r = wp.r;
      var stop = this.onEnter(e);
      if (stop || !this.living(e) || e.state !== 'move') return;
      e.wi++;
    } else {
      e.x += dx / dist * step;
      e.z += dz / dist * step;
      e.yaw = Math.atan2(dx, dz);
      e.c = Math.round(e.x / CELL);
      e.r = Math.round(e.z / CELL);
    }
  };

  Battle.prototype.flyEnemy = function (e, dt) {
    e.ft += (e.def.speed * dt) / e.flyLen;
    var f = Math.min(1, e.ft);
    e.x = e.x0 + (e.x1 - e.x0) * f;
    e.z = e.z0 + (e.z1 - e.z0) * f;
    e.y = 3.55 + Math.sin(this.time * 3.2 + e.phase0) * 0.22;
    if (e.ft >= 1) this.leak(e);
  };

  Battle.prototype.ransomTarget = function (e) {
    var best = null, bd = 1e9, pot = null, pd = 1e9;
    for (var i = 0; i < this.towers.length; i++) {
      var t = this.towers[i];
      if (t.dead) continue;
      var d = this.distCell(e, t);
      if (d > e.def.range) continue;
      if (t.type === 'honeypot' && d < pd) { pd = d; pot = t; }
      if (d < bd) { bd = d; best = t; }
    }
    return pot || best;
  };

  Battle.prototype.shootTower = function (e, t) {
    var dist = hypot(t.x - e.x, t.z - e.z);
    this.projectiles.push({
      id: this.nid(), kind: 'lock',
      x: e.x, y: e.flying ? e.y : 0.9, z: e.z,
      targetTower: t.id, dmg: e.def.shot, encrypt: e.def.encrypt || 0,
      age: 0, dur: Math.max(0.12, dist / 14),
      sx: e.x, sy: e.flying ? e.y : 0.9, sz: e.z
    });
    e.targetId = t.id;
    e.anim = 0.45;
    this.sfx('ransom');
  };

  Battle.prototype.attackBlocked = function (e, dt) {
    var t = this.towerById(e.blocker);
    if (!t || t.dead) {
      e.blocker = null;
      e.state = 'move';
      this.repath(e, null);
      return;
    }
    e.x = e.c * CELL; e.z = e.r * CELL;
    e.yaw = Math.atan2(t.x - e.x, t.z - e.z);
    if (e.def.melee) {
      e.attackCd -= dt;
      if (e.attackCd <= 0) {
        this.damageTower(t, e.def.melee, e);
        e.attackCd = e.def.meleeCd || 0.7;
        e.anim = 0.4;
        t.anim = Math.max(t.anim, 0.2);
        this.sfx('bite');
        this.fx((e.x + t.x) / 2, 0.8, (e.z + t.z) / 2, 'slash', { life: 0.28 });
      }
    }
  };

  Battle.prototype.attackNode = function (e, dt) {
    var node = e.goalNode ? this.nodeById(e.goalNode) : null;
    if (!node || !node.isolated || !node.holder) {
      e.state = 'move';
      e.goalNode = null;
      e.goalKey = null;
      this.repath(e, null);
      return;
    }
    e.yaw = Math.atan2(node.c * CELL - e.x, node.r * CELL - e.z);
    e.attackCd -= dt;
    if (e.attackCd <= 0) {
      var dmg = (e.def.melee || 20) * (e.def.boss ? 1.35 : 1);
      this.damageHolder(node, dmg);
      e.attackCd = e.def.meleeCd || 0.75;
      e.anim = 0.55;
      this.sfx('slam');
      this.fx(node.c * CELL, 1, node.r * CELL, 'slam', { life: 0.4 });
    }
  };

  Battle.prototype.bossTick = function (e, dt) {
    var self = this;
    if (e.def.id === 'wankui') {
      if (!e.p2 && e.hp <= e.maxHp * 0.5) {
        e.p2 = true; e.phase = 2;
        this.log('万傀生命过半，傀儡笼打开', 'bad');
        this.sfx('boss');
        for (var i = 0; i < 6; i++) this.queueNear('worm', e, 0.35 + i * 0.42, 0.85, true);
      }
      e.bossCd -= dt;
      if (e.bossCd <= 0) {
        var node = this.nearestIsolated(e, 11);
        if (node) {
          this.telegraph([node.c + ',' + node.r], 2.6, 'slam', function () {
            var live = self.nodeById(node.id);
            if (live && live.isolated) {
              self.damageHolder(live, e.def.slam || 180);
              self.log('万傀洪峰冲击「' + live.name + '」', 'bad');
              self.fx(live.c * CELL, 1.4, live.r * CELL, 'boom', { life: 0.6 });
            }
          });
        }
        e.bossCd = 9;
      }
    } else if (e.def.id === 'mirage') {
      if (!e.p2 && e.hp <= e.maxHp * 0.5) {
        e.p2 = true; e.phase = 2; e.storm = 6.5; e.stormTick = 0.2;
        this.log('蜃楼发动路由风暴', 'bad');
        this.sfx('boss');
      }
      if (e.storm > 0) {
        e.storm -= dt;
        e.stormTick -= dt;
        if (e.stormTick <= 0) {
          e.stormTick = 1;
          for (var i = 0; i < this.towers.length; i++) {
            var t = this.towers[i];
            if (t.dead || this.distCell(t, e) > 3.5) continue;
            t.shield = Math.max(0, t.shield - 55);
            this.damageTower(t, 10, e);
          }
          this.fx(e.x, 1.6, e.z, 'storm', { life: 0.5 });
        }
      }
      e.bossCd -= dt;
      if (e.bossCd <= 0) {
        var cells = this.pickSegment(e, 3);
        if (cells) {
          this.telegraph(cells, 2.9, 'blackhole', function () { self.tryTempBlock(cells, 6.2, 'blackhole'); });
          this.log('蜃楼正在伪造路由，黑洞即将落下', 'warn');
        }
        e.bossCd = 11;
      }
    } else if (e.def.id === 'shadow') {
      var ratio = e.hp / e.maxHp;
      if (e.phase < 2 && ratio <= 0.7) {
        e.phase = 2; e.revealed = true; e.armorOn = true;
        this.log('蛰影提权：护甲展开，木马被释放', 'bad');
        this.sfx('boss');
        for (var k = 0; k < 4; k++) this.queueNear('trojan', e, 0.3 + k * 0.45, 1, true);
      }
      if (e.phase < 3 && ratio <= 0.4) {
        e.phase = 3; e.armorOn = false;
        var lock = this.pickSegment(e, 4);
        if (lock) {
          this.telegraph(lock, 3.1, 'lock', function () { self.tryTempBlock(lock, 9, 'lock'); });
          this.log('蛰影准备锁死前方运维环', 'bad');
        } else this.log('蛰影进入破坏阶段', 'bad');
        e.phase = 3;
      }
    }
  };

  Battle.prototype.pickSegment = function (e, n) {
    var idxs = [];
    if (e.wps && e.wps.length) {
      for (var i = e.wi; i < e.wps.length && idxs.length < n + 2; i++) idxs.push(e.wps[i].c + ',' + e.wps[i].r);
    }
    var routes = this.routes;
    var keys = Object.keys(routes);
    for (var r = 0; r < keys.length && idxs.length < 12; r++) {
      var p = routes[keys[r]] && routes[keys[r]].path;
      if (!p) continue;
      for (var j = 0; j < p.length && idxs.length < 14; j++) idxs.push(p[j]);
    }
    var cand = [];
    for (var a = 0; a < idxs.length; a++) {
      var cell = this.map.cells[idxs[a]];
      if (!cell) continue;
      if (cell.kind === 'spawn' || cell.kind === 'exit' || cell.kind === 'node') continue;
      if (this.occupies(cell.c, cell.r)) continue;
      cand.push(idxs[a]);
    }
    for (var s = 0; s + n <= cand.length; s++) {
      var seg = cand.slice(s, s + n);
      var uniq = [];
      var seen = {};
      for (var u = 0; u < seg.length; u++) if (!seen[seg[u]]) { seen[seg[u]] = 1; uniq.push(seg[u]); }
      if (uniq.length < Math.min(2, n)) continue;
      var blocked = new Set(this.blocked);
      uniq.forEach(function (k) { blocked.add(k); });
      if (this.sealReport(blocked).length === 0) return uniq;
    }
    return null;
  };

  Battle.prototype.tryTempBlock = function (cells, dur, kind) {
    var use = [];
    for (var i = 0; i < cells.length; i++) {
      var p = cells[i].split(',');
      if (this.occupies(+p[0], +p[1])) continue;
      var cell = this.map.cells[cells[i]];
      if (!cell || !TD.walkKind(cell.kind)) continue;
      if (cell.kind === 'spawn' || cell.kind === 'exit') continue;
      use.push(cells[i]);
    }
    if (!use.length) return false;
    var blocked = new Set(this.blocked);
    use.forEach(function (k) { blocked.add(k); });
    if (this.sealReport(blocked).length) {
      this.log('地形改变会封死通路，攻击改道失败', 'warn');
      return false;
    }
    for (var j = 0; j < use.length; j++) this.tempBlocks.set(use[j], { t: dur, kind: kind });
    this.rebuildBlocks();
    this.repathAll();
    this.log(kind === 'lock' ? '一段运维环被锁死，路线重新收敛' : '路由黑洞截断通行，各入口改道', 'bad');
    this.sfx('terra');
    return true;
  };

  Battle.prototype.telegraph = function (cells, time, kind, fn) {
    this.telegraphs.push({ cells: cells.slice(), t: time, max: time, kind: kind, fn: fn });
  };

  Battle.prototype.forceBreakNode = function (nodeId) {
    var node = this.nodeById(nodeId);
    if (!node || !node.holder) return false;
    if (node.holder.kind === 'tower') {
      var t = this.towerById(node.holder.id);
      if (t) this.destroyTower(t, false);
    } else {
      for (var i = 0; i < this.holders.length; i++) if (this.holders[i].id === node.holder.id) this.destroyHolder(this.holders[i]);
    }
    return true;
  };

  Battle.prototype.warnLock = function (cells, delay, dur) {
    var self = this;
    this.telegraph(cells, delay, 'lock', function () { self.tryTempBlock(cells, dur, 'lock'); });
  };

  Battle.prototype.inRange = function (t, e) {
    if (e.flying) return hypot(e.x - t.x, e.z - t.z) / CELL <= (t.range || 0);
    return this.distCell(t, e) <= (t.range || 0);
  };

  Battle.prototype.inCone = function (t, e) {
    var ang = Math.atan2(e.x - t.x, e.z - t.z);
    var d = Math.atan2(Math.sin(ang - t.facing), Math.cos(ang - t.facing));
    return Math.abs(d) <= (t.cone || 0.8) * 0.5;
  };

  Battle.prototype.inLane = function (t, e, half) {
    var ang = Math.atan2(e.x - t.x, e.z - t.z);
    var d = Math.atan2(Math.sin(ang - t.facing), Math.cos(ang - t.facing));
    return Math.abs(d) <= half && this.inRange(t, e);
  };

  Battle.prototype.acquire = function (t) {
    var best = null, bs = -1;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!this.living(e)) continue;
      if (t.type === 'firewall') {
        if (e.blocker !== t.id) continue;
      } else {
        if (!this.inRange(t, e) || !this.inCone(t, e)) continue;
        if (e.def.camo && !e.revealed) continue;
      }
      var s = this.urgency(e);
      if (s > bs) { bs = s; best = e; }
    }
    return best;
  };

  Battle.prototype.sandboxPulse = function (t, dmg) {
    this.fx(t.x, 0.2, t.z, 'scan', { life: 0.55, range: t.range || 3.5 });
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!this.living(e) || e.flying) continue;
      if (this.distCell(e, t) > (t.range || 3)) continue;
      if (e.def.camo && !e.revealed) this.reveal(e);
      this.damageEnemy(e, dmg, 'hit');
    }
    t.anim = 0.4;
    this.sfx('scan');
  };

  Battle.prototype.fireIntercept = function (t, target) {
    if (t.branch === 'pierce') {
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (!this.living(e)) continue;
        if (!this.inLane(t, e, (t.cone || 0.26) * 0.5)) continue;
        var splash = e.def.camo && !e.revealed;
        this.damageEnemy(e, t.dmg, splash ? 'splash' : 'hit');
      }
      this.fx(t.x, 1.3, t.z, 'pierce', { life: 0.18, x2: target.x, y2: target.flying ? target.y : 0.8, z2: target.z });
      this.sfx('pierce');
    } else {
      var dist = hypot(target.x - t.x, target.z - t.z);
      this.projectiles.push({
        id: this.nid(), kind: t.branch === 'suppress' ? 'slow' : 'bolt',
        x: t.x, y: 1.45, z: t.z, target: target.id, dmg: t.dmg,
        slow: t.slowAmt || 0, slowDur: t.slowDur || 0,
        age: 0, dur: Math.max(0.07, dist / 16),
        sx: t.x, sy: 1.45, sz: t.z
      });
      this.sfx(t.branch === 'suppress' ? 'suppress' : 'shot');
    }
    t.targetId = target.id;
    t.anim = 0.32;
  };

  Battle.prototype.updateTower = function (t, dt) {
    if (t.dead) { t.deathT -= dt; return; }
    t.hitFlash = Math.max(0, t.hitFlash - dt);
    t.anim = Math.max(0, t.anim - dt * 1.6);
    if (t.skillCd > 0) t.skillCd -= dt;
    if (t.skillT > 0) {
      t.skillT -= dt;
      if (t.skillT <= 0 && t.type === 'firewall') {
        t.bonusCap = 0;
        this.trimBlocks(t);
      }
    }
    if (t.encryptT > 0) {
      t.encryptT -= dt;
      t.targetId = null;
      t.healIds = [];
      return;
    }
    if (t.type === 'repair') { this.healTower(t, dt); return; }
    if (t.type === 'gate' || t.type === 'honeypot') { t.targetId = null; return; }
    t.cd -= dt;
    if (t.type === 'sandbox') {
      if (t.cd <= 0) { this.sandboxPulse(t, t.dmg); t.cd = t.interval; }
      return;
    }
    if (t.cd > 0) return;
    var target = this.acquire(t);
    t.targetId = target ? target.id : null;
    if (!target) return;
    if (t.type === 'firewall') {
      this.damageEnemy(target, t.dmg, 'hit');
      this.fx((t.x + target.x) / 2, 0.7, (t.z + target.z) / 2, 'slash', { life: 0.22 });
      if (t.level >= 2) {
        for (var i = 0; i < t.blocked.length; i++) {
          var o = this.enemyById(t.blocked[i]);
          if (o && o.id !== target.id && this.living(o)) this.damageEnemy(o, t.dmg * 0.4, 'hit');
        }
      }
      t.anim = 0.3;
      this.sfx('fw');
    } else {
      this.fireIntercept(t, target);
    }
    var rate = (t.skillT > 0 && t.type === 'intercept') ? 0.45 : 1;
    t.cd = t.interval * rate;
  };

  Battle.prototype.trimBlocks = function (t) {
    var cap = (t.cap || 0) + (t.bonusCap || 0);
    var guard = 0;
    while (this.usedCap(t) > cap && guard++ < 8) {
      var worst = null, ws = 99;
      for (var i = 0; i < t.blocked.length; i++) {
        var e = this.enemyById(t.blocked[i]);
        if (!e || e.state !== 'blocked') continue;
        var s = this.urgency(e);
        if (s < ws) { ws = s; worst = e; }
      }
      if (!worst) break;
      t.blocked = t.blocked.filter(function (id) { return id !== worst.id; });
      worst.blocker = null;
      worst.state = 'move';
      this.repath(worst, null);
    }
  };

  Battle.prototype.healTower = function (t, dt) {
    t.healIds = [];
    for (var i = 0; i < this.towers.length; i++) {
      var o = this.towers[i];
      if (o.dead || o.id === t.id || o.hp >= o.maxHp - 0.2) continue;
      if (this.distCell(o, t) > t.range) continue;
      o.hp = Math.min(o.maxHp, o.hp + t.heal * dt);
      t.healIds.push(o.id);
    }
  };

  Battle.prototype.updateEnemy = function (e, dt) {
    if (e.state === 'dead' || e.state === 'leaked') { e.deathT -= dt; return; }
    e.hitFlash = Math.max(0, e.hitFlash - dt);
    e.anim = Math.max(0, e.anim - dt * 1.4);
    e.slowT = Math.max(0, e.slowT - dt);
    e.rootT = Math.max(0, e.rootT - dt);
    e.tauntCd = Math.max(0, e.tauntCd - dt);
    e.phase0 += dt;
    if (e.flying) {
      this.flyEnemy(e, dt);
      return;
    }
    if (e.def.boss) this.bossTick(e, dt);
    if (e.def.giveShield) {
      e.giveWait -= dt;
      if (e.giveWait <= 0) {
        for (var i = 0; i < this.enemies.length; i++) {
          var o = this.enemies[i];
          if (o.id === e.id || !this.living(o) || o.flying) continue;
          if (this.distCell(o, e) <= e.def.giveR) o.shield = Math.max(o.shield, e.def.giveShield);
        }
        e.giveWait = e.def.giveCd;
        this.fx(e.x, 1, e.z, 'shell', { life: 0.4 });
      }
    }
    if (e.def.shot) {
      e.shotWait -= dt;
      if (e.shotWait <= 0) {
        var tgt = this.ransomTarget(e);
        if (tgt) { this.shootTower(e, tgt); e.shotWait = e.def.shotCd; }
      }
    }
    if (e.state === 'blocked') { this.attackBlocked(e, dt); return; }
    if (e.state === 'attacknode') { this.attackNode(e, dt); return; }
    if (e.rootT > 0) return;
    e.think -= dt;
    if (e.think <= 0) { e.think = 0.45; this.thinkEnemy(e); }
    this.moveEnemy(e, dt);
  };

  Battle.prototype.updateProjectile = function (p, dt) {
    p.age += dt;
    var tx, ty, tz, alive = false;
    if (p.target) {
      var e = this.enemyById(p.target);
      if (e && this.living(e)) { tx = e.x; ty = e.flying ? e.y : 0.7; tz = e.z; alive = true; }
    } else if (p.targetTower) {
      var t = this.towerById(p.targetTower);
      if (t && !t.dead) { tx = t.x; ty = 1.1; tz = t.z; alive = true; }
    }
    if (alive) { p.x2 = tx; p.y2 = ty; p.z2 = tz; }
    var f = Math.min(1, p.age / p.dur);
    var x2 = p.x2 != null ? p.x2 : p.x, y2 = p.y2 != null ? p.y2 : p.y, z2 = p.z2 != null ? p.z2 : p.z;
    p.x = p.sx + (x2 - p.sx) * f;
    p.y = p.sy + (y2 - p.sy) * f;
    p.z = p.sz + (z2 - p.sz) * f;
    if (p.age < p.dur) return;
    p.done = true;
    if (p.target && alive) {
      var victim = this.enemyById(p.target);
      if (victim) {
        this.damageEnemy(victim, p.dmg, 'hit');
        if (p.slow) { victim.slowT = Math.max(victim.slowT, p.slowDur || 1.5); victim.slowMul = p.slow; }
        this.fx(victim.x, victim.flying ? victim.y : 0.8, victim.z, 'spark', { life: 0.25 });
      }
    }
    if (p.targetTower && alive) {
      var tower = this.towerById(p.targetTower);
      if (tower) {
        var src = null;
        this.damageTower(tower, p.dmg, src);
        if (p.encrypt) this.encryptTower(tower, p.encrypt);
      }
    }
  };

  Battle.prototype.encryptTower = function (t, dur) {
    if (!t || t.dead || t.type === 'honeypot') return;
    var was = t.encryptT > 0;
    t.encryptT = Math.max(t.encryptT, dur);
    if (!was) {
      this.fx(t.x, 1.5, t.z, 'encrypt', { life: 0.6 });
      this.sfx('encrypt');
    }
  };

  Battle.prototype.startWave = function () {
    if (this.phase === 'victory' || this.phase === 'defeat') return;
    var w = this.waves[this.waveIndex];
    this.phase = 'combat';
    this.prepLeft = 0;
    this.waveT = 0;
    this.spawnQ = [];
    this.compute += w.grantC;
    this.intel += w.grantI;
    this.stats.earnedC += w.grantC;
    for (var i = 0; i < w.spawns.length; i++) {
      var s = w.spawns[i];
      for (var n = 0; n < s.n; n++) this.spawnQ.push({ t: (s.delay || 0) + n * s.gap, ent: s.ent, type: s.type });
    }
    this.spawnQ.sort(function (a, b) { return a.t - b.t; });
    this.log('第 ' + (this.waveIndex + 1) + ' 波流量到达', 'warn');
    this.sfx('wave');
  };

  Battle.prototype.skipPrep = function () {
    if (this.phase !== 'prep' || this.over) return { ok: false };
    this.compute += 10;
    this.startWave();
    return { ok: true };
  };

  Battle.prototype.update = function (dt) {
    if (dt < 0) dt = 0;
    if (dt > 0.35) dt = 0.35;
    if (this.over && this.phase !== 'combat') {
      this.time += dt;
      this.fadeFx(dt);
      return;
    }
    this.time += dt;
    var self = this;
    var dirty = false;
    ['isolator', 'downgrade', 'restore'].forEach(function (k) {
      if (self.itemCd[k] > 0) self.itemCd[k] = Math.max(0, self.itemCd[k] - dt);
    });
    for (var i = 0; i < this.nodes.length; i++) if (this.nodes[i].lockT > 0) this.nodes[i].lockT = Math.max(0, this.nodes[i].lockT - dt);
    this.tempBlocks.forEach(function (v, k) {
      v.t -= dt;
      if (v.t <= 0) { self.tempBlocks.delete(k); dirty = true; }
    });
    this.tempOld.forEach(function (v, k) {
      var nv = v - dt;
      if (nv <= 0) { self.tempOld.delete(k); dirty = true; }
      else self.tempOld.set(k, nv);
    });
    if (dirty) {
      this.rebuildBlocks();
      this.repathAll();
      this.log('临时通行变化结束，路线恢复计算');
    }
    for (var g = this.telegraphs.length - 1; g >= 0; g--) {
      var tel = this.telegraphs[g];
      tel.t -= dt;
      if (tel.t <= 0) {
        if (tel.fn) tel.fn();
        this.telegraphs.splice(g, 1);
      }
    }
    if (this.phase === 'prep') {
      this.prepLeft -= dt;
      if (this.prepLeft <= 0) this.startWave();
    }
    if (this.phase === 'combat') {
      this.waveT += dt;
      while (this.spawnQ.length && this.spawnQ[0].t <= this.waveT) {
        var sp = this.spawnQ.shift();
        this.spawnEntrance(sp.type, sp.ent);
      }
    }
    for (var q = this.lateQ.length - 1; q >= 0; q--) {
      this.lateQ[q].t -= dt;
      if (this.lateQ[q].t <= 0) {
        var job = this.lateQ[q];
        var born = this.spawnAt(job.type, job.c, job.r, job.ent);
        if (born) {
          born.isCopy = !!job.isCopy;
          born.duplicated = !!job.isCopy;
          if (job.hpMul && job.hpMul !== 1) { born.hp *= job.hpMul; born.maxHp = born.hp; }
        }
        this.lateQ.splice(q, 1);
      }
    }
    for (var ei = 0; ei < this.enemies.length; ei++) this.updateEnemy(this.enemies[ei], dt);
    for (var ti = 0; ti < this.towers.length; ti++) this.updateTower(this.towers[ti], dt);
    for (var hi = this.holders.length - 1; hi >= 0; hi--) {
      var h = this.holders[hi];
      if (h.dead) continue;
      h.t -= dt;
      if (h.t <= 0) this.destroyHolder(h);
    }
    for (var pi = 0; pi < this.projectiles.length; pi++) this.updateProjectile(this.projectiles[pi], dt);
    if (!this.over) {
      var income = (2.65 + this.waveIndex * 0.18) * dt;
      this.compute += income;
      for (var ni = 0; ni < this.nodes.length; ni++) {
        var node = this.nodes[ni];
        if (!node.isolated || !node.holder || node.holder.kind !== 'tower') continue;
        var ht = this.towerById(node.holder.id);
        if (ht && !ht.dead) { this.intel += 0.5 * dt; this.stats.hold += dt; }
      }
    }
    this.cleanup();
    this.outcome();
    this.fadeFx(dt);
  };

  Battle.prototype.fadeFx = function (dt) {
    for (var i = this.fxs.length - 1; i >= 0; i--) {
      this.fxs[i].age += dt;
      if (this.fxs[i].age >= this.fxs[i].life) this.fxs.splice(i, 1);
    }
  };

  Battle.prototype.cleanup = function () {
    this.enemies = this.enemies.filter(function (e) {
      return !((e.state === 'dead' || e.state === 'leaked') && e.deathT <= 0);
    });
    this.towers = this.towers.filter(function (t) { return !(t.dead && t.deathT <= 0); });
    this.holders = this.holders.filter(function (h) { return !h.dead; });
    this.projectiles = this.projectiles.filter(function (p) { return !p.done; });
  };

  Battle.prototype.outcome = function () {
    if (this.suppressEnd || this.over) return;
    if (this.phase !== 'combat') return;
    if (this.spawnQ.length || this.lateQ.length) return;
    for (var i = 0; i < this.enemies.length; i++) if (this.living(this.enemies[i])) return;
    if (this.waveIndex >= this.waves.length - 1) {
      this.phase = 'victory';
      this.over = true;
      this.log('全部波次已被阻断，事件结束', 'good');
      this.sfx('win');
    } else {
      this.waveIndex++;
      this.phase = 'prep';
      this.prepLeft = this.waves[this.waveIndex].prep;
      this.log('波次间歇。下一波见流量预报。');
    }
  };

  TD.Battle = Battle;
  TD.createBattle = function (map, seed) { return new Battle(map, seed); };
})(typeof window !== 'undefined' ? window : globalThis);
