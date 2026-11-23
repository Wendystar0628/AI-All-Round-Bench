/* 网络安全攻防战 — 对局模拟（确定性、固定步长）：状态、路由收敛、玩家操作、塔 */
(function (root) {
  'use strict';
  const TD = root.TD, DT = TD.TICK, R = TD.RULES;

  class Sim extends TD.Emitter {
    constructor(mapId, opts) {
      super();
      opts = opts || {};
      this.mapId = mapId; this.def = TD.MAPS[mapId]; this.grid = TD.parseMap(this.def);
      const g = this.grid, n = g.cells.length;
      this.W = g.W; this.H = g.H;
      this.rng = TD.makeRng(opts.seed || (90210 + this.def.index * 7919));
      this.time = 0; this.tickN = 0;
      const st = this.def.start;
      this.compute = st.compute; this.intel = st.intel; this.integrity = st.integrity; this.maxIntegrity = st.integrity;
      this.towers = []; this.tById = new Map(); this.towerAt = new Int32Array(n);
      this.enemies = []; this.eById = new Map();
      this.shots = []; this.zones = []; this.warnings = [];
      this.blockCnt = new Uint8Array(n); this.legCnt = new Uint8Array(n);
      this.nodes = {}; for (const c of g.nodes) this.nodes[c.i] = { i: c.i, tower: 0, iso: null, reT: 0, holdT: 0, engT: 0 };
      this.itemCd = { isolator: 0, downgrade: 0, restore: 0 };
      this.wave = 0; this.phase = 'prep'; this.prepT = R.prepFirst; this.spawnQ = []; this.waveT = 0;
      this.totalWaves = this.def.waves.length;
      this.seen = {};
      this.stats = { kills: {}, killN: 0, leaks: 0, built: 0, lost: 0, sold: 0, reroutes: 0, isolations: 0, intelGain: 0, intelUse: 0, computeUse: 0, dmgToTowers: 0, healed: 0, items: 0, skills: 0 };
      this.over = null; this.nid = 1; this.routeVer = 0;
      this.field = null; this.routes = {};
      this.noAutoWave = !!opts.noAutoWave; this.passiveMul = (opts.passiveMul == null ? 1 : opts.passiveMul) * (st.passive || 1);
      this._pass = i => this.blockCnt[i] === 0;
      this._cost = i => (g.cells[i].legacy || this.legCnt[i] > 0) ? TD.LEGACY_COST : 1;
      this.recompute('init');
    }

    // ---------- 基础查询 ----------
    cellAt(x, y) { return (x < 0 || y < 0 || x >= this.W || y >= this.H) ? null : this.grid.cells[y * this.W + x]; }
    nodeIsolated(i) { const n = this.nodes[i]; return !!n && (n.tower !== 0 || n.iso !== null); }
    isLegacy(i) { return this.grid.cells[i].legacy || this.legCnt[i] > 0; }
    entryName(id) { return this.def.entries[id].name; }
    exitName(id) { return this.def.exits[id] ? this.def.exits[id].name : '?'; }

    // ---------- 路由收敛 ----------
    recompute(reason) {
      const g = this.grid, old = this.routes;
      this.field = TD.computeField(g, this._pass, this._cost);
      const routes = {}, changed = [];
      for (const e of g.entries) {
        const r = TD.traceRoute(this.field, e.i) || { cells: [e.i], cost: Infinity, exit: null };
        routes[e.id] = r;
        const o = old[e.id];
        if (o && (o.cells.length !== r.cells.length || o.cells.some((c, k) => c !== r.cells[k]))) changed.push(e.id);
      }
      this.routes = routes; this.routeVer++;
      for (const e of this.enemies) if (!e.dead && !e.fly) this.rerouteEnemy(e);
      if (reason !== 'init') { if (changed.length) this.stats.reroutes++; this.emit('routes', { reason, changed, old, routes }); }
      return changed;
    }
    _inside(e, c) { const cc = this.grid.cells[c]; return Math.abs(cc.x - e.x) <= 0.5 && Math.abs(cc.y - e.y) <= 0.5; }
    rerouteEnemy(e) {
      if (e.detour) {
        const d = e.detour;
        if (d.kind === 'smash' && this.nodeIsolated(d.node) && d.path.length === 0 && e.to < 0) { /* 正在冲击，保持 */ }
        else e.detour = null;
      }
      if (e.to < 0) return;
      const f = this.field, g = this.grid;
      const tOk = this._pass(e.to) && isFinite(f.dist[e.to]), cOk = this._pass(e.cell) && isFinite(f.dist[e.cell]);
      const tc = g.cells[e.to], cc = g.cells[e.cell];
      const dT = Math.hypot(tc.x - e.x, tc.y - e.y), dC = Math.hypot(cc.x - e.x, cc.y - e.y);
      let back = false;
      if (tOk && cOk) back = dC + f.dist[e.cell] + 0.05 < dT + f.dist[e.to];
      else if (!tOk && cOk) back = true;
      else if (!tOk && !cOk) back = this._inside(e, e.cell) && !this._inside(e, e.to);
      if (back) { const t = e.to; e.to = e.cell; e.cell = t; e.turnT = this.time; }
    }
    enemyReachable(e, f, pass, cost) {
      const g = this.grid;
      const a = c => c >= 0 && pass(c) && isFinite(f.dist[c]);
      if (a(e.to) || a(e.cell)) return true;
      const b = c => { if (c < 0 || pass(c) || !this._inside(e, c)) return false; const nb = TD.bestNeighbor(g, f, pass, cost, c); return nb >= 0 && isFinite(f.dist[nb]); };
      return b(e.to) || b(e.cell);
    }
    // 假设性评估：block 要封的格，open 要放开的格，leg 要降级的格
    evaluate(ch) {
      const g = this.grid;
      const bs = new Set(ch.block || []), os = new Set(ch.open || []), ls = new Set(ch.leg || []), us = new Set(ch.unleg || []);
      const pass = i => (this.blockCnt[i] === 0 || (os.has(i) && this.blockCnt[i] === 1)) && !bs.has(i);
      const cost = i => (g.cells[i].legacy || (this.legCnt[i] > 0 && !(us.has(i) && this.legCnt[i] === 1)) || ls.has(i)) ? TD.LEGACY_COST : 1;
      const f = TD.computeField(g, pass, cost);
      const routes = {}, sealedEntries = [], changed = [];
      for (const e of g.entries) {
        const r = TD.traceRoute(f, e.i);
        if (!r) { sealedEntries.push(e.id); routes[e.id] = null; continue; }
        routes[e.id] = r;
        const o = this.routes[e.id];
        if (!o || o.cells.length !== r.cells.length || o.cells.some((c, k) => c !== r.cells[k])) changed.push(e.id);
      }
      const sealedEnemies = [];
      for (const e of this.enemies) { if (e.dead || e.fly) continue; if (!this.enemyReachable(e, f, pass, cost)) sealedEnemies.push(e.id); }
      return { ok: !sealedEntries.length && !sealedEnemies.length, routes, changed, sealedEntries, sealedEnemies, field: f };
    }
    sealText(ev) {
      const a = ev.sealedEntries.map(id => '入口 ' + id + '“' + this.entryName(id) + '”');
      if (ev.sealedEnemies.length) a.push('场上 ' + ev.sealedEnemies.length + ' 个威胁');
      return '拒绝：' + a.join('、') + ' 将无路可达中枢';
    }

    // ---------- 部署 ----------
    checkPlace(type, ci) {
      const d = TD.TOWERS[type], c = this.grid.cells[ci];
      const res = { ok: false, reason: '', isolate: false, intel: 0, cost: d.cost, ev: null };
      if (!c || c.type === 'void') { res.reason = '不在可部署区域'; return res; }
      if (this.towerAt[ci]) { res.reason = '该位置已有设备'; return res; }
      const kind = c.type;
      if (!d.place.includes(kind)) {
        if (kind === 'entry' || kind === 'exit') res.reason = '出入口不能部署';
        else if (kind === 'obstacle') res.reason = '障碍上不能部署';
        else if (d.place.includes('platform')) res.reason = d.name + '只能部署在设备平台';
        else if (type === 'gateway') res.reason = '网闸只能部署在交换节点';
        else if (type === 'honeypot') res.reason = '蜜罐只能部署在链路上';
        else res.reason = d.name + '只能部署在链路或交换节点';
        return res;
      }
      if (kind === 'link' && this.blockCnt[ci] > 0) { res.reason = '这段链路当前不可通行'; return res; }
      if (kind === 'node') {
        const ns = this.nodes[ci];
        res.isolate = true; res.intel = R.isolateIntel;
        if (ns.iso) { res.reason = '节点上已有应急隔离器'; return res; }
        if (this.blockCnt[ci] > 0) { res.reason = '节点当前不可通行'; return res; }
        if (ns.reT > 0) { res.reason = '节点刚恢复直通，' + Math.ceil(ns.reT) + ' 秒后才能再次隔离'; res.cooldown = true; return res; }
        const ev = this.evaluate({ block: [ci] }); res.ev = ev;
        if (!ev.ok) { res.reason = this.sealText(ev); res.sealed = true; return res; }
      }
      if (this.compute < d.cost) { res.reason = '算力不足（需要 ' + d.cost + '）'; return res; }
      if (this.intel < res.intel) { res.reason = '情报不足（隔离需要 ' + res.intel + '）'; return res; }
      res.ok = true; return res;
    }
    place(type, ci, facing, free) {
      const chk = this.checkPlace(type, ci);
      if (!chk.ok && !(free && !chk.sealed && !/已有|只能|不能|不可/.test(chk.reason))) { this.emit('reject', { reason: chk.reason, ci, ev: chk.ev, what: 'place' }); return null; }
      const d = TD.TOWERS[type], c = this.grid.cells[ci], S = TD.towerStats(type, 1, null);
      if (!free) { this.compute -= d.cost; this.intel -= chk.intel; this.stats.computeUse += d.cost; this.stats.intelUse += chk.intel; }
      const t = {
        id: this.nid++, type, ci, x: c.x, y: c.y, level: 1, branch: null, S, hp: S.hp, maxHp: S.hp,
        shield: 0, shieldMax: 0, shieldT: 0, shieldLock: 0, encT: 0, cd: 0.4, skillCd: 0, skillT: 0, scanT: 0,
        facing: facing == null ? 1 : facing, aim: 0, hasAim: false, target: 0, blocked: [], load: 0, healIds: [],
        spent: d.cost, onNode: c.type === 'node', blocker: type === 'firewall' || type === 'honeypot',
        lastHitT: -99, fireT: -99, born: this.time, dead: false
      };
      t.aim = Math.atan2(TD.DIRS[t.facing][1], TD.DIRS[t.facing][0]);
      this.towers.push(t); this.tById.set(t.id, t); this.towerAt[ci] = t.id; this.stats.built++;
      this.emit('towerPlace', { tower: t });
      if (t.onNode) {
        const ns = this.nodes[ci]; ns.tower = t.id; ns.holdT = 0; ns.engT = 0; this.blockCnt[ci]++; this.stats.isolations++;
        this.emit('nodeIsolate', { ci, by: 'tower', tower: t });
        this.recompute('isolate');
      }
      return t;
    }
    checkUpgrade(t, branch) {
      const d = TD.TOWERS[t.type];
      if (t.level >= 2) return { ok: false, reason: '已是最高等级' };
      if (d.B && !d.B[branch]) return { ok: false, reason: '请选择一个分支' };
      const intel = d.B ? R.branchIntel : 0;
      if (this.compute < d.upCost) return { ok: false, reason: '算力不足（需要 ' + d.upCost + '）', cost: d.upCost, intel };
      if (this.intel < intel) return { ok: false, reason: '情报不足（分支需要 ' + intel + '）', cost: d.upCost, intel };
      return { ok: true, cost: d.upCost, intel };
    }
    upgrade(id, branch, free) {
      const t = this.tById.get(id); if (!t) return false;
      const chk = this.checkUpgrade(t, branch);
      if (!chk.ok && !free) { this.emit('reject', { reason: chk.reason, ci: t.ci, what: 'upgrade' }); return false; }
      const d = TD.TOWERS[t.type];
      if (!free) { this.compute -= d.upCost; this.intel -= chk.intel; this.stats.computeUse += d.upCost; this.stats.intelUse += chk.intel; }
      t.level = 2; t.branch = d.B ? branch : null; t.spent += d.upCost;
      const S = TD.towerStats(t.type, 2, t.branch); const add = S.hp - t.maxHp;
      t.S = S; t.maxHp = S.hp; t.hp = Math.min(t.maxHp, t.hp + Math.max(0, add)); t.upT = this.time;
      this.emit('towerUp', { tower: t });
      return true;
    }
    previewSell(id) { const t = this.tById.get(id); if (!t || !t.onNode) return null; return this.evaluate({ open: [t.ci] }); }
    sell(id) {
      const t = this.tById.get(id); if (!t) return false;
      const refund = Math.round(t.spent * R.sellRefund);
      this.compute += refund; this.stats.sold++;
      this.emit('towerSell', { tower: t, refund });
      this._removeTower(t, 'sell');
      return true;
    }
    _removeTower(t, why) {
      t.dead = true;
      const k = this.towers.indexOf(t); if (k >= 0) this.towers.splice(k, 1);
      this.tById.delete(t.id); this.towerAt[t.ci] = 0;
      for (const id of t.blocked) { const e = this.eById.get(id); if (e && e.blockedBy === t.id) e.blockedBy = 0; }
      if (t.onNode) {
        const ns = this.nodes[t.ci]; ns.tower = 0; ns.reT = R.reisolate * (why === 'destroy' && t.type === 'gateway' && t.level >= 2 ? 1 : 1);
        this.blockCnt[t.ci]--;
        this.emit('nodeOpen', { ci: t.ci, why });
        this.recompute('open');
      }
    }
    destroyTower(t, src) {
      if (t.dead) return;
      this.stats.lost++;
      this.emit('towerDie', { tower: t, src });
      if (t.type === 'honeypot' && t.level >= 2 && t.branch === 'b') {
        const S = t.S; const ids = [];
        for (const e of this.enemies) { if (e.dead || e.fly) continue; if (Math.hypot(e.x - t.x, e.y - t.y) <= S.burst) { this.reveal(e, 'burst'); if (!e.boss) e.stunT = Math.max(e.stunT, S.stun); ids.push(e.id); } }
        this.emit('honeyBurst', { tower: t, r: S.burst, ids });
      }
      this._removeTower(t, 'destroy');
    }

    // ---------- 伤害 / 状态（塔）----------
    damageTower(t, dmg, src, kind) {
      if (t.dead) return;
      const S = t.S;
      if (t.type === 'firewall') {
        if (kind === 'melee' || kind === 'smash') dmg *= 1 - S.armor;
        if (t.skillT > 0) { const sk = TD.TOWERS.firewall.skill; dmg *= 1 - sk.cut; if ((kind === 'melee' || kind === 'smash') && src && src.hp != null && !src.dead && src.d) this.damageEnemy(src, sk.reflect, t, {}); }
      }
      if (t.type === 'gateway' && (kind === 'smash' || kind === 'surge')) dmg *= 1 - S.smashCut;
      let abs = 0;
      if (t.shield > 0) { abs = Math.min(t.shield, dmg); t.shield -= abs; dmg -= abs; if (t.shield <= 0.01) { t.shield = 0; t.shieldT = 0; this.emit('shieldBreak', { tower: t }); } }
      t.hp -= dmg; t.lastHitT = this.time; t.lastHitKind = kind; this.stats.dmgToTowers += dmg;
      if (t.onNode) this.nodes[t.ci].engT = 4;
      this.emit('towerHit', { tower: t, dmg, abs, kind, sx: src ? src.x : t.x, sy: src ? src.y : t.y, src: src ? src.id : 0, fly: !!(src && src.fly) });
      if (t.hp <= 0) this.destroyTower(t, src);
    }
    encryptTower(t, dur) {
      if (t.dead || t.type === 'honeypot' || t.type === 'gateway') return false;
      if (t.shield > 0) { this.emit('encBlocked', { tower: t }); return false; }
      const fresh = t.encT <= 0; t.encT = Math.max(t.encT, dur);
      if (fresh) this.emit('encrypt', { tower: t });
      return true;
    }
    healTower(t, amt) { const a = Math.min(amt, t.maxHp - t.hp); if (a > 0) { t.hp += a; this.stats.healed += a; } return a; }

    // ---------- 技能 ----------
    checkSkill(t) {
      const sk = TD.towerSkill(t.type, t.level, t.branch);
      if (!sk) return { ok: false, reason: t.type === 'interceptor' ? '选择分支后获得技能' : '该设备没有主动技能' };
      if (t.encT > 0) return { ok: false, reason: '设备被加密，无法释放技能', sk };
      if (t.skillCd > 0) return { ok: false, reason: '技能冷却中（' + Math.ceil(t.skillCd) + ' 秒）', sk };
      return { ok: true, sk };
    }
    castSkill(id) {
      const t = this.tById.get(id); if (!t) return false;
      const chk = this.checkSkill(t);
      if (!chk.ok) { this.emit('reject', { reason: chk.reason, ci: t.ci, what: 'skill' }); return false; }
      const sk = chk.sk, S = t.S; t.skillCd = sk.cd; this.stats.skills++;
      const info = { tower: t, name: sk.name, ids: [] };
      if (t.type === 'firewall') { t.skillT = sk.dur; }
      else if (t.type === 'honeypot') {
        for (const e of this.enemies) {
          if (e.dead || e.boss) continue;
          if (e.blockedBy === t.id || (e.detour && e.detour.kind === 'lure' && e.detour.tower === t.id)) { e.rootT = Math.max(e.rootT, S.trap); if (S.mark) e.markT = Math.max(e.markT, S.trap + 1); info.ids.push(e.id); }
        }
        t.skillT = S.trap;
      } else if (t.type === 'interceptor') {
        if (t.branch === 'a') {
          const base = Math.atan2(TD.DIRS[t.facing][1], TD.DIRS[t.facing][0]); info.beams = [];
          for (const off of [-0.3, 0, 0.3]) { const a = base + off; info.beams.push(this._beam(t, a, S.depth + 0.6, sk.dmg)); }
          t.fireT = this.time;
        } else {
          for (const e of this.enemies) { if (e.dead) continue; if (this.inArea(t, S, e.x, e.y)) { this.slowEnemy(e, sk.slow, sk.dur); info.ids.push(e.id); } }
          t.skillT = sk.dur;
        }
      } else if (t.type === 'sandbox') { t.skillT = sk.dur; this._pulse(t, S, sk.mul); }
      else if (t.type === 'repair') {
        for (const o of this.towers) {
          if (o === t || Math.hypot(o.x - t.x, o.y - t.y) > S.range + 0.01) continue;
          if (o.shieldLock <= 0) { o.shield = S.shield; o.shieldMax = S.shield; o.shieldT = sk.dur; }
          if (o.encT > 0) { o.encT = 0; this.emit('cleanse', { tower: o }); }
          info.ids.push(o.id);
        }
        t.skillT = 1.2;
      }
      this.emit('skill', info);
      return true;
    }

    // ---------- 道具 ----------
    downgradeCells(ci) {
      const g = this.grid, c = g.cells[ci], rad = TD.ITEMS.downgrade.radius, out = [];
      for (const o of g.cells) { if (o.type !== 'link' || o.legacy) continue; if (Math.hypot(o.x - c.x, o.y - c.y) <= rad) out.push(o.i); }
      return out;
    }
    checkItem(key, target) {
      const it = TD.ITEMS[key], res = { ok: false, reason: '', ev: null, cells: [] };
      const have = it.res === 'intel' ? this.intel : this.compute;
      if (key === 'isolator') {
        const c = this.grid.cells[target];
        if (!c || c.type !== 'node') { res.reason = '应急隔离器只能投放到交换节点'; return res; }
        const ns = this.nodes[target]; res.cells = [target];
        if (ns.tower || ns.iso) { res.reason = '节点已被隔离'; return res; }
        if (this.blockCnt[target] > 0) { res.reason = '节点当前不可通行'; return res; }
        if (ns.reT > 0) { res.reason = '节点刚恢复直通，' + Math.ceil(ns.reT) + ' 秒后才能再次隔离'; return res; }
        const ev = this.evaluate({ block: [target] }); res.ev = ev;
        if (!ev.ok) { res.reason = this.sealText(ev); res.sealed = true; return res; }
      } else if (key === 'downgrade') {
        const c = this.grid.cells[target];
        if (!c || !c.walk) { res.reason = '协议降级需要投放到链路上'; return res; }
        res.cells = this.downgradeCells(target);
        if (!res.cells.length) { res.reason = '范围内没有可降级的链路'; return res; }
        res.ev = this.evaluate({ leg: res.cells });
      } else if (key === 'restore') {
        const t = this.tById.get(target);
        if (!t) { res.reason = '备份还原需要选择一座塔'; return res; }
        res.cells = [t.ci];
        if (t.hp >= t.maxHp && t.encT <= 0) { res.reason = '该设备完好，无需还原'; return res; }
      }
      if (this.itemCd[key] > 0) { res.reason = it.name + '冷却中（' + Math.ceil(this.itemCd[key]) + ' 秒）'; return res; }
      if (have < it.cost) { res.reason = (it.res === 'intel' ? '情报' : '算力') + '不足（需要 ' + it.cost + '）'; return res; }
      res.ok = true; return res;
    }
    useItem(key, target, free) {
      const chk = this.checkItem(key, target);
      if (!chk.ok && !(free && !chk.sealed && chk.cells.length)) { this.emit('reject', { reason: chk.reason, ci: key === 'restore' ? (this.tById.get(target) || {}).ci : target, ev: chk.ev, what: 'item' }); return false; }
      const it = TD.ITEMS[key];
      if (!free) { if (it.res === 'intel') { this.intel -= it.cost; this.stats.intelUse += it.cost; } else { this.compute -= it.cost; this.stats.computeUse += it.cost; } this.itemCd[key] = it.cd; }
      this.stats.items++;
      if (key === 'isolator') {
        const ns = this.nodes[target]; ns.iso = { hp: it.hp, maxHp: it.hp, t: it.dur, dur: it.dur }; this.blockCnt[target]++; this.stats.isolations++;
        this.emit('item', { key, ci: target });
        this.emit('nodeIsolate', { ci: target, by: 'isolator' });
        this.recompute('isolate');
      } else if (key === 'downgrade') {
        const z = { id: this.nid++, kind: 'downgrade', cells: chk.cells, t: it.dur, dur: it.dur, ci: target };
        for (const c of z.cells) this.legCnt[c]++;
        this.zones.push(z);
        this.emit('item', { key, ci: target, cells: z.cells });
        this.recompute('downgrade');
      } else if (key === 'restore') {
        const t = this.tById.get(target); const amt = this.healTower(t, t.maxHp * it.frac);
        if (t.encT > 0) { t.encT = 0; this.emit('cleanse', { tower: t }); }
        this.emit('item', { key, ci: t.ci, tower: t, amt });
      }
      return true;
    }
    breakIsolator(ci, why) {
      const ns = this.nodes[ci]; if (!ns || !ns.iso) return;
      ns.iso = null; ns.reT = R.reisolate; this.blockCnt[ci]--;
      this.emit('nodeOpen', { ci, why: why || 'expire', iso: true });
      this.recompute('open');
    }

    // ---------- 攻击区域 ----------
    inArea(t, S, x, y) {
      const d = TD.DIRS[t.facing], dx = x - t.x, dy = y - t.y;
      const f = dx * d[0] + dy * d[1], l = Math.abs(dx * -d[1] + dy * d[0]);
      return f >= -0.5 && f <= S.depth + 0.5 && l <= S.half;
    }
    areaCells(ci, facing, S) {
      const c = this.grid.cells[ci], d = TD.DIRS[facing], out = [], hw = Math.floor(S.half);
      for (let f = 0; f <= S.depth; f++) for (let l = -hw; l <= hw; l++) {
        const x = c.x + d[0] * f - d[1] * l, y = c.y + d[1] * f + d[0] * l, cc = this.cellAt(x, y);
        if (cc && cc.i !== ci) out.push(cc.i);
      }
      return out;
    }
    targetable(e) { return !e.dead && !e.hidden && !(e.type === 'boss3' && e.phase === 1 && e.revealT <= 0); }
    acquire(t, S) {
      let best = null, bs = Infinity; const sup = !!S.slow;
      for (const e of this.enemies) {
        if (!this.targetable(e) || !this.inArea(t, S, e.x, e.y)) continue;
        let sc = e.remain; if (sup && e.slowT > 0.3) sc += 1000;
        if (sc < bs) { bs = sc; best = e; }
      }
      return best;
    }
    _beam(t, ang, len, dmg) {
      const x1 = t.x, y1 = t.y, ux = Math.cos(ang), uy = Math.sin(ang), x2 = x1 + ux * len, y2 = y1 + uy * len, hits = [];
      for (const e of this.enemies.slice()) {
        if (e.dead) continue;
        const px = e.x - x1, py = e.y - y1, f = px * ux + py * uy;
        if (f < 0.2 || f > len) continue;
        if (Math.abs(px * -uy + py * ux) <= 0.3 + e.d.r * 0.6) { hits.push(e.id); this.damageEnemy(e, dmg * (e.fly ? R.antiAir : 1), t, { aoe: true }); }
      }
      return { x1, y1, x2, y2, hits };
    }
    _pulse(t, S, mul) {
      const ids = [];
      for (const e of this.enemies.slice()) {
        if (e.dead || e.fly) continue;
        if (Math.hypot(e.x - t.x, e.y - t.y) <= S.aoe + e.d.r * 0.5) { ids.push(e.id); this.damageEnemy(e, S.dmg * (mul || 1), t, { aoe: true, shieldMul: S.shieldMul }); }
      }
      t.fireT = this.time;
      this.emit('pulse', { tower: t, r: S.aoe, ids, big: (mul || 1) > 1 });
    }

    // ---------- 塔的每帧更新 ----------
    updateTower(t) {
      const S = t.S;
      if (t.shieldT > 0) { t.shieldT -= DT; if (t.shieldT <= 0) { t.shield = 0; this.emit('shieldOff', { tower: t }); } }
      if (t.shieldLock > 0) t.shieldLock -= DT;
      if (t.encT > 0) { t.encT -= DT; if (t.encT <= 0) { t.encT = 0; this.emit('cleanse', { tower: t, auto: true }); } }
      if (t.skillCd > 0) t.skillCd -= DT;
      if (t.skillT > 0) t.skillT -= DT;
      if (t.cd > 0) t.cd -= DT;
      const enc = t.encT > 0;
      if (t.blocker) {
        let load = 0, w = 0;
        for (let k = 0; k < t.blocked.length; k++) { const e = this.eById.get(t.blocked[k]); if (e && !e.dead && e.blockedBy === t.id) { t.blocked[w++] = e.id; load += e.d.size; } }
        t.blocked.length = w; t.load = load;
      }
      switch (t.type) {
        case 'firewall':
          if (!enc && t.cd <= 0 && t.blocked.length) {
            t.cd = S.rate; t.fireT = this.time;
            const ids = S.cleave ? t.blocked.slice() : [t.blocked[0]], pts = [];
            for (const id of ids) { const e = this.eById.get(id); if (e && !e.dead) { pts.push([e.x, e.y]); this.damageEnemy(e, S.dmg, t, {}); } }
            this.emit('fwHit', { tower: t, pts, cleave: S.cleave });
          }
          break;
        case 'honeypot':
          t.scanT -= DT; if (t.scanT <= 0) { t.scanT = 0.25; this._lureScan(t, S); }
          if (S.mark) for (const id of t.blocked) { const e = this.eById.get(id); if (e) e.markT = Math.max(e.markT, 0.5); }
          break;
        case 'gateway':
          if (S.regen && this.time - t.lastHitT > 3 && t.hp < t.maxHp) t.hp = Math.min(t.maxHp, t.hp + S.regen * DT);
          break;
        case 'interceptor': {
          const tg = enc ? null : this.acquire(t, S);
          t.target = tg ? tg.id : 0; t.hasAim = !!tg;
          if (tg) {
            t.aim = Math.atan2(tg.y - t.y, tg.x - t.x);
            if (t.cd <= 0) {
              t.cd = S.rate; t.fireT = this.time;
              if (S.pierce) { const b = this._beam(t, t.aim, S.depth + 0.6, S.dmg); this.emit('beam', { tower: t, b }); }
              else {
                const sup = !!S.slow;
                this.shots.push({ id: this.nid++, kind: sup ? 'sup' : 'bolt', x: t.x, y: t.y, sx: t.x, sy: t.y, tx: tg.x, ty: tg.y, target: tg.id, tk: 'e', speed: sup ? 18 : 15, dmg: S.dmg, src: t.id, slow: S.slow || 0, slowT: S.slowT || 0, fly: tg.fly, born: this.time });
                this.emit('shot', { tower: t, kind: sup ? 'sup' : 'bolt' });
              }
            }
          }
          break;
        }
        case 'sandbox': {
          const dr = S.detect * (t.skillT > 0 ? 2 : 1);
          let any = false;
          for (const e of this.enemies) {
            if (e.dead) continue;
            const d = Math.hypot(e.x - t.x, e.y - t.y);
            if (d <= dr && (e.hidden || e.type === 'boss3')) this.reveal(e, 'sandbox');
            if (!e.fly && d <= S.aoe + e.d.r * 0.5) any = true;
          }
          if (!enc && t.cd <= 0 && any) { t.cd = S.rate; this._pulse(t, S, 1); }
          break;
        }
        case 'repair': {
          t.healIds.length = 0;
          if (!enc) {
            const cands = [];
            for (const o of this.towers) { if (o === t || o.hp >= o.maxHp) continue; if (Math.hypot(o.x - t.x, o.y - t.y) <= S.range + 0.01) cands.push(o); }
            cands.sort((a, b) => (a.hp / a.maxHp - b.hp / b.maxHp) || (a.id - b.id));
            for (let k = 0; k < cands.length && k < S.beams; k++) { this.healTower(cands[k], S.heal * DT); t.healIds.push(cands[k].id); }
          }
          break;
        }
      }
    }
    _lureScan(t, S) {
      let res = t.load;
      for (const e of this.enemies) if (!e.dead && e.detour && e.detour.kind === 'lure' && e.detour.tower === t.id) res += e.d.size;
      if (res >= S.block) return;
      const g = this.grid, depth = Math.ceil(S.lure) + 3;
      for (const e of this.enemies) {
        if (e.dead || e.fly || e.boss || !e.d.attacker || e.blockedBy || e.passed === t.id || e.rootT > 0) continue;
        if (e.detour && e.detour.kind === 'lure') continue;
        if (res + e.d.size > S.block) continue;
        if (Math.hypot(e.x - t.x, e.y - t.y) > S.lure) continue;
        const start = e.to >= 0 ? e.to : e.cell;
        if (start === t.ci) continue;
        if (!this._pass(start)) continue;
        const path = TD.bfsPath(g, this._pass, start, i => i === t.ci, depth);
        if (!path || !path.length) continue;
        e.detour = { kind: 'lure', tower: t.id, path };
        res += e.d.size;
        this.emit('lure', { tower: t, enemy: e });
        if (res >= S.block) break;
      }
    }

    // ---------- 主循环 ----------
    step() {
      if (this.over) return;
      this.time += DT; this.tickN++;
      this.compute += R.passive * this.passiveMul * DT * (this.phase === 'active' ? 1 : 0.5);
      this.updateWave();
      for (const k in this.itemCd) if (this.itemCd[k] > 0) this.itemCd[k] = Math.max(0, this.itemCd[k] - DT);
      this.updateZones();
      this.updateNodes();
      for (const t of this.towers.slice()) if (!t.dead) this.updateTower(t);
      for (const e of this.enemies.slice()) if (!e.dead) this.updateEnemy(e);
      this.updateShots();
      if (this._dirtyDead) { this.enemies = this.enemies.filter(e => !e.dead); this._dirtyDead = false; }
      this.checkWaveEnd();
    }
    updateZones() {
      let changed = null;
      for (let k = this.zones.length - 1; k >= 0; k--) {
        const z = this.zones[k]; z.t -= DT;
        if (z.t <= 0) {
          this.zones.splice(k, 1);
          if (z.kind === 'downgrade') { for (const c of z.cells) this.legCnt[c]--; changed = 'downgradeEnd'; }
          else { for (const c of z.cells) this.blockCnt[c]--; changed = z.kind + 'End'; }
          this.emit('zoneEnd', { zone: z });
        }
      }
      if (changed) this.recompute(changed);
      for (let k = this.warnings.length - 1; k >= 0; k--) {
        const w = this.warnings[k]; w.t += DT;
        const boss = this.eById.get(w.boss);
        if (!boss || boss.dead) { this.warnings.splice(k, 1); this.emit('warnEnd', { warn: w, cancelled: true }); continue; }
        if (w.t >= w.dur) { this.warnings.splice(k, 1); this.emit('warnEnd', { warn: w }); this.execWarning(w, boss); }
      }
    }
    updateNodes() {
      const chk = this.tickN % 15 === 0;
      for (const k in this.nodes) {
        const ns = this.nodes[k];
        if (ns.reT > 0) ns.reT = Math.max(0, ns.reT - DT);
        if (ns.engT > 0) ns.engT -= DT;
        if (ns.iso) { ns.iso.t -= DT; if (ns.iso.t <= 0) this.breakIsolator(ns.i, 'expire'); }
        if (ns.tower) {
          if (chk) { const c = this.grid.cells[ns.i]; for (const e of this.enemies) if (!e.dead && !e.fly && Math.hypot(e.x - c.x, e.y - c.y) <= 1.7) { ns.engT = Math.max(ns.engT, 0.5); break; } }
          if (ns.engT > 0 && this.phase === 'active') {
            ns.holdT += DT;
            if (ns.holdT >= R.holdInterval) { ns.holdT = 0; this.gainIntel(1, 'hold', this.grid.cells[ns.i].x, this.grid.cells[ns.i].y); }
          }
        }
      }
    }
    gainIntel(n, why, x, y) { this.intel += n; this.stats.intelGain += n; this.emit('intel', { n, why, x, y }); }
    updateShots() {
      for (let k = this.shots.length - 1; k >= 0; k--) {
        const s = this.shots[k];
        let tg = s.tk === 'e' ? this.eById.get(s.target) : this.tById.get(s.target);
        if (tg && tg.dead) tg = null;
        if (tg) { s.tx = tg.x; s.ty = tg.y; }
        const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy), mv = s.speed * DT;
        if (d <= mv) {
          this.shots.splice(k, 1);
          if (tg) {
            if (s.tk === 'e') { if (s.slow) this.slowEnemy(tg, s.slow, s.slowT); this.damageEnemy(tg, s.dmg * (tg.fly ? R.antiAir : 1), this.tById.get(s.src) || null, {}); }
            else { const src = this.eById.get(s.src); this.damageTower(tg, s.dmg, src || { x: s.sx, y: s.sy, id: 0 }, 'ranged'); if (s.enc && !tg.dead) this.encryptTower(tg, s.enc); }
          }
          this.emit('shotHit', { shot: s, hit: !!tg });
        } else { s.x += dx / d * mv; s.y += dy / d * mv; }
      }
    }
  }
  TD.Sim = Sim;
})(typeof window !== 'undefined' ? window : globalThis);
