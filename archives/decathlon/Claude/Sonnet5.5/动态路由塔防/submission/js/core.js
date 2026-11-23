/* 游戏核心：地图解析、路径场、改道、部署/升级/撤下、道具、波次 */
(function (G) {
'use strict';
var K = G.K = { OBS: 0, ROAD: 1, OLD: 2, NODE: 3, PLAT: 4, IN: 5, OUT: 6, TUN: 7 };
var DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
G.DX = DX; G.DY = DY;
var BLK_ISO = 1, BLK_HOLE = 2, BLK_LOCK = 4;
G.BLK = { ISO: BLK_ISO, HOLE: BLK_HOLE, LOCK: BLK_LOCK };

function Heap() { this.a = []; }
Heap.prototype.push = function (d, i) {
  var a = this.a; a.push([d, i]); var n = a.length - 1;
  while (n > 0) { var p = (n - 1) >> 1; if (a[p][0] <= a[n][0]) break; var t = a[p]; a[p] = a[n]; a[n] = t; n = p; }
};
Heap.prototype.pop = function () {
  var a = this.a, top = a[0], last = a.pop();
  if (a.length) {
    a[0] = last; var n = 0, L = a.length;
    for (;;) {
      var l = 2 * n + 1, r = l + 1, m = n;
      if (l < L && a[l][0] < a[m][0]) m = l;
      if (r < L && a[r][0] < a[m][0]) m = r;
      if (m === n) break; var t = a[m]; a[m] = a[n]; a[n] = t; n = m;
    }
  }
  return top;
};
Heap.prototype.size = function () { return this.a.length; };

function Game(mapIndex, opts) {
  opts = opts || {};
  this.mapIndex = mapIndex;
  var map = this.map = G.MAPS[mapIndex];
  var rows = map.rows;
  this.H = rows.length; this.W = rows[0].length; var N = this.N = this.W * this.H;
  this.kind = new Uint8Array(N); this.sub = new Array(N);
  this.blocked = new Uint8Array(N); this.tempOld = new Float32Array(N); this.nodeCd = new Float32Array(N);
  this.towerAt = new Array(N).fill(null); this.isoAt = new Array(N).fill(null);
  this.zoneAt = new Array(N).fill(null);
  this.entrances = []; this.exits = {}; this.nodes = [];
  for (var y = 0; y < this.H; y++) for (var x = 0; x < this.W; x++) {
    var ch = rows[y][x], i = y * this.W + x, k = K.OBS;
    if (ch === 'r') k = K.ROAD; else if (ch === 'o') k = K.OLD; else if (ch === 't') k = K.TUN; else if (ch === 'N') { k = K.NODE; this.nodes.push(i); }
    else if (ch === 'P') k = K.PLAT;
    else if (ch === 'A' || ch === 'B' || ch === 'C') {
      k = K.IN; var ed = map.entrances[ch];
      this.entrances.push({ id: ch, x: x, y: y, idx: i, name: ed.name, color: ed.color, route: [], exit: null, cost: 0 });
    } else if (ch === '1' || ch === '2') { k = K.OUT; this.exits[ch] = { id: ch, x: x, y: y, idx: i, name: map.exits[ch].name }; }
    this.kind[i] = k; this.sub[i] = ch;
  }
  this.entrances.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
  var zs = map.zones || [];
  for (var zi = 0; zi < zs.length; zi++) {
    var z = zs[zi];
    for (var yy = z.y0; yy <= z.y1; yy++) for (var xx = z.x0; xx <= z.x1; xx++) {
      if (xx >= 0 && yy >= 0 && xx < this.W && yy < this.H) { var ii = yy * this.W + xx; if (!this.zoneAt[ii]) this.zoneAt[ii] = z; }
    }
  }
  // 战斗状态
  this.time = 0; this.speed = 1; this.paused = false; this.over = false; this.win = false;
  this.diff = (G.settings && G.settings.difficulty) || 0; var dd = G.DIFF[this.diff] || G.DIFF[0]; this.compute = Math.round(map.start.c * dd.res); this.intel = Math.round(map.start.i * dd.res); this.core = 100; this.coreMax = 100;
  this.enemies = []; this.towers = []; this.projs = []; this.hazards = []; this.isolators = [];
  this.uid = 1; this.listeners = []; this.topoVersion = 0;
  this.waveIdx = 0; this.nextWaveIn = 24; this.spawnQ = []; this.waveAlive = {}; this.waveSpawnLeft = {}; this.waveStartTime = 0;
  this.itemCd = { isolator: 0, downgrade: 0, restore: 0 };
  this.seen = {}; this.income = map.income || 2.6; this.incomeAcc = 0; this.autoWave = true;
  this.stats = { kills: 0, killsBy: {}, leaksBy: {}, leaks: 0, built: 0, destroyed: 0, sold: 0, reroutes: 0, intelGain: 0, compGain: 0, compSpent: 0, intelSpent: 0, dmg: 0, healed: 0, bypass: 0, itemsUsed: 0, flawless: true, maxLeak: 0 };
  this.sealMsgTile = null;
  this.field = null; this.routes = {};
  this.refreshField();
  this.logs = [];
}
G.Game = Game;
var P = Game.prototype;

P.on = function (fn) { this.listeners.push(fn); };
P.emit = function (type, data) { for (var i = 0; i < this.listeners.length; i++) this.listeners[i](type, data || {}); };
P.log = function (text, lvl) {
  var rec = { t: this.time, text: text, lvl: lvl || 'info' };
  this.logs.push(rec); if (this.logs.length > 80) this.logs.shift();
  this.emit('log', rec);
};
P.idx = function (x, y) { return y * this.W + x; };
P.inb = function (x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; };
P.tx = function (i) { return i % this.W; };
P.ty = function (i) { return (i / this.W) | 0; };
P.isRoadKind = function (k) { return k === K.ROAD || k === K.OLD || k === K.NODE || k === K.IN || k === K.OUT || k === K.TUN; };
P.nodeName = function (i) { var n = this.map.nodeNames[this.tx(i) + ',' + this.ty(i)]; return n || ('节点 ' + this.tx(i) + ',' + this.ty(i)); };
P.placeName = function (i) {
  var k = this.kind[i];
  if (k === K.NODE) return this.nodeName(i);
  if (k === K.IN) { var e = this.entranceAt(i); return '入口 ' + e.id + '「' + e.name + '」'; }
  if (k === K.OUT) return '出口「' + this.exits[this.sub[i]].name + '」';
  var z = this.zoneAt[i]; return (z ? z.name : '链路') + ' (' + this.tx(i) + ',' + this.ty(i) + ')';
};
P.entranceAt = function (i) { for (var a = 0; a < this.entrances.length; a++) if (this.entrances[a].idx === i) return this.entrances[a]; return null; };
P.isOld = function (i) { return this.kind[i] === K.OLD || this.tempOld[i] > 0; };
P.tileCost = function (i, extraOld) { return (this.isOld(i) || (extraOld && extraOld[i])) ? 1 / G.OLD_SPEED : 1; };
P.passable = function (i, extraBlock, unblock) {
  if (!this.isRoadKind(this.kind[i])) return false;
  var bl = this.blocked[i]; if (unblock && unblock[i]) bl &= ~BLK_ISO;
  if (bl) return false;
  if (extraBlock && extraBlock[i]) return false;
  return true;
};

// ---------- 路径场 ----------
// extra: {block:[idx...], old:[idx...]}
P.computeField = function (extra) {
  var N = this.N, W = this.W, H = this.H, dist = new Float64Array(N).fill(Infinity);
  var eb = null, eo = null, eu = null, i, k;
  if (extra && extra.unblock) { eu = new Uint8Array(N); for (k = 0; k < extra.unblock.length; k++) eu[extra.unblock[k]] = 1; }
  if (extra && extra.block) { eb = new Uint8Array(N); for (k = 0; k < extra.block.length; k++) eb[extra.block[k]] = 1; }
  if (extra && extra.old) { eo = new Uint8Array(N); for (k = 0; k < extra.old.length; k++) eo[extra.old[k]] = 1; }
  var heap = new Heap();
  for (var id in this.exits) { var ex = this.exits[id]; dist[ex.idx] = 0; heap.push(0, ex.idx); }
  while (heap.size()) {
    var top = heap.pop(), d = top[0]; i = top[1];
    if (d > dist[i]) continue;
    var x = i % W, y = (i / W) | 0, ci = this.tileCost(i, eo);
    for (var dd = 0; dd < 4; dd++) {
      var nx = x + DX[dd], ny = y + DY[dd];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      var j = ny * W + nx;
      if (!this.passable(j, eb, eu)) continue;
      var nd = d + (ci + this.tileCost(j, eo)) * 0.5;
      if (nd < dist[j] - 1e-9) { dist[j] = nd; heap.push(nd, j); }
    }
  }
  // 被阻断的格子（敌人正站在里面时用于离开）
  var odist = new Float64Array(dist);
  for (i = 0; i < N; i++) {
    if (!this.isRoadKind(this.kind[i]) || dist[i] < Infinity) continue;
    var bx = i % W, by = (i / W) | 0, best = Infinity;
    for (var q = 0; q < 4; q++) {
      var ax = bx + DX[q], ay = by + DY[q]; if (ax < 0 || ay < 0 || ax >= W || ay >= H) continue;
      var a = ay * W + ax; if (dist[a] < best) best = dist[a] + 1;
    }
    odist[i] = best;
  }
  return { dist: dist, odist: odist, eb: eb, eo: eo };
};
P.edgeCost = function (a, b, f) {
  var eo = f ? f.eo : null; return (this.tileCost(a, eo) + this.tileCost(b, eo)) * 0.5;
};
// 从 cur 走向的下一格（梯度下降）
P.nextStep = function (cur, f) {
  var W = this.W, H = this.H, x = cur % W, y = (cur / W) | 0, best = -1, bv = Infinity;
  for (var d = 0; d < 4; d++) {
    var nx = x + DX[d], ny = y + DY[d]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    var j = ny * W + nx; var dj = f.dist[j]; if (dj === Infinity) continue;
    var v = dj + this.edgeCost(cur, j, f);
    if (v < bv - 1e-9) { bv = v; best = j; }
  }
  return best;
};
P.followRoute = function (start, f) {
  var tiles = [start], cur = start, guard = 0;
  while (guard++ < this.N) {
    if (this.kind[cur] === K.OUT) break;
    var n = this.nextStep(cur, f); if (n < 0) break;
    tiles.push(n); cur = n;
  }
  return tiles;
};
P.refreshField = function () {
  this.field = this.computeField(null);
  this.routes = {};
  for (var a = 0; a < this.entrances.length; a++) {
    var en = this.entrances[a], t = this.followRoute(en.idx, this.field);
    var last = t[t.length - 1];
    en.route = t; en.exit = this.kind[last] === K.OUT ? this.sub[last] : null; en.cost = this.field.dist[en.idx];
    this.routes[en.id] = en;
  }
};
function sameRoute(a, b) { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
P.routeZones = function (tiles) {
  var out = [];
  for (var i = 0; i < tiles.length; i++) {
    var z = this.zoneAt[tiles[i]]; var nm = z ? z.name : null;
    if (nm && out.indexOf(nm) < 0) out.push(nm);
  }
  return out;
};
// 一个敌人能否在给定场下继续前进
P.enemyCanProceed = function (e, f) {
  if (e.air || e.dead) return true;
  var cur = e.cur, nxt = e.nxt;
  if (nxt >= 0 && f.dist[nxt] < Infinity) return true;
  if (f.dist[cur] < Infinity) return true;
  return f.odist[cur] < Infinity || (nxt >= 0 && f.odist[nxt] < Infinity);
};
// 预览：假设再阻断 block[] 格、并把 old[] 格变为旧链路
P.preview = function (extra) {
  var f = this.computeField(extra), res = { ok: true, sealed: [], stranded: 0, routes: {}, changed: {}, field: f, anyChanged: false, extra: extra };
  for (var a = 0; a < this.entrances.length; a++) {
    var en = this.entrances[a], t = this.followRoute(en.idx, f), last = t[t.length - 1];
    var reach = f.dist[en.idx] < Infinity && this.kind[last] === K.OUT;
    var r = { tiles: t, exit: reach ? this.sub[last] : null, cost: f.dist[en.idx], reach: reach };
    res.routes[en.id] = r;
    if (!reach) { res.sealed.push(en.id); res.ok = false; }
    var ch = !sameRoute(t, en.route);
    r.changed = ch; res.changed[en.id] = ch; if (ch) res.anyChanged = true;
    r.deltaCost = r.cost - en.cost; r.zones = this.routeZones(t);
  }
  for (var i = 0; i < this.enemies.length; i++) {
    var e = this.enemies[i]; if (e.air || e.dead) continue;
    if (!this.enemyCanProceed(e, f)) res.stranded++;
  }
  if (res.stranded > 0) res.ok = false;
  return res;
};
P.sealReason = function (pv) {
  if (pv.sealed.length) {
    var en = this.routes[pv.sealed[0]];
    return '入口 ' + en.id + '「' + en.name + '」将被封死——至少要保留一条通往出口的道路';
  }
  if (pv.stranded) return '场上有 ' + pv.stranded + ' 个敌人将无路可走';
  return '';
};
// 通行状态改变：重新收敛
P.topologyChanged = function (reason, tiles, quiet) {
  var oldRoutes = {};
  for (var a = 0; a < this.entrances.length; a++) oldRoutes[this.entrances[a].id] = this.entrances[a].route;
  this.refreshField(); this.topoVersion++; this.goalCache = {};
  var changed = [];
  for (a = 0; a < this.entrances.length; a++) { var en = this.entrances[a]; if (!sameRoute(oldRoutes[en.id], en.route)) changed.push(en.id); }
  for (var i = 0; i < this.enemies.length; i++) { var e = this.enemies[i]; if (!e.air && !e.dead) this.reorient(e); }
  if (changed.length && !quiet) this.stats.reroutes++;
  this.emit('reroute', { reason: reason, tiles: tiles || [], changed: changed, routes: this.routes, oldRoutes: oldRoutes });
  return changed;
};
// 敌人从当前位置重新寻路：继续前进或掉头
P.reorient = function (e, force) {
  if (e.air || e.dead) return;
  var f = this.fieldFor(e);
  if (e.nxt < 0) { e.nxt = this.nextStep(e.cur, f); e.t = 0; return; }
  var c = this.edgeCost(e.cur, e.nxt, f);
  var cont = (1 - e.t) * c + f.dist[e.nxt];
  var back = e.t * c + f.dist[e.cur];
  if (cont === Infinity) { // 前方已不可达：能掉头就掉头（含站在被隔离格里、前方是死胡同的情形）
    if (back < Infinity || f.odist[e.cur] < Infinity) { var t0 = e.cur; e.cur = e.nxt; e.nxt = t0; e.t = 1 - e.t; e.turned = 1.0; this.emit('turn', { e: e }); }
    return;
  }
  if (back < cont - 0.25 || (cont === Infinity && back < Infinity)) {
    var t = e.cur; e.cur = e.nxt; e.nxt = t; e.t = 1 - e.t;
    e.turned = 1.0;
    this.emit('turn', { e: e });
  } else if (e.t < 0.02 && !force) {
    // 刚到达某格：重新选择下一格
    var n = this.nextStep(e.cur, f); if (n >= 0 && n !== e.nxt) { e.nxt = n; }
  }
};
P.fieldFor = function (e) {
  if (e.mode === 'strike' && e.goal >= 0) return this.goalField(e.goal);
  return this.field;
};
P.goalField = function (goal) {
  if (!this.goalCache) this.goalCache = {};
  var f = this.goalCache[goal]; if (f) return f;
  var N = this.N, W = this.W, H = this.H, dist = new Float64Array(N).fill(Infinity), heap = new Heap();
  dist[goal] = 0; heap.push(0, goal);
  while (heap.size()) {
    var top = heap.pop(), d = top[0], i = top[1]; if (d > dist[i]) continue;
    var x = i % W, y = (i / W) | 0, ci = this.tileCost(i);
    for (var dd = 0; dd < 4; dd++) {
      var nx = x + DX[dd], ny = y + DY[dd]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      var j = ny * W + nx; if (!this.passable(j)) continue;
      var nd = d + (ci + this.tileCost(j)) * 0.5; if (nd < dist[j] - 1e-9) { dist[j] = nd; heap.push(nd, j); }
    }
  }
  var odist = new Float64Array(dist);
  f = { dist: dist, odist: odist, eb: null, eo: null }; this.goalCache[goal] = f; return f;
};

// ---------- 部署判定 ----------
P.placeClass = function (i) {
  var k = this.kind[i];
  if (k === K.ROAD || k === K.OLD || k === K.TUN) return 'road';
  if (k === K.NODE) return 'node';
  if (k === K.PLAT) return 'plat';
  return 'none';
};
P.towerCost = function (kind, i) {
  var d = G.TOWERS[kind], c = d.cost, it = 0;
  if (i != null && this.kind[i] === K.NODE) it = d.nodeIntel || 0;
  return { c: c, i: it };
};
P.canPlace = function (kind, x, y) {
  var d = G.TOWERS[kind], res = { ok: false, msg: '', tiles: [], afford: true, isolates: false, pv: null };
  if (!this.inb(x, y)) { res.msg = '超出战场范围'; return res; }
  var i = this.idx(x, y), pc = this.placeClass(i);
  res.idx = i;
  if (this.kind[i] === K.IN || this.kind[i] === K.OUT) { res.msg = '入口与出口不能部署设备'; return res; }
  if (pc === 'none') { res.msg = '障碍或空白基板不能部署'; return res; }
  if (this.towerAt[i] || this.isoAt[i]) { res.msg = '该位置已有设备'; return res; }
  if (d.place.indexOf(pc) < 0) {
    var need = { road: '链路', node: '交换节点', plat: '设备平台' };
    res.msg = d.name + '只能部署在' + d.place.map(function (p) { return need[p]; }).join('或') + '上'; return res;
  }
  var cost = this.towerCost(kind, i);
  res.cost = cost;
  if (this.compute < cost.c) { res.afford = false; res.msg = '算力不足（需要 ' + cost.c + '）'; }
  else if (this.intel < cost.i) { res.afford = false; res.msg = '情报不足（隔离节点需要 ' + cost.i + ' 情报）'; }
  if (pc === 'node') {
    res.isolates = true;
    if (this.nodeCd[i] > 0) { res.msg = '节点正在重启，' + Math.ceil(this.nodeCd[i]) + ' 秒后可再次隔离'; res.tiles = [i]; res.cd = true; return res; }
    var pv = res.pv = this.preview({ block: [i] });
    if (!pv.ok) { res.msg = '无法隔离：' + this.sealReason(pv); res.tiles = [i]; res.sealed = true; return res; }
  }
  if (!res.afford) return res;
  res.ok = true; return res;
};
P.spend = function (c, it) {
  this.compute -= c; this.intel -= it; this.stats.compSpent += c; this.stats.intelSpent += it;
};
P.addCompute = function (v) { this.compute += v; this.stats.compGain += v; };
P.addIntel = function (v, x, y) { this.intel += v; this.stats.intelGain += v; this.emit('intelGain', { v: v, x: x, y: y }); };

P.makeTower = function (kind, x, y, level, branch, face) {
  var st = G.towerStats(kind, level || 1, branch);
  var tw = { id: this.uid++, kind: kind, x: x, y: y, idx: this.idx(x, y), level: level || 1, branch: branch || null,
    hp: st.hp, maxhp: st.hp, shield: 0, shieldT: 0, encT: 0, face: face == null ? 0 : face, cd: 0.4, skillCd: 0, hardenT: 0, trapT: 0,
    blocked: [], invC: 0, invI: 0, holdT: 0, engaged: 0, born: this.time, shieldBreakT: 0, healAcc: 0, healFx: 0, onNode: this.kind[this.idx(x, y)] === K.NODE, dead: false };
  return tw;
};
P.installTower = function (tw) {
  this.towers.push(tw); this.towerAt[tw.idx] = tw;
  if (tw.onNode) {
    this.blocked[tw.idx] |= BLK_ISO;
  }
};
P.deploy = function (kind, x, y, face) {
  var r = this.canPlace(kind, x, y);
  if (!r.ok) return r;
  var tw = this.makeTower(kind, x, y, 1, null, face);
  this.spend(r.cost.c, r.cost.i); tw.invC = r.cost.c; tw.invI = r.cost.i;
  this.installTower(tw); this.stats.built++;
  this.emit('built', { tw: tw });
  var d = G.TOWERS[kind];
  if (tw.onNode) {
    this.log('已隔离「' + this.nodeName(tw.idx) + '」（' + d.name + '），道路在此截断。', 'ok');
    this.emit('isolate', { idx: tw.idx, tw: tw });
    this.topologyChanged('isolate', [tw.idx]);
  } else {
    this.log('已部署 ' + d.name + ' @ ' + this.placeName(tw.idx), 'info');
  }
  return { ok: true, tw: tw };
};
P.placeFree = function (kind, x, y, level, branch, face) {
  var tw = this.makeTower(kind, x, y, level || 1, branch, face);
  this.installTower(tw); this.emit('built', { tw: tw, free: true });
  if (tw.onNode) { this.emit('isolate', { idx: tw.idx, tw: tw, quiet: true }); this.topologyChanged('isolate', [tw.idx], true); }
  return tw;
};
P.upgradeInfo = function (tw) {
  var d = G.TOWERS[tw.kind];
  if (tw.level >= 2) return { max: true };
  var info = { max: false, branchRequired: !!d.branches, options: [] };
  if (d.branches) {
    ['A', 'B'].forEach(function (b) { var br = d.branches[b]; info.options.push({ branch: b, c: br.cost, i: br.intel, name: br.name, desc: br.desc }); });
  } else info.options.push({ branch: null, c: d.lv[1].cost, i: 0, name: d.lv[1].name });
  return info;
};
P.upgrade = function (tw, branch) {
  var d = G.TOWERS[tw.kind];
  if (tw.dead || tw.level >= 2) return { ok: false, msg: '已是最高等级' };
  var c, it = 0;
  if (d.branches) { if (!branch || !d.branches[branch]) return { ok: false, msg: '请选择升级分支' }; c = d.branches[branch].cost; it = d.branches[branch].intel; }
  else c = d.lv[1].cost;
  if (this.compute < c) return { ok: false, msg: '算力不足（需要 ' + c + '）' };
  if (this.intel < it) return { ok: false, msg: '情报不足（分支需要 ' + it + ' 情报）' };
  this.spend(c, it); tw.invC += c; tw.invI += it;
  var ratio = tw.hp / tw.maxhp;
  tw.level = 2; tw.branch = d.branches ? branch : null;
  var st = G.towerStats(tw.kind, tw.level, tw.branch);
  tw.maxhp = st.hp; tw.hp = Math.max(tw.hp, st.hp * ratio * 0.9 + st.hp * 0.1);
  this.emit('upgraded', { tw: tw });
  this.log(d.name + ' 升级为 ' + G.towerTitle(tw), 'ok');
  return { ok: true };
};
P.sellValue = function (tw) { return { c: Math.floor(tw.invC * G.ISO_REFUND_C), i: tw.onNode ? Math.floor(tw.invI * G.ISO_REFUND_I) : 0 }; };
P.sell = function (tw) {
  if (tw.dead) return;
  var v = this.sellValue(tw);
  this.addCompute(v.c); if (v.i) this.addIntel(v.i, tw.x, tw.y);
  this.stats.sold++;
  this.removeTower(tw, 'sold');
  this.log('已撤下 ' + G.TOWERS[tw.kind].name + '，返还算力 ' + v.c + (v.i ? ' / 情报 ' + v.i : '') + '。', 'info');
};
P.removeTower = function (tw, why) {
  if (tw.dead) return; tw.dead = true;
  var i = this.towers.indexOf(tw); if (i >= 0) this.towers.splice(i, 1);
  this.towerAt[tw.idx] = null;
  for (var k = 0; k < this.enemies.length; k++) { var e = this.enemies[k]; if (e.bl === tw) this.releaseBlock(e); if (e.lure === tw) e.lure = null; }
  tw.blocked.length = 0;
  this.emit(why === 'sold' ? 'sold' : 'towerDead', { tw: tw, why: why });
  if (tw.onNode) {
    this.blocked[tw.idx] &= ~BLK_ISO;
    this.nodeCd[tw.idx] = G.NODE_CD;
    this.emit('bypass', { idx: tw.idx, why: why });
    this.stats.bypass++;
    this.log('「' + this.nodeName(tw.idx) + '」恢复直通（' + (why === 'sold' ? '已撤下' : '设备被摧毁') + '），再次隔离需等待 ' + G.NODE_CD + ' 秒。', why === 'sold' ? 'info' : 'warn');
    this.topologyChanged('bypass', [tw.idx]);
  }
};
P.releaseBlock = function (e) {
  if (!e.bl) return;
  var tw = e.bl, i = tw.blocked.indexOf(e); if (i >= 0) tw.blocked.splice(i, 1);
  e.bl = null; e.passTile = -2;
  this.reorient(e, true);
};

// ---------- 道具 ----------
P.itemReady = function (id) { return this.itemCd[id] <= 0; };
P.canUseItem = function (id, x, y) {
  var it = G.ITEMS[id], res = { ok: false, msg: '', tiles: [], pv: null };
  if (this.itemCd[id] > 0) { res.msg = it.name + ' 冷却中（' + Math.ceil(this.itemCd[id]) + ' 秒）'; return res; }
  if (it.res === 'intel' && this.intel < it.cost) { res.msg = '情报不足（需要 ' + it.cost + '）'; res.afford = false; return res; }
  if (it.res === 'compute' && this.compute < it.cost) { res.msg = '算力不足（需要 ' + it.cost + '）'; res.afford = false; return res; }
  if (!this.inb(x, y)) { res.msg = '超出战场范围'; return res; }
  var i = this.idx(x, y); res.idx = i;
  if (id === 'isolator') {
    if (this.kind[i] !== K.NODE) { res.msg = '应急隔离器只能插入交换节点'; return res; }
    if (this.towerAt[i] || this.isoAt[i]) { res.msg = '该节点已被隔离'; return res; }
    if (this.nodeCd[i] > 0) { res.msg = '节点正在重启，' + Math.ceil(this.nodeCd[i]) + ' 秒后可再次隔离'; res.tiles = [i]; return res; }
    var pv = res.pv = this.preview({ block: [i] });
    if (!pv.ok) { res.msg = '无法隔离：' + this.sealReason(pv); res.tiles = [i]; res.sealed = true; return res; }
    res.ok = true; return res;
  }
  if (id === 'downgrade') {
    var tiles = this.downgradeTiles(x, y);
    if (!tiles.length) { res.msg = '范围内没有可降级的链路'; return res; }
    res.tiles = tiles; res.pv = this.preview({ old: tiles });
    res.ok = true; return res;
  }
  if (id === 'restore') {
    var tw = this.towerAt[i];
    if (!tw) { res.msg = '请选择一座己方设备'; return res; }
    if (tw.hp >= tw.maxhp && tw.encT <= 0) { res.msg = '该设备状态良好，无需还原'; return res; }
    res.ok = true; res.tw = tw; return res;
  }
  return res;
};
P.downgradeTiles = function (cx, cy) {
  var r = G.ITEMS.downgrade.radius, out = [];
  for (var y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (var x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
    if (!this.inb(x, y)) continue; var i = this.idx(x, y), k = this.kind[i];
    if (k !== K.ROAD && k !== K.TUN && k !== K.NODE && k !== K.IN) continue;
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > r * r + 0.01) continue;
    out.push(i);
  }
  return out;
};
P.useItem = function (id, x, y) {
  var r = this.canUseItem(id, x, y); if (!r.ok) return r;
  var it = G.ITEMS[id], i = r.idx;
  if (it.res === 'intel') this.spend(0, it.cost); else this.spend(it.cost, 0);
  this.itemCd[id] = it.cd; this.stats.itemsUsed++;
  if (id === 'isolator') {
    var iso = { id: this.uid++, idx: i, x: this.tx(i), y: this.ty(i), hp: it.hp, maxhp: it.hp, ttl: it.ttl, ttlMax: it.ttl, dead: false, isIso: true };
    this.isoAt[i] = iso; this.isolators.push(iso); this.blocked[i] |= BLK_ISO;
    this.emit('item', { id: id, x: iso.x, y: iso.y, iso: iso });
    this.emit('isolate', { idx: i, iso: iso });
    this.log('应急隔离器已插入「' + this.nodeName(i) + '」，有效期 ' + it.ttl + ' 秒。', 'ok');
    this.topologyChanged('isolate', [i]);
  } else if (id === 'downgrade') {
    for (var k = 0; k < r.tiles.length; k++) this.tempOld[r.tiles[k]] = it.ttl;
    this.emit('item', { id: id, x: x, y: y, tiles: r.tiles });
    this.log('协议降级已生效：该片链路暂时使用旧协议（' + it.ttl + ' 秒），路线重新评估。', 'ok');
    this.topologyChanged('downgrade', r.tiles);
  } else if (id === 'restore') {
    var tw = r.tw; tw.hp = Math.min(tw.maxhp, tw.hp + tw.maxhp * it.heal); tw.encT = 0;
    this.emit('item', { id: id, x: tw.x, y: tw.y, tw: tw });
    this.emit('unencrypt', { tw: tw });
    this.log('备份还原：' + G.towerTitle(tw) + ' 恢复生命并解除加密。', 'ok');
  }
  return { ok: true };
};
P.removeIsolator = function (iso, why) {
  if (iso.dead) return; iso.dead = true;
  var k = this.isolators.indexOf(iso); if (k >= 0) this.isolators.splice(k, 1);
  this.isoAt[iso.idx] = null; this.blocked[iso.idx] &= ~BLK_ISO; this.nodeCd[iso.idx] = G.NODE_CD;
  this.emit('isoGone', { iso: iso, why: why }); this.emit('bypass', { idx: iso.idx, why: why });
  this.stats.bypass++;
  this.log('应急隔离器' + (why === 'expire' ? '到期' : '被冲毁') + '，「' + this.nodeName(iso.idx) + '」恢复直通。', 'warn');
  this.topologyChanged('bypass', [iso.idx]);
};

// ---------- 技能 ----------
P.canSkill = function (tw) {
  if (tw.dead) return { ok: false, msg: '' };
  var d = G.TOWERS[tw.kind];
  var has = tw.kind === 'firewall' || tw.kind === 'honeypot' || tw.kind === 'repair';
  if (!has) return { ok: false, msg: '该设备没有主动技能' };
  if (tw.encT > 0) return { ok: false, msg: '设备已被加密，无法释放技能' };
  if (tw.skillCd > 0) return { ok: false, msg: '技能冷却中（' + Math.ceil(tw.skillCd) + ' 秒）' };
  return { ok: true };
};
P.useSkill = function (tw) {
  var c = this.canSkill(tw); if (!c.ok) return c;
  var st = G.towerStats(tw.kind, tw.level, tw.branch), d = G.TOWERS[tw.kind];
  if (tw.kind === 'firewall') {
    tw.hardenT = d.skill.dur; tw.skillCd = d.skill.cd;
    this.emit('skill', { tw: tw, kind: 'harden' });
    this.log('防火墙启用「硬化策略」。', 'info');
  } else if (tw.kind === 'honeypot') {
    var n = 0, R = st.lure;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i]; if (e.air || e.dead || e.def.boss) continue;
      if ((e.x - tw.x) * (e.x - tw.x) + (e.y - tw.y) * (e.y - tw.y) <= R * R) { e.rootT = st.trapDur; e.trapMark = st.trapDur; n++; this.emit('trapped', { e: e, tw: tw }); }
    }
    tw.skillCd = st.trapCd; this.emit('skill', { tw: tw, kind: 'trap', n: n });
    this.log('蜜罐释放「诱捕」，困住 ' + n + ' 个目标。', 'info');
    if (st.blast) this.honeyBlast(tw, st);
  } else if (tw.kind === 'repair') {
    var cnt = 0, R2 = st.skillR;
    for (var k = 0; k < this.towers.length; k++) {
      var o = this.towers[k]; if (o === tw && false) continue;
      if ((o.x - tw.x) * (o.x - tw.x) + (o.y - tw.y) * (o.y - tw.y) <= R2 * R2) {
        if (o.shieldBreakT > 0) continue;
        o.shield = Math.max(o.shield, st.skillShield); o.shieldT = 10; o.encT = 0; cnt++; this.emit('shieldOn', { tw: o, src: tw }); this.emit('unencrypt', { tw: o });
      }
    }
    tw.skillCd = st.skillCd; this.emit('skill', { tw: tw, kind: 'switch', n: cnt });
    this.log('冗余切换：为 ' + cnt + ' 座设备提供护盾并解除加密。', 'ok');
  }
  return { ok: true };
};

// ---------- 波次 ----------
P.forecast = function (n) {
  var w = this.map.waves[n]; if (!w) return null;
  var res = {};
  for (var i = 0; i < this.entrances.length; i++) res[this.entrances[i].id] = {};
  w.forEach(function (gp) { res[gp.ent] = res[gp.ent] || {}; res[gp.ent][gp.type] = (res[gp.ent][gp.type] || 0) + gp.n; });
  return res;
};
P.isRush = function (n) { return this.map.rushWave === n; };
P.startNextWave = function () {
  if (this.waveIdx >= this.map.waves.length || this.over) return false;
  var n = this.waveIdx, w = this.map.waves[n], list = [], hpm = G.hpScale(this.map, n + 1) * (G.DIFF[this.diff] || G.DIFF[0]).hp;
  w.forEach(function (gp) {
    for (var i = 0; i < gp.n; i++) list.push({ t: this.time + gp.delay + i * gp.gap, type: gp.type, ent: gp.ent, hpMul: hpm * gp.hpMul, wave: n + 1 });
  }, this);
  this.spawnQ = this.spawnQ.concat(list).sort(function (a, b) { return a.t - b.t; });
  this.waveAlive[n + 1] = 0; this.waveSpawnLeft[n + 1] = list.length; this.waveStartTime = this.time;
  this.waveIdx++;
  var last = this.waveIdx >= this.map.waves.length;
  this.nextWaveIn = last ? 1e9 : 26;
  // 首次出现的新敌人
  var newT = [];
  w.forEach(function (gp) { if (!this.seen[gp.type]) { this.seen[gp.type] = true; newT.push(gp.type); } }, this);
  var rush = this.isRush(n + 1);
  this.emit('wave', { n: this.waveIdx, total: this.map.waves.length, rush: rush, boss: last, newTypes: newT });
  this.log('第 ' + this.waveIdx + ' / ' + this.map.waves.length + ' 波来袭' + (rush ? '——洪峰：三个入口同时大量出兵！' : (last ? '——Boss 波！' : '。')), rush || last ? 'alert' : 'warn');
  return true;
};
P.callNextWave = function () {
  if (this.waveIdx >= this.map.waves.length) return false;
  var bonus = Math.max(0, Math.floor(this.nextWaveIn * 0.5));
  var ok = this.startNextWave();
  if (ok && bonus > 0 && this.waveIdx > 1) { this.addCompute(bonus); this.emit('toast', { text: '提前发起：奖励算力 +' + bonus, lvl: 'ok' }); }
  return ok;
};
P.snapshot = function () {
  return { time: this.time, core: this.core, wave: this.waveIdx, kills: this.stats.kills };
};
})(window.G = window.G || {});
