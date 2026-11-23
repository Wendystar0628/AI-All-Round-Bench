/* 战斗模拟：固定步长、确定性随机、可单步推进（供视频导出使用） */
(function (g) {
'use strict';
const TD = g.TD || (g.TD = {});
const R = TD.Route, D = TD.DATA;
const STEP = 1 / 30;

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ---------- 图扩展：部署点 ---------- */
function prepGraph(map) {
  const G = R.build(map);
  G.points = [];
  for (const e of G.edges) {
    if (e.a === e.b) continue;
    const fr = e.len > 34 ? [0.34, 0.66] : [0.5];
    for (let k = 0; k < fr.length; k++) {
      G.points.push({ key: e.id + '#' + k, edgeId: e.id, edge: e, frac: fr[k], x: 0, y: 0, tower: null });
    }
  }
  for (const p of G.points) {
    const A = G.nodes.get(p.edge.a), B = G.nodes.get(p.edge.b);
    p.x = A.x + (B.x - A.x) * p.frac;
    p.y = A.y + (B.y - A.y) * p.frac;
  }
  G.pointByKey = new Map();
  G.pointsByEdge = new Map();
  for (const p of G.points) { G.pointByKey.set(p.key, p); if (!G.pointsByEdge.has(p.edgeId)) G.pointsByEdge.set(p.edgeId, []); G.pointsByEdge.get(p.edgeId).push(p); }
  G.nodeById = new Map();
  for (const n of map.nodes) G.nodeById.set(n.id, n);
  return G;
}

/* ---------- 创建对局 ---------- */
function create(mapId, seed) {
  const mapDef = D.MAPS.find(m => m.id === mapId) || D.MAPS[0];
  const G = prepGraph(mapDef);
  const st = {
    mapDef, map: mapDef, G, mapId,
    rng: mulberry(seed || 12345),
    time: 0, frame: 0,
    waveIdx: -1, waveState: 'prep', prepT: mapDef.waves.length ? 18 : 0,
    compute: 150, intel: 30, integrity: 100,
    speed: 1, paused: false,
    enemies: [], towers: [], shots: [], fx: [], beams: [],
    isolated: new Set(), locked: new Set(), black: new Set(), down: new Set(),
    isolators: [], cooldown: {}, downgrades: [],
    routes: {}, assign: Object.assign({}, mapDef.assign || {}),
    towerAt: new Map(), enemyAt: new Map(),
    nextId: 1, spawnQueue: [],
    stats: { kills: 0, leaked: 0, computeEarned: 0, intelEarned: 0, built: 0, lost: 0, damage: 0 },
    events: [], result: null,
    boss: null, warn: []
  };
  recompute(st, true);
  return st;
}

/* ---------- 路由 ---------- */
function prefFor(st, entry) {
  const w = currentWave(st);
  const list = (w && w.pref && w.pref[entry]) || (st.mapDef.pref && st.mapDef.pref[entry]) || [];
  const o = {};
  for (const x of list) o[x] = true;
  return o;
}
function currentWave(st) {
  if (st.waveIdx < 0 || st.waveIdx >= st.mapDef.waves.length) return null;
  return st.mapDef.waves[st.waveIdx];
}
function routeState(st) {
  return { isolated: st.isolated, down: st.down, black: st.black, locked: st.locked, pref: {} };
}
function recompute(st, initial) {
  const rs = routeState(st);
  const entries = st.mapDef.nodes.filter(n => n.kind === 'entry').map(n => n.id);
  rs.pref = {};
  for (const e of entries) rs.pref[e] = prefFor(st, e);
  st.routes = R.entryRoutes(st.G, st.mapDef, rs, st.assign);
  if (!initial) repathAll(st);
}
/* 检查隔离某节点后是否仍有路（入口与场上地面敌人） */
function canChange(st, testIsolated) {
  const iso = new Set(st.isolated);
  if (testIsolated) iso.add(testIsolated);
  const rs = { isolated: iso, down: st.down, black: st.black, locked: st.locked, pref: {} };
  const entries = st.mapDef.nodes.filter(n => n.kind === 'entry').map(n => n.id);
  for (const e of entries) rs.pref[e] = prefFor(st, e);
  const rts = R.entryRoutes(st.G, st.mapDef, rs, st.assign);
  for (const e of entries) if (!rts[e]) return { ok: false, why: 'entry', entry: e };
  const exits = new Set();
  for (const [, n] of st.G.nodes) if (n.kind === 'exit') exits.add(n.id);
  for (const en of st.enemies) {
    if (en.fly || en.dead) continue;
    const anchor = en.path[Math.max(0, en.i - 1)];
    if (!anchor) continue;
    if (!R.dijkstra(st.G, anchor, exits, rs, en.exit, rs.pref[en.entry])) return { ok: false, why: 'enemy', enemy: en };
  }
  return { ok: true };
}
function repathAll(st) {
  const rs = routeState(st);
  const entries = st.mapDef.nodes.filter(n => n.kind === 'entry').map(n => n.id);
  for (const e of entries) rs.pref[e] = prefFor(st, e);
  for (const en of st.enemies) {
    if (en.dead) continue;
    if (en.fly) { en.flyPath = flyPath(st, en); continue; }
    const anchor = en.path[Math.max(0, en.i - 1)];
    if (!anchor) continue;
    const r = R.dijkstra(st.G, anchor, exitSet(st), rs, en.exit, rs.pref[en.entry]);
    if (!r) { continue; }
    const oldNext = en.path[en.i];
    en.path = r.path; en.exit = r.exit;
    en.i = 1;
    en.wp = waypoints(st, en);
    if (en.state === 'blocked' && en.blockedBy && !towerAlive(en.blockedBy)) { unblock(st, en); }
    if (oldNext !== en.path[1] && en.state === 'blocked') unblock(st, en);
    if (en.divert && !needsDivert(st, en)) en.divert = null;
    if (en.state === 'move' || en.state === 'blocked') { /* 位置不变，从当前位置走向新路 */ }
  }
  // 记录改道事件（用于表现）
}
function exitSet(st) {
  if (!st._exits) {
    st._exits = new Set();
    for (const [, n] of st.G.nodes) if (n.kind === 'exit') st._exits.add(n.id);
  }
  return st._exits;
}
function waypoints(st, en) {
  const pts = en.path.map(id => { const n = st.G.nodeById.get(id); return [n.x, n.y]; });
  const off = ((en.lane % 3) - 1) * 2.6;
  return pts.map((p, k) => {
    if (k === 0 || k === pts.length - 1) return [p[0], p[1]];
    const a = pts[k - 1], b = pts[k + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [p[0] + (-dy / l) * off, p[1] + (dx / l) * off];
  });
}
function flyPath(st, en) {
  const A = st.G.nodeById.get(en.entryNode), B = st.G.nodeById.get(en.exit);
  if (!A || !B) return null;
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  const lift = Math.hypot(B.x - A.x, B.y - A.y) * 0.22 + 16;
  return { a: [A.x, A.y], c: [mx, my - lift], b: [B.x, B.y], t: 0, len: Math.hypot(B.x - A.x, B.y - A.y) };
}

/* ---------- 生成 ---------- */
function spawnEnemy(st, typeId, entryId, exitId, opts) {
  const def = D.ENEMIES[typeId];
  const entryNode = st.G.nodeById.get(entryId);
  if (!entryNode) return null;
  const exit = exitId || st.assign[entryId] || [...exitSet(st)][0];
  const rs = routeState(st);
  rs.pref = {}; for (const e of st.mapDef.nodes.filter(n => n.kind === 'entry').map(n => n.id)) rs.pref[e] = prefFor(st, e);
  let path = null;
  if (!def.fly) {
    const r = R.dijkstra(st.G, entryId, exitSet(st), rs, exit, rs.pref[entryId]);
    if (!r) { const r2 = R.dijkstra(st.G, entryId, exitSet(st), rs, null, rs.pref[entryId]); if (!r2) return null; path = r2.path; }
    else path = r.path;
  }
  const lane = st.nextId % 5;
  const en = {
    id: st.nextId++, type: typeId, def,
    x: entryNode.x + (st.rng() - 0.5) * 5, y: entryNode.y + (st.rng() - 0.5) * 5, z: def.fly ? def.fly : 0,
    hp: def.hp, maxHp: def.hp, shield: 0, maxShield: 0,
    speed: def.speed, entry: entryId, entryNode: entryId, exit: exit,
    path: path || [entryId, exit], i: 1, lane,
    state: def.fly ? 'fly' : 'move', dead: false, leaked: false,
    atkCd: st.rng() * 0.5, revealed: !def.disguised, slow: 0, trap: 0,
    replicated: false, boss: !!def.boss, phase: 0, abilityCd: 4, hitT: 0, anim: st.rng() * 6,
    flyPath: null, passed: new Set(), divert: null, slamCd: 0, size: def.size
  };
  if (def.fly) en.flyPath = flyPath(st, en);
  else en.wp = waypoints(st, en);
  st.enemies.push(en);
  return en;
}
function towerAlive(t) { return t && !t.dead; }
function unblock(st, en) {
  if (en.blockedBy) {
    const i = en.blockedBy.blocked.indexOf(en);
    if (i >= 0) en.blockedBy.blocked.splice(i, 1);
    en.blockedBy = null;
  }
  if (en.state === 'blocked') en.state = 'move';
}

/* ---------- 波次 ---------- */
function startWave(st, idx) {
  st.waveIdx = idx;
  const w = st.mapDef.waves[idx];
  st.waveState = 'active';
  st.spawnQueue = [];
  let t = 0;
  const entries = w.entries.slice();
  for (const grp of w.groups) {
    const useEntry = grp.entry || entries[(st.nextId + grp.count) % entries.length];
    for (let k = 0; k < grp.count; k++) {
      const e = grp.entry || entries[(k + grp.count) % entries.length];
      st.spawnQueue.push({ t: t, type: grp.type, entry: e, exit: (w.assign && w.assign[e]) || st.assign[e] });
      t += grp.gap;
    }
  }
  st.spawnQueue.sort((a, b) => a.t - b.t);
  st.waveTime = 0;
  st.assign = Object.assign({}, st.mapDef.assign || {}, w.assign || {});
  recompute(st, false);
  st.events.push({ kind: 'wave', text: '第 ' + (idx + 1) + ' 波：' + (w.note || '') });
}

/* ---------- 塔 ---------- */
function towerStats(type, level, branch) {
  const d = D.TOWERS[type];
  const s = {
    hp: d.hp * (level > 1 ? 1.6 : 1), dmg: d.dmg * (level > 1 ? 1.55 : 1),
    atk: d.atk * (level > 1 ? 1.25 : 1), range: (d.range || 0) * (level > 1 ? 1.18 : 1),
    detect: (d.detect || 0) * (level > 1 ? 1.2 : 1), heal: (d.heal || 0) * (level > 1 ? 1.6 : 1),
    blockCap: d.blockCap + (level > 1 ? 1 : 0), lure: (d.lure || 0) * (level > 1 ? 1.45 : 1)
  };
  if (type === 'interceptor' && level > 1) {
    if (branch === 'b1') { s.dmg *= 1.1; s.pierce = true; }
    if (branch === 'b2') { s.slow = true; s.splash = 7; }
  }
  if (type === 'honeypot' && level > 1) {
    if (branch === 'b1') { s.lure *= 1.6; s.trapDmg = 9; }
    if (branch === 'b2') { s.trapDur = 5.5; s.trapSlow = 0.55; }
  }
  return s;
}
function placeTower(st, type, spot, facing) {
  const def = D.TOWERS[type];
  const t = {
    id: st.nextId++, type, def, level: 1, branch: null,
    x: spot.x, y: spot.y, z: spot.z || 0,
    hp: def.hp, maxHp: def.hp, shield: 0, maxShield: 0,
    cd: 0, skillCd: 0, facing: facing == null ? defaultFacing(st, spot) : facing,
    blocked: [], dead: false, encryptT: 0, spot: spot.key, spotRef: spot,
    nodeId: spot.nodeId || null, edgeId: spot.edgeId || null, frac: spot.frac,
    anim: 0, fireT: 0, hitT: 0, born: st.time
  };
  t.stats = towerStats(type, 1, null);
  if (spot.tower) return null;
  spot.tower = t; t.spotRef = spot;
  st.towers.push(t);
  st.towerAt.set(t.spot, t);
  if (t.nodeId) { st.isolated.add(t.nodeId); st.cooldown[t.nodeId] = 0; }
  st.stats.built++;
  st.compute -= def.cost;
  recompute(st, false);
  st.events.push({ kind: 'build', tower: t });
  return t;
}
function defaultFacing(st, spot) {
  // 朝向最近入口的平均方向
  let sx = 0, sy = 0, n = 0;
  for (const nd of st.mapDef.nodes) if (nd.kind === 'entry') { sx += nd.x; sy += nd.y; n++; }
  if (!n) return 0;
  const dx = sx / n - spot.x, dy = sy / n - spot.y;
  let a = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  return Math.round(a / step) * step;
}
function removeTower(st, t) {
  if (t.dead) return;
  t.dead = true;
  for (const en of t.blocked.slice()) unblock(st, en);
  if (t.spotRef) t.spotRef.tower = null;
  st.towerAt.delete(t.spot);
  if (t.nodeId) { st.isolated.delete(t.nodeId); st.cooldown[t.nodeId] = st.time + 8; }
  st.events.push({ kind: 'sell', tower: t });
  recompute(st, false);
}
function sellTower(st, t) {
  const refund = Math.floor(t.def.cost * 0.6);
  st.compute += refund;
  removeTower(st, t);
  return refund;
}
function upgradeTower(st, t, branch) {
  if (t.level > 1) return false;
  const cost = Math.floor(t.def.cost * 0.85);
  if (st.compute < cost) return false;
  st.compute -= cost;
  t.level = 2;
  if (t.def.branches && branch) t.branch = branch;
  t.maxHp = towerStats(t.type, 2, t.branch).hp;
  t.hp = Math.min(t.maxHp, t.hp + t.maxHp * 0.35);
  t.stats = towerStats(t.type, 2, t.branch);
  st.events.push({ kind: 'upgrade', tower: t });
  return true;
}

/* ---------- 道具 ---------- */
function useIsolator(st, nodeId) {
  const node = st.G.nodeById.get(nodeId);
  if (!node || !node.sw) return { ok: false, msg: '只能隔离交换节点' };
  if (st.isolated.has(nodeId)) return { ok: false, msg: '节点已被隔离' };
  if ((st.cooldown[nodeId] || 0) > st.time) return { ok: false, msg: '该节点刚恢复直通，需等待' };
  const chk = canChange(st, nodeId);
  if (!chk.ok) return { ok: false, msg: chk.why === 'entry' ? '会封死入口，操作被拒绝' : '会让场上敌人无路可走' };
  if (st.intel < D.ITEMS.isolator.cost) return { ok: false, msg: '情报不足' };
  st.intel -= D.ITEMS.isolator.cost;
  const iso = { nodeId, hp: D.ITEMS.isolator.hp, t: D.ITEMS.isolator.dur, maxT: D.ITEMS.isolator.dur };
  st.isolators.push(iso);
  st.isolated.add(nodeId);
  st.cooldown[nodeId] = 0;
  recompute(st, false);
  st.events.push({ kind: 'isolate', nodeId });
  return { ok: true };
}
function useDowngrade(st, x, y) {
  const it = D.ITEMS.downgrade;
  if (st.intel < it.cost) return { ok: false, msg: '情报不足' };
  let hit = 0;
  for (const e of st.G.edges) {
    if (e.legacy) continue;
    const A = st.G.nodeById.get(e.a), B = st.G.nodeById.get(e.b);
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    if (Math.hypot(mx - x, my - y) <= it.radius) {
      if (!st.down.has(e.id)) { st.down.add(e.id); st.downgrades.push({ edgeId: e.id, t: it.dur, maxT: it.dur }); hit++; }
    }
  }
  if (!hit) return { ok: false, msg: '范围内没有可降级的链路' };
  st.intel -= it.cost;
  recompute(st, false);
  st.events.push({ kind: 'downgrade', x, y });
  return { ok: true };
}
function useRestore(st, t) {
  const it = D.ITEMS.restore;
  if (!t) return { ok: false, msg: '需要选择一座塔' };
  if (st.compute < it.cost) return { ok: false, msg: '算力不足' };
  st.compute -= it.cost;
  t.hp = Math.min(t.maxHp, t.hp + it.heal);
  t.encryptT = 0;
  st.fx.push({ kind: 'heal', x: t.x, y: t.y, z: t.z, t: 0, dur: 0.9 });
  st.events.push({ kind: 'restore', tower: t });
  return { ok: true };
}
function castSkill(st, t) {
  if (!t || t.encryptT > 0 || t.skillCd > 0) return false;
  if (t.type === 'honeypot') {
    t.skillCd = 22;
    let n = 0;
    for (const en of st.enemies) {
      if (en.dead || en.fly) continue;
      if (Math.hypot(en.x - t.x, en.y - t.y) <= (t.stats.lure || 20) + 4) { en.trap = t.branch === 'b2' ? 5.5 : 3.4; n++; }
    }
    st.fx.push({ kind: 'trap', x: t.x, y: t.y, z: t.z, t: 0, dur: 0.8, r: (t.stats.lure || 20) + 4 });
    st.events.push({ kind: 'skill', tower: t, text: '诱捕 ' + n + ' 个目标' });
    return true;
  }
  if (t.type === 'repair') {
    t.skillCd = t.def.skill.cd;
    let n = 0;
    for (const o of st.towers) {
      if (o.dead) continue;
      if (Math.hypot(o.x - t.x, o.y - t.y) <= t.stats.range) { o.shield = 80; o.maxShield = 80; o.encryptT = 0; n++; }
    }
    st.fx.push({ kind: 'shield', x: t.x, y: t.y, z: t.z, t: 0, dur: 1.2, r: t.stats.range });
    st.events.push({ kind: 'skill', tower: t, text: '冗余切换：' + n + ' 座塔获得护盾' });
    return true;
  }
  return false;
}

/* ---------- 伤害 ---------- */
function damageEnemy(st, en, dmg, opts) {
  if (en.dead) return 0;
  opts = opts || {};
  let d = dmg;
  if (en.def.armor && !opts.trueDmg) d *= (1 - en.def.armor);
  if (en.shield > 0) {
    const a = Math.min(en.shield, d);
    en.shield -= a; d -= a;
    if (en.shield <= 0) st.fx.push({ kind: 'shieldbreak', x: en.x, y: en.y, z: en.z, t: 0, dur: 0.5 });
  }
  en.hp -= d;
  en.hitT = 0.18;
  st.stats.damage += Math.min(d, en.hp + d);
  if (en.hp <= 0) {
    en.dead = true;
    if (en.def.disguised && !en.revealed && opts.splash) {
      // 未显形被波及消灭：释放载荷
      st.fx.push({ kind: 'payload', x: en.x, y: en.y, z: en.z, t: 0, dur: 0.7, r: 15 });
      for (const t of st.towers) {
        if (t.dead) continue;
        const dd = Math.hypot(t.x - en.x, t.y - en.y);
        if (dd <= 15) damageTower(st, t, 42);
      }
    }
    killReward(st, en);
  }
  return d;
}
function killReward(st, en) {
  st.stats.kills++;
  st.compute += Math.round(en.def.bounty * 0.55);
  st.stats.computeEarned += Math.round(en.def.bounty * 0.55);
  if (en.def.intel) {
    st.intel += en.def.intel;
    st.stats.intelEarned += en.def.intel;
  }
  st.fx.push({ kind: 'death', x: en.x, y: en.y, z: en.z, t: 0, dur: 0.7, color: en.def.color, size: en.size });
}
function damageTower(st, t, dmg) {
  if (t.dead) return;
  t.hitT = 0.2;
  if (t.shield > 0) {
    const a = Math.min(t.shield, dmg);
    t.shield -= a; dmg -= a;
    st.fx.push({ kind: 'shieldhit', x: t.x, y: t.y, z: t.z, t: 0, dur: 0.4 });
  }
  t.hp -= dmg;
  if (t.hp <= 0) {
    t.hp = 0;
    removeTower(st, t);
    st.stats.lost++;
    st.fx.push({ kind: 'towerdeath', x: t.x, y: t.y, z: t.z, t: 0, dur: 1.0, color: t.def.color });
  }
}
function needsDivert(st, en) {
  if (!en.def.attacks || en.def.attacks !== 'slam') return null;
  const nextId = en.path[en.i];
  if (!nextId) return null;
  if (!st.isolated.has(nextId)) return null;
  // 找该节点上的塔或隔离器
  const tower = st.towers.find(t => !t.dead && t.nodeId === nextId);
  const iso = st.isolators.find(i => i.nodeId === nextId);
  if (tower) return { nodeId: nextId, tower, x: tower.x, y: tower.y, kind: 'tower' };
  if (iso) {
    const nd = st.G.nodeById.get(nextId);
    return { nodeId: nextId, iso, x: nd.x, y: nd.y, kind: 'iso' };
  }
  return null;
}

/* ---------- 主步进 ---------- */
function step(st, dt) {
  if (st.waveState === 'won' || st.waveState === 'lost') { updateFx(st, dt); return; }
  st.time += dt; st.frame++;
  // 资源
  st.compute += (2.0 + st.waveIdx * 0.12) * dt;
  st.stats.computeEarned += (2.0 + st.waveIdx * 0.12) * dt;
  // 守住隔离节点获得情报
  let held = 0;
  for (const nid of st.isolated) {
    if (st.towers.some(t => !t.dead && t.nodeId === nid) || st.isolators.some(i => i.nodeId === nid)) held++;
  }
  if (held) { st.intel += held * 0.4 * dt; st.stats.intelEarned += held * 0.4 * dt; }
  // 隔离器计时
  for (let i = st.isolators.length - 1; i >= 0; i--) {
    const iso = st.isolators[i];
    iso.t -= dt;
    if (iso.t <= 0 || iso.hp <= 0) {
      st.isolators.splice(i, 1);
      if (!st.towers.some(t => !t.dead && t.nodeId === iso.nodeId)) {
        st.isolated.delete(iso.nodeId);
        st.cooldown[iso.nodeId] = st.time + 8;
        recompute(st, false);
        st.events.push({ kind: 'iso-expire', nodeId: iso.nodeId });
      }
    }
  }
  // 协议降级计时
  for (let i = st.downgrades.length - 1; i >= 0; i--) {
    const d = st.downgrades[i];
    d.t -= dt;
    if (d.t <= 0) {
      st.downgrades.splice(i, 1);
      st.down.delete(d.edgeId);
      recompute(st, false);
      st.events.push({ kind: 'down-expire', edgeId: d.edgeId });
    }
  }
  // 波次流程
  if (st.waveState === 'prep') {
    st.prepT -= dt;
    if (st.prepT <= 0) startWave(st, st.waveIdx + 1);
  } else if (st.waveState === 'active') {
    st.waveTime = (st.waveTime || 0) + dt;
    while (st.spawnQueue.length && st.spawnQueue[0].t <= st.waveTime) {
      const s = st.spawnQueue.shift();
      const en = spawnEnemy(st, s.type, s.entry, s.exit);
      if (en) st.events.push({ kind: 'spawn', enemy: en });
    }
    if (!st.spawnQueue.length && !st.enemies.some(e => !e.dead && !e.leaked)) {
      // 波次结束
      const w = st.mapDef.waves[st.waveIdx];
      st.intel += 8 + Math.floor(st.waveIdx * 0.8);
      st.stats.intelEarned += 8 + Math.floor(st.waveIdx * 0.8);
      if (st.waveIdx >= st.mapDef.waves.length - 1) {
        st.waveState = 'won'; st.result = 'win';
        st.events.push({ kind: 'end', result: 'win' });
      } else {
        st.waveState = 'prep'; st.prepT = 14;
        st.events.push({ kind: 'waveclear', text: '第 ' + (st.waveIdx + 1) + ' 波清除' });
      }
    }
  }
  // 塔
  for (const t of st.towers) {
    if (t.dead) continue;
    t.anim += dt;
    if (t.encryptT > 0) t.encryptT -= dt;
    if (t.skillCd > 0) t.skillCd -= dt;
    if (t.cd > 0) t.cd -= dt;
    if (t.fireT > 0) t.fireT -= dt;
    if (t.hitT > 0) t.hitT -= dt;
    const enc = t.encryptT > 0;
    if (t.type === 'interceptor' && !enc && t.cd <= 0) {
      const target = findTarget(st, t);
      if (target) {
        t.cd = 1 / t.stats.atk;
        t.fireT = 0.12;
        st.shots.push({ kind: 'bolt', x: t.x, y: t.y, z: t.z + 7, tx: target.x, ty: target.y, tz: target.z, t: 0, dur: 0.16, dmg: t.stats.dmg, tower: t, target, pierce: t.stats.pierce, slow: t.stats.slow, splash: t.stats.splash });
        st.events.push({ kind: 'shoot', tower: t });
      }
    } else if (t.type === 'sandbox' && !enc) {
      for (const e of st.enemies) {
        if (e.dead || e.fly) continue;
        if (Math.hypot(e.x - t.x, e.y - t.y) <= t.stats.detect && e.def.disguised && !e.revealed) reveal(st, e);
        if (e.def.bossKind === 'latent' && e.phase === 0 && Math.hypot(e.x - t.x, e.y - t.y) <= t.stats.detect) { e.revealed = true; }
      }
      if (t.cd <= 0) {
        const list = st.enemies.filter(e => !e.dead && !e.fly && Math.hypot(e.x - t.x, e.y - t.y) <= t.stats.range);
        if (list.length) {
          t.cd = 1 / t.stats.atk; t.fireT = 0.3;
          st.fx.push({ kind: 'sandblast', x: t.x, y: t.y, z: t.z + 6, t: 0, dur: 0.5, r: t.stats.range });
          for (const e of list) damageEnemy(st, e, t.stats.dmg);
          st.events.push({ kind: 'shoot', tower: t });
        }
      }
    } else if (t.type === 'repair' && !enc && t.cd <= 0) {
      let healed = false;
      for (const o of st.towers) {
        if (o.dead || o === t) continue;
        if (o.hp >= o.maxHp && o.shield >= o.maxShield) continue;
        if (Math.hypot(o.x - t.x, o.y - t.y) <= t.stats.range) {
          o.hp = Math.min(o.maxHp, o.hp + t.stats.heal * dt);
          if (!healed) { st.beams.push({ x1: t.x, y1: t.y, z1: t.z + 6, x2: o.x, y2: o.y, z2: o.z + 4, t: 0, dur: 0.5 }); healed = true; }
        }
      }
      if (healed) t.cd = 0.5;
    } else if (t.type === 'honeypot' && !enc) {
      // 诱敌：把附近会攻塔的地面敌人引向自己
      t.lureCd = (t.lureCd || 0) - dt;
      if (t.lureCd <= 0) {
        t.lureCd = 0.5;
        for (const en of st.enemies) {
          if (en.dead || en.fly || en.trap > 0) continue;
          if (en.lureTo === t) continue;
          if (Math.hypot(en.x - t.x, en.y - t.y) <= t.stats.lure) {
            if (en.blockedBy && en.blockedBy !== t) { en.lureTo = t; en.lureT = 4.5; unblock(st, en); }
            else if (en.def.attacks === 'ranged' || en.divert) { en.lureTo = t; en.lureT = 4.5; }
          }
        }
      }
    }
    // 防火墙/蜜罐 还击
    if ((t.type === 'firewall' || t.type === 'honeypot') && !enc && t.cd <= 0 && t.blocked.length) {
      const en = t.blocked[0];
      t.cd = 1 / t.stats.atk; t.fireT = 0.15;
      damageEnemy(st, en, t.stats.dmg);
      st.fx.push({ kind: 'melee', x: en.x, y: en.y, z: en.z + 2, t: 0, dur: 0.25 });
    }
  }
  // 敌人
  for (const en of st.enemies) {
    if (en.dead || en.leaked) continue;
    en.anim += dt;
    if (en.hitT > 0) en.hitT -= dt;
    if (en.slow > 0) en.slow -= dt;
    if (en.boss) bossUpdate(st, en, dt);
    if (en.trap > 0) {
      en.trap -= dt;
      damageEnemy(st, en, 9 * dt);
      continue;
    }
    if (en.fly) { updateFly(st, en, dt); continue; }
    en.progressScore = -(en.i / Math.max(1, en.path.length)) * 1000;
    if (en.def.attacks === 'ranged') updateRansom(st, en, dt);
    if (en.def.shieldHp && en.anim % 1 < dt) packerShield(st, en);
    // 洪泛团/Boss 冲击隔离节点
    if (en.def.attacks === 'slam' || (en.boss && en.def.bossKind === 'wankui')) {
      const dv = needsDivert(st, en);
      if (dv && !en.divert) { en.divert = dv; en.state = 'divert'; }
    }
    if (en.state === 'divert' && en.divert) { updateDivert(st, en, dt); continue; }
    updateGround(st, en, dt);
  }
  // 蜃楼黑洞计时
  if (st._bh) {
    for (let i = st._bh.length - 1; i >= 0; i--) {
      st._bh[i].t -= dt;
      if (st._bh[i].t <= 0) {
        st.black.delete(st._bh[i].id);
        st._bh.splice(i, 1);
        recompute(st, false);
        st.events.push({ kind: 'blackhole-end', edgeId: st._bh[i] ? st._bh[i].id : '' });
      }
    }
  }
  // 弹道
  for (let i = st.shots.length - 1; i >= 0; i--) {
    const s = st.shots[i];
    s.t += dt;
    if (s.t >= s.dur) {
      if (s.target && !s.target.dead) {
        damageEnemy(st, s.target, s.dmg);
        st.fx.push({ kind: 'hit', x: s.target.x, y: s.target.y, z: s.target.z + 1.5, t: 0, dur: 0.3 });
        if (s.pierce) {
          const dir = Math.atan2(s.ty - s.y, s.tx - s.x);
          for (const e of st.enemies) {
            if (e.dead || e === s.target) continue;
            const dx = e.x - s.target.x, dy = e.y - s.target.y;
            const proj = dx * Math.cos(dir) + dy * Math.sin(dir);
            const perp = Math.abs(-dx * Math.sin(dir) + dy * Math.cos(dir));
            if (proj > 0 && proj < 30 && perp < e.size) damageEnemy(st, e, s.dmg * 0.7);
          }
        }
        if (s.slow) {
          s.target.slow = 2.2;
          if (s.splash) for (const e of st.enemies) {
            if (e.dead || e === s.target) continue;
            if (Math.hypot(e.x - s.target.x, e.y - s.target.y) <= s.splash) { damageEnemy(st, e, s.dmg * 0.35); e.slow = 1.6; }
          }
        }
      }
      st.shots.splice(i, 1);
    }
  }
  // 清理
  for (let i = st.enemies.length - 1; i >= 0; i--) {
    const en = st.enemies[i];
    if (en.dead || en.leaked) {
      if (en.blockedBy) unblock(st, en);
      if (en.lureSrc) { const k = en.lureSrc.lured.indexOf(en); if (k >= 0) en.lureSrc.lured.splice(k, 1); }
      st.enemies.splice(i, 1);
    }
  }
  updateFx(st, dt);
  // 失败
  if (st.integrity <= 0 && st.waveState !== 'lost') {
    st.waveState = 'lost'; st.result = 'lose';
    st.events.push({ kind: 'end', result: 'lose' });
  }
}
function trapDmg(en) { return true; }
function updateFx(st, dt) {
  for (let i = st.fx.length - 1; i >= 0; i--) { st.fx[i].t += dt; if (st.fx[i].t >= st.fx[i].dur) st.fx.splice(i, 1); }
  for (let i = st.beams.length - 1; i >= 0; i--) { st.beams[i].t += dt; if (st.beams[i].t >= st.beams[i].dur) st.beams.splice(i, 1); }
}

function findTarget(st, t) {
  const half = 1.0; // ~57 度
  let best = null, bestScore = -1;
  const fx = Math.cos(t.facing), fy = Math.sin(t.facing);
  for (const en of st.enemies) {
    if (en.dead || en.leaked) continue;
    if (en.def.disguised && !en.revealed) continue;
    if (en.def.bossKind === 'latent' && en.phase === 0 && !en.revealed) continue;
    const dx = en.x - t.x, dy = en.y - t.y;
    const d = Math.hypot(dx, dy);
    if (d > t.stats.range || d < 0.001) continue;
    const dot = (dx / d) * fx + (dy / d) * fy;
    if (dot < Math.cos(half)) continue;
    // 越接近出口分越高
    let score = -en.progressScore;
    if (en.fly) score = -1000;
    if (!best || score > bestScore) { best = en; bestScore = score; }
  }
  return best;
}
function updateGround(st, en, dt) {
  const speed = en.speed * (en.slow > 0 ? 0.55 : 1) * (legacyFactor(st, en) ? 0.78 : 1);
  // 被蜜罐引诱
  if (en.lureT > 0 && en.lureTo) {
    if (en.lureTo.dead) { en.lureT = 0; en.lureTo = null; }
    else {
      en.lureT -= dt;
      const dx = en.lureTo.x - en.x, dy = en.lureTo.y - en.y, d = Math.hypot(dx, dy);
      if (d > 4.2) {
        const mv = speed * dt;
        en.x += dx / d * mv; en.y += dy / d * mv;
        en.heading = Math.atan2(dy, dx);
        return;
      }
      en.atkCd -= dt;
      if (en.atkCd <= 0) {
        en.atkCd = 1 / (en.def.atk || 1);
        damageTower(st, en.lureTo, en.def.dmg);
        st.fx.push({ kind: 'attack', x: en.lureTo.x, y: en.lureTo.y, z: en.lureTo.z + 4, t: 0, dur: 0.3, from: [en.x, en.y, en.z + 2] });
      }
      if (en.lureT <= 0) { en.lureTo = null; }
      return;
    }
  }
  if (en.state === 'blocked' && en.blockedBy) {
    // 攻塔
    en.atkCd -= dt;
    if (en.atkCd <= 0) {
      en.atkCd = 1 / (en.def.atk || 1);
      const t = en.blockedBy;
      if (t && !t.dead) {
        damageTower(st, t, en.def.dmg);
        st.fx.push({ kind: 'attack', x: t.x, y: t.y, z: t.z + 4, t: 0, dur: 0.3, from: [en.x, en.y, en.z + 2] });
      }
    }
    // 被摧毁则恢复
    if (!en.blockedBy || en.blockedBy.dead) unblock(st, en);
    return;
  }
  if (en.i >= en.wp.length) { leak(st, en); return; }
  const tgt = en.wp[en.i];
  const dx = tgt[0] - en.x, dy = tgt[1] - en.y;
  const d = Math.hypot(dx, dy);
  const mv = speed * dt;
  if (d <= mv) {
    en.x = tgt[0]; en.y = tgt[1];
    onReachNode(st, en);
    en.i++;
    if (en.i >= en.wp.length) { leak(st, en); return; }
  } else {
    en.x += dx / d * mv; en.y += dy / d * mv;
    en.heading = Math.atan2(dy, dx);
  }
  checkBlock(st, en);
}
function legacyFactor(st, en) {
  const a = en.path[en.i - 1], b = en.path[en.i];
  if (!a || !b) return false;
  const id = R.key(a, b);
  for (const e of st.G.edges) if (e.id === id) return e.legacy || st.down.has(id);
  return false;
}
function onReachNode(st, en) {
  const nid = en.path[en.i - 1];
  if (en.def.replicate && !en.replicated && nid !== en.entryNode) {
    en.replicated = true;
    if (!st.isolated.has(nid)) {
      const c = spawnEnemy(st, en.type, en.entry, en.exit);
      if (c) { c.x = en.x + 2.4; c.y = en.y + 1.2; c.replicated = true; c.path = en.path.slice(); c.i = en.i; c.wp = en.wp.map(p => [p[0] + 2.4, p[1] + 1.2]); }
    }
  }
  // 旧链路显形
  if (en.def.disguised && !en.revealed && legacyFactor(st, en)) reveal(st, en);
}
function reveal(st, en) {
  if (en.revealed) return;
  en.revealed = true;
  st.fx.push({ kind: 'reveal', x: en.x, y: en.y, z: en.z + 2, t: 0, dur: 0.6 });
}
function checkBlock(st, en) {
  if (en.state !== 'move' || en.fly) return;
  const a = en.path[en.i - 1], b = en.path[en.i];
  if (!a || !b) return;
  const A = st.G.nodeById.get(a), B = st.G.nodeById.get(b);
  const vx = B.x - A.x, vy = B.y - A.y, l2 = vx * vx + vy * vy || 1;
  const t = ((en.x - A.x) * vx + (en.y - A.y) * vy) / l2;
  const key = R.key(a, b);
  // 链路阻挡点
  const pts = st.G.pointsByEdge.get(key);
  if (pts) for (const p of pts) {
    const pk = p.key + '|' + en.id;
    if (en.passed.has(pk)) continue;
    if (t >= p.frac) {
      en.passed.add(pk);
      const tw = p.tower;
      if (tw && !tw.dead && (tw.type === 'firewall' || tw.type === 'honeypot') && tw.blocked.length < tw.stats.blockCap) {
        doBlock(st, en, tw, p.x, p.y);
        return;
      }
    }
  }
  // 节点上的防火墙拦截相邻链路
  const nextNode = b;
  for (const t of st.towers) {
    if (t.dead || t.type !== 'firewall' || !t.nodeId || t.nodeId !== nextNode) continue;
    if (Math.hypot(en.x - t.x, en.y - t.y) > 15) continue;
    const pk = 'node|' + t.id + '|' + en.id;
    if (en.passed.has(pk)) continue;
    en.passed.add(pk);
    if (t.blocked.length < t.stats.blockCap) { doBlock(st, en, t, t.x, t.y); return; }
  }
  if (en.def.disguised && !en.revealed) reveal(st, en);
}
function doBlock(st, en, tw, bx, by) {
  en.state = 'blocked';
  en.blockedBy = tw;
  tw.blocked.push(en);
  const dx = en.x - bx, dy = en.y - by, d = Math.hypot(dx, dy) || 1;
  en.x = bx + dx / d * 3.2; en.y = by + dy / d * 3.2;
  if (en.def.disguised) reveal(st, en);
  st.fx.push({ kind: 'block', x: bx, y: by, z: 0, t: 0, dur: 0.4 });
}
function updateRansom(st, en, dt) {
  if (en.state === 'blocked') return;
  en.atkCd -= dt;
  if (en.atkCd > 0) return;
  // 优先蜜罐
  let target = null, bestD = en.def.range;
  for (const t of st.towers) {
    if (t.dead) continue;
    const d = Math.hypot(t.x - en.x, t.y - en.y);
    if (d > en.def.range) continue;
    const score = (t.type === 'honeypot' ? -1000 : 0) + d;
    if (!target || score < bestD) { target = t; bestD = score; }
  }
  if (!target) { en.atkCd = 0.4; return; }
  en.atkCd = 1 / en.def.atk;
  damageTower(st, target, en.def.dmg);
  if (en.def.encrypt && target.def.cls !== 'lure') target.encryptT = Math.max(target.encryptT, 3.2);
  st.shots.push({ kind: 'crypt', x: en.x, y: en.y, z: en.z + 3, tx: target.x, ty: target.y, tz: target.z + 4, t: 0, dur: 0.22, dmg: 0 });
  st.fx.push({ kind: 'crypt', x: target.x, y: target.y, z: target.z + 4, t: 0, dur: 0.5 });
}
function packerShield(st, en) {
  for (const o of st.enemies) {
    if (o.dead || o === en) continue;
    if (o.shield > 0) continue;
    if (Math.hypot(o.x - en.x, o.y - en.y) <= en.def.shieldR) { o.shield = en.def.shieldHp; o.maxShield = en.def.shieldHp; o.shieldSrc = en.id; }
  }
}
function updateDivert(st, en, dt) {
  const dv = en.divert;
  if (!dv) { en.state = 'move'; return; }
  if (dv.kind === 'tower' && dv.tower.dead) { en.divert = null; en.state = 'move'; repathAll(st); return; }
  if (dv.kind === 'iso' && !st.isolators.includes(dv.iso)) { en.divert = null; en.state = 'move'; repathAll(st); return; }
  const dx = dv.x - en.x, dy = dv.y - en.y, d = Math.hypot(dx, dy);
  if (d > 5) {
    const mv = en.speed * dt;
    en.x += dx / d * mv; en.y += dy / d * mv;
    en.heading = Math.atan2(dy, dx);
    return;
  }
  en.atkCd -= dt;
  if (en.atkCd <= 0) {
    en.atkCd = 1 / (en.def.atk || 1);
    const dmg = en.def.dmg * (en.boss ? 2.2 : 1);
    if (dv.kind === 'tower') {
      damageTower(st, dv.tower, dmg);
      st.fx.push({ kind: 'slam', x: dv.tower.x, y: dv.tower.y, z: dv.tower.z + 4, t: 0, dur: 0.4 });
    } else {
      dv.iso.hp -= dmg;
      st.fx.push({ kind: 'slam', x: dv.x, y: dv.y, z: 2, t: 0, dur: 0.4 });
      if (dv.iso.hp <= 0) st.events.push({ kind: 'iso-broken', nodeId: dv.nodeId });
    }
  }
}
function updateFly(st, en, dt) {
  const fp = en.flyPath;
  if (!fp) { leak(st, en); return; }
  const total = Math.hypot(fp.b[0] - fp.a[0], fp.b[1] - fp.a[1]) || 1;
  fp.t += (en.speed * dt) / total;
  if (fp.t >= 1) { leak(st, en); return; }
  const t = fp.t, u = 1 - t;
  en.x = u * u * fp.a[0] + 2 * u * t * fp.c[0] + t * t * fp.b[0];
  en.y = u * u * fp.a[1] + 2 * u * t * fp.c[1] + t * t * fp.b[1];
  en.progressScore = -t * 1000;
}
function leak(st, en) {
  en.leaked = true;
  st.stats.leaked++;
  const dmg = en.boss ? 22 : 5 + Math.round(en.size * 0.8);
  st.integrity -= dmg;
  st.fx.push({ kind: 'leak', x: en.x, y: en.y, z: en.z, t: 0, dur: 0.8 });
  st.events.push({ kind: 'leak', enemy: en, dmg });
}

/* ---------- Boss ---------- */
function bossUpdate(st, en, dt) {
  if (!en.boss) return;
  const k = en.def.bossKind;
  en.abilityCd -= dt;
  const hpFrac = en.hp / en.maxHp;
  if (k === 'wankui') {
    if (hpFrac < 0.5 && en.phase === 0) {
      en.phase = 1;
      st.events.push({ kind: 'boss-phase', enemy: en, text: '万傀释放成群蠕虫' });
      for (let i = 0; i < 6; i++) {
        const c = spawnEnemy(st, 'worm', en.entry, en.exit);
        if (c) { c.x = en.x + (i - 3) * 4; c.y = en.y + 2; }
      }
    }
    if (en.abilityCd <= 0 && st.isolated.size) {
      en.abilityCd = 7;
      const nid = [...st.isolated][Math.floor(st.rng() * st.isolated.size)];
      const nd = st.G.nodeById.get(nid);
      st.fx.push({ kind: 'bossslam', x: nd.x, y: nd.y, z: 2, t: 0, dur: 0.9 });
      for (const t of st.towers) if (!t.dead && t.nodeId === nid) damageTower(st, t, 90);
      for (const iso of st.isolators) if (iso.nodeId === nid) iso.hp -= 160;
      st.events.push({ kind: 'boss-atk', enemy: en, text: '万傀洪峰冲击 ' + nd.name });
    }
  } else if (k === 'mirage') {
    if (hpFrac < 0.5 && en.phase === 0) {
      en.phase = 1;
      st.events.push({ kind: 'boss-phase', enemy: en, text: '蜃楼发动路由风暴' });
      for (const t of st.towers) {
        if (t.dead) continue;
        if (Math.hypot(t.x - en.x, t.y - en.y) < 60) { t.shield = 0; t.maxShield = 0; damageTower(st, t, 30); }
      }
    }
    if (en.abilityCd <= 0) {
      en.abilityCd = 9;
      // 在前方链路制造黑洞
      const a = en.path[Math.max(0, en.i - 1)], b = en.path[en.i];
      if (a && b) {
        const id = R.key(a, b);
        if (!st.black.has(id)) {
          st.black.add(id);
          st.events.push({ kind: 'blackhole', edgeId: id, enemy: en, text: '蜃楼制造路由黑洞' });
          setTimeout(() => { }, 0);
          st._bh = st._bh || [];
          st._bh.push({ id, t: 9 });
          recompute(st, false);
        }
      }
    }
  } else if (k === 'latent') {
    if (en.phase === 0 && en.revealed) { en.phase = 1; st.events.push({ kind: 'boss-phase', enemy: en, text: '蛰影提权：护甲强化' }); en.def.armor = 0.4; }
    if (en.phase === 1 && hpFrac < 0.55) {
      en.phase = 2;
      st.events.push({ kind: 'boss-phase', enemy: en, text: '蛰影破坏阶段：锁死运维环' });
      for (let i = 0; i < 4; i++) {
        const c = spawnEnemy(st, 'trojan', en.entry, en.exit);
        if (c) { c.x = en.x + (i - 2) * 5; c.y = en.y + 2; }
      }
      // 锁死前方若干节点
      let n = 0;
      for (let k2 = en.i; k2 < en.path.length && n < 2; k2++, n++) {
        const nid = en.path[k2];
        if (st.G.nodeById.get(nid).sw) { st.locked.add(nid); st.events.push({ kind: 'lock', nodeId: nid }); }
      }
      recompute(st, false);
    }
    if (en.phase === 0) en.revealed = false;
  }
}

/* 供视图/演示使用 */
TD.Sim = {
  STEP, create, step, spawnEnemy, placeTower, removeTower, sellTower, upgradeTower,
  useIsolator, useDowngrade, useRestore, castSkill, canChange, recompute, repathAll,
  damageEnemy, damageTower, towerStats, prefFor, bossUpdate, prepGraph,
  findTarget, leak
};
})(typeof window !== 'undefined' ? window : globalThis);
