/* 实战演示：在游戏逻辑上实时演出，带光标、字幕与关键步骤 */
(function (G) {
'use strict';
var K = G.K;
function $(id) { return document.getElementById(id); }
function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }

var DEMOS = G.DEMOS = [
  { name: '分段取舍', map: 0, sub: '企业网', desc: '把网闸拖到西边界节点：预览中入口 A 折向 DMZ 互联、与 B 汇流；确认后，正奔向办公网段的敌人在节点前掉头。', setup: setup1, script: script1 },
  { name: '旁路直通', map: 1, sub: '洪峰', desc: '洪峰来袭，洪泛团冲垮汇聚节点上的网闸，C、B 的路线改回机房 Y；玩家同时在 A 的路线上投下协议降级。', setup: setup2, script: script2 },
  { name: '蛰影现身', map: 2, sub: '第 16 波', desc: '蛰影锁死前方一段运维环，各入口的路线重新收敛；玩家选中修复进程，释放冗余切换。', setup: setup3, script: script3 }
];

function enemyOn(g, type, ent, tx, ty, t, hpMul) {
  var e = g.spawnEnemy(type, ent, hpMul || 1, 0), idx = g.idx(tx, ty); e.cur = idx; e.nxt = g.nextStep(idx, g.field); e.t = t || 0;
  if (e.nxt >= 0) { var ax = g.tx(idx), ay = g.ty(idx), bx = g.tx(e.nxt), by = g.ty(e.nxt); e.x = ax + (bx - ax) * e.t; e.y = ay + (by - ay) * e.t; e.yaw = Math.atan2(by - ay, bx - ax); }
  e.spawnT = 0; return e;
}
function creep(list, on, f) { list.forEach(function (e) { if (on) { e.slowT = 60; e.slowF = f || 0.6; } else { e.slowT = 0; } }); }
function basics(g) {
  g.diff = 0; g.autoWave = false; g.nextWaveIn = 1e9; g.compute = 800; g.intel = 200; g.finish = function () { }; g.income = 3; g.leakScale = 0.5;
}
function queue(g, list) { list.forEach(function (q) { g.spawnQ.push({ t: q[0], type: q[1], ent: q[2], hpMul: q[3] || 1, wave: 0 }); }); g.spawnQ.sort(function (a, b) { return a.t - b.t; }); }
function placer(g) { return function (k, x, y, lv, br, face) { return g.placeFree(k, x, y, lv || 1, br || null, face || 0); }; }

// 三段演示合计 ≤ 60 秒：每段约 19 秒，含开场、操作、战况展示与收尾

// ---------------- 演示一：分段取舍 ----------------
function setup1(g) {
  basics(g);
  g.waveIdx = 5; g.seen = { worm: 1, trojan: 1, hotspot: 1, flooder: 1, ransom: 1 };
  var f = placer(g), PI = Math.PI;
  // 办公网段：防火墙拦截先头敌群，拦截器与沙箱输出，修复进程补血
  f('firewall', 4, 6, 2); f('interceptor', 3, 5, 1, null, 0); f('interceptor', 5, 7, 1, null, PI); f('sandbox', 5, 5); f('repair', 3, 4);
  // DMZ 互联：被改道的敌群在这里接战
  f('firewall', 8, 2, 1); f('interceptor', 7, 1, 1, null, PI / 4); f('sandbox', 9, 3);
  // 业务网段
  f('firewall', 12, 5); f('interceptor', 13, 5, 1, null, PI); f('interceptor', 11, 5, 1, null, 0); f('sandbox', 13, 4); f('repair', 11, 4);
  // 办公网段里的先头敌群：已被防火墙拦住，勒索者在远处加密设备
  [0.1, 0.2, 0.3, 0.4].forEach(function (t, i) { var e = enemyOn(g, 'worm', 'A', 4, 5, t, 2.4); e.lane = (i % 2 ? 0.1 : -0.1); });
  enemyOn(g, 'ransom', 'A', 4, 3, 0.7, 1.6); enemyOn(g, 'trojan', 'A', 4, 4, 0.3, 1.5);
  queue(g, [[7.0, 'worm', 'A', 2.4], [7.6, 'worm', 'A', 2.4], [8.2, 'trojan', 'A', 2.2], [8.8, 'worm', 'A', 2.4], [9.4, 'worm', 'A', 2.4], [10.0, 'worm', 'A', 2.4], [10.6, 'worm', 'A', 2.4], [11.2, 'trojan', 'A', 2.2]]);
}
function* script1(D) {
  var g = D.g, grp = [];
  D.say('演示一 · 分段取舍：办公网段正与先头敌群交火，入口 A 的后续大军逼近西边界节点。');
  yield D.wait(0.8);
  grp = [enemyOn(g, 'worm', 'A', 4, 1, 0.9, 2.0), enemyOn(g, 'worm', 'A', 4, 1, 0.5, 2.0), enemyOn(g, 'trojan', 'A', 4, 1, 0.1, 2.0), enemyOn(g, 'worm', 'A', 4, 0, 0.7, 2.0), enemyOn(g, 'worm', 'A', 4, 0, 0.3, 2.0), enemyOn(g, 'flooder', 'A', 4, 0, 0.0, 1.1)];
  creep(grp, true, 0.62);
  yield D.wait(0.9);
  D.say('把网闸拖到「西边界节点」，先看预览。');
  yield* D.deploy('airgap', 4, 3, null, { read: 2.4, say: '预览（虚线）：A 改走 DMZ 互联，与 B 汇流；路程 +8，但敌人绕开办公网段。' });
  creep(grp, false);
  D.say('确认隔离：节点截断，路线同步收敛——节点前的敌人掉头，转向 DMZ 互联。');
  yield D.wait(3.4);
  D.say('DMZ 防线接战：防火墙拦住敌群、拦截器与沙箱输出；洪泛团转头重击网闸。');
  yield D.wait(4.2);
  D.say('代价：网闸承压、业务网段将迎来更多敌人——改道要权衡。');
  yield D.wait(3.4);
}

// ---------------- 演示二：旁路直通 ----------------
function setup2(g) {
  basics(g);
  g.waveIdx = 10; g.seen = { worm: 1, trojan: 1, hotspot: 1, flooder: 1, ransom: 1, packer: 1 };
  var f = placer(g), PI = Math.PI;
  var ag = f('airgap', 9, 4); ag.hp = 520; ag.maxhp = 900; g.demoGate = ag;                          // 汇聚节点上的网闸（即将被冲垮）
  // 专线隧道西侧：承接 A 与改道后的 C、B
  f('interceptor', 4, 4, 1, null, PI / 2); f('sandbox', 2, 4); f('interceptor', 4, 6, 2, 'B', PI); f('interceptor', 2, 6, 1, null, 0); f('repair', 5, 7); f('firewall', 3, 7, 1); f('firewall', 3, 9, 1);
  f('interceptor', 2, 8, 1, null, 0);
  // 汇聚节点与旧专线
  f('sandbox', 8, 6); f('interceptor', 10, 6, 2, 'A', PI); f('interceptor', 8, 4, 1, null, 0); f('firewall', 9, 7); f('interceptor', 10, 7, 1, null, PI); f('repair', 8, 7);
  f('honeypot', 11, 9); f('interceptor', 12, 9, 1, null, PI); f('sandbox', 12, 10);
  g.income = 2;
  // 洪峰：三个入口同时出兵
  var q = [];
  for (var i = 0; i < 8; i++) { q.push([0.4 + i * 0.7, 'worm', 'A', 1.9]); q.push([0.6 + i * 0.7, 'worm', 'C', 1.9]); q.push([0.8 + i * 0.7, 'worm', 'B', 1.9]); }
  q.push([2.6, 'packer', 'B', 1.6]); q.push([3.4, 'ransom', 'C', 1.6]); q.push([4.0, 'trojan', 'A', 1.8]); q.push([4.6, 'trojan', 'C', 1.8]); q.push([5.2, 'trojan', 'B', 1.8]);
  queue(g, q);
  var fl = enemyOn(g, 'flooder', 'C', 9, 2, 0.5, 0.8); g.demoFlooder = fl;
  // 洪峰已在路上：三路先头敌人正沿 y=3 的链路涌向专线隧道
  [[1, 3, 0.1, 'A'], [2, 3, 0.4, 'A'], [3, 3, 0.2, 'A'], [4, 3, 0.7, 'C'], [5, 3, 0.2, 'C'], [6, 3, 0.6, 'C'], [7, 3, 0.1, 'B'], [8, 3, 0.5, 'B']].forEach(function (u, i) { var e = enemyOn(g, i === 5 ? 'trojan' : 'worm', u[3], u[0], u[1], u[2], 1.9); });
  enemyOn(g, 'ransom', 'B', 10, 3, 0.4, 1.6);
}
function* script2(D) {
  var g = D.g;
  D.say('演示二 · 旁路直通：骨干流域「洪峰」。汇聚节点被网闸隔离，三路敌人全部挤向专线隧道。');
  D.setHint(9, 4);
  yield D.wait(3.0);
  D.say('洪泛团离开路线，奔向被隔离节点的可通行一侧，正重击网闸。');
  yield D.until(function () { return g.demoGate.dead || g.time > 8.4; }, 9);
  if (!g.demoGate.dead) g.damageTower(g.demoGate, 9999, null);
  D.clearHint();
  D.say('网闸被冲垮：节点旁路直通！C、B 的路线改回旧专线，隧道里的敌人就地掉头。');
  yield D.wait(2.6);
  D.say('玩家在 A 的路线上投下「协议降级」。');
  yield* D.item('downgrade', 3, 6, { say: '预览：该片链路临时变为旧链路——地面敌人减速、木马显形。', read: 1.9 });
  D.say('协议降级生效：隧道里的敌人被拖慢、木马现形，沙箱与拦截器得以集火。');
  yield D.wait(3.6);
}

// ---------------- 演示三：蛰影现身 ----------------
function setup3(g) {
  basics(g);
  g.waveIdx = 15; g.seen = { worm: 1, trojan: 1, hotspot: 1, flooder: 1, ransom: 1, packer: 1 };
  var f = placer(g), PI = Math.PI;
  var i1 = f('interceptor', 5, 5, 2, 'B', 0), i2 = f('interceptor', 5, 9, 1, null, -PI / 4);
  var sb = f('sandbox', 8, 5, 2); f('sandbox', 4, 3); var rp = f('repair', 5, 6, 2); g.demoRepair = rp;
  var fw = f('firewall', 6, 6, 2); f('firewall', 6, 4, 1); f('honeypot', 6, 7);
  f('interceptor', 13, 6, 1, null, PI); f('interceptor', 10, 5, 2, 'A', PI); f('sandbox', 10, 7); f('repair', 13, 5);
  f('interceptor', 7, 2, 1, null, PI / 2); f('interceptor', 9, 2, 1, null, PI / 2);
  i1.encT = 16; fw.encT = 16; sb.encT = 16; g.demoEnc = [i1, fw, sb];
  fw.hp = fw.maxhp * 0.5; i1.hp = i1.maxhp * 0.65;
  g.demoBoss = null;
  queue(g, [[0.5, 'ransom', 'A', 1.0], [1.5, 'worm', 'C', 1.0], [2.0, 'worm', 'C', 1.0], [2.5, 'trojan', 'B', 1.0], [3.0, 'worm', 'C', 1.0], [3.6, 'packer', 'C', 1.0], [4.4, 'worm', 'B', 1.0], [5.0, 'worm', 'C', 1.0], [5.6, 'ransom', 'B', 1.0], [6.5, 'worm', 'B', 1.0]]);
  var b = enemyOn(g, 'boss3', 'A', 8, 1, 0.2, 0.4); b.slowT = 999; b.slowF = 0.35; b.hp = b.maxhp * 0.36; b.bossSpawn = 0; b.lockCd = 99; g.demoBoss = b;
}
function* script3(D) {
  var g = D.g, boss = g.demoBoss;
  D.say('演示三 · 蛰影现身：气隙深层第 16 波，蛰影入侵；几座设备已被勒索者加密（洋红色锁标）。');
  yield D.wait(3.0);
  if (boss && !boss.dead) { boss.hp = Math.min(boss.hp, boss.maxhp * 0.3); boss.lockCd = 1.2; boss.slowF = 0.5; D.keepBoss = boss; }
  D.say('破坏阶段：蛰影将锁死前方一段运维环——地面红色警示线就是预警位置。');
  yield D.until(function () { return g.hazards.some(function (h) { return h.active; }); }, 6);
  D.say('运维环被锁死，各入口的路线重新收敛，敌人沿新的道路绕行。');
  yield D.wait(2.0);
  D.say('选中修复进程，释放「冗余切换」。');
  yield* D.selectTower(g.demoRepair);
  yield* D.clickEl('[data-sk]');
  D.say('冗余切换：为附近友塔提供护盾并解除加密——防线重新开火，压住了蛰影。');
  yield D.wait(4.4);
}

// ---------------- 导演 ----------------
function Director(def, match) {
  this.def = def; this.m = match; this.g = match.game; this.w = match.world; this.active = true; this.clock = 0; this.waitUntil = 0; this.cond = null;
  this.cx = window.innerWidth * 0.5; this.cy = window.innerHeight * 0.7; this.mv = null; this.anchor = null; this.hint = null; this.cf = null; this.press = false; this.dragging = null; this.pausedGame = false;
  this.cursor = el('<svg id="cursor" viewBox="0 0 24 24"><path d="M3 2l15 9-6.5 1.6L14 20l-3 1-2.5-7.5L4 17z" fill="#fff" stroke="#f7c23d" stroke-width="1.4"/></svg>');
  document.body.appendChild(this.cursor);
  this.sub = el('<div id="demo-sub"><div class="tt"></div><div class="tx"></div></div>'); document.body.appendChild(this.sub);
  this.bar = el('<div id="demo-bar"><span class="st1">// 实战演示 LIVE DEMO</span><span class="dn">' + def.name + '</span><button class="btn sm bad">退出演示</button></div>'); document.body.appendChild(this.bar);
  var self = this; this.bar.querySelector('button').onclick = function () { G.demo.stop(); };
  this.gen = def.script(this);
}
var DP = Director.prototype;
DP.say = function (text, secs) { var tx = this.sub.querySelector('.tx'); tx.textContent = text; this.sub.querySelector('.tt').textContent = '实战演示 · ' + this.def.name; this.sub.style.display = 'block'; return { wait: secs == null ? 3 : secs }; };
DP.wait = function (s) { return { wait: s }; };
DP.until = function (fn, timeout) { return { until: fn, timeout: timeout || 30 }; };
// 光标移动时长：未指定时按距离估算（普通移动约 1500 px/s，拖拽更慢），并带轻微弧线
DP.travel = function (px) { return Math.max(0.32, Math.min(1.2, (this.dragging ? 0.42 + px / 1050 : 0.28 + px / 1500))); };
DP.moveTo = function (x, y, dur, cb) {
  var d = Math.hypot(x - this.cx, y - this.cy); if (dur == null) dur = this.travel(d);
  this.anchor = null; this.mv = { x0: this.cx, y0: this.cy, x1: x, y1: y, t0: this.clock, dur: Math.max(0.01, dur), cb: cb, arc: Math.min(40, d * 0.05) }; return { wait: dur };
};
DP.moveToWorld = function (wx, wy, wz, dur, cb) {
  var w = this.w, fn = function () { return w.project(wx, wy, wz); }, p0 = fn(), d = Math.hypot(p0.x - this.cx, p0.y - this.cy);
  if (dur == null) dur = this.travel(d);
  this.anchor = null; this.mv = { x0: this.cx, y0: this.cy, fn: fn, t0: this.clock, dur: Math.max(0.01, dur), cb: cb, arc: Math.min(40, d * 0.05) }; return { wait: dur };
};
DP.setHint = function (x, y) { this.hint = { x: x, y: y }; };
DP.clearHint = function () { this.hint = null; };
// 演示镜头：先看全景，再滑向战斗聚焦区域，并跟随主要战斗区域（敌群重心、正在操作的位置、Boss 预警段）
DP.updateCamera = function (dt) {
  var cam = G.camCtl, def = cam.def, g = this.g; if (!def) return;
  var i, sx = 0, sz = 0, sw = 0, ex = 0, ez = 0, ew = 0, es = [];
  for (i = 0; i < g.enemies.length; i++) { var e = g.enemies[i]; if (e.dead) continue; var wgt = e.def.boss ? 5 : (e.type === 'flooder' ? 2.5 : 1); ex += e.x * wgt; ez += e.y * wgt; ew += wgt; es.push(e); }
  if (ew > 0) { sx += ex / ew * 2; sz += ez / ew * 2; sw += 2; }
  var h = this.hint; if (h) { sx += h.x * 3; sz += h.y * 3; sw += 3; }
  var hp = [];
  for (i = 0; i < g.hazards.length; i++) { var hz = g.hazards[i], hx = 0, hy = 0; for (var k = 0; k < hz.tiles.length; k++) { hx += g.tx(hz.tiles[k]); hy += g.ty(hz.tiles[k]); } hx /= hz.tiles.length; hy /= hz.tiles.length; hp.push([hx, hy]); sx += hx * 1.5; sz += hy * 1.5; sw += 1.5; }
  var tx = def.tx, tz = def.tz;
  if (sw > 0) { tx = sx / sw; tz = sz / sw; } else if (this.cf) { tx = this.cf.x; tz = this.cf.z; }
  var ds = es.map(function (q) { return Math.hypot(q.x - tx, q.y - tz); }).sort(function (a, b) { return a - b; });
  var sp = ds.length ? ds[Math.min(ds.length - 1, Math.floor(ds.length * 0.8))] : 0;
  if (h) sp = Math.max(sp, Math.hypot(h.x - tx, h.y - tz)); hp.forEach(function (q) { sp = Math.max(sp, Math.hypot(q[0] - tx, q[1] - tz)); });
  var td = Math.min(19, Math.max(11.5, 10.5 + sp * 1.2));
  if (!this.cf) this.cf = { x: tx, z: tz, d: td };
  var a = 1 - Math.exp(-dt / 0.7); this.cf.x += (tx - this.cf.x) * a; this.cf.z += (tz - this.cf.z) * a; this.cf.d += (td - this.cf.d) * a;
  var b = Math.max(0, Math.min(1, (this.clock - 1.1) / 1.9)); b = b * b * (3 - 2 * b);
  function lerp(p, q, u) { return p + (q - p) * u; }
  cam.gtx = lerp(def.tx, this.cf.x, b); cam.gtz = lerp(def.tz, this.cf.z + 0.5, b); cam.gdist = lerp(def.dist, this.cf.d, b); cam.gpitch = lerp(def.pitch, 50, b); cam.gaz = lerp(def.az, 0.22, b);
};
DP.setPress = function (on) { this.press = on; this.cursor.classList.toggle('press', on); };
function center(elm) { var r = elm.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
DP.topOf = function (idx) { var g = this.g; return g.kind[idx] === K.PLAT ? 0.45 : 0.15; };
DP.deploy = function* (kind, tx, ty, face, o) {
  o = o || {}; var g = this.g, w = this.w, inp = G.input, ui = G.ui, idx = g.idx(tx, ty), self = this;
  var card = document.querySelector('#deck-t [data-k="' + kind + '"]'), c = center(card);
  this.setHint(tx, ty);
  yield this.moveTo(c.x, c.y); this.setPress(true); yield this.wait(0.16);
  inp.cancel(); inp.mode = 'armed'; inp.armed = kind; ui.refreshCards(); this.dragging = G.TOWERS[kind];
  yield this.moveToWorld(tx, ty, this.topOf(idx), null, function () { inp.hover(self.cx, self.cy); ui.dragGhost(self.cx, self.cy, self.dragging); });
  inp.hover(this.cx, this.cy);
  if (o.say) this.say(o.say);
  yield this.wait(o.read || 2.2);
  this.setPress(false); this.dragging = null; ui.dragGhost(0, 0, null);
  inp.leftClick(this.cx, this.cy);
  if (inp.mode === 'confirm') { yield this.wait(0.4); var b = $('cf-ok'), bc = center(b); yield this.moveTo(bc.x, bc.y); this.setPress(true); yield this.wait(0.16); b.click(); this.setPress(false); }
  else if (inp.mode === 'facing') { yield this.moveToWorld(tx + Math.cos(face || 0) * 2.2, ty + Math.sin(face || 0) * 2.2, 0.4, null, function () { inp.hover(self.cx, self.cy); }); yield this.wait(0.3); inp.leftClick(self.cx, self.cy); }
  yield this.wait(0.2);
  this.clearHint();
};
DP.item = function* (id, wx, wy, o) {
  o = o || {}; var w = this.w, inp = G.input, self = this;
  var card = document.querySelector('#deck-i [data-i="' + id + '"]'), c = center(card);
  this.setHint(wx, wy);
  yield this.moveTo(c.x, c.y); this.setPress(true); yield this.wait(0.16); this.setPress(false);
  inp.armItem(id);
  yield this.moveToWorld(wx, wy, 0.15, null, function () { inp.hover(self.cx, self.cy); });
  inp.hover(this.cx, this.cy); if (o.say) this.say(o.say);
  yield this.wait(o.read || 2.0);
  this.setPress(true); yield this.wait(0.16); if (id === 'downgrade') inp.itemPos = { x: wx, y: wy }; inp.leftClick(this.cx, this.cy); this.setPress(false); yield this.wait(0.3);
  this.clearHint();
};
DP.selectTower = function* (tw) {
  var w = this.w; this.setHint(tw.x, tw.y);
  yield this.moveToWorld(tw.x, tw.y, w.towerTop(tw) + 0.35, null); this.setPress(true); yield this.wait(0.16); w.setSelection(tw, 'tower'); G.ui.select('tower', tw); this.setPress(false); yield this.wait(0.7);
};
DP.clickEl = function* (sel) {
  var b = document.querySelector(sel); if (!b) return; var c = center(b);
  yield this.moveTo(c.x, c.y); this.setPress(true); yield this.wait(0.16); b.click(); this.setPress(false); yield this.wait(0.3);
};
DP.moveCursor = function () {
  var mv = this.mv;
  if (!mv) { if (this.anchor) { var an = this.anchor(); this.cx = an.x; this.cy = an.y; } return; }
  var u = Math.min(1, (this.clock - mv.t0) / mv.dur), e = u * u * (3 - 2 * u), x1 = mv.x1, y1 = mv.y1;
  if (mv.fn) { var d = mv.fn(); x1 = d.x; y1 = d.y; }
  var dx = x1 - mv.x0, dy = y1 - mv.y0, dl = Math.hypot(dx, dy) || 1, bow = Math.sin(Math.PI * e) * (mv.arc || 0);
  this.cx = mv.x0 + dx * e - dy / dl * bow; this.cy = mv.y0 + dy * e + dx / dl * bow;
  if (mv.cb) mv.cb(); if (u >= 1) { if (mv.fn) this.anchor = mv.fn; this.mv = null; }
};
DP.tick = function (dt) {
  if (!this.active) return; this.clock += dt; this.moveCursor(); this.updateCamera(dt);
  if (this.keepBoss && !this.keepBoss.dead) this.keepBoss.hp = Math.max(this.keepBoss.hp, this.keepBoss.maxhp * 0.26);
  if (this.waitUntil > this.clock && !(this.cond && this.cond())) return;
  this.cond = null;
  for (var guard = 0; guard < 20; guard++) {
    var r; try { r = this.gen.next(); } catch (e) { console.error(e); this.finish(); return; }
    if (r.done) { this.finish(); return; }
    var v = r.value; if (!v) continue;
    if (v.wait != null) { this.waitUntil = this.clock + v.wait; return; }
    if (v.until) { this.waitUntil = this.clock + v.timeout; this.cond = v.until; return; }
  }
};
DP.frame = function () {
  if (!this.mv && this.anchor) { var an = this.anchor(); this.cx = an.x; this.cy = an.y; }
  this.cursor.style.left = this.cx + 'px'; this.cursor.style.top = this.cy + 'px';
  if (this.dragging) G.ui.dragGhost(this.cx, this.cy, this.dragging);
};
DP.finish = function () {
  if (this.ended) return; this.ended = true; this.sub.style.display = 'none';
  var box = el('<div id="demo-end" class="panel" style="position:fixed;left:50%;bottom:36px;transform:translateX(-50%);z-index:60;padding:14px 22px;display:flex;gap:12px;align-items:center"><span style="font-size:17px;color:#fff;margin-right:8px">演示结束</span></div>');
  var mk = function (t, cls, fn) { var b = el('<button class="btn ' + cls + '">' + t + '</button>'); b.onclick = fn; box.appendChild(b); };
  var idx = DEMOS.indexOf(this.def);
  mk('重播', 'pri', function () { G.demo.start(idx); }); mk('演示列表', '', function () { G.demo.stop(false); }); mk('进入战场', '', function () { G.demo.stop(true); G.curtain(function () { G.hideAllScreens(); G.startMatch(DEMOS[idx].map); }); });
  document.body.appendChild(box); this.endBox = box;
};
DP.dispose = function () { this.active = false; [this.cursor, this.sub, this.bar, this.endBox].forEach(function (n) { if (n && n.parentNode) n.parentNode.removeChild(n); }); G.ui.dragGhost(0, 0, null); document.body.classList.remove('demo'); };

G.demo = {
  // 直接进入某段演示（不带转场）；视频导出与正常播放共用
  launch: function (i) {
    G.hideAllScreens(); if (G.match && G.match.demo) G.match.demo.dispose();
    var def = DEMOS[i], m = G.startMatch(def.map, { demo: true }); m.demoId = i;
    def.setup(m.game, m.world); G.ui.refreshCards(); G.ui.fcRender(true);
    document.body.classList.add('demo');
    m.demo = new Director(def, m); G.camCtl.userMoved = false;
    m.game.log('实战演示：' + def.name, 'info');
    return m;
  },
  start: function (i) {
    G.curtain(function () { G.demo.launch(i); });
  },
  stop: function (silent) {
    var m = G.match; if (m && m.demo) { m.demo.dispose(); m.demo = null; }
    if (!silent) G.curtain(function () { G.hideAllScreens(); G.enterMenu(0); G.screens.demos(); });
  }
};
})(window.G = window.G || {});
