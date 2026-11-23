// 战斗模拟：与渲染无关的纯逻辑。所有时间都由 update(dt) 推进，便于确定性地导出视频。
(function () {
  const D = window.GAME_DATA;
  const STEP = 1 / 60;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const DIRS8 = [[1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071], [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071]];

  class Sim {
    constructor(mapDef, opts = {}) {
      this.def = mapDef;
      this.g = new window.GridMap(mapDef);
      const g = this.g;
      this.seed = opts.seed || 7;
      this.rng = mulberry32(this.seed);
      this.t = 0;
      this.res = { compute: opts.compute != null ? opts.compute : 240, intel: opts.intel != null ? opts.intel : 70 };
      this.integrity = 100;
      this.totalWaves = mapDef.waves;
      this.waveNo = 0; // 已开始的波次（从 1 计）
      this.state = 'prep'; // prep | active | won | lost
      this.prepT = opts.prepT != null ? opts.prepT : 26;
      this.spawnQ = [];
      this.enemies = new Map();
      this.nextId = 1;
      this.towers = new Map();
      this.cellTower = new Array(g.n).fill(null);
      this.isoDevice = new Array(g.n).fill(null); // 节点上的隔离设备（防火墙 / 网闸）
      this.isolators = new Map(); // 应急隔离器
      this.nodeCd = new Float64Array(g.n); // 节点恢复后的再次隔离冷却结束时间
      this.blackhole = new Map(); // 伪路由黑洞：格 -> 结束时间
      this.lock = new Map(); // 锁死段：格 -> 结束时间
      this.downgrade = new Map(); // 协议降级：格 -> 结束时间
      this.pending = []; // 预警中的 Boss 行动
      this.events = [];
      this.projectiles = [];
      this.itemCd = {};
      this.field = null;
      this.dirty = true;
      this.fieldCache = new Map();
      this.lastPaths = {};
      this.stats = {
        kills: 0, leaks: 0, towersBuilt: 0, towersLost: 0, nodesIsolated: 0, reroutes: 0,
        itemsUsed: 0, bossKilled: false, spent: 0, peakWave: 0, nodeHeld: 0, trojanBursts: 0,
      };
      this.warnings = [];
      this.bossIds = [];
      this.seenTypes = new Set();
      this.ensureField();
      this.lastPaths = this.entryPaths();
    }

    // ---------- 工具 ----------
    emit(ev) { this.events.push(ev); }
    drainEvents() { const e = this.events; this.events = []; return e; }
    cellPos(i) { return [this.g.worldX(i), this.g.worldZ(i)]; }
    rand() { return this.rng(); }
    costOf(i) {
      const g = this.g;
      if (g.type[i] === 'old' || this.downgrade.has(i)) return 2;
      return 1;
    }
    isPass(i, extra) {
      const g = this.g;
      if (!g.passable[i]) return false;
      if (extra) {
        if (extra.iso && extra.iso.has(i)) return false;
        if (extra.clear && extra.clear.has(i)) return true;
      }
      if (g.type[i] === 'node' && (this.isoDevice[i] || this.isolators.has(i))) return false;
      if (this.blackhole.has(i) || this.lock.has(i)) return false;
      return true;
    }
    isIsolated(i) { return this.g.type[i] === 'node' && !!(this.isoDevice[i] || this.isolators.has(i)); }
    occupied(i) {
      for (const e of this.enemies.values()) {
        if (e.flying || e.dead) continue;
        if (e.a === i || e.b === i) return true;
      }
      return false;
    }

    // ---------- 流向场与路线 ----------
    computeFieldWith(extra) {
      const g = this.g;
      const pass = (i) => this.isPass(i, extra);
      const exits = g.exits.map((x) => x.cell);
      return window.GridRouting.computeField(g, pass, (i) => this.costOf(i), exits);
    }
    ensureField() {
      if (!this.dirty && this.field) return;
      this.dirty = false;
      this.field = this.computeFieldWith(null);
      this.fieldCache.clear();
      this.onTopoChange();
    }
    entryPaths(extra) {
      const g = this.g;
      const f = extra ? this.computeFieldWith(extra) : this.field;
      const out = {};
      for (const e of g.entries) {
        const reach = f.dist[e.cell] < Infinity;
        out[e.id] = reach ? window.GridRouting.walkField(f, e.cell) : [];
      }
      return out;
    }
    // 设备式隔离的目标场：洪泛团 / Boss 用来冲向节点的通行一侧
    fieldToNode(node) {
      let f = this.fieldCache.get(node);
      if (f) return f;
      const g = this.g;
      const acc = g.adj[node].filter((j) => this.isPass(j));
      f = window.GridRouting.computeField(g, (i) => this.isPass(i), (i) => this.costOf(i), acc);
      this.fieldCache.set(node, f);
      return f;
    }
    fieldFor(e) {
      if (e.target >= 0) return this.fieldToNode(e.target);
      return this.field;
    }
    onTopoChange() {
      // 场上地面敌人从当前位置重新寻路：必要时掉头
      const f = this.field;
      for (const e of this.enemies.values()) {
        if (e.flying || e.dead || e.b < 0) continue;
        const ff = this.fieldFor(e);
        const bOk = this.isPass(e.b) && ff.dist[e.b] < Infinity;
        let reverse = false;
        if (!bOk) reverse = true;
        else {
          const cb = this.costOf(e.b);
          const fwd = (1 - e.p) * cb + ff.dist[e.b];
          const back = e.p * cb + ff.dist[e.a];
          if (back < fwd - 0.05 && this.isPass(e.a)) reverse = true;
        }
        if (reverse && this.isPass(e.a)) {
          const tmp = e.a; e.a = e.b; e.b = tmp; e.p = 1 - e.p;
        }
      }
      // 路线变化记录
      const paths = this.entryPaths();
      const changed = [];
      for (const id in paths) {
        const a = paths[id].join(','), b = (this.lastPaths[id] || []).join(',');
        if (a !== b) changed.push(id);
      }
      if (changed.length && this.lastPaths && Object.keys(this.lastPaths).length) {
        this.stats.reroutes += changed.length;
        this.emit({ type: 'reroute', entries: changed, paths });
      }
      this.lastPaths = paths;
    }
    // 预览：在假设的通行变化下，检查是否封死，并给出各入口的新路线
    preview(extra) {
      const g = this.g;
      const f = this.computeFieldWith(extra);
      const sealed = [];
      for (const e of g.entries) if (!(f.dist[e.cell] < Infinity)) sealed.push(e.id);
      for (const en of this.enemies.values()) {
        if (en.flying || en.dead) continue;
        const ok = f.dist[en.a] < Infinity || (en.b >= 0 && f.dist[en.b] < Infinity);
        if (!ok) { sealed.push('敌人'); break; }
      }
      const paths = {};
      for (const e of g.entries) paths[e.id] = f.dist[e.cell] < Infinity ? window.GridRouting.walkField(f, e.cell) : [];
      const changed = [];
      for (const id in paths) if (paths[id].join() !== (this.lastPaths[id] || []).join()) changed.push(id);
      return { ok: sealed.length === 0, sealed, paths, changed, field: f };
    }
    // 单格隔离预览（节点）
    previewIsolate(cell) {
      return this.preview({ iso: new Set([cell]) });
    }

    // ---------- 放置与操作 ----------
    placeKindOf(i) {
      const t = this.g.type[i];
      if (t === 'link' || t === 'old') return 'link';
      if (t === 'node') return 'node';
      if (t === 'plat') return 'plat';
      return null;
    }
    checkTower(kind, cell, opts = {}) {
      const def = D.TOWERS[kind];
      if (!def) return { ok: false, reason: '未知设备' };
      const g = this.g;
      if (cell == null || cell < 0) return { ok: false, reason: '不能部署在这里' };
      const pk = this.placeKindOf(cell);
      if (!pk || def.places.indexOf(pk) < 0) {
        if (g.type[cell] === 'entry' || g.type[cell] === 'exit') return { ok: false, reason: '入口与出口不能部署设备' };
        if (g.type[cell] === 'block') return { ok: false, reason: '障碍不能部署' };
        if (g.type[cell] === 'void') return { ok: false, reason: '空域不能部署' };
        return { ok: false, reason: `${def.name}只能部署在${def.places.map((p) => ({ link: '链路', node: '交换节点', plat: '设备平台' }[p])).join('或')}上` };
      }
      if (this.cellTower[cell]) return { ok: false, reason: '这里已有设备' };
      if (this.isolators.has(cell)) return { ok: false, reason: '节点正由应急隔离器隔离' };
      const cost = def.cost;
      const intel = pk === 'node' ? (def.nodeIntel || 0) : 0;
      if (this.res.compute < cost) return { ok: false, reason: '算力不足', need: { compute: cost } };
      if (this.res.intel < intel) return { ok: false, reason: '情报不足', need: { intel } };
      if (pk === 'node') {
        if (this.nodeCd[cell] > this.t) return { ok: false, reason: `节点刚恢复直通，${Math.ceil(this.nodeCd[cell] - this.t)} 秒后才能再次隔离` };
        if (kind !== 'interceptor') {
          const pv = this.preview({ iso: new Set([cell]) });
          if (!pv.ok) return { ok: false, reason: `此操作会封死${pv.sealed.join('、')}，已拒绝`, sealed: true, cell };
        }
      }
      return { ok: true, cost: { compute: cost, intel }, kind: pk };
    }
    placeTower(kind, cell, opts = {}) {
      const chk = this.checkTower(kind, cell, opts);
      if (!chk.ok) return chk;
      const def = D.TOWERS[kind];
      this.res.compute -= def.cost;
      if (chk.cost.intel) this.res.intel -= chk.cost.intel;
      const t = {
        id: this.nextId++, kind, cell, def, cls: def.cls, level: 1, branch: null,
        hp: def.hp, maxHp: def.hp, shield: 0, encUntil: 0, flash: 0,
        cd: 0, skillCd: 0, skillUntil: 0, rateMul: 1,
        blockCap: def.blockCap || 0, usedCap: 0, blockers: new Set(),
        tauntR: def.tauntR || 0, trapR: def.trapR, trapCd: def.trapCd || 0, burn: 0,
        range: def.range || 0, dmg: def.dmg || 0, rate: def.rate || 0, pierce: 0, suppress: false,
        detectR: def.detectR || 0, aoeR: def.aoeR || 0, aoeRange: def.aoeRange || 0, aoeDmg: def.aoeDmg || 0,
        healR: def.healR || 0, heal: def.heal || 0, counterDmg: def.counterDmg || 0, counterRate: def.counterRate || 0,
        angle: opts.angle != null ? opts.angle : 0, spent: def.cost, intelSpent: chk.cost.intel,
        x: this.g.worldX(cell), z: this.g.worldZ(cell), placedT: this.t, revealT: 0, aoeCd: 0, lastHitT: -99,
        shieldUntil: 0, skillActive: false, engaged: false,
      };
      if (kind === 'firewall') { t.counterDmg = def.counterDmg; t.counterRate = def.counterRate; }
      this.towers.set(t.id, t);
      this.cellTower[cell] = t;
      if (chk.kind === 'node') {
        this.isoDevice[cell] = t;
        this.stats.nodesIsolated++;
        this.dirty = true;
        this.emit({ type: 'isolate', cell, by: t.id, kind: 'device' });
      }
      this.stats.towersBuilt++;
      this.stats.spent += chk.cost.compute + (chk.cost.intel || 0);
      this.dirty = true;
      this.emit({ type: 'built', tower: t.id, kind, cell });
      this.ensureField();
      return { ok: true, tower: t };
    }
    canUpgrade(t) {
      if (!t || t.level >= 2) return { ok: false, reason: '已达到最高等级' };
      if (t.def.branches && t.level === 1) return { ok: true, cost: { compute: t.def.upCost } };
      if (!t.def.upCost) return { ok: false, reason: '无法升级' };
      return { ok: true, cost: { compute: t.def.upCost } };
    }
    upgrade(id) {
      const t = this.towers.get(id);
      const c = this.canUpgrade(t);
      if (!c.ok) return c;
      if (this.res.compute < c.cost.compute) return { ok: false, reason: '算力不足', need: { compute: c.cost.compute } };
      this.res.compute -= c.cost.compute;
      t.spent += c.cost.compute;
      t.level = 2;
      const m = t.def.upMul || {};
      if (m.hp) { const old = t.maxHp; t.maxHp = Math.round(t.maxHp * m.hp); t.hp = Math.min(t.maxHp, t.hp + (t.maxHp - old)); }
      if (m.dmg) t.dmg = Math.round(t.dmg * m.dmg);
      if (m.range) t.range = m.range;
      if (m.detectR) t.detectR *= m.detectR;
      if (m.aoeR) t.aoeR *= m.aoeR;
      if (m.aoeDmg) t.aoeDmg = Math.round(t.aoeDmg * m.aoeDmg);
      if (m.healR) t.healR *= m.healR;
      if (m.heal) t.heal *= m.heal;
      if (m.cap) t.blockCap = m.cap;
      if (t.kind === 'firewall') { t.blockCap = 4; t.counterDmg = 20; }
      if (t.kind === 'gateway') t.maxHp = t.maxHp;
      if (t.kind === 'sandbox') t.aoeRange += 0.5;
      if (t.kind === 'repair') t.shieldAmt = 95;
      this.emit({ type: 'upgrade', tower: t.id, kind: t.kind, cell: t.cell });
      return { ok: true };
    }
    branchOptions(id) {
      const t = this.towers.get(id);
      if (!t || !t.def.branches) return null;
      return t.def.branches;
    }
    chooseBranch(id, key) {
      const t = this.towers.get(id);
      if (!t || !t.def.branches) return { ok: false, reason: '该设备没有分支' };
      if (t.level < 2) return { ok: false, reason: '需先升至 2 级' };
      if (t.branch) return { ok: false, reason: '分支已选定' };
      const b = t.def.branches[key];
      if (!b) return { ok: false, reason: '未知分支' };
      if (this.res.intel < 20) return { ok: false, reason: '情报不足', need: { intel: 20 } };
      this.res.intel -= 20;
      t.branch = key;
      b.apply(t);
      this.emit({ type: 'branch', tower: t.id, kind: t.kind, branch: key, cell: t.cell });
      return { ok: true };
    }
    sellPrice(id) {
      const t = this.towers.get(id);
      if (!t) return 0;
      return Math.floor(t.spent * 0.5);
    }
    sell(id) {
      const t = this.towers.get(id);
      if (!t) return { ok: false, reason: '设备不存在' };
      const refund = this.sellPrice(id);
      this.res.compute += refund;
      this.removeTower(t, 'sold');
      return { ok: true, refund };
    }
    removeTower(t, why) {
      this.towers.delete(t.id);
      if (this.cellTower[t.cell] === t) this.cellTower[t.cell] = null;
      for (const eid of t.blockers) {
        const e = this.enemies.get(eid);
        if (e) { e.blocker = null; e.blockTower = -1; }
      }
      t.blockers.clear();
      t.usedCap = 0;
      if (this.isoDevice[t.cell] === t) this.releaseIsolation(t.cell);
      this.emit({ type: why === 'sold' ? 'sold' : 'towerDown', tower: t.id, kind: t.kind, cell: t.cell, x: t.x, z: t.z });
      this.dirty = true;
      this.ensureField();
    }
    releaseIsolation(cell) {
      this.isoDevice[cell] = null;
      this.nodeCd[cell] = this.t + 10;
      this.dirty = true;
      this.emit({ type: 'restore', cell });
      this.ensureField();
    }
    useSkill(id) {
      const t = this.towers.get(id);
      if (!t) return { ok: false, reason: '设备不存在' };
      if (!t.def.skill) return { ok: false, reason: '该设备没有主动技能' };
      if (t.skillCd > 0) return { ok: false, reason: `冷却中，还需 ${Math.ceil(t.skillCd)} 秒` };
      if (this.isEnc(t)) return { ok: false, reason: '设备已被加密，无法释放技能' };
      const s = t.def.skill;
      t.skillCd = t.kind === 'honeypot' ? t.trapCd : s.cd;
      switch (t.kind) {
        case 'firewall': t.skillUntil = this.t + s.dur; t.blockCap += 3; t.counterDmg *= 2; break;
        case 'honeypot': this.trapAround(t); break;
        case 'interceptor': t.skillUntil = this.t + s.dur; t.rateMul = 2; break;
        case 'sandbox': this.sandboxPulse(t, 2); break;
        case 'repair': this.shieldAround(t); break;
      }
      this.emit({ type: 'skill', tower: t.id, kind: t.kind, cell: t.cell });
      return { ok: true };
    }
    isEnc(t) { return this.t < t.encUntil; }
    trapAround(t) {
      let n = 0;
      for (const e of this.enemies.values()) {
        if (e.flying || e.dead || e.isBoss) continue;
        const d = Math.hypot(e.x - t.x, e.z - t.z);
        if (d <= t.trapR) { e.trapT = t.def.skill.dur; n++; this.emit({ type: 'trap', x: e.x, z: e.z, enemy: e.id }); }
      }
      return n;
    }
    shieldAround(t) {
      for (const o of this.towers.values()) {
        if (o === t) continue;
        if (Math.hypot(o.x - t.x, o.z - t.z) <= t.healR + 0.2) {
          o.shield = Math.max(o.shield, t.def.skill ? 70 : 70);
          o.shieldUntil = this.t + 8;
          o.encUntil = 0;
          this.emit({ type: 'shield', tower: o.id, x: o.x, z: o.z });
        }
      }
    }
    // 道具
    checkItem(kind, cell) {
      const def = D.ITEMS[kind];
      const g = this.g;
      if (!def) return { ok: false, reason: '未知道具' };
      if ((this.itemCd[kind] || 0) > this.t) return { ok: false, reason: `冷却中，还需 ${Math.ceil(this.itemCd[kind] - this.t)} 秒` };
      if (this.res.intel < (def.cost.intel || 0) || this.res.compute < (def.cost.compute || 0)) {
        return { ok: false, reason: def.cost.intel ? '情报不足' : '算力不足', need: def.cost };
      }
      if (kind === 'isolator') {
        if (cell == null || g.type[cell] !== 'node') return { ok: false, reason: '应急隔离器只能用于直通的交换节点' };
        if (this.cellTower[cell]) return { ok: false, reason: '节点上已有设备' };
        if (this.isIsolated(cell)) return { ok: false, reason: '节点已被隔离' };
        if (this.nodeCd[cell] > this.t) return { ok: false, reason: `节点刚恢复直通，${Math.ceil(this.nodeCd[cell] - this.t)} 秒后才能隔离` };
        const pv = this.preview({ iso: new Set([cell]) });
        if (!pv.ok) return { ok: false, reason: `此操作会封死${pv.sealed.join('、')}，已拒绝`, sealed: true, cell };
        return { ok: true };
      }
      if (kind === 'downgrade') {
        if (cell == null || (g.type[cell] !== 'link' && g.type[cell] !== 'old')) return { ok: false, reason: '协议降级需要指向链路' };
        const cells = this.cellsInRadius(cell, def.radius).filter((i) => g.type[i] === 'link' || g.type[i] === 'old');
        return { ok: true, cells };
      }
      if (kind === 'restore') {
        const t = cell != null ? this.cellTower[cell] : null;
        if (!t) return { ok: false, reason: '备份还原需要指向己方设备' };
        if (t.hp >= t.maxHp && !this.isEnc(t)) return { ok: false, reason: '设备状态正常，无需还原' };
        return { ok: true, tower: t };
      }
      return { ok: false, reason: '无法使用' };
    }
    cellsInRadius(cell, r) {
      const g = this.g, out = [];
      const cx = g.x[cell], cy = g.y[cell];
      for (let i = 0; i < g.n; i++) {
        const dx = g.x[i] - cx, dy = g.y[i] - cy;
        if (dx * dx + dy * dy <= r * r + 0.01) out.push(i);
      }
      return out;
    }
    useItem(kind, cell) {
      const chk = this.checkItem(kind, cell);
      if (!chk.ok) return chk;
      const def = D.ITEMS[kind];
      if (def.cost.intel) this.res.intel -= def.cost.intel;
      if (def.cost.compute) this.res.compute -= def.cost.compute;
      this.itemCd[kind] = this.t + def.cd;
      this.stats.itemsUsed++;
      if (kind === 'isolator') {
        this.isolators.set(cell, { hp: def.hp, life: def.life, id: this.nextId++ });
        this.dirty = true;
        this.ensureField();
        this.emit({ type: 'isolate', cell, kind: 'isolator' });
      } else if (kind === 'downgrade') {
        for (const i of chk.cells) this.downgrade.set(i, this.t + def.dur);
        this.dirty = true;
        this.ensureField();
        this.emit({ type: 'downgrade', cells: chk.cells, cell });
      } else if (kind === 'restore') {
        const t = chk.tower;
        t.hp = Math.min(t.maxHp, t.hp + Math.round(t.maxHp * def.healPct));
        t.encUntil = 0;
        this.emit({ type: 'restoreTower', tower: t.id, x: t.x, z: t.z });
      }
      this.emit({ type: 'item', kind, cell });
      return { ok: true };
    }

    // ---------- 敌人 ----------
    spawn(type, entryId, opts = {}) {
      const g = this.g;
      const entry = g.entries.find((e) => e.id === entryId);
      if (!entry) return null;
      const isBoss = type.startsWith('boss:');
      const key = isBoss ? type.slice(5) : type;
      const def = isBoss ? D.BOSSES[key] : D.ENEMIES[key];
      const hpMul = opts.hpMul != null ? opts.hpMul : 1;
      const e = {
        id: this.nextId++, type: key, def, isBoss, entry: entryId, flying: !!def.flying,
        hp: Math.round(def.hp * hpMul), maxHp: Math.round(def.hp * hpMul), shield: 0, armor: 0,
        a: entry.cell, b: -1, p: 0, x: 0, z: 0, slowT: 0, slowMul: 1, trapT: 0, suppressT: 0,
        blocker: null, blockTower: -1, cloned: !!opts.cloned, dead: false, flash: 0, atkCd: 0,
        revealed: !def.disguised, revealT: 0, target: -1, smashCd: 0, cd: 0, shieldCd: 0, rem: 0,
        flyFrom: entry.cell, flyTo: -1, heading: 0, spawnT: this.t, pathPhase: 0, bossPhase: 0, bossKind: key,
        hiddenNow: !!def.disguised,
      };
      if (e.flying) {
        const exits = g.exits;
        let best = exits[0], bd = 1e9;
        for (const x of exits) {
          const d = Math.hypot(g.x[x.cell] - g.x[entry.cell], g.y[x.cell] - g.y[entry.cell]);
          if (d < bd) { bd = d; best = x; }
        }
        e.flyTo = best.cell;
        e.flyLen = Math.max(1, Math.hypot(g.x[e.flyTo] - g.x[e.flyFrom], g.y[e.flyTo] - g.y[e.flyFrom]));
        e.p = 0;
        e.a = entry.cell;
      }
      if (isBoss) {
        e.hp = Math.round(def.hp * (hpMul > 1 ? 1 : 1));
        e.maxHp = e.hp;
        e.cd = 6;
        e.shieldCd = 0;
        e.bossPhase = 0;
        this.bossIds.push(e.id);
        e.revealed = key !== 'zhenying';
        e.revealT = 0;
        e.hiddenNow = key === 'zhenying';
      }
      this.enemies.set(e.id, e);
      this.updatePos(e);
      if (!opts.silent && !this.seenTypes.has(key)) { this.seenTypes.add(key); this.emit({ type: 'newType', kind: key, boss: isBoss }); }
      if (!opts.silent) this.emit({ type: 'spawn', enemy: e.id, kind: key, entry: entryId, boss: isBoss, x: e.x, z: e.z });
      return e;
    }
    updatePos(e) {
      const g = this.g;
      if (e.flying) {
        const f = Math.min(1, e.p);
        const ax = g.x[e.flyFrom], ay = g.y[e.flyFrom], bx = g.x[e.flyTo], by = g.y[e.flyTo];
        const gx = ax + (bx - ax) * f, gy = ay + (by - ay) * f;
        e.x = gx - (g.w - 1) / 2;
        e.z = gy - (g.h - 1) / 2;
        e.y = 2.1 + 0.25 * Math.sin(this.t * 3 + e.id);
        return;
      }
      const ax = g.worldX(e.a), az = g.worldZ(e.a);
      if (e.b >= 0) {
        const bx = g.worldX(e.b), bz = g.worldZ(e.b);
        e.x = ax + (bx - ax) * e.p;
        e.z = az + (bz - az) * e.p;
        e.heading = Math.atan2(bx - ax, bz - az);
      } else {
        e.x = ax; e.z = az;
      }
      e.y = 0;
    }
    // 攻击目标选择：蜜罐嘲讽 > 阻挡它的塔 > 最近的塔
    pickTarget(e, range) {
      let best = null, bestScore = Infinity;
      for (const t of this.towers.values()) {
        const d = Math.hypot(t.x - e.x, t.z - e.z);
        if (d > range) continue;
        let score = d;
        if (t.kind === 'honeypot') score -= 100;
        if (e.blockTower === t.id) score -= 50;
        if (score < bestScore) { bestScore = score; best = t; }
      }
      return best;
    }
    blockerAt(cell, e) {
      if (e.flying) return null;
      const g = this.g;
      const t0 = this.cellTower[cell];
      const cands = [];
      if (t0 && t0.blockCap > 0 && (g.type[cell] === 'link' || g.type[cell] === 'old')) cands.push(t0);
      for (const n of g.adj[cell]) {
        const tn = this.cellTower[n];
        if (g.type[n] === 'node' && tn && tn.kind === 'firewall' && this.isoDevice[n] === tn && tn.blockCap > 0) cands.push(tn);
      }
      for (const t of cands) {
        if (t.usedCap === 0 || t.usedCap + e.def.blockCost <= t.blockCap) return t;
      }
      return null;
    }
    block(e, t) {
      e.blocker = t.id;
      e.blockTower = t.id;
      t.blockers.add(e.id);
      t.usedCap += e.def.blockCost || 1;
      e.b = -1;
      e.p = 0;
      if (e.type === 'trojan' && !e.revealed) this.reveal(e, 'block');
      this.emit({ type: 'block', enemy: e.id, tower: t.id, x: e.x, z: e.z });
    }
    unblock(e) {
      const t = this.towers.get(e.blockTower);
      if (t) { t.blockers.delete(e.id); t.usedCap = Math.max(0, t.usedCap - (e.def.blockCost || 1)); }
      e.blocker = null;
      e.blockTower = -1;
    }
    reveal(e, why) {
      if (e.revealed && !e.hiddenNow) return;
      e.revealed = true;
      e.hiddenNow = false;
      e.revealT = this.t + 6;
      this.emit({ type: 'reveal', enemy: e.id, x: e.x, z: e.z, why });
    }
    arrive(e, cell) {
      const g = this.g;
      // 蠕虫：首次经过直通的交换节点时复制
      if (e.type === 'worm' && !e.cloned && g.type[cell] === 'node' && !this.isIsolated(cell)) {
        e.cloned = true;
        const c = this.spawn('worm', e.entry, { cloned: true, silent: true });
        if (c) { c.a = cell; c.b = -1; c.p = 0; c.cloned = true; this.updatePos(c); }
        this.emit({ type: 'clone', x: e.x, z: e.z });
      }
      // 旧链路显形木马
      if (e.def.disguised && (g.type[cell] === 'old' || this.downgrade.has(cell))) this.reveal(e, 'old');
      const bt = this.blockerAt(cell, e);
      if (bt) this.block(e, bt);
    }
    moveGround(e, dt) {
      if (e.dead || e.blocker || e.trapT > 0) return;
      const g = this.g;
      const f = this.fieldFor(e);
      if (e.b < 0) {
        if (g.type[e.a] === 'exit') return;
        let nx = f.next[e.a];
        if (nx < 0 && !this.isPass(e.a)) nx = this.escapeCell(e.a, f);
        if (nx < 0) return;
        e.b = nx; e.p = 0;
      }
      const slow = e.slowT > 0 ? e.slowMul : 1;
      const spd = e.def.speed * slow * (e.isBoss && e.bossKind === 'zhenying' && e.bossPhase >= 2 ? 1.25 : 1);
      e.p += spd * dt / this.costOf(e.b);
      let guard = 0;
      while (e.p >= 1 && guard++ < 4) {
        e.p -= 1;
        e.a = e.b;
        e.b = -1;
        if (g.type[e.a] === 'exit') {
          this.reachExit(e);
          return;
        }
        this.arrive(e, e.a);
        if (e.blocker) { e.p = 0; return; }
        const f2 = this.fieldFor(e);
        let nx = f2.next[e.a];
        if (nx < 0 && !this.isPass(e.a)) nx = this.escapeCell(e.a, f2);
        if (nx < 0) { e.p = 0; return; }
        if (e.target >= 0 && e.a !== e.target && g.adj[e.target].indexOf(e.a) >= 0 && this.isIsolated(e.target)) {
          // 已到达冲击位置，停下攻击
          e.p = 0; return;
        }
        e.b = nx;
      }
    }
    // 站在已被封锁的格上时，朝最近的可通行邻格撤离
    escapeCell(cell, f) {
      let best = -1, bd = Infinity;
      for (const n of this.g.adj[cell]) {
        if (!this.isPass(n)) continue;
        if (f.dist[n] < bd) { bd = f.dist[n]; best = n; }
      }
      return bd < Infinity ? best : -1;
    }
    reachExit(e) {
      e.dead = true;
      this.enemies.delete(e.id);
      this.integrity -= e.def.coreDmg;
      this.stats.leaks++;
      this.emit({ type: 'leak', enemy: e.id, kind: e.type, x: e.x, z: e.z, dmg: e.def.coreDmg, boss: e.isBoss });
      if (this.integrity <= 0) {
        this.integrity = 0;
        this.endGame('lost');
      }
    }
    hitEnemy(e, dmg, src, extra) {
      if (e.dead || dmg <= 0) return;
      let d = dmg;
      if (e.armor) d *= 1 - e.armor;
      if (extra && extra.suppressed) d *= 1.25;
      if (e.shield > 0) {
        const a = Math.min(e.shield, d);
        e.shield -= a; d -= a;
      }
      e.hp -= d;
      e.flash = 0.18;
      if (src !== 'burn') this.emit({ type: 'hit', enemy: e.id, x: e.x, z: e.z, dmg: Math.round(dmg), src: src || '', y: e.flying ? 2.1 : 0.5 });
      if (e.hp <= 0) this.killEnemy(e, src);
    }
    killEnemy(e, src) {
      if (e.dead) return;
      e.dead = true;
      this.enemies.delete(e.id);
      this.stats.kills++;
      const r = e.def.reward || 0;
      this.res.compute += r + (e.isBoss ? 80 : 0);
      if (e.def.intel && !e.isBoss) this.res.intel += e.def.intel;
      if (e.isBoss) {
        this.res.intel += e.def.intel;
        this.stats.bossKilled = true;
        this.bossIds = this.bossIds.filter((x) => x !== e.id);
      }
      if (e.blocker) this.unblock(e);
      if (e.def.disguised && e.hiddenNow) {
        this.stats.trojanBursts++;
        const p = e.def.payload;
        this.emit({ type: 'payload', x: e.x, z: e.z, r: p.r });
        for (const t of [...this.towers.values()]) {
          if (Math.hypot(t.x - e.x, t.z - e.z) <= p.r) this.hitTower(t, p.dmg, 'payload');
        }
      }
      this.emit({ type: 'kill', enemy: e.id, kind: e.type, x: e.x, z: e.z, y: e.flying ? 2.1 : 0, boss: e.isBoss, src });
    }
    hitTower(t, dmg, src) {
      if (!this.towers.has(t.id) || dmg <= 0) return;
      let d = dmg;
      if (t.shield > 0) { const a = Math.min(t.shield, d); t.shield -= a; d -= a; }
      t.hp -= d;
      t.flash = 0.2;
      t.lastHitT = this.t;
      this.emit({ type: 'towerHit', tower: t.id, x: t.x, z: t.z, dmg: Math.round(dmg), src: src || '' });
      if (t.hp <= 0) {
        t.hp = 0;
        this.stats.towersLost++;
        this.removeTower(t, 'down');
      }
    }

    // ---------- 波次 ----------
    startWave() {
      this.waveNo++;
      this.state = 'active';
      this.stats.peakWave = Math.max(this.stats.peakWave, this.waveNo);
      const groups = D.WAVES[this.def.id][this.waveNo - 1] || [];
      const hpMul = 1 + 0.055 * (this.waveNo - 1);
      const q = [];
      for (const gr of groups) {
        const isBoss = gr.t.startsWith('boss:');
        const ids = isBoss ? gr.e.slice(0, 1) : gr.e;
        for (const eid of ids) {
          for (let k = 0; k < gr.n; k++) {
            q.push({ t: this.t + (gr.at || 0) + k * gr.gap, entry: eid, type: gr.t, hpMul: isBoss ? 1 : hpMul });
          }
        }
      }
      q.sort((a, b) => a.t - b.t);
      this.spawnQ = q;
      this.emit({ type: 'wave', no: this.waveNo, total: this.totalWaves, boss: groups.some((x) => x.t.startsWith('boss:')) });
    }
    skipPrep() {
      if (this.state === 'prep') this.prepT = 0;
    }
    endGame(res) {
      if (this.state === 'won' || this.state === 'lost') return;
      this.state = res;
      this.emit({ type: 'end', result: res });
    }

    // ---------- 主循环 ----------
    update(dt) {
      let rem = dt;
      let guard = 0;
      while (rem > 1e-9 && this.state !== 'won' && this.state !== 'lost' && guard++ < 2000) {
        const h = Math.min(rem, STEP);
        this.step(h);
        rem -= h;
      }
    }
    step(h) {
      this.t += h;
      this.ensureField();
      // 波次与准备
      if (this.state === 'prep') {
        this.prepT -= h;
        if (this.prepT <= 0) this.startWave();
      }
      while (this.spawnQ.length && this.spawnQ[0].t <= this.t) {
        const s = this.spawnQ.shift();
        this.spawn(s.type, s.entry, { hpMul: s.hpMul });
      }
      // 收入
      const rate = 3.5 + 0.3 * Math.max(0, this.waveNo - 1);
      this.res.compute += rate * h;
      this.tickTimers(h);
      this.tickBossAbilities(h);
      // 敌人
      for (const e of [...this.enemies.values()]) {
        if (e.dead) continue;
        e.flash = Math.max(0, e.flash - h);
        if (e.trapT > 0) e.trapT -= h;
        if (e.slowT > 0) { e.slowT -= h; if (e.slowT <= 0) e.slowMul = 1; }
        if (e.suppressT > 0) e.suppressT -= h;
        if (e.def.disguised && e.hiddenNow === false && e.revealT > 0 && this.t > e.revealT && e.type === 'trojan') { /* keep revealed */ }
        if (e.flying) {
          e.p += (e.def.speed * h) / e.flyLen;
          if (e.p >= 1) { this.reachExit(e); continue; }
          this.updatePos(e);
          continue;
        }
        if (e.target >= 0 && this.isIsolated(e.target) === false) e.target = -1;
        this.enemyAbilities(e, h);
        if (!e.dead) this.moveGround(e, h);
        if (e.dead) continue;
        this.updatePos(e);
      }
      // 防火墙 / 蜜罐阻挡的还击，蜜罐灼烧
      this.towerUpdate(h);
      this.projectileUpdate(h);
      // 清理
      this.warnings = this.warnings.filter((w) => this.t < w.until);
      // 波次完成
      if (this.state === 'active' && this.spawnQ.length === 0 && this.enemies.size === 0) {
        const bonus = 12 + this.waveNo;
        this.res.intel += bonus;
        this.res.compute += 20 + this.waveNo * 2;
        this.emit({ type: 'waveClear', no: this.waveNo, bonus });
        if (this.waveNo >= this.totalWaves) {
          this.endGame('won');
        } else {
          this.state = 'prep';
          this.prepT = 24;
        }
      }
      if (this.integrity <= 0) this.endGame('lost');
    }
    tickTimers(h) {
      const expire = (m) => { for (const [k, v] of m) if (this.t >= v) { m.delete(k); this.dirty = true; } };
      expire(this.blackhole); expire(this.lock); expire(this.downgrade);
      for (const [k, v] of this.isolators) {
        v.life -= h;
        if (v.life <= 0) { this.isolators.delete(k); this.nodeCd[k] = this.t + 10; this.dirty = true; this.emit({ type: 'restore', cell: k, kind: 'expire' }); }
      }
      if (this.dirty) this.ensureField();
      // 节点坚守情报
      for (const t of this.towers.values()) {
        if (this.isoDevice[t.cell] === t && this.t - t.lastHitT < 1.5) this.res.intel += h * 0.8;
      }
      for (const t of this.towers.values()) {
        if (t.skillCd > 0) t.skillCd -= h;
        if (t.flash > 0) t.flash -= h;
        if (t.skillUntil && this.t >= t.skillUntil) {
          t.skillUntil = 0;
          if (t.kind === 'firewall') { t.blockCap = t.level === 2 ? 4 : 3; t.counterDmg = t.level === 2 ? 20 : 14; }
          if (t.kind === 'interceptor') t.rateMul = 1;
        }
        if (t.shield > 0 && t.shieldUntil && this.t >= t.shieldUntil) t.shield = 0;
      }
    }
    towerUpdate(h) {
      for (const t of [...this.towers.values()]) {
        if (!this.towers.has(t.id)) continue;
        const enc = this.isEnc(t);
        // 防火墙与蜜罐：对阻挡的敌人还击或灼烧
        if ((t.kind === 'firewall' || t.kind === 'honeypot') && !enc) {
          t.cd -= h;
          if (t.cd <= 0 && t.blockers.size) {
            t.cd = 1 / (t.counterRate || 1);
            for (const eid of [...t.blockers]) {
              const e = this.enemies.get(eid);
              if (!e) continue;
              if (t.kind === 'firewall') { this.emit({ type: 'counter', tower: t.id, enemy: e.id, x: t.x, z: t.z, tx: e.x, tz: e.z }); this.hitEnemy(e, t.counterDmg, 'firewall'); }
            }
          }
          if (t.kind === 'honeypot' && t.burn > 0) {
            for (const eid of [...t.blockers]) {
              const e = this.enemies.get(eid);
              if (e) this.hitEnemy(e, t.burn * h, 'burn');
            }
          }
          // 防火墙同时还击在节点上拦截的敌人
        }
        if (t.kind === 'repair' && !enc) {
          for (const o of this.towers.values()) {
            if (o === t) continue;
            if (o.hp >= o.maxHp) continue;
            if (Math.hypot(o.x - t.x, o.z - t.z) <= t.healR) {
              o.hp = Math.min(o.maxHp, o.hp + t.heal * h);
              t.healTick = (t.healTick || 0) + h;
              if (t.healTick > 0.45) {
                t.healTick = 0;
                this.emit({ type: 'heal', from: t.id, to: o.id, x: o.x, z: o.z, fx: t.x, fz: t.z });
              }
            }
          }
        }
        if (t.kind === 'interceptor' && !enc) {
          t.cd -= h;
          if (t.cd <= 0) {
            const tgt = this.pickInterceptorTarget(t);
            if (tgt) {
              t.cd = 1 / (t.rate * (t.rateMul || 1));
              t.angle = t.angle;
              const dur = t.def.travel;
              this.projectiles.push({ kind: 'shot', tower: t.id, enemy: tgt.id, t: 0, dur, dmg: t.dmg, branch: t.branch, supp: t.suppress, pierce: t.pierce, fromX: t.x, fromZ: t.z, fromY: 1.2 });
              this.emit({ type: 'shot', from: t.id, to: tgt.id, x: t.x, z: t.z, tx: tgt.x, tz: tgt.z, kind: 'interceptor', branch: t.branch, dur });
            }
          }
        }
        if (t.kind === 'sandbox' && !enc) {
          t.aoeCd -= h;
          if (t.aoeCd <= 0) {
            t.aoeCd = 1 / t.rate;
            this.sandboxPulse(t, 1);
          }
        }
      }
    }
    pickInterceptorTarget(t) {
      const ang = t.angle;
      const fx = Math.cos(ang), fz = Math.sin(ang);
      let best = null, bestRem = Infinity;
      for (const e of this.enemies.values()) {
        if (e.dead) continue;
        if (!e.flying && e.hiddenNow) continue; // 未显形不能被单体攻击选中
        const dx = e.x - t.x, dz = e.z - t.z;
        const d = Math.hypot(dx, dz);
        if (d > t.range || d < 0.2) continue;
        const dot = (dx * fx + dz * fz) / d;
        if (dot < 0.6 && !(d < 1.0)) continue;
        const rem = this.enemyRemaining(e);
        if (rem < bestRem) { bestRem = rem; best = e; }
      }
      return best;
    }
    enemyRemaining(e) {
      if (e.flying) return (1 - e.p) * 30;
      const f = this.fieldFor(e);
      const base = e.b >= 0 ? f.dist[e.b] + (1 - e.p) : f.dist[e.a];
      return base;
    }
    sandboxPulse(t, mult) {
      // 检测：显形范围内伪装 / 潜伏目标
      for (const e of this.enemies.values()) {
        if (e.dead || e.flying) continue;
        if (Math.hypot(e.x - t.x, e.z - t.z) <= t.detectR) {
          if (e.hiddenNow) {
            e.hiddenNow = false;
            if (e.isBoss) { e.revealT = this.t + 5; e.revealed = true; }
            this.emit({ type: 'reveal', enemy: e.id, x: e.x, z: e.z, why: 'sandbox' });
          }
        }
      }
      // 范围攻击：选择沿路线离出口最近、在攻击范围内的地面敌人为中心
      let center = null, bestRem = Infinity;
      for (const e of this.enemies.values()) {
        if (e.dead || e.flying) continue;
        if (Math.hypot(e.x - t.x, e.z - t.z) > t.aoeRange) continue;
        const rem = this.enemyRemaining(e);
        if (rem < bestRem) { bestRem = rem; center = e; }
      }
      if (!center) return;
      this.emit({ type: 'aoe', x: center.x, z: center.z, r: t.aoeR, from: t.id, kind: 'sandbox' });
      const hits = [...this.enemies.values()].filter((e) => !e.dead && !e.flying && Math.hypot(e.x - center.x, e.z - center.z) <= t.aoeR);
      for (const e of hits) this.hitEnemy(e, t.aoeDmg * mult, 'sandbox');
    }
    projectileUpdate(h) {
      const keep = [];
      for (const p of this.projectiles) {
        p.t += h;
        if (p.t < p.dur) { keep.push(p); continue; }
        if (p.kind === 'shot') {
          const e = this.enemies.get(p.enemy);
          if (e && !e.dead) {
            let dmg = p.dmg;
            if (p.supp) this.applySlow(e, 0.5, 2.5);
            this.hitEnemy(e, dmg, 'interceptor', { suppressed: e.suppressT > 0 || p.supp });
            if (p.supp) e.suppressT = 2.5;
            if (p.pierce) {
              // 贯穿：沿射线继续命中后方的目标（含未显形木马）
              const dx = e.x - p.fromX, dz = e.z - p.fromZ;
              const dl = Math.hypot(dx, dz) || 1;
              let k = 1;
              const all = [...this.enemies.values()].filter((x) => x !== e && !x.dead && !x.flying);
              for (const x of all) {
                if (k >= p.pierce) break;
                const vx = x.x - p.fromX, vz = x.z - p.fromZ;
                const along = (vx * dx + vz * dz) / dl;
                const perp = Math.abs(vx * dz - vz * dx) / dl;
                if (along > dl && along < dl + 3.2 && perp < 0.55) {
                  this.hitEnemy(x, dmg * (0.7 - 0.15 * k), 'pierce');
                  k++;
                }
              }
              this.emit({ type: 'pierce', x0: p.fromX, z0: p.fromZ, x1: e.x, z1: e.z });
            }
          }
        }
        if (p.kind === 'ranged') {
          const t = this.towers.get(p.tower);
          if (t) this.hitTower(t, p.dmg, p.src);
          if (p.encrypt && t && t.kind !== 'honeypot') { t.encUntil = this.t + p.encrypt; this.emit({ type: 'encrypt', tower: t.id, x: t.x, z: t.z }); }
        }
      }
      this.projectiles = keep;
    }
    applySlow(e, mul, dur) {
      e.slowMul = Math.min(e.slowMul, mul);
      e.slowT = Math.max(e.slowT, dur);
    }
    // 敌人能力：蠕虫 / 洪泛团 / 勒索者 / 加壳器 / 木马
    enemyAbilities(e, h) {
      const def = e.def;
      if (e.isBoss) return; // Boss 由 tickBossAbilities 处理
      // 木马潜伏隐藏由 hiddenNow 表示
      // 加壳器：为附近同伴提供护盾
      if (def.shieldAmt) {
        e.shieldCd -= h;
        if (e.shieldCd <= 0) {
          e.shieldCd = def.shieldCd;
          for (const o of this.enemies.values()) {
            if (o === e || o.dead || o.flying) continue;
            if (Math.hypot(o.x - e.x, o.z - e.z) <= def.aura) {
              o.shield = Math.min(o.shield + def.shieldAmt, def.shieldAmt * 2);
            }
          }
          this.emit({ type: 'aura', x: e.x, z: e.z, r: def.aura });
        }
      }
      // 洪泛团：冲向被隔离节点的通行一侧，重击设备
      if (def.smash && !e.blocker) {
        if (e.target < 0) this.pickSmashTarget(e);
        if (e.target >= 0 && this.isIsolated(e.target) && this.g.adj[e.target].indexOf(e.a) >= 0 && e.b < 0) {
          e.smashCd -= h;
          if (e.smashCd <= 0) {
            e.smashCd = def.smash.cd;
            this.smashNode(e.target, def.smash.dmg, e);
          }
        } else if (e.target >= 0 && !this.isIsolated(e.target)) {
          e.target = -1;
        }
      }
      // 勒索者：边移动边远程攻击射程内的塔（被阻挡时停下射击）
      if (def.range) {
        e.cd -= h;
        if (e.cd <= 0) {
          const tgt = this.pickRansomTarget(e);
          if (tgt) {
            e.cd = 1 / def.rate;
            this.projectiles.push({ kind: 'ranged', tower: tgt.id, dmg: def.dmg, encrypt: def.encrypt, t: 0, dur: 0.35, src: 'ransom', fromX: e.x, fromZ: e.z, fromY: 0.6, enemy: e.id });
            this.emit({ type: 'enemyShot', from: e.id, to: tgt.id, x: e.x, z: e.z, tx: tgt.x, tz: tgt.z, kind: 'ransom' });
          } else e.cd = 0.2;
        }
      }
      // 被阻挡的近战敌人：攻击挡住它的塔（附近蜜罐的嘲讽会吸引它改打蜜罐）
      if (e.blocker && !def.range) {
        const t = this.towers.get(e.blockTower);
        if (!t) { e.blocker = null; e.blockTower = -1; return; }
        e.atkCd = (e.atkCd || 0) - h;
        if (e.atkCd <= 0) {
          e.atkCd = 1.0;
          let target = t;
          const taunt = this.pickTarget(e, 2.4);
          if (taunt && taunt.kind === 'honeypot') target = taunt;
          this.emit({ type: 'enemyBite', enemy: e.id, to: target.id, x: e.x, z: e.z, tx: target.x, tz: target.z, dmg: def.dmg });
          this.hitTower(target, def.dmg, e.type);
        }
      }
    }
    pickRansomTarget(e) {
      const range = e.def.range;
      let best = null, bestScore = Infinity;
      for (const t of this.towers.values()) {
        const d = Math.hypot(t.x - e.x, t.z - e.z);
        if (d > range) continue;
        let score = d;
        if (t.kind === 'honeypot') score -= 100;
        else if (e.blockTower === t.id) score -= 20;
        if (score < bestScore) { bestScore = score; best = t; }
      }
      return best;
    }
    pickSmashTarget(e) {
      // 在附近的隔离节点中选择一个可到达的目标
      let best = -1, bestD = Infinity;
      for (const node of this.g.nodes) {
        if (!this.isIsolated(node)) continue;
        if (!this.isoDevice[node] && !this.isolators.has(node)) continue;
        const f = this.fieldToNode(node);
        const d = f.dist[e.a];
        if (d < Infinity && d < bestD) { bestD = d; best = node; }
      }
      if (best >= 0 && bestD <= 14) e.target = best;
    }
    smashNode(node, dmg, src) {
      const iso = this.isolators.get(node);
      if (iso) {
        iso.hp -= dmg;
        this.emit({ type: 'slam', cell: node, x: this.g.worldX(node), z: this.g.worldZ(node), dmg, kind: 'isolator' });
        if (iso.hp <= 0) {
          this.isolators.delete(node);
          this.nodeCd[node] = this.t + 10;
          this.dirty = true;
          this.emit({ type: 'restore', cell: node, kind: 'broken' });
          this.ensureField();
        }
        return;
      }
      const t = this.isoDevice[node];
      if (t) {
        this.emit({ type: 'slam', cell: node, x: this.g.worldX(node), z: this.g.worldZ(node), dmg, kind: 'device' });
        this.hitTower(t, dmg, src ? src.type : 'smash');
      }
    }
    // ---------- Boss ----------
    tickBossAbilities(h) {
      for (const id of this.bossIds) {
        const e = this.enemies.get(id);
        if (!e || e.dead) continue;
        this.bossAbility(e, h);
      }
      // 预警到期后执行
      for (const p of this.pending) {
        if (!p.done && this.t >= p.at) { p.done = true; this.execPending(p); }
      }
      this.pending = this.pending.filter((p) => !p.done);
    }
    bossAbility(e, h) {
      const frac = e.hp / e.maxHp;
      const k = e.bossKind;
      if (k === 'wanku') {
        if (frac < 0.5 && e.bossPhase < 1) {
          e.bossPhase = 1;
          this.emit({ type: 'phase', enemy: e.id, phase: 2, name: '蠕虫群', x: e.x, z: e.z });
          e.cd = 1;
        }
        e.cd -= h;
        if (e.bossPhase >= 1 && e.cd <= 0) {
          e.cd = 9;
          for (let i = 0; i < 5; i++) {
            const c = this.spawn('worm', e.entry, { cloned: true, silent: true });
            if (c) { c.a = e.a; c.b = -1; c.p = 0; c.cloned = true; this.updatePos(c); }
          }
          this.emit({ type: 'summon', x: e.x, z: e.z });
        }
        // 洪峰：冲向隔离节点，冲击设备
        if (e.target < 0 && e.smashCd <= 0) this.pickSmashTarget(e);
        if (e.target >= 0) {
          if (!this.isIsolated(e.target)) { e.target = -1; }
          else if (this.g.adj[e.target].indexOf(e.a) >= 0 && e.b < 0) {
            e.smashCd -= h;
            if (e.smashCd <= 0 && !e.wind) {
              e.wind = true;
              this.warnings.push({ kind: 'slam', cell: e.target, until: this.t + 1.2 });
              this.pending.push({ kind: 'slam', node: e.target, at: this.t + 1.2, boss: e.id });
            }
          }
        }
      } else if (k === 'shenlou') {
        if (frac < 0.5 && e.bossPhase < 1) {
          e.bossPhase = 1;
          this.emit({ type: 'phase', enemy: e.id, phase: 2, name: '路由风暴', x: e.x, z: e.z });
          e.cd = 4;
          e.stormT = 0;
        }
        e.cd -= h;
        if (e.cd <= 0) {
          if (e.bossPhase === 0 || e.stormT === undefined) {
            e.cd = 12;
            this.planBlackhole(e);
          } else {
            e.cd = 13;
            e.stormT = 6;
            this.emit({ type: 'storm', x: e.x, z: e.z, r: 3.6, dur: 6 });
          }
        }
        if (e.stormT > 0) {
          e.stormT -= h;
          for (const t of [...this.towers.values()]) {
            if (Math.hypot(t.x - e.x, t.z - e.z) <= 3.6) {
              t.shield = 0;
              this.hitTower(t, 9 * h, 'storm');
            }
          }
        }
      } else if (k === 'zhenying') {
        if (frac < 0.66 && e.bossPhase < 1) {
          e.bossPhase = 1;
          e.armor = 0.35;
          e.hiddenNow = false;
          this.emit({ type: 'phase', enemy: e.id, phase: 2, name: '提权', x: e.x, z: e.z });
          e.cd = 4;
        }
        if (frac < 0.33 && e.bossPhase < 2) {
          e.bossPhase = 2;
          this.emit({ type: 'phase', enemy: e.id, phase: 3, name: '破坏', x: e.x, z: e.z });
          e.cd = 3;
        }
        if (e.revealT && this.t > e.revealT && e.bossPhase === 0) {
          e.hiddenNow = true;
        }
        if (e.bossPhase === 0 && !e.revealed) e.hiddenNow = true;
        e.cd -= h;
        if (e.bossPhase >= 1 && e.cd <= 0) {
          e.cd = e.bossPhase >= 2 ? 15 : 9;
          if (e.bossPhase === 1) {
            for (let i = 0; i < 2; i++) {
              const c = this.spawn('trojan', e.entry, { silent: true });
              if (c) { c.a = e.a; c.b = -1; c.p = 0; this.updatePos(c); c.revealed = false; c.hiddenNow = true; }
            }
            this.emit({ type: 'summon', x: e.x, z: e.z });
          } else {
            this.planLock(e);
          }
        }
      }
    }
    // 从 Boss 当前位置沿路线向前，选择可以安全改变的连续链路段（不会封死）
    candidateSegment(e, len) {
      const g = this.g;
      const f = this.fieldFor(e);
      const route = [];
      let cur = e.b >= 0 ? e.b : e.a;
      let guard = 0;
      while (cur >= 0 && route.length < 14 && guard++ < 40 && g.type[cur] !== 'exit') {
        route.push(cur);
        cur = f.next[cur];
      }
      for (let s = 1; s + len <= route.length; s++) {
        const seg = route.slice(s, s + len);
        if (seg.every((c) => (g.type[c] === 'link' || g.type[c] === 'old') && !this.cellTower[c] && !this.occupied(c))) {
          return seg;
        }
      }
      return null;
    }
    planBlackhole(e) {
      const seg = this.candidateSegment(e, 2);
      if (!seg) return;
      const f2 = this.computeFieldWith({ iso: new Set(seg) });
      const ok = this.g.entries.every((en) => f2.dist[en.cell] < Infinity) && [...this.enemies.values()].every((x) => x.flying || x.dead || f2.dist[x.a] < Infinity || (x.b >= 0 && f2.dist[x.b] < Infinity));
      if (!ok) return;
      this.warnings.push({ kind: 'blackhole', cells: seg, until: this.t + 3.5 });
      this.pending.push({ kind: 'blackhole', cells: seg, at: this.t + 3.5, dur: 9 });
      this.emit({ type: 'warn', kind: 'blackhole', cells: seg, dur: 3.5 });
    }
    planLock(e) {
      const seg = this.candidateSegment(e, 3);
      if (!seg) return;
      const f2 = this.computeFieldWith({ iso: new Set(seg) });
      const ok = this.g.entries.every((en) => f2.dist[en.cell] < Infinity) && [...this.enemies.values()].every((x) => x.flying || x.dead || f2.dist[x.a] < Infinity || (x.b >= 0 && f2.dist[x.b] < Infinity));
      if (!ok) return;
      this.warnings.push({ kind: 'lock', cells: seg, until: this.t + 4 });
      this.pending.push({ kind: 'lock', cells: seg, at: this.t + 4, dur: 12 });
      this.emit({ type: 'warn', kind: 'lock', cells: seg, dur: 4 });
    }
    execPending(p) {
      if (p.kind === 'blackhole' || p.kind === 'lock') {
        const map = p.kind === 'blackhole' ? this.blackhole : this.lock;
        if (p.cells.some((c) => this.cellTower[c])) return;
        const f2 = this.computeFieldWith({ iso: new Set(p.cells) });
        const ok = this.g.entries.every((en) => f2.dist[en.cell] < Infinity);
        if (!ok) return;
        for (const c of p.cells) map.set(c, this.t + p.dur);
        this.dirty = true;
        this.ensureField();
        this.emit({ type: p.kind, cells: p.cells, dur: p.dur });
      } else if (p.kind === 'slam') {
        const node = p.node;
        const boss = this.enemies.get(p.boss);
        if (boss) boss.wind = false;
        if (boss) boss.smashCd = 12;
        if (!this.isIsolated(node)) return;
        const dmg = 110;
        this.emit({ type: 'slam', cell: node, x: this.g.worldX(node), z: this.g.worldZ(node), dmg, kind: 'boss' });
        const iso = this.isolators.get(node);
        if (iso) {
          this.isolators.delete(node);
          this.nodeCd[node] = this.t + 10;
          this.dirty = true;
          this.ensureField();
          this.emit({ type: 'restore', cell: node, kind: 'broken' });
        }
        const t = this.isoDevice[node];
        if (t) {
          this.hitTower(t, dmg, 'boss');
        }
        for (const o of [...this.towers.values()]) {
          if (o !== t && Math.hypot(o.x - this.g.worldX(node), o.z - this.g.worldZ(node)) <= 1.3) this.hitTower(o, 40, 'boss');
        }
      }
    }
    // 演示与剧情用：在指定格上预警后锁死（与 Boss 锁死相同的执行流程）
    scheduleLock(cells, warnDur, dur) {
      this.warnings.push({ kind: 'lock', cells, until: this.t + warnDur });
      this.pending.push({ kind: 'lock', cells, at: this.t + warnDur, dur });
      this.emit({ type: 'warn', kind: 'lock', cells, dur: warnDur });
    }
    // 预览用的 Boss 行动预警
    bossWarnings() { return this.warnings; }
    // 导出给渲染层的只读快照
    bossList() { return this.bossIds.map((id) => this.enemies.get(id)).filter(Boolean); }
    liveCount() { return this.enemies.size; }
  }

  window.Sim = Sim;
  window.SIM_UTIL = { DIRS8, mulberry32 };
})();
