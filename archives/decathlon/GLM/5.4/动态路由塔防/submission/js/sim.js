/* 动态路由塔防 —— 核心模拟：网格图、寻路、改道、战斗、状态、Boss、道具、波次（纯逻辑） */
window.G = window.G || {};
(function () {
  'use strict';
  const DT = 1 / 30;
  const CELL = 4, LAYER_H = 2.4, FLY_Y = 3.7, PLAT_Y = 1.6;
  const OLD_COST = 2.5, OLD_SLOW = 0.45, REOPEN_CD = 8;

  // ---------- 工具 ----------
  function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  class Heap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
    pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (; ;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break;[a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  }
  const DIRS = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
  const DIR8 = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

  // ---------- 地图构建 ----------
  function buildMap(def) {
    const M = { def, w: def.w, d: def.d, cells: [], byKey: new Map(), byId: new Map(), adj: new Map(), nodes: [], entries: [], exits: [], platforms: [], obstacles: [], rivers: [], gaps: [] };
    const key = (x, z, L) => L + ':' + x + ':' + z;
    function addCell(x, z, L, ch) {
      if (ch === '.' || ch === ' ') return null;
      const c = { id: key(x, z, L), x, z, L, ch, L0: L };
      c.wx = (x - (M.w - 1) / 2) * CELL; c.wz = (z - (M.d - 1) / 2) * CELL; c.wy = L * LAYER_H;
      if (ch === '-') c.type = 'path';
      else if (ch === '=') c.type = 'old';
      else if (ch >= '1' && ch <= '9') { c.type = 'node'; c.nodeId = ch; c.name = def.nodes[ch]; M.nodes.push(c); }
      else if (ch === 'A' || ch === 'B' || ch === 'C') { c.type = 'entry'; c.entryId = ch; c.name = def.entries[ch]; M.entries.push(c); }
      else if (ch === 'X' || ch === 'Y') { c.type = 'exit'; c.exitId = ch; c.name = def.exits[ch]; M.exits.push(c); }
      else if (ch === 'p') { c.type = 'plat'; c.wy = PLAT_Y; M.platforms.push(c); }
      else if (ch === '#') { c.type = 'obst'; M.obstacles.push(c); }
      else if (ch === '~') { c.type = 'river'; M.rivers.push(c); }
      else if (ch === '@') { c.type = 'gap'; c.gap = true; M.gaps.push(c); }
      else return null;
      M.cells.push(c); M.byKey.set(c.id, c); M.byId.set(c.id, c);
      return c;
    }
    def.layer0.forEach((row, z) => { for (let x = 0; x < row.length && x < M.w; x++) addCell(x, z, 0, row[x]); });
    if (def.layer1) def.layer1.forEach((row, z) => { for (let x = 0; x < row.length && x < M.w; x++) addCell(x, z, 1, row[x]); });
    // 邻接
    const walkTypes = { path: 1, old: 1, node: 1, entry: 1, exit: 1 };
    for (const c of M.cells) {
      if (!walkTypes[c.type]) continue;
      const list = [];
      for (const d in DIRS) {
        const nb = M.byKey.get(key(c.x + DIRS[d][0], c.z + DIRS[d][1], c.L));
        if (nb && walkTypes[nb.type]) list.push([nb.id, CELL]);
      }
      if (c.L > 0) {
        for (const r of (def.ramps || [])) {
          if (r[0] === c.x && r[1] === c.z && r[2] === c.L) {
            const dd = DIRS[r[3]]; const nb = M.byKey.get(key(c.x + dd[0], c.z + dd[1], c.L - 1));
            if (nb && walkTypes[nb.type]) list.push([nb.id, Math.hypot(CELL, LAYER_H)]);
          }
        }
      } else {
        for (const r of (def.ramps || [])) {
          if (r[2] === 1) { const dd = DIRS[r[3]]; if (r[0] + dd[0] === c.x && r[1] + dd[1] === c.z) { const nb = M.byKey.get(key(r[0], r[1], 1)); if (nb && walkTypes[nb.type]) list.push([nb.id, Math.hypot(CELL, LAYER_H)]); } }
        }
      }
      M.adj.set(c.id, list);
    }
    // 校验
    for (const c of M.cells) if (walkTypes[c.type] && !M.adj.get(c.id)) M.adj.set(c.id, []);
    M.entryIds = M.entries.map(c => c.entryId);
    M.exitIds = M.exits.map(c => c.exitId);
    M.nodeByNum = {}; for (const n of M.nodes) M.nodeByNum[n.nodeId] = n;
    M.walkable = walkTypes;
    return M;
  }

  // ---------- 寻路 ----------
  function costFactor(M, c, g) {
    if (c.type === 'old') return OLD_COST;
    if (g && g.terrain.oldUntil.has(c.id) && g.terrain.oldUntil.get(c.id) > g.t) return OLD_COST;
    return 1;
  }
  function computeRoutes(M, blocked, g) {
    const dist = new Map(), next = new Map(), heap = new Heap();
    for (const ex of M.exits) { dist.set(ex.id, 0); heap.push(0, ex.id); }
    while (heap.size) {
      const [d, id] = heap.pop(); if (d > dist.get(id) + 1e-9) continue;
      for (const [nb, len] of M.adj.get(id)) {
        if (blocked.has(nb)) continue;
        const c = M.byId.get(nb); const nd = d + len * costFactor(M, c, g);
        if (nd < (dist.has(nb) ? dist.get(nb) : Infinity)) { dist.set(nb, nd); heap.push(nd, nb); }
      }
    }
    for (const [id] of dist) {
      const c = M.byId.get(id); if (c.type === 'exit') continue;
      let best = null, bd = Infinity;
      for (const [nb, len] of M.adj.get(id)) {
        if (blocked.has(nb)) continue; const d = dist.get(nb); if (d == null) continue;
        const tot = len * costFactor(M, M.byId.get(nb), g) + d; if (tot < bd) { bd = tot; best = nb; }
      }
      next.set(id, best);
    }
    return { dist, next };
  }
  function entryRoutes(M, routes) {
    const out = {};
    for (const en of M.entries) {
      const arr = [en.id]; let cur = en.id; let guard = 0;
      while (guard++ < 400) { const n = routes.next.get(cur); if (!n) break; arr.push(n); cur = n; if (M.byId.get(cur).type === 'exit') break; }
      out[en.entryId] = arr;
    }
    return out;
  }
  function blockedSet(g) {
    const s = new Set();
    for (const n of g.M.nodes) if (n.iso) s.add(n.id);
    for (const [id, until] of g.terrain.blockedUntil) if (until > g.t) s.add(id);
    return s;
  }

  // ---------- 游戏创建 ----------
  function createGame(mapId, opts) {
    opts = opts || {};
    const def = G.MAPS[mapId]; if (!def) throw new Error('unknown map ' + mapId);
    const M = buildMap(def);
    const g = {
      M, mapId, def, t: 0, tick: 0, speed: 1, paused: false, phase: 'prep', interT: opts.prepTime != null ? opts.prepTime : 14,
      cpu: opts.cpu != null ? opts.cpu : 300, intel: opts.intel != null ? opts.intel : 4, core: 100, coreMax: 100,
      waveIdx: -1, wave: null, enemies: [], towers: [], projectiles: [], nextId: 1,
      terrain: { blockedUntil: new Map(), blockedKind: new Map(), oldUntil: new Map(), warnings: [] },
      itemCd: { isolator: 0, downgrade: 0, restore: 0 },
      events: [], log: [], rng: rng(opts.seed != null ? opts.seed : 12345), holdT: 0, gameTime: 0,
      stats: { kills: 0, leaks: 0, built: 0, lost: 0, cpuSpent: 0, intelEarned: 0, dmg: 0, isolated: 0, waves: 0, bossKills: 0, killByType: {}, time: 0 },
      finished: false
    };
    for (const n of M.nodes) { n.iso = null; n.reopenAt = 0; }
    g.routes = computeRoutes(M, new Set(), g); g.routes.byEntry = entryRoutes(M, g.routes);
    g.routesChanged = new Set();
    return g;
  }

  function ev(g, type, data) { g.events.push(Object.assign({ type, t: g.t }, data || {})); }
  function say(g, text, kind) { g.log.push({ t: g.t, text, kind: kind || 'info' }); if (g.log.length > 60) g.log.shift(); ev(g, 'log', { text, kind: kind || 'info' }); }
  function cellOf(g, id) { return g.M.byId.get(id); }

  // ---------- 路线更新 ----------
  function recompute(g, reason) {
    const before = g.routes.byEntry;
    g.routes = computeRoutes(g.M, blockedSet(g), g); g.routes.byEntry = entryRoutes(g.M, g.routes);
    const changed = new Set();
    for (const k in g.routes.byEntry) if (!before[k] || before[k].join(',') !== g.routes.byEntry[k].join(',')) changed.add(k);
    g.routesChanged = changed;
    // 场上敌人重新寻路
    for (const e of g.enemies) {
      if (e.dead || e.fly) continue;
      if (e.mode === 'blocked' || e.mode === 'siegeAttack') continue;
      if (e.mode === 'lured' || e.mode === 'siege') { rebuildCustomPath(g, e); continue; }
      const toOk = e.to && isWalkable(g, e.to);
      if (!toOk) {
        const cellOk = isWalkable(g, e.cell);
        if (!e.to || e.prog < 0.02) { e.prog = 0; e.to = cellOk ? (g.routes.next.get(e.cell) || null) : pickEscape(g, e.cell); }
        else if (cellOk) { const oc = e.cell; e.cell = e.to; e.to = oc; e.prog = 1 - e.prog; }
        else { e.to = pickEscape(g, e.cell); e.prog = Math.min(e.prog, 0.5); if (!e.to) e.prog = 0; }
      }
    }
    if (changed.size) ev(g, 'routeChange', { entries: Array.from(changed), reason: reason || '' });
    return changed;
  }
  function pickEscape(g, cellId) {
    let best = null, bd = Infinity;
    for (const [nb] of g.M.adj.get(cellId)) { if (!isWalkable(g, nb)) continue; const d = g.routes.dist.get(nb); if (d != null && d < bd) { bd = d; best = nb; } }
    return best;
  }
  function enemyHasEscape(g, e, blocked) {
    const walk = id => { const c = g.M.byId.get(id); return c && g.M.walkable[c.type] && !blocked.has(id); };
    if (walk(e.cell)) return true;
    for (const [nb] of g.M.adj.get(e.cell)) if (walk(nb)) return true;
    if (e.to && walk(e.to)) return true;
    return false;
  }
  function isWalkable(g, id) {
    const c = g.M.byId.get(id); if (!c || !g.M.walkable[c.type]) return false;
    if (c.type === 'node' && c.iso) return false;
    const u = g.terrain.blockedUntil.get(id); if (u != null && u > g.t) return false;
    return true;
  }
  function cellIsOld(g, id) { const c = g.M.byId.get(id); if (c.type === 'old') return true; const u = g.terrain.oldUntil.get(id); return u != null && u > g.t; }
  function bfsPath(g, fromId, toId, allowBlockedTarget) {
    const prev = new Map(); const q = [fromId]; prev.set(fromId, null);
    while (q.length) {
      const cur = q.shift(); if (cur === toId) break;
      const c = g.M.byId.get(cur);
      for (const [nb] of g.M.adj.get(cur)) {
        if (prev.has(nb)) continue;
        if (!isWalkable(g, nb) && !(allowBlockedTarget && nb === toId)) continue;
        prev.set(nb, cur); q.push(nb);
      }
    }
    if (!prev.has(toId)) return null;
    const path = []; let cur = toId; while (cur !== null && cur !== fromId) { path.unshift(cur); cur = prev.get(cur); }
    return path;
  }
  function rebuildCustomPath(g, e) {
    const start = (e.prog > 0.02 && e.to && isWalkable(g, e.to)) ? e.to : e.cell;
    if (e.mode === 'lured') { const hp = g.towers.find(t => t.id === e.lureTarget); if (!hp) { e.mode = 'walk'; e.path = null; return; } const p = bfsPath(g, start, hp.cell, true); if (!p) { e.mode = 'walk'; e.path = null; return; } e.path = p; }
    else if (e.mode === 'siege') { const node = g.M.byId.get(e.siegeNode); if (!node || !node.iso) { e.mode = 'walk'; e.path = null; return; } const tgt = bestAdjacentCell(g, start, node); if (!tgt) { e.mode = 'walk'; e.path = null; return; } e.path = bfsPath(g, start, tgt, false) || []; e.siegeStand = tgt; }
  }
  function bestAdjacentCell(g, fromId, node) {
    let best = null, bl = Infinity;
    for (const [nb] of g.M.adj.get(node.id)) { if (!isWalkable(g, nb)) continue; const p = bfsPath(g, fromId, nb, false); if (p && p.length < bl) { bl = p.length; best = nb; } }
    return best;
  }

  // ---------- 连通性检查 ----------
  function checkIsolation(g, nodeId) {
    const blocked = blockedSet(g); blocked.add(nodeId);
    const r = computeRoutes(g.M, blocked, g);
    for (const en of g.M.entries) if (!r.dist.has(en.id)) return { ok: false, reason: '隔离此处会让入口「' + en.name + '」无路可走', cell: en.id };
    for (const e of g.enemies) {
      if (e.dead || e.fly || e.mode === 'blocked' || e.mode === 'siegeAttack') continue;
      if (!enemyHasEscape(g, e, blocked) || (!r.dist.has(e.cell) && !(e.to && r.dist.has(e.to)) && !g.M.adj.get(e.cell).some(([nb]) => r.dist.has(nb)))) return { ok: false, reason: (G.ENEMIES[e.type].name) + ' 将被封死在链路上', cell: e.cell, enemy: e.id };
    }
    return { ok: true };
  }
  function canBlockCells(g, cells) {
    const blocked = blockedSet(g); for (const c of cells) blocked.add(c);
    const r = computeRoutes(g.M, blocked, g);
    for (const en of g.M.entries) if (!r.dist.has(en.id)) return false;
    for (const e of g.enemies) { if (e.dead || e.fly || e.mode === 'blocked' || e.mode === 'siegeAttack') continue; if (!enemyHasEscape(g, e, blocked)) return false; if (!r.dist.has(e.cell) && !(e.to && r.dist.has(e.to)) && !g.M.adj.get(e.cell).some(([nb]) => r.dist.has(nb))) return false; }
    return true;
  }

  // ---------- 波次 ----------
  function startWave(g, idx) {
    const def = g.def.waves[idx]; if (!def) return false;
    const queue = [];
    for (const gr of def.groups) for (let i = 0; i < gr[2]; i++) queue.push({ t: gr[4] + i * gr[3], entry: gr[0], type: gr[1] });
    queue.sort((a, b) => a.t - b.t);
    g.wave = { idx, def, t: 0, queue, total: queue.length, spawned: 0 }; g.waveIdx = idx; g.phase = 'wave';
    ev(g, 'waveStart', { idx, label: def.label, flood: !!def.flood });
    say(g, '第 ' + (idx + 1) + ' 波「' + def.label + '」开始' + (def.flood ? ' —— 三个入口同时出兵' : ''), def.flood ? 'warn' : 'wave');
    return true;
  }
  function spawnEnemy(g, entryId, type, opts) {
    opts = opts || {};
    const def = G.ENEMIES[type]; const en = g.M.entries.find(c => c.entryId === entryId); if (!en) return null;
    const hpMul = opts.hpMul != null ? opts.hpMul : (def.boss ? 1 + 0.06 * Math.max(0, g.waveIdx) : 1 + 0.11 * Math.max(0, (g.waveIdx)));
    const e = {
      id: g.nextId++, type, def, hp: def.hp * hpMul, maxHp: def.hp * hpMul, shield: 0, maxShield: 0,
      cell: opts.cell || en.id, to: null, prog: 0, mode: 'walk', blockedBy: null, path: null, lureTarget: null, siegeNode: null,
      revealed: !def.disguise && !(def.phases), cap: def.cap || 1, fly: !!def.fly, side: (g.rng() - 0.5) * 1.6, lane: g.rng() * Math.PI * 2,
      attackCd: 0.6 + g.rng() * 0.6, slowUntil: 0, slowAmt: 0, trapUntil: 0, dead: false, isClone: !!opts.isClone, replDone: false,
      x: en.wx, y: en.wy, z: en.wz, dirx: 0, dirz: 1, anim: g.rng() * 10, hitAt: -9, spawnAt: g.t, exitId: null,
      bossPhase: def.phases ? 'lurk' : null, phaseDone: {}, abilCd: 5, dmgMul: 1
    };
    if (def.phases) e.revealed = false;
    if (e.fly) {
      const ex = nearestExit(g, en); e.exitId = ex.exitId;
      const mx = (en.wx + ex.wx) / 2, mz = (en.wz + ex.wz) / 2;
      e.flyPath = [{ x: en.wx, y: FLY_Y + 0.5, z: en.wz }, { x: mx + (g.rng() - 0.5) * 6, y: FLY_Y + 2.2, z: mz + (g.rng() - 0.5) * 6 }, { x: ex.wx, y: FLY_Y + 0.5, z: ex.wz }];
      e.flyLen = bezLen(e.flyPath); e.flyProg = 0; e.cell = en.id; e.to = ex.id;
    } else {
      e.to = g.routes.next.get(e.cell) || null;
    }
    g.enemies.push(e);
    ev(g, 'spawn', { enemy: e, type, entry: entryId });
    return e;
  }
  function nearestExit(g, en) { let best = null, bd = Infinity; for (const ex of g.M.exits) { const d = Math.hypot(ex.wx - en.wx, ex.wz - en.wz); if (d < bd) { bd = d; best = ex; } } return best; }
  function bezLen(p) { let L = 0, prev = p[0]; for (let i = 1; i <= 16; i++) { const t = i / 16; const q = bez(p, t); L += Math.hypot(q.x - prev.x, q.y - prev.y, q.z - prev.z); prev = q; } return L; }
  function bez(p, t) { const a = 1 - t; return { x: a * a * p[0].x + 2 * a * t * p[1].x + t * t * p[2].x, y: a * a * p[0].y + 2 * a * t * p[1].y + t * t * p[2].y, z: a * a * p[0].z + 2 * a * t * p[1].z + t * t * p[2].z }; }

  // ---------- 塔 ----------
  function towerDef(t) { const d = G.TOWERS[t.type]; if (t.level >= 2) { const o = Object.assign({}, d, d.up); if (t.branch && d.branches) Object.assign(o, d.branches[t.branch]); return o; } return d; }
  function towerAt(g, cellId) { return g.towers.find(t => t.cell === cellId && !t.dead); }
  function nodeTower(g, node) { return g.towers.find(t => t.onNode === node.id && !t.dead); }
  function canDeploy(g, type, cellId) {
    const c = cellOf(g, cellId); if (!c) return { ok: false, reason: '这里不能部署' };
    const d = G.TOWERS[type];
    if (c.type === 'plat') { if (!d.onPlat) return { ok: false, reason: d.name + '不能部署在设备平台上' }; if (towerAt(g, cellId)) return { ok: false, reason: '该平台已有设备' }; if (g.cpu < d.cost) return { ok: false, reason: '算力不足' }; return { ok: true }; }
    if (c.type === 'node') {
      if (!d.onNode) return { ok: false, reason: d.name + '只能部署在' + (d.onPath ? '链路' : '设备平台') };
      if (c.iso) return { ok: false, reason: '节点已被隔离' };
      if (g.t < c.reopenAt) return { ok: false, reason: '节点刚恢复直通，' + Math.ceil(c.reopenAt - g.t) + ' 秒后才能再次隔离' };
      if (g.cpu < d.cost) return { ok: false, reason: '算力不足' };
      if (g.intel < (d.nodeIntel || 0)) return { ok: false, reason: '情报不足（隔离节点需要 ' + d.nodeIntel + ' 情报）' };
      const chk = checkIsolation(g, c.id); if (!chk.ok) return chk;
      return { ok: true, isolates: true };
    }
    if (c.type === 'path' || c.type === 'old') {
      if (!d.onPath) return { ok: false, reason: d.name + '不能部署在链路上' };
      if (towerAt(g, cellId)) return { ok: false, reason: '该链路已有设备' };
      if (g.cpu < d.cost) return { ok: false, reason: '算力不足' };
      return { ok: true };
    }
    return { ok: false, reason: '这里不能部署' };
  }
  function deploy(g, type, cellId, facing) {
    const chk = canDeploy(g, type, cellId); if (!chk.ok) { ev(g, 'reject', { reason: chk.reason, cell: chk.cell }); return chk; }
    const c = cellOf(g, cellId); const d = G.TOWERS[type];
    const t = { id: g.nextId++, type, level: 1, branch: null, cell: cellId, onNode: c.type === 'node' ? c.nodeId : null, hp: d.hp, maxHp: d.hp,
      facing: facing != null ? facing : 0, x: c.wx, y: c.wy, z: c.wz, blockers: new Set(), cd: 0, skillCd: 0, encUntil: 0, shield: 0, hitAt: -9, dead: false,
      invested: d.cost, buffUntil: 0, healFx: 0, aim: 0, anim: g.rng() * 6, lastTarget: null, stormUntil: 0 };
    g.towers.push(t); g.cpu -= d.cost; g.stats.cpuSpent += d.cost; g.stats.built++;
    if (c.type === 'node') { g.intel -= (d.nodeIntel || 0); isolateNode(g, c, t, 'tower'); }
    ev(g, 'deploy', { tower: t, type, cell: cellId });
    say(g, d.name + ' 已部署' + (c.type === 'node' ? '，节点「' + c.name + '」被隔离' : ''), 'build');
    return { ok: true, tower: t };
  }
  function isolateNode(g, node, tower, kind) {
    node.iso = { kind, towerId: tower ? tower.id : null, since: g.t }; g.stats.isolated++;
    recompute(g, 'isolate'); ev(g, 'isolate', { node: node.id, kind });
    say(g, '节点「' + node.name + '」已隔离，路线重新收敛', 'iso');
  }
  function reopenNode(g, node, reason) {
    if (!node.iso) return; node.iso = null; node.reopenAt = g.t + REOPEN_CD;
    recompute(g, 'reopen'); ev(g, 'reopen', { node: node.id, reason: reason || '' });
    say(g, '节点「' + node.name + '」恢复直通（' + (reason || '隔离解除') + '），' + REOPEN_CD + ' 秒内不能再次隔离', 'reopen');
  }
  function releaseBlockers(g, t) {
    for (const id of t.blockers) { const e = g.enemies.find(x => x.id === id); if (!e || e.dead) continue; e.blockedBy = null; e.mode = 'walk'; e.path = null; e.lureTarget = null; e.siegeNode = null; if (!e.fly && !isWalkable(g, e.to)) { if (isWalkable(g, e.cell)) e.to = g.routes.next.get(e.cell); else { e.cell = e.to; e.to = g.routes.next.get(e.cell); e.prog = 0; } } }
    t.blockers.clear();
  }
  function destroyTower(g, t, why) {
    if (t.dead) return; t.dead = true; releaseBlockers(g, t);
    g.towers = g.towers.filter(x => x !== t);
    if (t.onNode) { const node = g.M.nodeByNum[t.onNode]; if (node && node.iso && node.iso.towerId === t.id) reopenNode(g, node, why === 'sell' ? '设备撤下' : '设备被摧毁'); }
    ev(g, 'towerDie', { tower: t, why });
    if (why !== 'sell') { g.stats.lost++; say(g, (G.TOWERS[t.type] || { name: '应急隔离器' }).name + ' 被' + (why === 'enemy' ? '摧毁' : '冲毁'), 'bad'); }
  }
  function sellTower(g, id) {
    const t = g.towers.find(x => x.id === id); if (!t) return { ok: false };
    const refund = Math.round(t.invested * 0.6); g.cpu += refund; destroyTower(g, t, 'sell'); ev(g, 'sell', { tower: t, refund });
    say(g, '撤下 ' + G.TOWERS[t.type].name + '，回收 ' + refund + ' 算力', 'build');
    return { ok: true, refund };
  }
  function upgradeCost(g, t, branch) {
    const d = G.TOWERS[t.type];
    if (t.level >= 2) return null;
    if (t.level === 1 && d.branches) { const b = d.branches[branch]; if (!b) return null; return { cpu: d.up.cost + b.cost, intel: b.intel || 0 }; }
    return { cpu: d.up.cost, intel: 0 };
  }
  function upgradeTower(g, id, branch) {
    const t = g.towers.find(x => x.id === id); if (!t) return { ok: false, reason: '未选中塔' };
    if (t.level >= 2) return { ok: false, reason: '已是 2 级' };
    const d = G.TOWERS[t.type];
    if (branch && !d.branches) return { ok: false, reason: '该设备没有升级分支' };
    if (d.branches && !branch) return { ok: false, reason: '请选择分支', needBranch: true, branches: Object.keys(d.branches) };
    const cost = upgradeCost(g, t, branch); if (!cost) return { ok: false, reason: '无法升级' };
    if (g.cpu < cost.cpu) return { ok: false, reason: '算力不足' };
    if (g.intel < cost.intel) return { ok: false, reason: '情报不足（选择分支需要 ' + cost.intel + ' 情报）' };
    g.cpu -= cost.cpu; g.intel -= cost.intel; g.stats.cpuSpent += cost.cpu;
    t.level = 2; if (branch) t.branch = branch; t.invested += cost.cpu;
    const nd = towerDef(t); const ratio = t.hp / t.maxHp; t.maxHp = nd.hp; t.hp = Math.max(t.hp, nd.hp * Math.max(ratio, 0.6));
    ev(g, 'upgrade', { tower: t, branch });
    say(g, d.name + ' 升级到 2 级' + (branch ? '：' + d.branches[branch].name : ''), 'build');
    return { ok: true };
  }
  function castSkill(g, id) {
    const t = g.towers.find(x => x.id === id); if (!t) return { ok: false };
    const d = towerDef(t); if (!d.skill) return { ok: false, reason: '该设备没有主动技能' };
    if (t.encUntil > g.t) return { ok: false, reason: '设备被加密，无法释放技能' };
    if (t.skillCd > g.t) return { ok: false, reason: '技能冷却中：' + Math.ceil(t.skillCd - g.t) + ' 秒' };
    t.skillCd = g.t + d.skill.cd; t.skillUntil = g.t + (d.skill.dur || 0);
    const skill = d.skill.name;
    if (t.type === 'honeypot') { let n = 0; for (const eid of t.blockers) { const e = g.enemies.find(x => x.id === eid); if (e && !e.dead) { e.trapUntil = g.t + d.skill.dur; n++; } } ev(g, 'skill', { tower: t, skill, n }); say(g, '蜜罐释放「' + skill + '」，困住 ' + n + ' 个敌人', 'skill'); }
    else if (t.type === 'repair') { const r = d.range * CELL; let n = 0; for (const o of g.towers) { if (o === t || o.dead) continue; if (dist3(t, o) <= r) { o.shield = Math.max(o.shield, d.skill.shield); o.encUntil = 0; n++; ev(g, 'shield', { tower: o, amount: d.skill.shield }); } } ev(g, 'skill', { tower: t, skill, n }); say(g, '修复进程释放「' + skill + '」，' + n + ' 座友塔获得护盾并解除加密', 'skill'); }
    else if (t.type === 'sandbox') { const r = d.range * CELL; let n = 0; for (const e of g.enemies) { if (e.dead || e.fly) continue; if (distE(e, t) <= r) { if (!e.revealed) reveal(g, e); hurtEnemy(g, e, 130, t, { aoe: true }); n++; } } ev(g, 'skill', { tower: t, skill, n }); say(g, '沙箱释放「' + skill + '」，扫描命中 ' + n + ' 个目标', 'skill'); }
    else if (t.type === 'interceptor') { ev(g, 'skill', { tower: t, skill }); say(g, '拦截器释放「' + skill + '」', 'skill'); }
    else if (t.type === 'firewall') { ev(g, 'skill', { tower: t, skill }); say(g, '防火墙释放「' + skill + '」', 'skill'); }
    return { ok: true };
  }
  function dist3(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
  function distE(e, t) { return Math.hypot(e.x - t.x, e.y - t.y, e.z - t.z); }

  // ---------- 伤害 ----------
  function hurtEnemy(g, e, dmg, src, opts) {
    if (e.dead || dmg <= 0) return;
    opts = opts || {};
    if (e.blockedBy != null) { const b = g.towers.find(t => t.id === e.blockedBy); if (b && b.type === 'honeypot' && b.branch === 'counter') dmg *= 1 + G.TOWERS.honeypot.branches.counter.amp; }
    if (e.def.phases) { const ph = e.bossPhase; const armor = ph === 'escalate' ? 0.35 : ph === 'destroy' ? 0.45 : 0; dmg *= (1 - armor); }
    let d = dmg;
    if (e.shield > 0) { const a = Math.min(e.shield, d); e.shield -= a; d -= a; if (e.shield <= 0) ev(g, 'shieldBreak', { enemy: e }); }
    e.hp -= d; e.hitAt = g.t; g.stats.dmg += Math.min(dmg, dmg);
    ev(g, 'hit', { enemy: e, amount: dmg, x: e.x, y: e.y, z: e.z, crit: !!opts.crit });
    if (e.hp <= 0) killEnemy(g, e, src, opts);
  }
  function reveal(g, e) { if (e.revealed) return; e.revealed = true; ev(g, 'reveal', { enemy: e, x: e.x, y: e.y, z: e.z }); }
  function killEnemy(g, e, src, opts) {
    if (e.dead) return; e.dead = true;
    if (e.def.disguise && !e.revealed && opts && opts.aoe) {
      const p = e.def.payload; let n = 0;
      for (const t of g.towers) { if (t.dead) continue; if (dist3(e, t) <= p.r * CELL) { hurtTower(g, t, p.dmg, 'payload'); n++; } }
      ev(g, 'payload', { x: e.x, y: e.y, z: e.z, r: p.r, n }); say(g, '未显形的木马被波及消灭，释放载荷伤害了 ' + n + ' 座塔', 'bad');
    }
    if (e.blockedBy != null) { const b = g.towers.find(t => t.id === e.blockedBy); if (b) b.blockers.delete(e.id); }
    g.cpu += e.def.cpu; g.stats.kills++; g.stats.killByType[e.type] = (g.stats.killByType[e.type] || 0) + 1;
    if (e.def.key) { g.intel++; g.stats.intelEarned++; ev(g, 'intel', { amount: 1, x: e.x, y: e.y, z: e.z, reason: '重点威胁' }); }
    if (e.def.boss) { g.stats.bossKills++; g.intel += 5; g.stats.intelEarned += 5; ev(g, 'bossDie', { enemy: e }); say(g, 'Boss「' + e.def.name + '」已被清除', 'good'); }
    ev(g, 'enemyDie', { enemy: e, x: e.x, y: e.y, z: e.z, type: e.type });
  }
  function hurtTower(g, t, dmg, why) {
    if (!t || t.dead) return;
    let d = dmg;
    if (t.shield > 0) { const a = Math.min(t.shield, d); t.shield -= a; d -= a; if (t.shield <= 0) ev(g, 'shieldBreak', { tower: t }); }
    t.hp -= d; t.hitAt = g.t; ev(g, 'towerHit', { tower: t, amount: dmg, why });
    if (t.hp <= 0) destroyTower(g, t, why === 'sell' ? 'sell' : (why === 'payload' ? 'payload' : 'enemy'));
  }
  function encryptTower(g, t, dur) { if (!t || t.dead || t.type === 'honeypot') return; t.encUntil = Math.max(t.encUntil, g.t + dur); ev(g, 'encrypt', { tower: t, dur }); }

  // ---------- 敌人更新 ----------
  function speedOf(g, e) {
    let s = e.def.speed;
    if (e.fly) return s * CELL;
    let slow = 1;
    if (cellIsOld(g, e.to || e.cell)) slow = Math.min(slow, OLD_SLOW);
    if (e.slowUntil > g.t) slow = Math.min(slow, 1 - e.slowAmt);
    return s * CELL * slow;
  }
  function posOnEdge(g, e) {
    const a = cellOf(g, e.cell), b = cellOf(g, e.to);
    if (!b) return { x: a.wx, y: a.wy, z: a.wz, dx: e.dirx, dz: e.dirz };
    const t = Math.min(1, Math.max(0, e.prog));
    const dx = b.wx - a.wx, dz = b.wz - a.wz; const L = Math.hypot(dx, dz) || 1;
    const nx = dx / L, nz = dz / L; const px = -nz, pz = nx;
    const off = e.side * (e.mode === 'blocked' ? 1 : 0.55);
    return { x: a.wx + dx * t + px * off, y: a.wy + (b.wy - a.wy) * t, z: a.wz + dz * t + pz * off, dx: nx, dz: nz };
  }
  function edgeLen(g, e) { const a = cellOf(g, e.cell), b = cellOf(g, e.to); return Math.hypot(b.wx - a.wx, b.wy - a.wy, b.wz - a.wz); }
  function arrive(g, e) {
    const c = cellOf(g, e.to); e.cell = e.to; e.prog = 0; e.to = null;
    if (c.type === 'exit') { leak(g, e, c); return false; }
    if (c.type === 'old') reveal(g, e);
    if (cellIsOld(g, c.id)) reveal(g, e);
    if (c.type === 'node') {
      if (c.iso) { // 不应发生（连通性保证），兜底：退回
        e.to = g.routes.next.get(e.cell) || null; return !!e.to;
      }
      // 蠕虫复制
      if (e.def.repl && !e.isClone && !e.replDone) {
        e.replDone = true; const cl = spawnEnemy(g, c.entryId || g.M.entries[0].entryId, e.type, { cell: c.id, isClone: true });
        if (cl) { cl.to = e.to || g.routes.next.get(c.id); cl.prog = 0; cl.side = -e.side; ev(g, 'replicate', { enemy: e, clone: cl, x: c.wx, y: c.wy, z: c.wz }); }
      }
      // 节点上的防火墙：隔离时不可通行；若为直通节点则无事
    }
    // 相邻节点的防火墙拦截
    for (const [nb] of g.M.adj.get(c.id)) { const nc = cellOf(g, nb); if (nc.type === 'node' && nc.iso && nc.iso.kind === 'tower') { const t = g.towers.find(x => x.id === nc.iso.towerId); if (t && t.type === 'firewall' && t.blockers.size < towerDef(t).cap) { blockBy(g, e, t, 0); return true; } } }
    // 选择下一格
    if (e.mode === 'lured' || e.mode === 'siege') { if (e.path && e.path.length) e.to = e.path.shift(); if (!e.to) { e.mode = 'walk'; e.path = null; } }
    if (!e.to) e.to = g.routes.next.get(e.cell) || null;
    if (e.to && cellIsOld(g, e.to)) { /* 旧链路：显形在到达时处理 */ }
    return true;
  }
  function blockBy(g, e, t, prog) {
    if (e.blockedBy !== t.id) e.blockedSince = g.t;
    e.blockedBy = t.id; e.mode = 'blocked'; e.prog = prog; e.trapUntil = 0; t.blockers.add(e.id);
    if (e.def.disguise) reveal(g, e);
    if (e.def.phases && !e.revealed) reveal(g, e);
    ev(g, 'block', { enemy: e, tower: t });
  }
  function leak(g, e, c) {
    e.dead = true; g.core = Math.max(0, g.core - e.def.leak); g.stats.leaks++;
    if (e.blockedBy != null) { const b = g.towers.find(t => t.id === e.blockedBy); if (b) b.blockers.delete(e.id); }
    ev(g, 'leak', { enemy: e, exit: c.exitId, amount: e.def.leak, x: c.wx, y: c.wy, z: c.wz });
    say(g, G.ENEMIES[e.type].name + ' 到达「' + c.name + '」，中枢完整度 -' + e.def.leak, 'bad');
    if (g.core <= 0 && g.phase !== 'lose') { g.phase = 'lose'; g.finished = true; ev(g, 'lose', {}); say(g, '中枢完整度归零，汐域失守', 'bad'); }
  }
  function enemyAttack(g, e, t, dmg, cd, kind) {
    if (!t || t.dead) return;
    if (e.trapUntil > g.t) return;
    e.attackCd = cd; e.lungeAt = g.t;
    if (kind === 'ranged') { ev(g, 'enemyShot', { enemy: e, tower: t, kind }); encryptTower(g, t, e.def.ranged.enc); }
    else ev(g, 'enemyAttack', { enemy: e, tower: t, kind: kind || 'melee' });
    hurtTower(g, t, dmg, 'enemy');
  }
  function updateEnemy(g, e, dt) {
    if (e.dead) return;
    e.anim += dt;
    if (e.fly) {
      e.flyProg += speedOf(g, e) * dt / e.flyLen; const p = bez(e.flyPath, Math.min(1, e.flyProg)); e.x = p.x; e.y = p.y; e.z = p.z;
      const q = bez(e.flyPath, Math.min(1, e.flyProg + 0.01)); e.dirx = q.x - p.x; e.dirz = q.z - p.z;
      if (e.flyProg >= 1) { leak(g, e, cellOf(g, e.to)); }
      return;
    }
    // 被阻挡
    if (e.mode === 'blocked') {
      const t = g.towers.find(x => x.id === e.blockedBy);
      if (!t || t.dead) { e.blockedBy = null; e.mode = 'walk'; e.to = g.routes.next.get(e.cell) || null; e.prog = Math.min(e.prog, 0.5); }
      else {
        if (e.def.melee || e.def.ranged) { e.attackCd -= dt; if (e.attackCd <= 0) { const rage = 1 + Math.max(0, (g.t - (e.blockedSince || g.t) - 15) / 5) * 0.8; enemyAttack(g, e, t, (e.def.melee ? e.def.melee.dmg : e.def.ranged.dmg) * rage, e.def.melee ? e.def.melee.cd : e.def.ranged.cd, e.def.melee ? 'melee' : 'ranged'); } }
        else if (e.def.phases && e.bossPhase !== 'lurk') { e.attackCd -= dt; if (e.attackCd <= 0) enemyAttack(g, e, t, e.def.melee.dmg, e.def.melee.cd, 'melee'); }
      }
      updatePos(g, e); return;
    }
    // 被诱来的终点
    if (e.mode === 'lured') {
      const hp = g.towers.find(x => x.id === e.lureTarget);
      if (!hp) { e.mode = 'walk'; e.lureTarget = null; e.path = null; }
    }
    if (e.mode === 'siegeAttack') {
      const node = g.M.byId.get(e.siegeNode);
      const t = node && node.iso ? g.towers.find(x => x.id === node.iso.towerId) : null;
      if (!t) { e.mode = 'walk'; e.siegeNode = null; e.path = null; e.to = g.routes.next.get(e.cell) || null; }
      else { e.attackCd -= dt; if (e.attackCd <= 0) enemyAttack(g, e, t, e.def.siege.dmg, e.def.siege.cd, 'siege'); }
      updatePos(g, e); return;
    }
    if (e.trapUntil > g.t) { updatePos(g, e); return; }
    // 前进
    if (!e.to) { e.to = g.routes.next.get(e.cell) || null; if (!e.to) { updatePos(g, e); return; } }
    const L = edgeLen(g, e);
    e.prog += speedOf(g, e) * dt / L;
    // 路上经过节点防火墙相邻格：到达时处理
    if (e.prog >= 1) { const ok = arrive(g, e); if (!ok) return; }
    else {
      // 链路上的防火墙/蜜罐拦截
      const tc = cellOf(g, e.to);
      if (tc) {
        const tw = towerAt(g, e.to);
        if (tw && e.prog >= 0.5 && e.mode !== 'siege') {
          const cap = towerDef(tw).cap || 0;
          if (tw.type === 'firewall' && tw.blockers.size < cap + (tw.skillUntil > g.t ? 2 : 0)) { blockBy(g, e, tw, 0.5); }
          else if (tw.type === 'honeypot' && e.mode === 'lured' && tw.blockers.size < cap) { blockBy(g, e, tw, 0.5); }
        }
        if (e.mode === 'lured' && tw && tw.id === e.lureTarget && e.prog >= 0.45) {
          const cap = towerDef(tw).cap || 0; if (tw.blockers.size < cap) blockBy(g, e, tw, 0.45); else { e.mode = 'walk'; e.lureTarget = null; e.path = null; }
        }
      }
    }
    if (e.mode === 'siege' && e.path && e.path.length === 0 && e.to && e.cell === e.siegeStand) { e.mode = 'siegeAttack'; }
    if (e.mode === 'siege' && e.to == null) e.mode = 'walk';
    updatePos(g, e);
    // 远程攻塔（勒索者）：边走边打
    if (e.def.ranged && e.trapUntil <= g.t) {
      e.attackCd -= dt;
      if (e.attackCd <= 0) {
        const r = e.def.ranged.r * CELL; let best = null, bs = -1;
        for (const t of g.towers) { if (t.dead) continue; const d = distE(e, t); if (d <= r) { const score = (t.type === 'honeypot' ? 100 : 0) - d; if (score > bs) { bs = score; best = t; } } }
        if (best) enemyAttack(g, e, best, e.def.ranged.dmg, e.def.ranged.cd, 'ranged'); else e.attackCd = 0.3;
      }
    }
    // 加壳器护盾
    if (e.def.shield) {
      e.abilCd -= dt;
      if (e.abilCd <= 0) { e.abilCd = e.def.shield.cd; let n = 0; for (const o of g.enemies) { if (o.dead || o === e) continue; if (Math.hypot(o.x - e.x, o.z - e.z) <= e.def.shield.r * CELL) { if (o.shield < e.def.shield.amt) { o.shield = e.def.shield.amt; o.maxShield = e.def.shield.amt; n++; ev(g, 'shield', { enemy: o, amount: e.def.shield.amt }); } } } if (n) ev(g, 'packerPulse', { enemy: e, n }); }
    }
    // 洪泛团寻找被隔离节点
    if (e.def.siege && e.mode === 'walk') {
      e.siegeScan = (e.siegeScan || 0) - dt;
      if (e.siegeScan <= 0) {
        e.siegeScan = 0.5; let best = null, bd = Infinity;
        for (const n of g.M.nodes) { if (!n.iso) continue; const t = g.towers.find(x => x.id === n.iso.towerId); if (!t) continue; const d = Math.hypot(n.wx - e.x, n.wz - e.z); if (d <= e.def.siege.r * CELL && d < bd) { bd = d; best = n; } }
        if (best) { e.mode = 'siege'; e.siegeNode = best.id; rebuildCustomPath(g, e); if (e.mode === 'siege') ev(g, 'siege', { enemy: e, node: best.id }); }
      }
    }
    if (e.def.phases) updateBossZhe(g, e, dt);
    if (e.type === 'boss_wan') updateBossWan(g, e, dt);
    if (e.type === 'boss_shen') updateBossShen(g, e, dt);
  }
  function updatePos(g, e) { const p = posOnEdge(g, e); e.x = p.x; e.y = p.y; e.z = p.z; if (p.dx || p.dz) { e.dirx = p.dx; e.dirz = p.dz; } }
  // 蜜罐诱敌
  function updateLures(g, dt) {
    for (const hp of g.towers) {
      if (hp.dead || hp.type !== 'honeypot') continue;
      const d = towerDef(hp); const cap = d.cap; if (hp.blockers.size >= cap) continue;
      if (hp.lureScan == null) hp.lureScan = g.rng() * 0.3;
      hp.lureScan -= dt; if (hp.lureScan > 0) continue; hp.lureScan = 0.3;
      const r = d.lure * CELL;
      for (const e of g.enemies) {
        if (e.dead || e.fly || e.mode !== 'walk') continue;
        if (!(e.def.melee || e.def.ranged || e.def.siege)) continue;
        const dist = Math.hypot(e.x - hp.x, e.z - hp.z); if (dist > r) continue;
        if (hp.blockers.size >= cap) break;
        if (e.def.ranged && dist <= e.def.ranged.r * CELL) { /* 射程内直接攻击，在攻击逻辑中优先蜜罐 */ continue; }
        const start = (e.prog > 0.02 && e.to && isWalkable(g, e.to)) ? e.to : e.cell;
        const p = bfsPath(g, start, hp.cell, true); if (!p) continue;
        e.path = p; e.mode = 'lured'; e.lureTarget = hp.id; ev(g, 'lure', { enemy: e, tower: hp });
      }
    }
  }

  // ---------- Boss ----------
  function routeAhead(g, e, n) {
    const out = []; let cur = (e.to && isWalkable(g, e.to)) ? e.to : e.cell; let guard = 0;
    while (out.length < n && guard++ < 40) { const nx = g.routes.next.get(cur); if (!nx) break; out.push(nx); cur = nx; }
    return out;
  }
  function updateBossWan(g, e, dt) {
    if (e.hp < e.maxHp * 0.5 && !e.phaseDone.spawn) { e.phaseDone.spawn = true; let n = 0; for (let i = 0; i < e.def.spawnN; i++) { const c = spawnEnemy(g, g.M.entries[0].entryId, 'worm', { cell: e.cell, isClone: true }); if (c) { c.to = e.to; c.prog = Math.min(1, e.prog + 0.05); c.side = (g.rng() - 0.5) * 2.4; n++; } } ev(g, 'bossPhase', { enemy: e, phase: 'spawn', n }); say(g, '万傀释放成群蠕虫！', 'warn'); }
    e.abilCd -= dt;
    if (e.abilCd <= 0) {
      let best = null, bd = Infinity;
      for (const nd of g.M.nodes) { if (!nd.iso) continue; const t = g.towers.find(x => x.id === nd.iso.towerId); if (!t) continue; const d = Math.hypot(nd.wx - e.x, nd.wz - e.z); if (d <= e.def.slam.r * CELL && d < bd) { bd = d; best = t; } }
      if (best) { e.abilCd = e.def.slam.cd; e.slamAt = g.t; ev(g, 'slam', { enemy: e, tower: best, x: best.x, y: best.y, z: best.z }); hurtTower(g, best, best.type === 'isolator' ? 9999 : e.def.slam.dmg, 'enemy'); say(g, '万傀发动「洪峰」冲击节点「' + cellOf(g, best.cell).name + '」', 'warn'); }
      else e.abilCd = 1.5;
    }
  }
  function updateBossShen(g, e, dt) {
    if (e.hp < e.maxHp * e.def.stormAt && !e.phaseDone.storm) {
      e.phaseDone.storm = true; let n = 0;
      for (const t of g.towers) { if (dist3(e, t) <= 5.5 * CELL) { t.shield = 0; t.stormUntil = g.t + 8; n++; ev(g, 'storm', { tower: t }); } }
      ev(g, 'bossPhase', { enemy: e, phase: 'storm', n }); say(g, '蜃楼发动「路由风暴」，' + n + ' 座塔的护盾被削弱、火力下降', 'warn');
    }
    e.abilCd -= dt;
    if (e.abilCd <= 0) {
      const ahead = routeAhead(g, e, 8).filter(id => { const c = cellOf(g, id); return c.type === 'path' || c.type === 'old'; });
      const chosen = [];
      for (const id of ahead) { if (chosen.length >= e.def.blackhole.n) break; if (!canBlockCells(g, chosen.concat([id]))) continue; chosen.push(id); }
      if (chosen.length) {
        e.abilCd = e.def.blackhole.cd; const until = g.t + e.def.blackhole.warn;
        g.terrain.warnings.push({ cells: chosen.slice(), applyAt: until, until: until + e.def.blackhole.dur, kind: 'blackhole', by: e.id });
        ev(g, 'bossWarn', { enemy: e, cells: chosen, kind: 'blackhole', applyAt: until }); say(g, '蜃楼正在制造「伪路由」黑洞，前方链路即将截断', 'warn');
      } else e.abilCd = 3;
    }
  }
  function updateBossZhe(g, e, dt) {
    const r = e.hp / e.maxHp;
    if (e.bossPhase === 'lurk' && r <= 0.7) { e.bossPhase = 'escalate'; reveal(g, e); let n = 0; for (let i = 0; i < 4; i++) { const c = spawnEnemy(g, g.M.entries[0].entryId, 'trojan', { cell: e.cell, isClone: true }); if (c) { c.to = e.to; c.prog = Math.min(1, e.prog + 0.05); c.revealed = true; c.side = (g.rng() - 0.5) * 2.4; n++; } } ev(g, 'bossPhase', { enemy: e, phase: 'escalate', n }); say(g, '蛰影完成提权：护甲强化，放出木马', 'warn'); e.abilCd = 3; }
    if (e.bossPhase === 'escalate' && r <= 0.35) { e.bossPhase = 'destroy'; ev(g, 'bossPhase', { enemy: e, phase: 'destroy' }); say(g, '蛰影进入破坏阶段，准备锁死运维环', 'warn'); e.abilCd = 1.5; }
    if (e.bossPhase === 'destroy') {
      e.abilCd -= dt;
      if (e.abilCd <= 0) {
        const ahead = routeAhead(g, e, 8).filter(id => { const c = cellOf(g, id); return c.type === 'path' || c.type === 'old'; });
        const chosen = [];
        for (const id of ahead) { if (chosen.length >= e.def.lock.n) break; if (!canBlockCells(g, chosen.concat([id]))) continue; chosen.push(id); }
        if (chosen.length) { e.abilCd = 14; const until = g.t + e.def.lock.warn; g.terrain.warnings.push({ cells: chosen.slice(), applyAt: until, until: until + e.def.lock.dur, kind: 'lock', by: e.id }); ev(g, 'bossWarn', { enemy: e, cells: chosen, kind: 'lock', applyAt: until }); say(g, '蛰影锁死前方一段运维环！路线即将重新收敛', 'warn'); }
        else e.abilCd = 4;
      }
    }
  }
  function updateTerrain(g, dt) {
    const W = g.terrain.warnings; let changed = false;
    for (let i = W.length - 1; i >= 0; i--) {
      const w = W[i];
      if (g.t >= w.applyAt && !w.applied) { w.applied = true; for (const id of w.cells) { g.terrain.blockedUntil.set(id, w.until); g.terrain.blockedKind.set(id, w.kind); } changed = true; ev(g, 'terrainApply', { cells: w.cells, kind: w.kind, until: w.until }); say(g, (w.kind === 'blackhole' ? '伪路由黑洞截断了链路' : '运维环被锁死') + '，各入口路线重新收敛', 'warn'); }
      if (g.t >= w.until) W.splice(i, 1);
    }
    for (const [id, until] of g.terrain.blockedUntil) if (until <= g.t) { g.terrain.blockedUntil.delete(id); g.terrain.blockedKind.delete(id); changed = true; ev(g, 'terrainEnd', { cell: id }); }
    for (const [id, until] of g.terrain.oldUntil) if (until <= g.t) { g.terrain.oldUntil.delete(id); changed = true; ev(g, 'downgradeEnd', { cell: id }); say(g, '协议降级结束，链路恢复正常速度', 'info'); }
    if (changed) recompute(g, 'terrain');
  }

  // ---------- 塔更新 ----------
  function targetable(g, e, t) {
    if (e.dead) return false;
    if (e.fly && t.type !== 'interceptor') return false;
    if (!e.revealed) return false;
    return true;
  }
  function inArc(t, e, arc) {
    if (t.type !== 'interceptor') return true;
    const ang = Math.atan2(-(e.z - t.z), e.x - t.x); const fa = t.facing;
    let d = ang - fa; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d) <= arc / 2 + 0.035;
  }
  function updateTowers(g, dt) {
    for (const t of g.towers) {
      if (t.dead) continue;
      const d = towerDef(t); const enc = t.encUntil > g.t; const storm = t.stormUntil > g.t;
      t.cd -= dt; t.anim = (t.anim || 0) + dt;
      if (t.shield > 0 && t.shieldRegen == null) t.shieldRegen = 0;
      let dmgMul = 1, rateMul = 1; if (t.skillUntil > g.t && t.type === 'interceptor') { rateMul = 2; dmgMul = 1.5; } if (storm) dmgMul *= 0.6;
      if (t.skillUntil > g.t && t.type === 'firewall') { t.hp = Math.min(t.maxHp, t.hp + 70 * dt); }
      if (enc) continue;
      if (t.type === 'repair') {
        const r = d.range * CELL; let best = null, br = 1;
        for (const o of g.towers) { if (o === t || o.dead) continue; const ratio = o.hp / o.maxHp; if (ratio < br && dist3(t, o) <= r) { br = ratio; best = o; } }
        if (best) { best.hp = Math.min(best.maxHp, best.hp + d.heal * dt); t.healFx = (t.healFx || 0) - dt; if (t.healFx <= 0) { t.healFx = 0.25; ev(g, 'heal', { tower: t, target: best }); } t.lastTarget = best; } else t.lastTarget = null;
        continue;
      }
      if (t.type === 'gate' || t.type === 'honeypot') {
        if (t.type === 'honeypot' && t.branch === 'counter') { for (const eid of Array.from(t.blockers)) { const e = g.enemies.find(x => x.id === eid); if (e && !e.dead) { e.hp -= d.dot * dt; e.hitAt = g.t; if (e.hp <= 0) killEnemy(g, e, t, {}); } } }
        continue;
      }
      if (t.type === 'sandbox') {
        const r = d.range * CELL;
        for (const e of g.enemies) { if (e.dead || e.fly) continue; if (!e.revealed && distE(e, t) <= r) reveal(g, e); }
        if (t.cd <= 0) {
          let hit = false;
          for (const e of g.enemies) { if (e.dead || e.fly) continue; if (distE(e, t) <= r) { hurtEnemy(g, e, d.dmg * dmgMul, t, { aoe: true }); hit = true; } }
          if (hit) { t.cd = 1 / d.rate; ev(g, 'pulse', { tower: t, r: d.range }); }
        }
        continue;
      }
      if (t.type === 'firewall') {
        if (t.cd <= 0) {
          let target = null; for (const eid of t.blockers) { const e = g.enemies.find(x => x.id === eid); if (e && !e.dead) { target = e; break; } }
          if (!target) { // Boss 等无法被阻挡的单位靠近时也还击
            let bd = 1.7 * CELL; for (const e of g.enemies) { if (e.dead || e.fly) continue; const dd = distE(e, t); if (dd < bd) { bd = dd; target = e; } }
          }
          if (target) { t.cd = 1 / d.rate; t.lungeAt = g.t; ev(g, 'shoot', { tower: t, target, kind: 'flame' }); hurtEnemy(g, target, d.dmg * dmgMul, t, {}); }
        }
        continue;
      }
      if (t.type === 'interceptor') {
        if (t.cd <= 0) {
          const r = d.range * CELL; let best = null, bp = Infinity;
          for (const e of g.enemies) {
            if (!targetable(g, e, t)) continue; const dist = distE(e, t); if (dist > r) continue; if (!inArc(t, e, d.arc)) continue;
            const p = e.fly ? (1 - e.flyProg) * 100 : (g.routes.dist.get(e.cell) != null ? g.routes.dist.get(e.cell) : 9999) - e.prog * CELL; if (p < bp) { bp = p; best = e; }
          }
          if (best) {
            t.cd = 1 / (d.rate * rateMul); t.lungeAt = g.t; t.aim = Math.atan2(-(best.z - t.z), best.x - t.x);
            if (d.pierce) {
              const dirx = best.x - t.x, dirz = best.z - t.z; const L = Math.hypot(dirx, dirz) || 1; const ux = dirx / L, uz = dirz / L; const hits = [];
              for (const e of g.enemies) { if (!targetable(g, e, t) || e.dead) continue; const px = e.x - t.x, pz = e.z - t.z; const proj = px * ux + pz * uz; if (proj < 0 || proj > r) continue; const perp = Math.abs(px * uz - pz * ux); if (perp <= 1.1) { hurtEnemy(g, e, d.dmg * dmgMul, t, {}); hits.push(e); } }
              if (!hits.length) hurtEnemy(g, best, d.dmg * dmgMul, t, {});
              ev(g, 'shoot', { tower: t, target: best, kind: 'pierce', hits, x2: t.x + ux * r, z2: t.z + uz * r });
            } else {
              g.projectiles.push({ id: g.nextId++, kind: d.slow ? 'pulse' : 'bolt', x: t.x, y: t.y + 1.6, z: t.z, target: best, speed: 22, dmg: d.dmg * dmgMul, tower: t, slow: d.slow, slowDur: d.slowDur, src: t });
              ev(g, 'shoot', { tower: t, target: best, kind: d.slow ? 'pulse' : 'bolt' });
            }
          }
        }
        continue;
      }
    }
  }
  function updateProjectiles(g, dt) {
    for (const p of g.projectiles) {
      const e = p.target; if (!e || e.dead) { p.dead = true; continue; }
      const tx = e.x, ty = e.y + 0.6, tz = e.z; const dx = tx - p.x, dy = ty - p.y, dz = tz - p.z; const L = Math.hypot(dx, dy, dz);
      const step = p.speed * dt;
      if (L <= step + 0.3) { p.dead = true; hurtEnemy(g, e, p.dmg, p.tower, {}); if (p.slow) { e.slowUntil = g.t + p.slowDur; e.slowAmt = p.slow; } ev(g, 'impact', { x: tx, y: ty, z: tz, kind: p.kind }); }
      else { p.x += dx / L * step; p.y += dy / L * step; p.z += dz / L * step; }
    }
    g.projectiles = g.projectiles.filter(p => !p.dead);
  }

  // ---------- 道具 ----------
  function useItem(g, itemId, target) {
    const it = G.ITEMS[itemId]; if (!it) return { ok: false, reason: '未知道具' };
    if (g.itemCd[itemId] > g.t) return { ok: false, reason: it.name + ' 冷却中：' + Math.ceil(g.itemCd[itemId] - g.t) + ' 秒' };
    if (it.kind === 'intel' ? g.intel < it.cost : g.cpu < it.cost) return { ok: false, reason: (it.kind === 'intel' ? '情报' : '算力') + '不足' };
    if (itemId === 'isolator') {
      const c = cellOf(g, target); if (!c || c.type !== 'node') return { ok: false, reason: '应急隔离器只能投放到交换节点上' };
      if (c.iso) return { ok: false, reason: '节点已被隔离' };
      if (g.t < c.reopenAt) return { ok: false, reason: '节点刚恢复直通，' + Math.ceil(c.reopenAt - g.t) + ' 秒后才能再次隔离' };
      const chk = checkIsolation(g, c.id); if (!chk.ok) { ev(g, 'reject', { reason: chk.reason, cell: chk.cell }); return chk; }
      g.intel -= it.cost; g.itemCd.isolator = g.t + it.cd;
      const iso = { id: g.nextId++, type: 'isolator', cell: c.id, onNode: c.nodeId, hp: it.hp, maxHp: it.hp, x: c.wx, y: c.wy, z: c.wz, blockers: new Set(), expireAt: g.t + it.dur, dead: false, isItem: true, level: 1, branch: null, invested: 0, encUntil: 0, shield: 0, hitAt: -9, anim: 0 };
      g.towers.push(iso); isolateNode(g, c, iso, 'isolator'); ev(g, 'item', { item: itemId, cell: c.id, tower: iso });
      say(g, '应急隔离器投放，节点「' + c.name + '」临时隔离 ' + it.dur + ' 秒', 'item');
      return { ok: true };
    }
    if (itemId === 'downgrade') {
      const c = cellOf(g, target); if (!c || (c.type !== 'path' && c.type !== 'old')) return { ok: false, reason: '协议降级只能投放到链路上' };
      g.intel -= it.cost; g.itemCd.downgrade = g.t + it.cd;
      const cells = [];
      for (const cc of g.M.cells) { if (cc.type !== 'path' && cc.type !== 'old') continue; if (Math.hypot(cc.wx - c.wx, cc.wz - c.wz) <= it.radius * CELL + 0.01) { g.terrain.oldUntil.set(cc.id, g.t + it.dur); cells.push(cc.id); } }
      recompute(g, 'downgrade'); ev(g, 'item', { item: itemId, cell: c.id, cells, radius: it.radius, until: g.t + it.dur });
      say(g, '协议降级生效：' + cells.length + ' 格链路切换为旧协议，敌人按新速度重新选择路线', 'item');
      return { ok: true, cells };
    }
    if (itemId === 'restore') {
      const t = g.towers.find(x => x.id === target && !x.dead); if (!t || t.isItem) return { ok: false, reason: '请选择一座友方塔' };
      g.cpu -= it.cost; g.itemCd.restore = g.t + it.cd;
      t.hp = Math.min(t.maxHp, t.hp + t.maxHp * it.heal); t.encUntil = 0; ev(g, 'item', { item: itemId, tower: t, x: t.x, y: t.y, z: t.z });
      say(g, '备份还原：' + G.TOWERS[t.type].name + ' 恢复生命并解除加密', 'item');
      return { ok: true };
    }
    return { ok: false };
  }
  function previewItem(g, itemId, target) {
    const it = G.ITEMS[itemId]; if (!it) return { ok: false, reason: '未知道具' };
    const c = cellOf(g, target);
    if (itemId === 'isolator') { if (!c || c.type !== 'node') return { ok: false, reason: '需要投放到交换节点' }; if (c.iso) return { ok: false, reason: '节点已隔离' }; if (g.t < c.reopenAt) return { ok: false, reason: '隔离冷却中' }; const chk = checkIsolation(g, c.id); if (!chk.ok) return chk; return { ok: true, routes: previewRoutes(g, [c.id]), cell: c.id }; }
    if (itemId === 'downgrade') { if (!c || (c.type !== 'path' && c.type !== 'old')) return { ok: false, reason: '需要投放到链路' }; const cells = g.M.cells.filter(cc => (cc.type === 'path' || cc.type === 'old') && Math.hypot(cc.wx - c.wx, cc.wz - c.wz) <= it.radius * CELL + 0.01).map(cc => cc.id); const r = computeRoutes(g.M, blockedSet(g), withOld(g, cells)); const by = entryRoutes(g.M, r); return { ok: true, cells, radius: it.radius, routes: by }; }
    if (itemId === 'restore') { const t = g.towers.find(x => x.id === target && !x.dead); if (!t || t.isItem) return { ok: false, reason: '需要选择一座塔' }; return { ok: true, tower: t }; }
    return { ok: false };
  }
  function withOld(g, cells) { const g2 = { t: g.t, terrain: { oldUntil: new Map(g.terrain.oldUntil), blockedUntil: g.terrain.blockedUntil, warnings: [] } }; for (const c of cells) g2.terrain.oldUntil.set(c, g.t + 999); return g2; }
  function previewRoutes(g, extraBlocked) {
    const blocked = blockedSet(g); for (const c of extraBlocked) blocked.add(c);
    return entryRoutes(g.M, computeRoutes(g.M, blocked, g));
  }
  function previewDeploy(g, type, cellId) {
    const chk = canDeploy(g, type, cellId); if (!chk.ok) return chk;
    const c = cellOf(g, cellId);
    if (c.type === 'node') return { ok: true, isolates: true, routes: previewRoutes(g, [c.id]), cell: c.id };
    return { ok: true, cell: c.id };
  }

  // ---------- 主循环 ----------
  function step(g, dt) {
    const steps = Math.max(1, Math.round(dt / DT)); const d = dt / steps;
    for (let i = 0; i < steps; i++) tick(g, d);
  }
  function tick(g, dt) {
    if (g.finished) { g.t += 0; return; }
    g.t += dt; g.tick++; g.stats.time = g.t;
    // 被动资源
    g.cpu += 7 * dt;
    updateTerrain(g, dt);
    // 波次
    if (g.phase === 'prep' || g.phase === 'inter') {
      g.interT -= dt; if (g.interT <= 0) { const nx = g.waveIdx + 1; if (nx < g.def.waves.length) startWave(g, nx); }
    } else if (g.phase === 'wave' && g.wave) {
      g.wave.t += dt;
      while (g.wave.queue.length && g.wave.queue[0].t <= g.wave.t) { const s = g.wave.queue.shift(); spawnEnemy(g, s.entry, s.type); g.wave.spawned++; }
      const alive = g.enemies.some(e => !e.dead);
      if (!g.wave.queue.length && !alive) {
        const reward = 3 + Math.floor(g.waveIdx / 3); g.intel += reward; g.stats.intelEarned += reward; g.stats.waves = g.waveIdx + 1;
        ev(g, 'waveClear', { idx: g.waveIdx, reward }); say(g, '第 ' + (g.waveIdx + 1) + ' 波已击退，情报 +' + reward, 'good');
        if (g.waveIdx + 1 >= g.def.waves.length) { g.phase = 'win'; g.finished = true; ev(g, 'win', {}); say(g, '全部波次已撑过，汐域守住了中枢', 'good'); }
        else { g.phase = 'inter'; g.interT = 9; ev(g, 'intermission', { next: g.waveIdx + 1 }); }
      }
    }
    // 隔离节点持续情报
    if (g.phase === 'wave') {
      g.holdT += dt;
      if (g.holdT >= 8) {
        g.holdT -= 8; let n = 0;
        for (const nd of g.M.nodes) { if (nd.iso && nd.iso.kind === 'tower') { const t = g.towers.find(x => x.id === nd.iso.towerId); if (t) { n++; } } }
        if (n) { g.intel += n; g.stats.intelEarned += n; ev(g, 'intelHold', { amount: n }); }
      }
    }
    updateLures(g, dt);
    for (const e of g.enemies) updateEnemy(g, e, dt);
    // 隔离器到期
    for (const t of Array.from(g.towers)) { if (t.isItem && g.t >= t.expireAt) { destroyTower(g, t, 'sell'); const node = g.M.nodeByNum[t.onNode]; if (node && node.iso && node.iso.towerId === t.id) reopenNode(g, node, '隔离器失效'); ev(g, 'isolatorEnd', { tower: t }); say(g, '应急隔离器失效，节点恢复直通', 'info'); } }
    updateTowers(g, dt);
    updateProjectiles(g, dt);
    g.enemies = g.enemies.filter(e => !e.dead);
  }
  function callNextWave(g) {
    if (g.phase === 'prep' || g.phase === 'inter') { const bonus = Math.round(g.interT * 5); g.cpu += bonus; const nx = g.waveIdx + 1; startWave(g, nx); say(g, '提前召唤下一波，算力 +' + bonus, 'info'); return { ok: true, bonus }; }
    return { ok: false };
  }
  function setSpeed(g, s) { g.speed = s; }
  function setPaused(g, p) { g.paused = p; }

  // 给渲染/界面用的查询
  function enemyProgress(g, e) { if (e.fly) return 1 - e.flyProg; const d = g.routes.dist.get(e.cell); return d != null ? d : 9999; }
  function enemyPath(g, e) {
    if (e.fly) return e.flyPath.map(p => ({ x: p.x, y: p.y, z: p.z }));
    const out = [{ x: e.x, y: e.y, z: e.z }]; let cur = e.to; let guard = 0;
    if (e.mode === 'lured' || e.mode === 'siege') { const path = (e.path || []).slice(); if (e.to) path.unshift(e.to); for (const id of path) { const c = cellOf(g, id); out.push({ x: c.wx, y: c.wy, z: c.wz }); } return out; }
    while (cur && guard++ < 60) { const c = cellOf(g, cur); out.push({ x: c.wx, y: c.wy, z: c.wz }); if (c.type === 'exit') break; cur = g.routes.next.get(cur); }
    return out;
  }
  function upcomingWave(g) { const nx = Math.min(g.waveIdx + 1, g.def.waves.length - 1); return { idx: nx, def: g.def.waves[nx] }; }

  G.Sim = { DT, CELL, LAYER_H, FLY_Y, PLAT_Y, OLD_COST, REOPEN_CD, buildMap, computeRoutes, entryRoutes, createGame, step, tick, deploy, canDeploy, sellTower, upgradeTower, upgradeCost, castSkill, useItem, previewItem, previewDeploy, previewRoutes, callNextWave, setSpeed, setPaused, towerDef, towerAt, nodeTower, checkIsolation, cellOf, enemyProgress, enemyPath, upcomingWave, isWalkable, cellIsOld, routeAhead, blockedSet, hurtEnemy, hurtTower, reveal, isolateNode, reopenNode, spawnEnemy, startWave };
})();
