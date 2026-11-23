/* 战斗模拟：实体、寻路改道、阻挡、攻防、状态、资源、波次、道具、技能、Boss。
 * 固定步长、可种子化随机，供实时循环与视频导出共用。渲染/音频/UI 通过事件队列消费。 */
(function (root) {
  'use strict';
  const ND = root.ND = root.ND || {};
  const C = ND.CELL, R = ND.Routing;
  const CELL = 2;
  ND.CELL = ND.CELL; ND.CELL_SIZE = CELL;
  ND.DT = 1 / 60;

  let _uid = 1;
  const uid = () => _uid++;
  function RNG(seed) { let s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  ND.clamp = clamp;

  ND.createGame = function (mapId, opts) {
    opts = opts || {};
    const mapDef = ND.MAPS.find(m => m.id === mapId);
    const grid = R.build(mapDef);
    const rng = RNG(opts.seed || 20261114);
    const g = {
      mapId, mapDef, grid, rng, CELL,
      w: grid.w, h: grid.h,
      time: 0, speed: 1, paused: false, over: false, result: null,
      compute: mapDef.startCompute, intel: mapDef.startIntel, integrity: mapDef.integrity, maxIntegrity: mapDef.integrity,
      wave: 0, waveState: 'prep', prepTimer: opts.firstPrep != null ? opts.firstPrep : 8,
      spawnQueue: [], enemies: [], towers: [], projectiles: [], events: [],
      blocked: new Set(), legacySet: new Set(), nodeState: {}, blackholes: [], locks: [],
      field: null, routes: {}, prevRoutes: {}, changedEntries: [],
      itemCd: { isolator: 0, downgrade: 0, restore: 0 },
      stats: { kills: 0, leaked: 0, built: 0, destroyed: 0, computeEarned: 0, intelEarned: 0, dmgDealt: 0, dmgTaken: 0, wavesCleared: 0 },
      boss: null, warnings: [], traffic: [],
      intelHoldAcc: 0, passiveAcc: 0,
      cellOf: (x, y) => y * grid.w + x,
    };
    // 世界坐标
    g.toWorld = (cx, cy) => ({ x: (cx - (grid.w - 1) / 2) * CELL, z: (cy - (grid.h - 1) / 2) * CELL });
    g.cellCenter = (i) => { const c = grid.cells[i]; return g.toWorld(c.x, c.y); };
    for (const n of grid.nodes) g.nodeState[n.i] = { isolated: false, by: null, cooldownUntil: 0 };

    // ---- 路由 ----
    g.recomputeRoutes = function (silent) {
      const old = g.routes;
      g.field = R.field(grid, g.blocked, g.legacySet);
      g.routes = R.entryRoutes(grid, g.field);
      g.changedEntries = R.changedEntries(old, g.routes);
      g.prevRoutes = old;
      if (!silent && g.changedEntries.length) emit('routesChanged', { changed: g.changedEntries });
      // 场上地面敌人从当前位置重新寻路
      for (const e of g.enemies) {
        if (e.flying || e.dead) continue;
        rerouteEnemy(e);
      }
    };
    function rerouteEnemy(e) {
      const start = e.nextCell != null ? e.nextCell : e.cell;
      const p = R.trace(grid, g.field, start);
      if (p) { e.path = p; e.pathIdx = 0; }
    }
    g.recomputeRoutes(true);

    function emit(type, data) { g.events.push({ type, data, t: g.time }); }
    g.emit = emit;

    // ---- 通行变化 ----
    function setBlocked(i, on) { if (on) g.blocked.add(i); else g.blocked.delete(i); }
    g.isolatedNodes = () => grid.nodes.filter(n => g.nodeState[n.i].isolated);

    g.canIsolate = function (i) {
      const ns = g.nodeState[i];
      if (!ns || ns.isolated) return { ok: false, why: 'already' };
      if (g.time < ns.cooldownUntil) return { ok: false, why: 'cooldown' };
      const test = new Set(g.blocked); test.add(i);
      const f = R.field(grid, test, g.legacySet);
      const enemyCells = g.enemies.filter(e => !e.flying && !e.dead).map(e => e.nextCell != null ? e.nextCell : e.cell);
      const conn = R.connected(grid, f, enemyCells);
      if (!conn.ok) return { ok: false, why: 'block', cell: conn.cell };
      return { ok: true };
    };
    g.isolateNode = function (i, by) {
      const chk = g.canIsolate(i);
      if (!chk.ok) return chk;
      g.nodeState[i].isolated = true; g.nodeState[i].by = by;
      setBlocked(i, true);
      emit('nodeIsolated', { cell: i, by });
      g.recomputeRoutes();
      return { ok: true };
    };
    g.openNode = function (i, cooldown) {
      const ns = g.nodeState[i];
      if (!ns.isolated) return;
      ns.isolated = false; ns.by = null;
      ns.cooldownUntil = g.time + (cooldown != null ? cooldown : 4);
      setBlocked(i, false);
      emit('nodeOpened', { cell: i });
      g.recomputeRoutes();
    };

    // ---- 塔 ----
    g.towerAt = (i) => g.towers.find(t => t.cell === i && !t.dead);
    g.canPlace = function (type, i, facing) {
      const def = ND.TOWERS[type], cell = grid.cells[i];
      if (!def) return { ok: false, why: 'unknown' };
      if (g.compute < def.cost) return { ok: false, why: 'cost' };
      if (g.towerAt(i)) return { ok: false, why: 'occupied' };
      const t = cell.type;
      let okPlace = false;
      if (def.place.includes('link') && (t === C.LINK || t === C.LEGACY)) okPlace = true;
      if (def.place.includes('node') && t === C.NODE) okPlace = true;
      if (def.place.includes('platform') && t === C.PLATFORM) okPlace = true;
      if (!okPlace) return { ok: false, why: 'terrain' };
      if (t === C.NODE) { const chk = g.canIsolate(i); if (!chk.ok) return chk; }
      return { ok: true };
    };
    g.placeTower = function (type, i, facing) {
      const chk = g.canPlace(type, i, facing);
      if (!chk.ok) { emit('rejected', { why: chk.why, cell: chk.cell != null ? chk.cell : i }); return chk; }
      const def = ND.TOWERS[type];
      const pos = g.cellCenter(i);
      const elevated = grid.cells[i].type === C.PLATFORM;
      const t = {
        id: uid(), type, def, cell: i, level: 1, branch: null, facing: facing || 0, aim: facing || 0,
        x: pos.x, z: pos.z, y: elevated ? 0.7 : 0,
        hp: def.hp, maxHp: def.hp, shield: 0, encryptedUntil: 0,
        attackCd: 0, skillCd: 0, engaged: [], dead: false, invested: def.cost,
        block: def.block || 0, dmg: def.dmg || 0, rate: def.rate || 1, range: def.range || 0,
        taunt: def.taunt || 0, heal: def.heal || 0, detect: def.detect || 0,
        anim: { recoil: 0, pulse: 0, healBeam: null },
      };
      g.compute -= def.cost; g.stats.built++;
      g.towers.push(t);
      if (grid.cells[i].type === C.NODE) {
        g.nodeState[i].isolated = true; g.nodeState[i].by = t.id; setBlocked(i, true);
        emit('nodeIsolated', { cell: i, by: t.id });
        g.recomputeRoutes();
      }
      emit('towerPlaced', { tower: t });
      return { ok: true, tower: t };
    };
    g.sellTower = function (t) {
      if (t.dead) return;
      const refund = Math.floor(t.invested * 0.6);
      g.compute += refund;
      removeTower(t, 'sold');
      emit('towerSold', { tower: t, refund });
    };
    function removeTower(t, reason) {
      t.dead = true;
      const i = t.cell;
      if (grid.cells[i].type === C.NODE && g.nodeState[i].by === t.id) g.openNode(i);
      // 释放被阻挡敌人
      for (const e of g.enemies) if (e.blockedBy === t.id) { e.blockedBy = null; e.state = 'moving'; }
      t.engaged.length = 0;
      emit('towerRemoved', { tower: t, reason });
    }
    g.destroyTower = function (t) { if (t.dead) return; g.stats.destroyed++; removeTower(t, 'destroyed'); emit('towerDestroyed', { tower: t }); };

    g.upgradeTower = function (t, branch) {
      if (t.dead || t.level >= 2) return { ok: false };
      const def = t.def;
      if (def.branches) {
        if (!branch || !def.branches[branch]) return { ok: false, why: 'branch' };
        const b = def.branches[branch];
        if (g.compute < (b.cost || 0) || g.intel < (b.intel || 0)) return { ok: false, why: 'cost' };
        g.compute -= b.cost || 0; g.intel -= b.intel || 0; t.invested += (b.cost || 0);
        t.level = 2; t.branch = branch;
        if (b.hp) { t.maxHp = b.hp; t.hp = Math.min(t.maxHp, t.hp + (b.hp - def.hp)); }
        if (b.block) t.block = b.block;
        if (b.taunt) t.taunt = b.taunt;
        if (b.dmg) t.dmg = b.dmg;
        if (b.rate) t.rate = b.rate;
        t.pierce = !!b.pierce; t.slow = b.slow || 0; t.slowDur = b.slowDur || 0; t.dot = b.dot || 0;
        emit('towerUpgraded', { tower: t, branch });
        return { ok: true };
      } else if (def.lv2) {
        const l = def.lv2;
        if (g.compute < l.cost) return { ok: false, why: 'cost' };
        g.compute -= l.cost; t.invested += l.cost; t.level = 2;
        if (l.hp) { t.maxHp = l.hp; t.hp = Math.min(t.maxHp, t.hp + (l.hp - def.hp)); }
        if (l.block) t.block = l.block;
        if (l.dmg) t.dmg = l.dmg;
        if (l.heal) t.heal = l.heal;
        if (l.range) t.range = l.range;
        if (l.detect) t.detect = l.detect;
        t.armor = l.armor || 0; t.mark = !!l.mark; t.shieldPower = l.shield || 0;
        emit('towerUpgraded', { tower: t });
        return { ok: true };
      }
      return { ok: false };
    };

    // ---- 敌人 ----
    g.spawnEnemy = function (type, entryKey, opts2) {
      opts2 = opts2 || {};
      const def = ND.ENEMIES[type];
      const entry = grid.entryMap[entryKey] || grid.entries[0];
      const pos = g.cellCenter(entry.i);
      const e = {
        id: uid(), type, def, entry: entry.entry,
        hp: def.hp, maxHp: def.hp, shield: 0, shieldMax: 0,
        x: pos.x, z: pos.z, y: def.flying ? 2.3 : 0.35,
        cell: entry.i, nextCell: null, path: null, pathIdx: 0,
        speed: def.speed, flying: !!def.flying, dead: false,
        disguised: !!def.disguised, revealed: !def.disguised,
        state: 'moving', blockedBy: null, attackCd: 0, abilityCd: 0,
        slowUntil: 0, slowFactor: 1, rootedUntil: 0, markUntil: 0,
        cloned: !!opts2.cloned, boss: !!def.boss, phase: 0,
        facing: 0, animT: rng() * 10, hitFlash: 0,
        targetExit: null, nodeTarget: null,
      };
      if (def.flying) {
        const exit = nearestExit(entry.i);
        const ep = g.cellCenter(exit.i);
        e.flyTarget = { x: ep.x, z: ep.z, cell: exit.i };
      } else {
        rerouteEnemy(e);
      }
      g.enemies.push(e);
      if (e.boss) { g.boss = e; emit('bossSpawn', { enemy: e }); }
      else emit('enemySpawn', { enemy: e });
      return e;
    };
    function nearestExit(from) {
      let best = grid.exits[0], bd = Infinity;
      for (const ex of grid.exits) { const d = g.field.dist[from]; void ex; }
      // 选择 dist 最小的出口（多源场已给出到最近出口的距离）；这里返回路径终点
      const p = R.trace(grid, g.field, from);
      if (p) { const last = grid.cells[p[p.length - 1]]; return last; }
      return best;
    }

    function damageEnemy(e, dmg, src) {
      if (e.dead) return;
      if (e.markUntil > g.time) dmg *= 1.2;
      if (e.shield > 0) {
        const ab = Math.min(e.shield, dmg); e.shield -= ab; dmg -= ab;
        if (e.shield <= 0) emit('shieldBroken', { enemy: e });
      }
      if (dmg > 0) { e.hp -= dmg; e.hitFlash = 0.2; g.stats.dmgDealt += dmg; }
      if (e.hp <= 0) killEnemy(e, src);
    }
    function killEnemy(e, src) {
      if (e.dead) return;
      e.dead = true; g.stats.kills++;
      const reward = e.def.reward || 5;
      g.compute += reward; g.stats.computeEarned += reward;
      if (e.def.elite || e.boss) { const ib = e.boss ? 20 : 5; g.intel += ib; g.stats.intelEarned += ib; }
      // 木马未显形被消灭 → 载荷
      if (e.type === 'trojan' && !e.revealed) {
        emit('payload', { x: e.x, z: e.z, radius: 2.2 });
        for (const t of g.towers) if (!t.dead && dist2(t.x, t.z, e.x, e.z) < (2.2 * CELL) * (2.2 * CELL)) damageTower(t, e.def.payload, e);
      }
      if (e.boss) { g.boss = null; emit('bossKilled', { enemy: e }); }
      emit('enemyKilled', { enemy: e, reward });
    }
    function damageTower(t, dmg, src) {
      if (t.dead) return;
      if (t.armor) dmg *= (1 - t.armor);
      if (t.shield > 0) { const ab = Math.min(t.shield, dmg); t.shield -= ab; dmg -= ab; }
      if (dmg > 0) { t.hp -= dmg; g.stats.dmgTaken += dmg; emit('towerHit', { tower: t, dmg, src }); }
      if (t.hp <= 0) g.destroyTower(t);
    }
    g.damageTower = damageTower; g.damageEnemy = damageEnemy;

    function reveal(e, why) { if (!e.revealed) { e.revealed = true; e.disguised = false; emit('revealed', { enemy: e, why }); } }

    // ---- 道具 ----
    g.useItem = function (id, target) {
      const def = ND.ITEMS[id];
      if (g.itemCd[id] > g.time) return { ok: false, why: 'cooldown' };
      const res = def.res === 'intel' ? g.intel : g.compute;
      if (res < def.cost) return { ok: false, why: 'cost' };
      if (id === 'isolator') {
        const i = target;
        const chk = g.canIsolate(i);
        if (!chk.ok) { emit('rejected', { why: chk.why, cell: chk.cell != null ? chk.cell : i }); return chk; }
        g.intel -= def.cost; g.itemCd[id] = g.time + def.cd;
        g.nodeState[i].isolated = true; g.nodeState[i].by = 'isolator';
        g.nodeState[i].isolator = { hp: def.hp, maxHp: def.hp, expires: g.time + def.duration };
        setBlocked(i, true); emit('nodeIsolated', { cell: i, by: 'isolator' }); g.recomputeRoutes();
        emit('itemUsed', { id, cell: i });
        return { ok: true };
      }
      if (id === 'downgrade') {
        const i = target; const c = grid.cells[i];
        if (!c.road || c.type === C.ENTRY || c.type === C.EXIT) return { ok: false, why: 'terrain' };
        g.intel -= def.cost; g.itemCd[id] = g.time + def.cd;
        const center = g.cellCenter(i); const affected = [];
        for (const cell of grid.cells) {
          if (!cell.road || cell.type === C.ENTRY || cell.type === C.EXIT) continue;
          const p = g.cellCenter(cell.i);
          if (dist2(p.x, p.z, center.x, center.z) <= (def.radius * CELL) * (def.radius * CELL)) { g.legacySet.add(cell.i); affected.push(cell.i); }
        }
        g.downgrades = g.downgrades || []; g.downgrades.push({ expires: g.time + def.duration, cells: affected });
        emit('itemUsed', { id, cell: i, cells: affected }); g.recomputeRoutes();
        return { ok: true };
      }
      if (id === 'restore') {
        const t = target;
        if (!t || t.dead) return { ok: false, why: 'target' };
        g.compute -= def.cost; g.itemCd[id] = g.time + def.cd;
        t.hp = Math.min(t.maxHp, t.hp + t.maxHp * def.healPct); t.encryptedUntil = 0;
        emit('itemUsed', { id, tower: t }); emit('towerHealed', { tower: t, amount: t.maxHp * def.healPct });
        return { ok: true };
      }
      return { ok: false };
    };

    // ---- 技能 ----
    g.useSkill = function (t) {
      if (t.dead || !t.def.skill) return { ok: false };
      if (t.skillCd > g.time) return { ok: false, why: 'cooldown' };
      if (t.encryptedUntil > g.time) return { ok: false, why: 'encrypted' };
      if (t.type === 'honeypot') {
        t.skillCd = g.time + t.def.skill.cd;
        const dur = t.branch === 'sticky' ? 4.5 : 3;
        let n = 0;
        for (const e of g.enemies) if (!e.dead && !e.flying && e.blockedBy === t.id) { e.rootedUntil = g.time + dur; n++; }
        emit('skillTrap', { tower: t, count: n, dur });
        return { ok: true };
      }
      if (t.type === 'repair') {
        t.skillCd = g.time + t.def.skill.cd;
        const shield = t.shieldPower || 90;
        let n = 0;
        for (const o of g.towers) if (!o.dead && o !== t && dist2(o.x, o.z, t.x, t.z) <= (t.range * CELL) * (t.range * CELL)) {
          o.shield = Math.max(o.shield, shield); o.shieldUntil = g.time + 6; o.encryptedUntil = 0; n++;
        }
        emit('skillFailover', { tower: t, count: n, shield });
        return { ok: true };
      }
      return { ok: false };
    };

    // ---- 波次 ----
    function buildWave(n) {
      const list = ND.WAVES[mapId][n - 1] || [];
      const q = [];
      for (const grp of list) for (let k = 0; k < grp.n; k++) q.push({ t: (grp.delay || 0) + k * grp.gap, e: grp.e, type: grp.t });
      q.sort((a, b) => a.t - b.t);
      return q;
    }
    g.startWave = function () {
      if (g.wave >= mapDef.waves) return;
      g.wave++; g.waveState = 'spawning'; g.spawnQueue = buildWave(g.wave); g.waveTime = 0;
      g.intel += 8; g.stats.intelEarned += 8;
      emit('waveStart', { wave: g.wave, total: mapDef.waves, isBoss: g.wave === mapDef.waves, flood: isFloodWave(g.wave) });
    };
    function isFloodWave(n) { const l = ND.WAVES[mapId][n - 1] || []; const es = new Set(l.map(x => x.e)); return es.size >= 3 && l.reduce((s, x) => s + x.n, 0) >= 14; }
    g.callWaveEarly = function () { if (g.waveState === 'prep') { g.compute += 15; g.prepTimer = 0; } };

    // ---- 主更新 ----
    g.step = function (dt) {
      if (g.over || g.paused) return;
      g.time += dt;
      // 资源被动增长
      g.passiveAcc += dt;
      if (g.passiveAcc >= 1) { const add = 2; g.compute += add; g.stats.computeEarned += add; g.passiveAcc -= 1; }
      // 守隔离节点情报
      const holding = g.isolatedNodes().length > 0 && g.enemies.some(e => !e.dead);
      if (holding) { g.intelHoldAcc += dt; if (g.intelHoldAcc >= 1.5) { g.intel += 1; g.stats.intelEarned += 1; g.intelHoldAcc -= 1.5; } }
      // 波次状态机
      if (g.waveState === 'prep') {
        g.prepTimer -= dt;
        if (g.prepTimer <= 0) g.startWave();
      } else if (g.waveState === 'spawning') {
        g.waveTime += dt;
        while (g.spawnQueue.length && g.spawnQueue[0].t <= g.waveTime) { const s = g.spawnQueue.shift(); g.spawnEnemy(s.type, s.e); }
        if (!g.spawnQueue.length) g.waveState = 'clearing';
      } else if (g.waveState === 'clearing') {
        if (!g.enemies.some(e => !e.dead)) {
          g.stats.wavesCleared++;
          if (g.wave >= mapDef.waves) { endGame(true); return; }
          g.waveState = 'prep'; g.prepTimer = 12; emit('waveCleared', { wave: g.wave });
        }
      }
      // 降级到期
      if (g.downgrades) {
        for (let k = g.downgrades.length - 1; k >= 0; k--) {
          if (g.time >= g.downgrades[k].expires) { for (const c of g.downgrades[k].cells) g.legacySet.delete(c); g.downgrades.splice(k, 1); emit('downgradeEnd', {}); g.recomputeRoutes(); }
        }
      }
      // 隔离器到期 / 黑洞 / 锁死
      for (const n of grid.nodes) {
        const ns = g.nodeState[n.i];
        if (ns.isolated && ns.by === 'isolator' && ns.isolator && g.time >= ns.isolator.expires) { delete ns.isolator; g.openNode(n.i); emit('isolatorExpired', { cell: n.i }); }
      }
      for (let k = g.blackholes.length - 1; k >= 0; k--) { const b = g.blackholes[k]; if (g.time >= b.expires) { setBlocked(b.cell, false); g.blackholes.splice(k, 1); emit('blackholeEnd', { cell: b.cell }); g.recomputeRoutes(); } }
      for (let k = g.locks.length - 1; k >= 0; k--) { const l = g.locks[k]; if (g.time >= l.expires) { for (const c of l.cells) setBlocked(c, false); g.locks.splice(k, 1); emit('lockEnd', { cells: l.cells }); g.recomputeRoutes(); } }
      // 预警到期 → 生效
      for (let k = g.warnings.length - 1; k >= 0; k--) {
        const w = g.warnings[k];
        if (g.time >= w.at) { g.warnings.splice(k, 1); if (w.apply) w.apply(); }
      }
      updateTowers(dt);
      updateEnemies(dt);
      updateProjectiles(dt);
      updateBoss(dt);
      // 清理
      g.enemies = g.enemies.filter(e => !e.dead || e.deathT > g.time - 0.5);
      g.towers = g.towers.filter(t => !t.dead);
      if (g.integrity <= 0 && !g.over) endGame(false);
    };

    function endGame(win) { g.over = true; g.result = win ? 'victory' : 'defeat'; emit('gameEnd', { result: g.result, stats: g.stats }); }

    // ---- 塔更新 ----
    function towerDisabled(t) { return t.encryptedUntil > g.time; }
    function updateTowers(dt) {
      for (const t of g.towers) {
        if (t.dead) continue;
        t.attackCd -= dt; t.skillCd -= dt;
        if (t.shieldUntil && g.time > t.shieldUntil) { t.shield = 0; t.shieldUntil = 0; }
        t.anim.recoil = Math.max(0, t.anim.recoil - dt * 4);
        t.anim.pulse = Math.max(0, t.anim.pulse - dt * 2);
        const disabled = towerDisabled(t);
        if (t.type === 'firewall') updateFirewall(t, dt, disabled);
        else if (t.type === 'honeypot') updateHoneypot(t, dt, disabled);
        else if (t.type === 'interceptor') updateInterceptor(t, dt, disabled);
        else if (t.type === 'sandbox') updateSandbox(t, dt, disabled);
        else if (t.type === 'repair') updateRepair(t, dt, disabled);
      }
    }
    function engage(t, e) {
      if (e.blockedBy || e.flying) return false;
      const cost = e.def.blockCost || 1;
      const used = t.engaged.reduce((s, id) => { const en = g.enemies.find(x => x.id === id); return s + (en ? (en.def.blockCost || 1) : 0); }, 0);
      if (used + cost > t.block) return false;
      t.engaged.push(e.id); e.blockedBy = t.id; e.state = 'blocked';
      if (e.type === 'trojan') reveal(e, 'block');
      return true;
    }
    function updateFirewall(t, dt, disabled) {
      // 节点防火墙拦截相邻链路敌人
      if (grid.cells[t.cell].type === C.NODE) {
        for (const e of g.enemies) {
          if (e.dead || e.flying || e.blockedBy) continue;
          if (dist2(e.x, e.z, t.x, t.z) <= (1.6 * CELL) * (1.6 * CELL)) engage(t, e);
        }
      }
      t.engaged = t.engaged.filter(id => { const e = g.enemies.find(x => x.id === id); return e && !e.dead && e.blockedBy === t.id; });
      if (!disabled && t.attackCd <= 0 && t.engaged.length) {
        const e = g.enemies.find(x => x.id === t.engaged[0]);
        if (e) { damageEnemy(e, t.dmg, t); t.attackCd = t.rate; t.anim.recoil = 1; emit('firewallHit', { tower: t, enemy: e }); }
      }
    }
    function updateHoneypot(t, dt, disabled) {
      // 诱敌：吸引附近会攻击塔的地面敌人
      const r2 = (t.taunt * CELL) * (t.taunt * CELL);
      for (const e of g.enemies) {
        if (e.dead || e.flying || e.blockedBy) continue;
        if (!['worm', 'flood', 'trojan'].includes(e.type)) continue;
        if (e.type === 'trojan' && !e.revealed) continue;
        if (dist2(e.x, e.z, t.x, t.z) <= r2) {
          // 走向蜜罐并被阻挡
          if (e.taunted !== t.id) {
            e.taunted = t.id;
            const p = traceTo(g.field, e.nextCell != null ? e.nextCell : e.cell, t.cell);
            if (p) { e.path = p; e.pathIdx = 0; e.nextCell = null; }
          }
          if (dist2(e.x, e.z, t.x, t.z) <= (1.2 * CELL) * (1.2 * CELL)) engage(t, e);
        }
      }
      t.engaged = t.engaged.filter(id => { const e = g.enemies.find(x => x.id === id); return e && !e.dead && e.blockedBy === t.id; });
      if (t.dot && !disabled) { for (const id of t.engaged) { const e = g.enemies.find(x => x.id === id); if (e) damageEnemy(e, t.dot * dt, t); } }
    }
    function pickTarget(t, canHitAir, needReveal) {
      let best = null, bd = Infinity;
      const r2 = (t.range * CELL) * (t.range * CELL);
      for (const e of g.enemies) {
        if (e.dead) continue;
        if (e.flying && !canHitAir) continue;
        if (!e.flying && !canHitAir && false) continue;
        if (needReveal && !e.revealed && (e.disguised || e.def.stealth)) continue;
        const d2 = dist2(e.x, e.z, t.x, t.z);
        if (d2 > r2) continue;
        if (t.def.sector) {
          const ang = Math.atan2(e.x - t.x, e.z - t.z);
          let diff = Math.abs(ang - t.facing); while (diff > Math.PI) diff = Math.abs(diff - 2 * Math.PI);
          if (diff > (t.def.sector * Math.PI / 180) / 2) continue;
        }
        const prog = e.flying ? 0 : (g.field.dist[e.cell] || 0);
        if (prog < bd) { bd = prog; best = e; }
      }
      return best;
    }
    function updateInterceptor(t, dt, disabled) {
      if (disabled) return;
      if (t.attackCd <= 0) {
        const target = pickTarget(t, true, true);
        if (target) {
          t.attackCd = t.rate; t.anim.recoil = 1;
          t.aim = Math.atan2(target.x - t.x, target.z - t.z);
          if (t.pierce) {
            // 贯穿直线
            const dx = target.x - t.x, dz = target.z - t.z, len = Math.hypot(dx, dz) || 1;
            const nx = dx / len, nz = dz / len;
            emit('pierceShot', { tower: t, x: t.x, z: t.z, nx, nz, range: t.range });
            for (const e of g.enemies) {
              if (e.dead || (!e.revealed && (e.disguised || e.def.stealth))) continue;
              const px = e.x - t.x, pz = e.z - t.z;
              const proj = px * nx + pz * nz;
              if (proj < 0 || proj > t.range * CELL) continue;
              const perp = Math.abs(px * nz - pz * nx);
              if (perp < 0.6 * CELL) { damageEnemy(e, t.dmg, t); if (t.slow) applySlow(e, t.slow, t.slowDur); }
            }
          } else {
            g.projectiles.push({ kind: 'tracer', x: t.x, y: t.y + 1.0, z: t.z, target, speed: 16, dmg: t.dmg, src: t, slow: t.slow, slowDur: t.slowDur, color: 0x6fe3ff });
            emit('interceptorFire', { tower: t, target });
          }
        }
      }
    }
    function applySlow(e, factor, dur) { e.slowUntil = g.time + dur; e.slowFactor = Math.min(e.slowFactor, 1 - factor); }
    function updateSandbox(t, dt, disabled) {
      const dr2 = (t.detect * CELL) * (t.detect * CELL);
      for (const e of g.enemies) {
        if (e.dead || e.flying) continue;
        if (dist2(e.x, e.z, t.x, t.z) <= dr2) {
          if (!e.revealed) reveal(e, 'sandbox');
          if (t.mark) e.markUntil = g.time + 1.5;
        }
      }
      if (disabled) return;
      if (t.attackCd <= 0) {
        const r2 = (t.range * CELL) * (t.range * CELL);
        let hit = false;
        for (const e of g.enemies) {
          if (e.dead || e.flying) continue;
          if (dist2(e.x, e.z, t.x, t.z) <= r2) { damageEnemy(e, t.dmg, t); hit = true; }
        }
        if (hit) { t.attackCd = t.rate; t.anim.pulse = 1; emit('sandboxPulse', { tower: t, radius: t.range }); }
      }
    }
    function updateRepair(t, dt, disabled) {
      t.anim.healBeam = null;
      if (disabled) return;
      const r2 = (t.range * CELL) * (t.range * CELL);
      let target = null, low = 1;
      for (const o of g.towers) {
        if (o.dead || o === t || o.hp >= o.maxHp) continue;
        if (dist2(o.x, o.z, t.x, t.z) <= r2) { const ratio = o.hp / o.maxHp; if (ratio < low) { low = ratio; target = o; } }
      }
      if (target) {
        target.hp = Math.min(target.maxHp, target.hp + t.heal * dt);
        t.anim.healBeam = target;
        if (rng() < dt * 3) emit('repairHeal', { tower: t, target });
      }
    }

    // ---- 敌人更新 ----
    function updateEnemies(dt) {
      for (const e of g.enemies) {
        if (e.dead) { e.deathT = e.deathT || g.time; continue; }
        e.animT += dt; e.hitFlash = Math.max(0, e.hitFlash - dt);
        if (e.slowUntil < g.time) e.slowFactor = 1;
        if (e.flying) { updateFlying(e, dt); continue; }
        if (e.rootedUntil > g.time) { /* 被诱捕，不动不攻 */ continue; }
        if (e.state === 'blocked') { updateBlocked(e, dt); continue; }
        if (e.state === 'attackingNode') { updateNodeAttacker(e, dt); continue; }
        // 勒索者边移动边攻击
        if (e.type === 'ransom') ransomAttack(e, dt);
        if (e.type === 'packer') packerAura(e, dt);
        if (e.boss) bossAura(e, dt);
        // 洪泛团寻找被隔离节点
        if (e.type === 'flood' && !e.nodeTarget) floodSeekNode(e);
        if (e.state === 'toNode') { moveAlong(e, dt); continue; }
        moveAlong(e, dt);
      }
    }
    function currentSpeed(e) {
      let s = e.speed * e.slowFactor;
      const ci = e.nextCell != null ? e.nextCell : e.cell;
      if (R.isLegacy(grid, ci, g.legacySet)) { s *= ND.LEGACY_SPEED; if (e.type === 'trojan') reveal(e, 'legacy'); }
      return s;
    }
    function moveAlong(e, dt) {
      if (!e.path || !e.path.length) { rerouteEnemy(e); if (!e.path) return; }
      if (e.nextCell == null) {
        if (e.pathIdx >= e.path.length) { leak(e); return; }
        e.nextCell = e.path[e.pathIdx];
      }
      const target = g.cellCenter(e.nextCell);
      const sp = currentSpeed(e) * CELL;
      const dx = target.x - e.x, dz = target.z - e.z;
      const d = Math.hypot(dx, dz);
      const step = sp * dt;
      e.facing = Math.atan2(dx, dz);
      if (d <= step) {
        e.x = target.x; e.z = target.z;
        arriveCell(e, e.nextCell);
      } else {
        e.x += dx / d * step; e.z += dz / d * step;
        // 接近阻挡格时提前停下
        const blocker = g.towerAt(e.nextCell);
        if (blocker && (blocker.type === 'firewall' || blocker.type === 'honeypot') && grid.cells[e.nextCell].type !== C.NODE) {
          if (d < 0.6 * CELL) { if (engage(blocker, e)) { e.state = 'blocked'; } }
        }
      }
    }
    function arriveCell(e, i) {
      e.cell = i; e.nextCell = null; e.pathIdx++;
      const cell = grid.cells[i];
      if (cell.type === C.EXIT) { leak(e); return; }
      if (R.isLegacy(grid, i, g.legacySet) && e.type === 'trojan') reveal(e, 'legacy');
      // 蠕虫在直通节点复制
      if (e.type === 'worm' && cell.type === C.NODE && !g.nodeState[i].isolated && !e.cloned) {
        e.cloned = true;
        const c = g.spawnEnemy('worm', e.entry, { cloned: true });
        c.x = e.x; c.z = e.z; c.cell = i; c.nextCell = null; c.path = e.path ? e.path.slice(e.pathIdx) : null; c.pathIdx = 0;
        emit('wormSplit', { enemy: e, clone: c });
      }
      // 链路阻挡
      const blocker = g.towerAt(i);
      if (blocker && (blocker.type === 'firewall' || blocker.type === 'honeypot') && cell.type !== C.NODE) {
        if (engage(blocker, e)) { e.state = 'blocked'; return; }
      }
      // 洪泛团抵达被隔离节点旁 → 开始冲击节点
      if (e.state === 'toNode' && e.pathIdx >= e.path.length) { e.state = 'attackingNode'; e.attackCd = 0.3; return; }
      if (e.pathIdx >= e.path.length && cell.type !== C.EXIT) { rerouteEnemy(e); }
    }
    function leak(e) {
      if (e.dead) return;
      e.dead = true; e.deathT = g.time; g.stats.leaked++;
      const dmg = e.boss ? 10 : 1;
      g.integrity = Math.max(0, g.integrity - dmg);
      emit('leak', { enemy: e, dmg, exit: grid.cells[e.cell].exit });
    }
    function updateBlocked(e, dt) {
      const t = g.towers.find(x => x.id === e.blockedBy);
      if (!t || t.dead) { e.blockedBy = null; e.state = 'moving'; return; }
      // 面向塔近战
      e.facing = Math.atan2(t.x - e.x, t.z - e.z);
      if (e.def.dmg && e.attackCd <= 0) {
        // 蜜罐替其他塔承担；被诱捕则不攻击
        damageTower(t, e.def.dmg, e);
        e.attackCd = e.def.rate || 1;
        emit('enemyMelee', { enemy: e, tower: t });
      }
      e.attackCd -= dt;
    }
    function ransomAttack(e, dt) {
      e.attackCd -= dt;
      if (e.attackCd > 0) return;
      const r2 = (e.def.range * CELL) * (e.def.range * CELL);
      let target = null, best = Infinity;
      for (const t of g.towers) {
        if (t.dead) continue;
        const d2 = dist2(t.x, t.z, e.x, e.z);
        if (d2 > r2) continue;
        const score = t.type === 'honeypot' ? -1000 : d2;
        if (score < best) { best = score; target = t; }
      }
      if (target) {
        e.attackCd = e.def.rate;
        g.projectiles.push({ kind: 'ransom', x: e.x, y: e.y + 0.5, z: e.z, target, speed: 10, dmg: e.def.dmg, src: e, encrypt: e.def.encrypt, color: 0xff5d3d });
        emit('ransomFire', { enemy: e, target });
      }
    }
    function packerAura(e, dt) {
      e.abilityCd -= dt;
      if (e.abilityCd > 0) return;
      e.abilityCd = 1.5;
      const r2 = (e.def.radius * CELL) * (e.def.radius * CELL);
      for (const o of g.enemies) {
        if (o.dead || o === e || o.flying) continue;
        if (dist2(o.x, o.z, e.x, e.z) <= r2 && o.shield < e.def.shield) { o.shield = e.def.shield; o.shieldMax = e.def.shield; emit('packerShield', { src: e, target: o }); }
      }
    }
    function bossAura(e, dt) { /* Boss 近战在 blocked 处理；技能在 updateBoss */ }

    function floodSeekNode(e) {
      let best = null, bd = Infinity;
      for (const n of grid.nodes) {
        const ns = g.nodeState[n.i];
        if (!ns.isolated) continue;
        const hasStruct = ns.by === 'isolator' || g.towerAt(n.i);
        if (!hasStruct) continue;
        const p = g.cellCenter(n.i);
        const d2 = dist2(e.x, e.z, p.x, p.z);
        if (d2 < bd && d2 < (7 * CELL) * (7 * CELL)) { bd = d2; best = n; }
      }
      if (!best) return;
      // 找到可通行的相邻格
      const adj = grid.adj[best.i].filter(i => !g.blocked.has(i));
      if (!adj.length) return;
      let near = adj[0], nd = Infinity;
      for (const a of adj) { const p = g.cellCenter(a); const d2 = dist2(e.x, e.z, p.x, p.z); if (d2 < nd) { nd = d2; near = a; } }
      const path = R.trace(grid, g.field, e.nextCell != null ? e.nextCell : e.cell);
      // 直接走向相邻格（用当前场寻路到 near）
      const f2 = R.field(grid, g.blocked, g.legacySet);
      const p2 = traceTo(f2, e.nextCell != null ? e.nextCell : e.cell, near);
      if (p2) { e.nodeTarget = best.i; e.path = p2; e.pathIdx = 0; e.nextCell = null; e.state = 'toNode'; emit('floodCharge', { enemy: e, node: best.i }); }
    }
    function traceTo(field, from, to) {
      // 反向：从 to 用 field 无法直接；做 BFS 最短路（代价）到 to
      const n = grid.cells.length, distA = new Float64Array(n).fill(Infinity), nextA = new Int32Array(n).fill(-1), done = new Uint8Array(n);
      const pq = [[0, to]]; distA[to] = 0;
      while (pq.length) {
        pq.sort((a, b) => a[0] - b[0]);
        const [d, u] = pq.shift();
        if (done[u]) continue; done[u] = 1;
        for (const v of grid.adj[u]) { if (g.blocked.has(v)) continue; const nd = d + R.cellCost(grid, v, g.legacySet); if (nd < distA[v] - 1e-9) { distA[v] = nd; nextA[v] = u; pq.push([nd, v]); } }
      }
      if (!isFinite(distA[from])) return null;
      const path = []; let cur = from, guard = 0;
      while (cur !== -1 && guard++ < 2000) { path.push(cur); if (cur === to) break; cur = nextA[cur]; }
      return path;
    }
    function updateNodeAttacker(e, dt) {
      const ni = e.nodeTarget, ns = g.nodeState[ni];
      if (!ns || !ns.isolated) { e.nodeTarget = null; e.state = 'moving'; rerouteEnemy(e); return; }
      e.attackCd -= dt;
      const p = g.cellCenter(ni);
      e.facing = Math.atan2(p.x - e.x, p.z - e.z);
      if (e.attackCd <= 0) {
        e.attackCd = e.def.rate || 1;
        const dmg = e.def.dmg * (e.type === 'flood' ? 1.5 : 1);
        const t = g.towerAt(ni);
        if (t) { damageTower(t, dmg, e); emit('nodeStrike', { enemy: e, node: ni, tower: t }); }
        else if (ns.by === 'isolator' && ns.isolator) {
          ns.isolator.hp -= dmg; emit('nodeStrike', { enemy: e, node: ni, isolator: true });
          if (ns.isolator.hp <= 0) { delete ns.isolator; g.openNode(ni); emit('isolatorDestroyed', { cell: ni }); }
        } else { g.openNode(ni); }
        if (!g.nodeState[ni].isolated) { e.nodeTarget = null; e.state = 'moving'; rerouteEnemy(e); emit('nodeBroken', { cell: ni, by: e }); }
      }
    }
    function updateFlying(e, dt) {
      if (e.type === 'ransom') ransomAttack(e, dt);
      const tgt = e.flyTarget;
      const dx = tgt.x - e.x, dz = tgt.z - e.z, d = Math.hypot(dx, dz);
      const sp = e.speed * e.slowFactor * CELL;
      e.facing = Math.atan2(dx, dz);
      if (d <= sp * dt) { e.x = tgt.x; e.z = tgt.z; e.cell = tgt.cell; leak(e); }
      else { e.x += dx / d * sp * dt; e.z += dz / d * sp * dt; }
    }

    // ---- 弹道 ----
    function updateProjectiles(dt) {
      for (let k = g.projectiles.length - 1; k >= 0; k--) {
        const p = g.projectiles[k];
        const tgt = p.target;
        if (!tgt || tgt.dead) { g.projectiles.splice(k, 1); continue; }
        const tx = tgt.x, tz = tgt.z, ty = (tgt.y || 0.35) + 0.4;
        const dx = tx - p.x, dy = ty - p.y, dz = tz - p.z, d = Math.hypot(dx, dy, dz);
        const step = p.speed * CELL * dt / 2;
        if (d <= step) {
          if (p.kind === 'tracer') { damageEnemy(tgt, p.dmg, p.src); if (p.slow) applySlow(tgt, p.slow, p.slowDur); emit('tracerHit', { enemy: tgt, src: p.src }); }
          else if (p.kind === 'ransom') { damageTower(tgt, p.dmg, p.src); if (tgt.type !== 'honeypot') tgt.encryptedUntil = Math.max(tgt.encryptedUntil, g.time + p.encrypt); emit('ransomHit', { tower: tgt, src: p.src }); }
          g.projectiles.splice(k, 1);
        } else { p.x += dx / d * step; p.y += dy / d * step; p.z += dz / d * step; }
      }
    }

    // ---- Boss ----
    function updateBoss(dt) {
      const b = g.boss;
      if (!b || b.dead) return;
      b.abilityCd -= dt;
      const hpRatio = b.hp / b.maxHp;
      if (b.type === 'boss1') {
        // 洪峰：冲击被隔离节点
        if (b.abilityCd <= 0) {
          const iso = g.isolatedNodes();
          if (iso.length) {
            const n = iso[Math.floor(rng() * iso.length)];
            warnThen(b, n.i, 2, () => bossFloodStrike(b, n.i));
            b.abilityCd = 7;
          } else b.abilityCd = 2;
        }
        if (hpRatio < 0.5) { b.spawnCd = (b.spawnCd || 0) - dt; if (b.spawnCd <= 0) { b.spawnCd = 6; for (let i = 0; i < 4; i++) { const c = g.spawnEnemy('worm', b.entry, { cloned: true }); c.x = b.x + (rng() - 0.5) * 2; c.z = b.z + (rng() - 0.5) * 2; c.cell = b.cell; rerouteEnemy(c); } emit('bossSpawnWorms', { boss: b }); } }
      } else if (b.type === 'boss2') {
        if (b.abilityCd <= 0) {
          const cell = pickForwardCell(b);
          if (cell != null) { warnThen(b, cell, 2.2, () => bossBlackhole(b, cell)); b.abilityCd = 8; }
          else b.abilityCd = 2;
        }
        if (hpRatio < 0.5) { b.stormCd = (b.stormCd || 0) - dt; if (b.stormCd <= 0) { b.stormCd = 7; for (const t of g.towers) if (!t.dead && dist2(t.x, t.z, b.x, b.z) < (4 * CELL) * (4 * CELL)) { t.shield = 0; t.shieldUntil = 0; } emit('routeStorm', { boss: b }); } }
      } else if (b.type === 'boss3') {
        const phase = hpRatio > 0.66 ? 0 : hpRatio > 0.33 ? 1 : 2;
        if (phase !== b.phase) { b.phase = phase; emit('bossPhase', { boss: b, phase }); if (phase >= 1) b.armor = 0.3; }
        if (phase === 0) { b.disguised = true; if (!b.revealed) b.revealed = false; }
        else { b.disguised = false; b.revealed = true; }
        if (phase >= 1) { b.spawnCd = (b.spawnCd || 0) - dt; if (b.spawnCd <= 0) { b.spawnCd = 7; for (let i = 0; i < 3; i++) { const c = g.spawnEnemy('trojan', b.entry); c.x = b.x + (rng() - 0.5) * 2; c.z = b.z + (rng() - 0.5) * 2; c.cell = b.cell; rerouteEnemy(c); } emit('bossSpawnTrojans', { boss: b }); } }
        if (phase === 2 && b.abilityCd <= 0) {
          const seg = pickLockSegment(b);
          if (seg) { warnThen(b, seg[0], 2.5, () => bossLock(b, seg)); b.abilityCd = 10; }
          else b.abilityCd = 2;
        }
      }
    }
    function warnThen(b, cell, delay, apply) {
      g.warnings.push({ cell, at: g.time + delay, apply, boss: b });
      emit('bossWarning', { boss: b, cell, delay });
    }
    function bossFloodStrike(b, ni) {
      const ns = g.nodeState[ni];
      const t = g.towerAt(ni);
      if (t) damageTower(t, 200, b);
      if (ns.isolator) { delete ns.isolator; }
      if (g.nodeState[ni].isolated) { g.openNode(ni); emit('nodeBroken', { cell: ni, by: b }); }
      emit('bossFlood', { boss: b, cell: ni });
    }
    function pickForwardCell(b) {
      // 选前方一个链路格，且移除后不封死
      const p = R.trace(grid, g.field, b.cell);
      if (!p) return null;
      for (let k = 2; k < Math.min(p.length, 7); k++) {
        const i = p[k]; const c = grid.cells[i];
        if (c.type !== C.LINK && c.type !== C.LEGACY) continue;
        const test = new Set(g.blocked); test.add(i);
        const f = R.field(grid, test, g.legacySet);
        const cells = g.enemies.filter(e => !e.flying && !e.dead).map(e => e.nextCell != null ? e.nextCell : e.cell);
        if (R.connected(grid, f, cells).ok) return i;
      }
      return null;
    }
    function bossBlackhole(b, cell) {
      setBlocked(cell, true);
      g.blackholes.push({ cell, expires: g.time + 8 });
      emit('blackholeStart', { cell, boss: b });
      g.recomputeRoutes();
    }
    function pickLockSegment(b) {
      const p = R.trace(grid, g.field, b.cell);
      if (!p) return null;
      for (let k = 2; k < Math.min(p.length - 1, 6); k++) {
        const seg = [p[k], p[k + 1]].filter(i => { const c = grid.cells[i]; return c.type === C.LINK || c.type === C.LEGACY || c.type === C.NODE; });
        if (seg.length < 2) continue;
        const test = new Set(g.blocked); seg.forEach(i => test.add(i));
        const f = R.field(grid, test, g.legacySet);
        const cells = g.enemies.filter(e => !e.flying && !e.dead).map(e => e.nextCell != null ? e.nextCell : e.cell);
        if (R.connected(grid, f, cells).ok) return seg;
      }
      return null;
    }
    function bossLock(b, seg) {
      seg.forEach(i => setBlocked(i, true));
      g.locks.push({ cells: seg, expires: g.time + 9 });
      emit('lockStart', { cells: seg, boss: b });
      g.recomputeRoutes();
    }

    // ---- 演示辅助 ----
    g.forceSpawn = g.spawnEnemy;
    g.snapshot = function () { return { time: g.time, wave: g.wave, compute: g.compute, intel: g.intel, integrity: g.integrity, enemies: g.enemies.filter(e => !e.dead).length, towers: g.towers.length }; };

    return g;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ND;
})(typeof window !== 'undefined' ? window : globalThis);