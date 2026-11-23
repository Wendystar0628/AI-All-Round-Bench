/* 战斗模拟：敌人、塔、弹道、Boss、地形危害 */
(function (G) {
'use strict';
var K = G.K, DX = G.DX, DY = G.DY, BLK = G.BLK;
var P = G.Game.prototype;
function rnd() { return G.simRand(); }
function dist2(ax, ay, bx, by) { return (ax - bx) * (ax - bx) + (ay - by) * (ay - by); }
function angDiff(a, b) { var d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
G.angDiff = angDiff;

// ---------- 敌人生成 ----------
P.spawnEnemy = function (type, entId, hpMul, wave, opts) {
  opts = opts || {};
  var def = G.ENEMIES[type], en = null;
  for (var a = 0; a < this.entrances.length; a++) if (this.entrances[a].id === entId) en = this.entrances[a];
  if (!en) en = this.entrances[0];
  var hp = def.hp * (hpMul || 1);
  var e = { id: this.uid++, type: type, def: def, hp: hp, maxhp: hp, shield: 0, cur: en.idx, nxt: -1, t: 0, x: en.x, y: en.y, z: def.air ? 2.1 : 0,
    yaw: 0, air: !!def.air, wave: wave || 0, ent: en.id, lane: (rnd() - 0.5) * 0.36, revealT: 0, slowT: 0, slowF: 0, rootT: 0, trapMark: 0, taintT: 0,
    bl: null, lure: null, atkCd: 0.3 + rnd() * 0.5, auraCd: 1, strikeCd: 1, passTile: -1, mode: 'route', goal: -1, hitFlash: 0, dead: false,
    disguised: type === 'trojan', stealth: false, revealed: false, armor: 0, born: this.time, turned: 0, spawnT: 0.6, cloned: !!opts.cloned, splitDone: false,
    slotIdx: 0, sx: 0, sy: 0, engagedT: 0 };
  if (def.boss) { e.phase = 1; e.surgeCd = 7; e.holeCd = 8; e.stormCd = 9; e.swarmCd = 4; e.lockCd = 8; e.trojCd = 6; e.stompCd = 1; e.bossSpawn = 2.2; }
  if (type === 'boss3') { e.stealth = true; }
  e.yaw = 0;
  if (e.air) {
    var ex = this.exits[this.map.flyTo[en.id] || '1'];
    e.fly = { tx: ex.x, ty: ex.y, exit: ex.idx };
    e.yaw = Math.atan2(ex.y - en.y, ex.x - en.x);
  } else {
    e.nxt = this.nextStep(e.cur, this.field);
    if (e.nxt >= 0) e.yaw = Math.atan2(this.ty(e.nxt) - en.y, this.tx(e.nxt) - en.x);
  }
  if (opts.pos) { e.x = opts.pos.x; e.y = opts.pos.y; }
  this.enemies.push(e);
  if (wave) { this.waveAlive[wave] = (this.waveAlive[wave] || 0) + 1; }
  this.emit('spawn', { e: e });
  if (def.boss && !opts.cloned) {
    this.emit('bossIntro', { e: e });
    this.log('警报：「' + def.name + '」(' + def.en + ') 从入口 ' + en.id + ' 现身！', 'alert');
  }
  return e;
};

// ---------- 伤害 ----------
P.damageEnemy = function (e, dmg, src, opt) {
  if (e.dead) return 0; opt = opt || {};
  var d = dmg;
  if (e.trapMark > 0) d *= 1.2;
  if (e.taintT > 0) d *= 1.15;
  if (e.armor) d *= 1 - e.armor;
  if (opt.bonus && e.slowT > 0) d *= 1 + opt.bonus;
  var absorbed = 0;
  if (e.shield > 0) { absorbed = Math.min(e.shield, d); e.shield -= absorbed; d -= absorbed; if (e.shield <= 0) this.emit('shieldBreak', { e: e }); }
  e.hp -= d; this.stats.dmg += d + absorbed; e.hitFlash = 0.14;
  if (!opt.quiet) this.emit('enemyHit', { e: e, dmg: d + absorbed, shieldOnly: d <= 0, src: src, kind: opt.kind || 'hit' });
  if (e.hp <= 0) this.killEnemy(e, opt);
  return d + absorbed;
};
P.killEnemy = function (e, opt) {
  if (e.dead) return; e.dead = true; opt = opt || {};
  var def = e.def;
  if (e.bl) { var i = e.bl.blocked.indexOf(e); if (i >= 0) e.bl.blocked.splice(i, 1); e.bl = null; }
  var payload = false;
  if (e.type === 'trojan' && !e.revealed) { payload = true; this.payload(e); }
  if (!opt.silent) {
    this.addCompute(def.rewardC); if (def.rewardI) this.addIntel(def.rewardI, e.x, e.y);
    this.stats.kills++; this.stats.killsBy[e.type] = (this.stats.killsBy[e.type] || 0) + 1;
  }
  this.emit('death', { e: e, payload: payload, silent: !!opt.silent });
  if (def.boss) { this.emit('bossDead', { e: e }); this.log('「' + def.name + '」已被清除。', 'ok'); this.clearBossHazards(e); }
  if (e.wave) this.waveAlive[e.wave]--;
};
P.payload = function (e) {
  var def = e.def, n = 0;
  for (var i = 0; i < this.towers.length; i++) {
    var tw = this.towers[i];
    if (dist2(tw.x, tw.y, e.x, e.y) <= def.payloadR * def.payloadR) { this.damageTower(tw, def.payload, e, { kind: 'payload' }); n++; }
  }
  this.emit('payload', { e: e, n: n });
  this.log('木马在伪装状态下被击毁，载荷引爆' + (n ? '，波及 ' + n + ' 座设备。' : '。'), 'warn');
};
P.leak = function (e) {
  if (e.dead) return; e.dead = true;
  if (e.bl) { var i = e.bl.blocked.indexOf(e); if (i >= 0) e.bl.blocked.splice(i, 1); e.bl = null; }
  this.core -= e.def.coreDmg * (this.leakScale || 1); this.stats.leaks++; this.stats.leaksBy[e.type] = (this.stats.leaksBy[e.type] || 0) + 1; this.stats.flawless = false;
  this.stats.maxLeak = Math.max(this.stats.maxLeak, e.def.coreDmg);
  this.emit('leak', { e: e, dmg: e.def.coreDmg });
  this.log(e.def.name + ' 到达出口，中枢完整度 −' + e.def.coreDmg + '。', 'alert');
  if (e.wave) this.waveAlive[e.wave]--;
  if (this.core <= 0 && !this.over) { this.core = 0; this.finish(false); }
};
P.finish = function (win) {
  if (this.over) return; this.over = true; this.win = win;
  this.emit('end', { win: win });
  this.log(win ? '全部波次已撑过，汐域保住了中枢。' : '中枢完整度归零，汐域失守。', win ? 'ok' : 'alert');
};
P.damageTower = function (tw, dmg, src, opt) {
  if (tw.dead || this.over && false) return 0; opt = opt || {};
  var st = G.towerStats(tw.kind, tw.level, tw.branch), d = dmg;
  if (st.armor) d *= 1 - st.armor;
  if (tw.hardenT > 0) d *= 0.4;
  var abs = 0;
  if (tw.shield > 0) { abs = Math.min(tw.shield, d); tw.shield -= abs; d -= abs; if (tw.shield <= 0) { tw.shieldT = 0; this.emit('shieldBreak', { tw: tw }); } }
  tw.hp -= d; tw.engaged = 2.0; tw.hitFlash = 0.15;
  this.emit('towerHit', { tw: tw, dmg: d + abs, src: src, kind: opt.kind || 'hit', absorbed: abs });
  if (tw.hp <= 0) this.destroyTower(tw, src);
  return d + abs;
};
P.destroyTower = function (tw, src) {
  if (tw.dead) return;
  this.stats.destroyed++;
  var st = G.towerStats(tw.kind, tw.level, tw.branch);
  this.emit('towerDestroyed', { tw: tw, src: src });
  this.log(G.towerTitle(tw) + ' 被摧毁' + (tw.onNode ? '，节点失去隔离' : '') + '。', 'alert');
  if (tw.kind === 'honeypot' && st.blast) this.honeyBlast(tw, st);
  this.removeTower(tw, 'killed');
};
P.honeyBlast = function (tw, st) {
  for (var i = this.enemies.length - 1; i >= 0; i--) {
    var e = this.enemies[i]; if (e.dead || e.air) continue;
    if (dist2(e.x, e.y, tw.x, tw.y) <= st.blastR * st.blastR) this.damageEnemy(e, st.blast, tw, { kind: 'blast' });
  }
  this.emit('blast', { x: tw.x, y: tw.y, r: st.blastR });
};
P.damageIso = function (iso, dmg, src) {
  if (iso.dead) return; iso.hp -= dmg; iso.hitFlash = 0.15;
  this.emit('isoHit', { iso: iso, dmg: dmg, src: src });
  if (iso.hp <= 0) this.removeIsolator(iso, 'killed');
};
P.tileOf = function (e) { return e.t >= 0.5 && e.nxt >= 0 ? e.nxt : e.cur; };

// ---------- 阻挡 ----------
P.isBlocker = function (tw) { return !tw.dead && (tw.kind === 'honeypot' || (tw.kind === 'firewall')); };
P.blockUsed = function (tw) { var u = 0; for (var i = 0; i < tw.blocked.length; i++) u += tw.blocked[i].def.block; return u; };
P.tryBlock = function (e, tw) {
  if (e.def.block <= 0 || e.bl) return false;
  var st = G.towerStats(tw.kind, tw.level, tw.branch);
  if (this.blockUsed(tw) + e.def.block > st.block) return false;
  e.bl = tw; tw.blocked.push(e); e.slotIdx = tw.blocked.length - 1; e.blockT = 0;
  e.atkCd = 0.4;
  this.emit('blocked', { e: e, tw: tw });
  return true;
};
P.checkBlock = function (e) {
  if (e.bl || e.def.block <= 0) return;
  var ti = this.tileOf(e);
  if (ti === e.passTile) return;
  var tw = this.towerAt[ti];
  if (tw && !tw.onNode && this.isBlocker(tw)) { if (!this.tryBlock(e, tw)) e.passTile = ti; else { if (e.t < 0.5 && e.nxt === ti) e.t = 0.5; } return; }
  e.passTile = ti;
};
P.zocCheck = function (e) {
  if (e.bl || e.def.block <= 0) return;
  var x = this.tx(e.cur), y = this.ty(e.cur);
  for (var d = 0; d < 4; d++) {
    var nx = x + DX[d], ny = y + DY[d]; if (!this.inb(nx, ny)) continue;
    var tw = this.towerAt[this.idx(nx, ny)];
    if (tw && tw.kind === 'firewall' && tw.onNode && !tw.dead) { if (this.tryBlock(e, tw)) { e.t = 0; e.nxt = -2; return; } }
  }
};

// ---------- 敌人更新 ----------
P.eachAlive = function (fn) { for (var i = 0; i < this.enemies.length; i++) { var e = this.enemies[i]; if (!e.dead) fn(e); } };
P.enemyAtkTarget = function (e) {
  // 被诱导：附近有蜜罐
  for (var i = 0; i < this.towers.length; i++) {
    var tw = this.towers[i]; if (tw.kind !== 'honeypot' || tw.dead) continue;
    var st = G.towerStats(tw.kind, tw.level, tw.branch);
    if (dist2(tw.x, tw.y, e.x, e.y) <= st.lure * st.lure) return tw;
  }
  return null;
};
P.updateEnemy = function (e, dt) {
  var def = e.def, W = this.W;
  e.hitFlash = Math.max(0, e.hitFlash - dt); e.turned = Math.max(0, e.turned - dt); e.spawnT = Math.max(0, e.spawnT - dt);
  if (e.revealT > 0) e.revealT -= dt;
  if (e.slowT > 0) e.slowT -= dt; if (e.rootT > 0) e.rootT -= dt;
  if (e.trapMark > 0) e.trapMark -= dt; if (e.taintT > 0) e.taintT -= dt;
  if (e.engagedT > 0) e.engagedT -= dt;
  // 显形判定
  var tile = this.tileOf(e);
  var wasRev = e.revealed;
  e.revealed = e.revealT > 0 || (!e.air && this.isOld(tile)) || !!e.bl;
  if (e.revealed && !wasRev && (e.disguised || e.stealth)) this.emit('revealed', { e: e });
  e.visible = !(e.disguised || e.stealth) || e.revealed;
  if (def.boss) this.bossUpdate(e, dt);
  if (e.dead) return;
  // 蜜罐诱导
  e.lure = null;
  if (!e.air && (e.bl || def.ranged || e.mode === 'strike')) e.lure = this.enemyAtkTarget(e);
  // ---- 飞行单位
  if (e.air) {
    var dx = e.fly.tx - e.x, dy = e.fly.ty - e.y, d = Math.sqrt(dx * dx + dy * dy);
    var sp = def.speed * (e.slowT > 0 ? 1 - e.slowF : 1) * dt;
    if (d <= sp + 0.15) { this.leak(e); return; }
    e.x += dx / d * sp; e.y += dy / d * sp;
    var ty = Math.atan2(dy, dx); e.yaw += angDiff(ty, e.yaw) * Math.min(1, dt * 6);
    e.rem = d * 1.0;
    return;
  }
  // ---- 地面单位
  // 被阻挡
  if (e.bl) {
    if (e.bl.dead) { this.releaseBlock(e); }
    else {
      var tw = e.lure || e.bl;
      var towardX = this.tx(e.bl.idx) - e.x, towardY = this.ty(e.bl.idx) - e.y;
      var ty2 = Math.atan2(towardY, towardX); e.yaw += angDiff(ty2, e.yaw) * Math.min(1, dt * 8);
      e.atkCd -= dt;
      if (def.atk && e.atkCd <= 0) {
        e.atkCd = def.atkRate;
        this.emit('melee', { e: e, tw: tw });
        this.damageTower(tw, def.atk * (e.type === 'worm' ? 1 : 1), e, { kind: 'melee' });
        e.engagedT = 1;
      }
      e.rem = this.remaining(e);
      return;
    }
  }
  // 洪泛团：节点冲击
  if (e.type === 'flooder') this.flooderThink(e, dt);
  // 远程攻击
  if (def.ranged) this.rangedAttack(e, dt);
  if (e.type === 'packer') { e.auraCd -= dt; if (e.auraCd <= 0) { e.auraCd = def.shieldRate; this.packerPulse(e); } }
  // 站在目标格上冲击
  if (e.mode === 'strike' && e.atGoal) {
    var nodeTw = this.nodeThing(e.strikeNode);
    if (!nodeTw) { e.mode = 'route'; e.atGoal = false; e.goal = -1; this.reorient(e, true); }
    else {
      var nx = this.tx(e.strikeNode) - e.x, ny = this.ty(e.strikeNode) - e.y;
      e.yaw += angDiff(Math.atan2(ny, nx), e.yaw) * Math.min(1, dt * 8);
      e.strikeCd -= dt; e.rem = this.remaining(e);
      if (e.strikeCd <= 0) {
        e.strikeCd = def.strikeRate;
        var tgt = e.lure || nodeTw;
        this.emit('strike', { e: e, target: tgt, idx: e.strikeNode });
        if (tgt.isIso) this.damageIso(tgt, def.strike * 1.2, e); else this.damageTower(tgt, def.strike, e, { kind: 'strike' });
        e.engagedT = 1.4;
      }
      return;
    }
  }
  if (e.rootT > 0) { e.rem = this.remaining(e); return; }
  if (e.nxt === -2) e.nxt = -1;
  var f = this.fieldFor(e);
  if (e.nxt < 0) { e.nxt = this.nextStep(e.cur, f); e.t = 0; if (e.nxt < 0) { e.rem = 999; return; } }
  var spd = def.speed * (e.slowT > 0 ? 1 - e.slowF : 1);
  if (this.isOld(tile)) spd *= G.OLD_SPEED;
  if (def.boss && e.phase >= 2 && e.type === 'boss1') spd *= 1.2;
  e.t += spd * dt;
  var guard = 0;
  while (e.t >= 1 && guard++ < 3) {
    e.t -= 1; e.cur = e.nxt; e.passTile = -1;
    if (this.kind[e.cur] === K.OUT) { this.leak(e); return; }
    if (e.type === 'worm' && !e.cloned && !e.splitDone && this.kind[e.cur] === K.NODE) {
      e.splitDone = true; var c = this.spawnEnemy('worm', e.ent, e.maxhp / e.def.hp * 0.8, e.wave, { cloned: true });
      c.cur = e.cur; c.nxt = e.nxt; c.t = 0; c.x = e.x; c.y = e.y; c.lane = -e.lane; c.splitDone = true; c.cloned = true; c.yaw = e.yaw; c.hp = c.maxhp = e.maxhp * 0.7;
      c.nxt = this.nextStep(c.cur, this.field);
      this.emit('clone', { from: e, to: c, idx: e.cur });
    }
    this.zocCheck(e);
    if (e.nxt === -2) { e.nxt = -1; e.t = 0; break; }
    if (e.mode === 'strike' && e.goal >= 0 && e.cur === e.goal) { e.atGoal = true; e.nxt = -1; e.t = 0; break; }
    e.nxt = this.nextStep(e.cur, this.fieldFor(e));
    if (e.nxt < 0) { e.t = 0; break; }
  }
  if (e.nxt >= 0) {
    var ax = this.tx(e.cur), ay = this.ty(e.cur), bx = this.tx(e.nxt), by = this.ty(e.nxt);
    e.x = ax + (bx - ax) * e.t; e.y = ay + (by - ay) * e.t;
    var ya = Math.atan2(by - ay, bx - ax); e.yaw += angDiff(ya, e.yaw) * Math.min(1, dt * 9);
    this.checkBlock(e);
  } else { e.x = this.tx(e.cur); e.y = this.ty(e.cur); }
  e.rem = this.remaining(e);
};
P.remaining = function (e) {
  if (e.air) return e.rem || 0;
  var f = e.mode === 'strike' ? this.field : this.field;
  if (e.nxt >= 0) { var dd = f.dist[e.nxt]; if (dd === Infinity) dd = f.odist[e.nxt]; return dd + (1 - e.t) * this.edgeCost(e.cur, e.nxt, f); }
  var d0 = f.dist[e.cur]; return d0 === Infinity ? f.odist[e.cur] : d0;
};
P.nodeThing = function (idx) { return this.towerAt[idx] || this.isoAt[idx] || null; };
P.flooderThink = function (e, dt) {
  e.thinkCd = (e.thinkCd || 0) - dt;
  if (e.mode === 'strike' && this.field.dist[e.goal] === Infinity) { e.mode = 'route'; e.goal = -1; e.atGoal = false; this.reorient(e, true); return; }
  if (e.mode === 'strike' && !e.atGoal) {
    var gf0 = this.goalField(e.goal);
    if (gf0.dist[e.cur] === Infinity && gf0.odist[e.cur] === Infinity && (e.nxt < 0 || gf0.dist[e.nxt] === Infinity)) { e.mode = 'route'; e.goal = -1; this.reorient(e, true); return; }
  }
  if (e.mode === 'strike') {
    if (!(this.blocked[e.strikeNode] & BLK.ISO) || !this.nodeThing(e.strikeNode)) { e.mode = 'route'; e.atGoal = false; e.goal = -1; e.strikeNode = -1; this.reorient(e, true); }
    return;
  }
  if (e.thinkCd > 0 || e.bl) return;
  e.thinkCd = 0.8;
  var best = -1, bestD = 1e9, bestGoal = -1;
  for (var n = 0; n < this.nodes.length; n++) {
    var ni = this.nodes[n]; if (!(this.blocked[ni] & BLK.ISO) || !this.nodeThing(ni)) continue;
    var nx = this.tx(ni), ny = this.ty(ni);
    if (dist2(nx, ny, e.x, e.y) > 8.5 * 8.5) continue;
    // 选一个可通行的相邻格作为落点
    for (var d = 0; d < 4; d++) {
      var ax = nx + DX[d], ay = ny + DY[d]; if (!this.inb(ax, ay)) continue;
      var ai = this.idx(ax, ay); if (!this.passable(ai) || this.field.dist[ai] === Infinity) continue;
      var gf = this.goalField(ai); var dd = gf.dist[e.cur]; if (dd === Infinity) dd = gf.odist[e.cur];
      if (e.nxt >= 0) dd = Math.min(dd, gf.dist[e.nxt] + 1);
      if (dd < bestD && dd < 11) { bestD = dd; best = ni; bestGoal = ai; }
    }
  }
  if (best >= 0) {
    e.mode = 'strike'; e.strikeNode = best; e.goal = bestGoal; e.atGoal = false;
    this.emit('flooderTurn', { e: e, idx: best });
    this.reorient(e, true);
    if (e.cur === e.goal && e.t < 0.01) { e.atGoal = true; e.nxt = -1; }
  }
};
P.rangedAttack = function (e, dt) {
  e.atkCd -= dt; if (e.atkCd > 0) return;
  var def = e.def, best = null, bd = 1e9, pot = null;
  for (var i = 0; i < this.towers.length; i++) {
    var tw = this.towers[i]; if (tw.dead) continue;
    var d = dist2(tw.x, tw.y, e.x, e.y); if (d > def.range * def.range) continue;
    if (tw.kind === 'honeypot') { if (d < bd || !pot) { pot = tw; } continue; }
    if (d < bd) { bd = d; best = tw; }
  }
  for (var q = 0; q < this.isolators.length; q++) { var io = this.isolators[q]; var di = dist2(io.x, io.y, e.x, e.y); if (di <= def.range * def.range && di < bd) { bd = di; best = io; } }
  var tgt = pot || best;
  if (!tgt) { e.atkCd = 0.15; return; }
  e.atkCd = def.atkRate;
  var ang = Math.atan2(tgt.y - e.y, tgt.x - e.x); e.yaw += angDiff(ang, e.yaw) * 0.6;
  this.fire({ kind: 'enc', x0: e.x, y0: e.y, z0: 0.8, target: tgt, dur: Math.max(0.25, Math.sqrt(dist2(tgt.x, tgt.y, e.x, e.y)) / 9), dmg: def.atk, src: e, enc: def.enc });
  e.engagedT = 1;
};
P.packerPulse = function (e) {
  var def = e.def, hit = [];
  this.eachAlive(function (o) {
    if (o === e || o.type === 'packer' || o.def.boss) return;
    if (dist2(o.x, o.y, e.x, e.y) <= def.aura * def.aura && o.shield < def.shieldCap) {
      o.shield = Math.min(def.shieldCap, o.shield + def.shieldAmt); hit.push(o);
    }
  });
  if (hit.length) this.emit('aura', { e: e, targets: hit });
};

// ---------- 弹道 ----------
P.fire = function (p) { p.id = this.uid++; p.t = 0; this.projs.push(p); this.emit('proj', { p: p }); return p; };
P.updateProjs = function (dt) {
  for (var i = this.projs.length - 1; i >= 0; i--) {
    var p = this.projs[i]; p.t += dt / p.dur;
    if (p.target && !p.fixed) { var tg = p.target; if (tg.dead && p.kind !== 'enc') { p.fixed = true; } else { p.tx = tg.x; p.ty = tg.y; } }
    if (p.t >= 1) { this.projs.splice(i, 1); this.impact(p); }
  }
};
P.impact = function (p) {
  var tg = p.target;
  if (p.kind === 'bolt' || p.kind === 'pulse') {
    if (tg && !tg.dead) {
      this.damageEnemy(tg, p.dmg, p.src, { kind: p.kind, bonus: p.bonus });
      if (p.slow && !tg.dead) { tg.slowT = Math.max(tg.slowT, p.slowDur); tg.slowF = Math.max(tg.slowF, p.slow); }
      this.emit('impact', { kind: p.kind, x: tg.x, y: tg.y, z: tg.z || 0.5, e: tg });
    }
  } else if (p.kind === 'shell') {
    var R = p.splash, hit = 0;
    for (var i = this.enemies.length - 1; i >= 0; i--) {
      var e = this.enemies[i]; if (e.dead || e.air) continue;
      if (dist2(e.x, e.y, p.tx, p.ty) <= (R + e.def.r * 0.5) * (R + e.def.r * 0.5)) {
        this.damageEnemy(e, p.dmg, p.src, { kind: 'shell' }); hit++;
        if (p.taint && !e.dead) e.taintT = 3;
      }
    }
    this.emit('impact', { kind: 'shell', x: p.tx, y: p.ty, z: 0.2, r: R, hit: hit });
  } else if (p.kind === 'enc') {
    var tw = p.target;
    if (tw && tw.isIso && !tw.dead) { this.damageIso(tw, p.dmg * 1.2, p.src); this.emit('impact', { kind: 'enc', x: tw.x, y: tw.y, z: 0.5 }); }
    else if (tw && !tw.dead) {
      this.damageTower(tw, p.dmg, p.src, { kind: 'ranged' });
      if (tw.kind !== 'honeypot' && !tw.dead && tw.shield <= 0) { if (tw.encT <= 0) this.emit('encrypt', { tw: tw }); tw.encT = Math.max(tw.encT, p.enc); }
      this.emit('impact', { kind: 'enc', x: tw.x, y: tw.y, z: 0.7, tw: tw });
    }
  }
};

// ---------- 塔更新 ----------
P.updateTower = function (tw, dt) {
  var st = G.towerStats(tw.kind, tw.level, tw.branch);
  tw.hitFlash = Math.max(0, (tw.hitFlash || 0) - dt);
  if (tw.skillCd > 0) tw.skillCd -= dt;
  if (tw.hardenT > 0) tw.hardenT -= dt;
  if (tw.shieldT > 0) { tw.shieldT -= dt; if (tw.shieldT <= 0) tw.shield = 0; }
  if (tw.shieldBreakT > 0) tw.shieldBreakT -= dt;
  if (tw.engaged > 0) tw.engaged -= dt;
  if (tw.encT > 0) { tw.encT -= dt; if (tw.encT <= 0) { tw.encT = 0; this.emit('unencrypt', { tw: tw }); } }
  tw.cd -= dt;
  tw.rangeShow = 0;
  // 隔离点情报
  if (tw.onNode && tw.kind !== 'honeypot') {
    var engaged = tw.blocked.length > 0 || tw.engaged > 0;
    if (engaged) { tw.holdT += dt; if (tw.holdT >= 6) { tw.holdT = 0; this.addIntel(3, tw.x, tw.y); this.log('守住「' + this.nodeName(tw.idx) + '」获得情报 +3。', 'ok'); } }
  }
  if (tw.kind === 'honeypot') { this.honeyUpdate(tw, st, dt); return; }
  if (tw.encT > 0) return;
  switch (tw.kind) {
    case 'firewall': this.firewallUpdate(tw, st, dt); break;
    case 'interceptor': this.interceptorUpdate(tw, st, dt); break;
    case 'sandbox': this.sandboxUpdate(tw, st, dt); break;
    case 'repair': this.repairUpdate(tw, st, dt); break;
  }
};
P.firewallUpdate = function (tw, st, dt) {
  if (!tw.blocked.length) return;
  if (tw.cd <= 0) {
    tw.cd = st.rate;
    var tgt = tw.blocked[0];
    for (var i = 1; i < tw.blocked.length; i++) if (tw.blocked[i].hp < tgt.hp) tgt = tw.blocked[i];
    this.emit('counter', { tw: tw, e: tgt });
    this.damageEnemy(tgt, st.dmg * (tw.hardenT > 0 ? 1.6 : 1), tw, { kind: 'counter' });
  }
};
P.honeyUpdate = function (tw, st, dt) {
  if (st.trace) {
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i]; if (e.dead || e.air) continue;
      if (e.lure === tw) { e.revealT = Math.max(e.revealT, 0.4); this.damageEnemy(e, st.trace * dt, tw, { kind: 'trace', quiet: true }); }
    }
  }
};
P.sectorTargets = function (tw, st) {
  var out = [], R = st.range, half = st.arc * Math.PI / 180;
  for (var i = 0; i < this.enemies.length; i++) {
    var e = this.enemies[i]; if (e.dead) continue;
    var dx = e.x - tw.x, dy = e.y - tw.y, d2 = dx * dx + dy * dy;
    if (d2 > (R + e.def.r) * (R + e.def.r)) continue;
    if (d2 < 0.04) { out.push(e); continue; }
    var a = Math.atan2(dy, dx);
    if (Math.abs(angDiff(a, tw.face)) <= half + Math.atan2(e.def.r, Math.sqrt(d2))) out.push(e);
  }
  return out;
};
P.interceptorUpdate = function (tw, st, dt) {
  if (tw.cd > 0) return;
  var cand = this.sectorTargets(tw, st), best = null, br = 1e9;
  for (var i = 0; i < cand.length; i++) {
    var e = cand[i];
    if (!e.visible && e.visible !== undefined) continue;
    var r = e.rem != null ? e.rem : 0;
    if (r < br) { br = r; best = e; }
  }
  if (!best) return;
  tw.cd = st.rate; tw.aim = Math.atan2(best.y - tw.y, best.x - tw.x);
  if (st.pierce) {
    // 光束贯穿：直线上的目标（含未显形）
    var dx = Math.cos(tw.aim), dy = Math.sin(tw.aim), hits = [];
    for (var j = 0; j < this.enemies.length; j++) {
      var o = this.enemies[j]; if (o.dead) continue;
      var rx = o.x - tw.x, ry = o.y - tw.y, along = rx * dx + ry * dy;
      if (along < 0 || along > st.range + 0.3) continue;
      var perp = Math.abs(rx * dy - ry * dx);
      if (perp <= 0.38 + o.def.r) hits.push({ e: o, along: along });
    }
    hits.sort(function (a, b) { return a.along - b.along; });
    hits = hits.slice(0, st.pierce);
    var fall = [1, 0.8, 0.6];
    var endAlong = hits.length ? hits[hits.length - 1].along : st.range;
    this.emit('beam', { tw: tw, x0: tw.x, y0: tw.y, x1: tw.x + dx * Math.max(endAlong, 1), y1: tw.y + dy * Math.max(endAlong, 1), hits: hits.length });
    for (var h = 0; h < hits.length; h++) this.damageEnemy(hits[h].e, st.dmg * fall[h], tw, { kind: 'beam' });
    this.emit('shot', { tw: tw, kind: 'beam' });
  } else {
    var dist = Math.sqrt(dist2(best.x, best.y, tw.x, tw.y));
    this.fire({ kind: st.slow ? 'pulse' : 'bolt', x0: tw.x, y0: tw.y, z0: 1.05, target: best, tx: best.x, ty: best.y, dur: Math.max(0.1, dist / 15), dmg: st.dmg, src: tw, slow: st.slow, slowDur: st.slowDur, bonus: st.bonus });
    this.emit('shot', { tw: tw, kind: st.slow ? 'pulse' : 'bolt' });
  }
};
P.sandboxUpdate = function (tw, st, dt) {
  // 检测
  var rr = st.detect * st.detect;
  for (var i = 0; i < this.enemies.length; i++) {
    var e = this.enemies[i]; if (e.dead) continue;
    if (dist2(e.x, e.y, tw.x, tw.y) <= rr) {
      if ((e.disguised || e.stealth) && e.revealT <= 0) this.emit('detect', { tw: tw, e: e });
      e.revealT = Math.max(e.revealT, 0.45);
    }
  }
  if (tw.cd > 0) return;
  var best = null, br = 1e9, R = st.range * st.range;
  for (var j = 0; j < this.enemies.length; j++) {
    var o = this.enemies[j]; if (o.dead || o.air) continue;
    if (dist2(o.x, o.y, tw.x, tw.y) > R) continue;
    var r = o.rem != null ? o.rem : 0; if (r < br) { br = r; best = o; }
  }
  if (!best) return;
  tw.cd = st.rate; tw.aim = Math.atan2(best.y - tw.y, best.x - tw.x);
  var d = Math.sqrt(dist2(best.x, best.y, tw.x, tw.y));
  // 预判落点
  var lead = Math.min(0.5, d / 8);
  var px = best.x, py = best.y;
  this.fire({ kind: 'shell', x0: tw.x, y0: tw.y, z0: 1.0, target: null, fixed: true, tx: px, ty: py, dur: 0.5 + d * 0.06, dmg: st.dmg, splash: st.splash, taint: st.taint, src: tw });
  this.emit('shot', { tw: tw, kind: 'shell' });
};
P.repairUpdate = function (tw, st, dt) {
  var cand = [], R = st.range * st.range;
  for (var i = 0; i < this.towers.length; i++) {
    var o = this.towers[i]; if (o === tw || o.dead || o.hp >= o.maxhp) continue;
    if (dist2(o.x, o.y, tw.x, tw.y) <= R) cand.push(o);
  }
  if (!cand.length) { tw.healing = []; return; }
  cand.sort(function (a, b) { return a.hp / a.maxhp - b.hp / b.maxhp; });
  cand = cand.slice(0, st.targets);
  tw.healing = cand;
  var amt = st.heal * dt;
  for (var k = 0; k < cand.length; k++) {
    var o2 = cand[k]; var before = o2.hp; o2.hp = Math.min(o2.maxhp, o2.hp + amt); this.stats.healed += o2.hp - before;
  }
  tw.healFx -= dt;
  if (tw.healFx <= 0) { tw.healFx = 0.45; this.emit('heal', { tw: tw, targets: cand, amt: st.heal * 0.45 }); }
};

// ---------- Boss ----------
P.clearBossHazards = function (boss) {
  for (var i = this.hazards.length - 1; i >= 0; i--) { var h = this.hazards[i]; if (h.boss === boss) this.endHazard(h); }
};
P.addHazard = function (h) { h.id = this.uid++; h.t = 0; this.hazards.push(h); this.emit('hazard', { h: h, phase: 'warn' }); return h; };
P.endHazard = function (h) {
  var k = this.hazards.indexOf(h); if (k >= 0) this.hazards.splice(k, 1);
  if (h.active && h.bit) {
    for (var i = 0; i < h.tiles.length; i++) this.blocked[h.tiles[i]] &= ~h.bit;
    this.emit('hazard', { h: h, phase: 'end' });
    this.topologyChanged('hazardEnd', h.tiles);
    this.log(h.kind === 'blackhole' ? '路由黑洞消散，道路重新开放。' : '锁死的运维环段解除，道路重新开放。', 'info');
  } else this.emit('hazard', { h: h, phase: 'cancel' });
};
P.updateHazards = function (dt) {
  for (var i = this.hazards.length - 1; i >= 0; i--) {
    var h = this.hazards[i]; h.t += dt;
    if (!h.active) {
      if (h.t >= h.warn) {
        h.active = true; h.t = 0;
        if (h.kind === 'surge') this.execSurge(h);
        else {
          // 再次校验不会封死
          var pv = this.preview({ block: h.tiles });
          if (!pv.ok) { this.hazards.splice(i, 1); this.emit('hazard', { h: h, phase: 'cancel' }); continue; }
          for (var k = 0; k < h.tiles.length; k++) this.blocked[h.tiles[k]] |= h.bit;
          this.emit('hazard', { h: h, phase: 'on' });
          this.topologyChanged('hazard', h.tiles);
          this.log(h.kind === 'blackhole' ? '路由黑洞成立，前方链路被截断，各入口重新改道。' : '运维环一段被锁死，各入口路线重新收敛。', 'alert');
        }
      }
    } else if (h.kind === 'surge') { if (h.t > 0.8) { this.hazards.splice(i, 1); } }
    else if (h.t >= h.dur) this.endHazard(h);
  }
};
P.execSurge = function (h) {
  var idx = h.tiles[0], thing = this.nodeThing(idx), x = this.tx(idx), y = this.ty(idx);
  this.emit('surge', { x: x, y: y, boss: h.boss, idx: idx });
  if (thing) {
    if (thing.isIso) this.removeIsolator(thing, 'surge');
    else this.damageTower(thing, 430, h.boss, { kind: 'surge' });
  }
  for (var i = this.towers.length - 1; i >= 0; i--) {
    var tw = this.towers[i]; if (tw === thing || tw.dead) continue;
    if (dist2(tw.x, tw.y, x, y) <= 1.5 * 1.5) this.damageTower(tw, 180, h.boss, { kind: 'surge' });
  }
};
P.pickHazard = function (boss, len, minAhead, maxAhead, allowNode) {
  var ahead = this.followRoute(boss.nxt >= 0 ? boss.nxt : boss.cur, this.field), best = null, bs = -1;
  for (var L = len; L >= Math.max(1, len - 1) && !best; L--) {
    for (var s = minAhead; s + L <= ahead.length && s <= maxAhead; s++) {
      var seg = ahead.slice(s, s + L), ok = true;
      for (var k = 0; k < seg.length; k++) {
        var t = seg[k], kd = this.kind[t];
        if (kd === K.IN || kd === K.OUT || this.blocked[t] || this.towerAt[t] || this.isoAt[t] || (kd === K.NODE && !allowNode)) { ok = false; break; }
      }
      if (!ok) continue;
      var pv = this.preview({ block: seg }); if (!pv.ok) continue;
      var ch = 0; for (var id in pv.changed) if (pv.changed[id]) ch++;
      var score = ch * 10 - s * 0.1 + rnd();
      if (score > bs) { bs = score; best = seg; }
    }
  }
  return best;
};
P.bossUpdate = function (e, dt) {
  var def = e.def;
  if (e.bossSpawn > 0) e.bossSpawn -= dt;
  var hpr = e.hp / e.maxhp;
  // 近身践踏
  e.stompCd -= dt;
  if (e.stompCd <= 0 && !e.bl) {
    var near = null, nd = 1.6 * 1.6;
    for (var i = 0; i < this.towers.length; i++) { var tw = this.towers[i]; var d = dist2(tw.x, tw.y, e.x, e.y); if (d < nd) { nd = d; near = tw; } }
    if (near) { e.stompCd = def.atkRate; this.emit('melee', { e: e, tw: near }); this.damageTower(near, def.atk, e, { kind: 'melee' }); }
    else e.stompCd = 0.3;
  }
  if (e.type === 'boss1') {
    if (e.phase === 1 && hpr < 0.5) { e.phase = 2; this.emit('bossPhase', { e: e, phase: 2, name: '僵尸网络释放' }); this.log('万傀进入第二阶段：释放成群蠕虫！', 'alert'); e.swarmCd = 0.5; }
    e.surgeCd -= dt;
    if (e.surgeCd <= 0) {
      var best = null, bd = 9.5 * 9.5;
      for (var n = 0; n < this.nodes.length; n++) {
        var ni = this.nodes[n]; if (!(this.blocked[ni] & BLK.ISO)) continue;
        var th = this.nodeThing(ni); if (!th) continue;
        var dd = dist2(this.tx(ni), this.ty(ni), e.x, e.y); if (dd < bd) { bd = dd; best = ni; }
      }
      if (best != null) {
        e.surgeCd = e.phase === 2 ? 9 : 12.5;
        this.addHazard({ kind: 'surge', tiles: [best], warn: 2.6, boss: e, bit: 0 });
        this.log('预警：万傀将对「' + this.nodeName(best) + '」发起洪峰冲击！', 'alert');
      } else e.surgeCd = 1.5;
    }
    if (e.phase === 2) {
      e.swarmCd -= dt;
      if (e.swarmCd <= 0) {
        e.swarmCd = 11;
        for (var w = 0; w < 6; w++) { var c = this.spawnEnemy('worm', e.ent, e.maxhp / def.hp * 0.15 + 0.7, e.wave, { cloned: false }); c.cur = e.cur; c.nxt = e.nxt; c.t = e.t; c.x = e.x + (rnd() - 0.5) * 0.8; c.y = e.y + (rnd() - 0.5) * 0.8; c.lane = (rnd() - 0.5) * 0.5; c.spawnT = 0.8; }
        this.emit('swarm', { e: e }); this.log('万傀释放了一群蠕虫。', 'alert');
      }
    }
  } else if (e.type === 'boss2') {
    if (e.phase === 1 && hpr < 0.5) { e.phase = 2; this.emit('bossPhase', { e: e, phase: 2, name: '路由风暴' }); this.log('蜃楼进入第二阶段：路由风暴！', 'alert'); e.stormCd = 1.5; }
    e.holeCd -= dt;
    if (e.holeCd <= 0) {
      var seg = this.pickHazard(e, e.phase === 2 ? 2 : 1, 2, 9, false);
      if (seg) {
        e.holeCd = e.phase === 2 ? 10 : 14;
        this.addHazard({ kind: 'blackhole', tiles: seg, warn: 3.2, dur: 9, boss: e, bit: BLK.HOLE });
        this.log('预警：蜃楼正在前方链路伪造路由黑洞。', 'alert');
      } else e.holeCd = 3;
    }
    if (e.phase === 2) {
      e.stormCd -= dt;
      if (e.stormCd <= 0) {
        e.stormCd = 11; var n2 = 0;
        for (var q = 0; q < this.towers.length; q++) {
          var t2 = this.towers[q]; if (dist2(t2.x, t2.y, e.x, e.y) <= 5 * 5) { t2.shield = 0; t2.shieldT = 0; t2.shieldBreakT = 8; this.damageTower(t2, 45, e, { kind: 'storm' }); n2++; }
        }
        this.emit('storm', { e: e, n: n2 }); this.log('路由风暴席卷：' + n2 + ' 座设备的护盾被削弱。', 'alert');
      }
    }
  } else if (e.type === 'boss3') {
    var ph = hpr > 0.66 ? 1 : (hpr > 0.33 ? 2 : 3);
    if (ph !== e.phase) {
      e.phase = ph; var nm = ph === 2 ? '提权' : '破坏';
      this.emit('bossPhase', { e: e, phase: ph, name: nm }); this.log('蛰影进入「' + nm + '」阶段。', 'alert');
      if (ph >= 2) { e.stealth = false; e.armor = 0.4; }
      if (ph === 3) { e.lockCd = 2.5; e.armor = 0.25; }
    }
    if (e.phase >= 2) {
      e.trojCd -= dt;
      if (e.trojCd <= 0 && e.phase === 2) {
        e.trojCd = 8;
        for (var tj = 0; tj < 3; tj++) { var c2 = this.spawnEnemy('trojan', e.ent, 1.3, e.wave, {}); c2.cur = e.cur; c2.nxt = e.nxt; c2.t = e.t; c2.x = e.x; c2.y = e.y; c2.lane = (tj - 1) * 0.2; c2.spawnT = 0.7; }
        this.emit('swarm', { e: e }); this.log('蛰影放出了木马。', 'warn');
      }
    }
    if (e.phase === 3) {
      e.lockCd -= dt;
      if (e.lockCd <= 0) {
        var sg = this.pickHazard(e, 3, 1, 10, true);
        if (sg) { e.lockCd = 12; this.addHazard({ kind: 'lock', tiles: sg, warn: 3.0, dur: 10, boss: e, bit: BLK.LOCK }); this.log('预警：蛰影将锁死前方一段运维环。', 'alert'); }
        else e.lockCd = 3;
      }
    }
  }
};

// ---------- 主循环 ----------
P.step = function (dt) {
  if (this.over) return;
  this.time += dt;
  // 收入
  this.addCompute(this.income * dt);
  // 波次
  if (this.waveIdx < this.map.waves.length && this.autoWave) {
    this.nextWaveIn -= dt; if (this.nextWaveIn <= 0) this.startNextWave();
  }
  while (this.spawnQ.length && this.spawnQ[0].t <= this.time) {
    var s = this.spawnQ.shift(); this.waveSpawnLeft[s.wave]--;
    this.spawnEnemy(s.type, s.ent, s.hpMul, s.wave);
  }
  // 节点/旧链路计时
  var topo = false, oldEnd = [];
  for (var i = 0; i < this.N; i++) {
    if (this.nodeCd[i] > 0) this.nodeCd[i] = Math.max(0, this.nodeCd[i] - dt);
    if (this.tempOld[i] > 0) { this.tempOld[i] -= dt; if (this.tempOld[i] <= 0) { this.tempOld[i] = 0; oldEnd.push(i); } }
  }
  if (oldEnd.length) { this.emit('downgradeEnd', { tiles: oldEnd }); this.log('协议降级结束，链路恢复新协议。', 'info'); this.topologyChanged('downgradeEnd', oldEnd); }
  for (var k in this.itemCd) if (this.itemCd[k] > 0) this.itemCd[k] = Math.max(0, this.itemCd[k] - dt);
  // 隔离器
  for (var q = this.isolators.length - 1; q >= 0; q--) {
    var iso = this.isolators[q]; iso.ttl -= dt; iso.hitFlash = Math.max(0, (iso.hitFlash || 0) - dt);
    if (iso.ttl <= 0) this.removeIsolator(iso, 'expire');
  }
  this.updateHazards(dt);
  // 敌人
  var list = this.enemies;
  for (var a = 0; a < list.length; a++) { var e = list[a]; if (!e.dead) this.updateEnemy(e, dt); }
  // 塔
  for (var b = this.towers.length - 1; b >= 0; b--) { var tw = this.towers[b]; if (!tw.dead) this.updateTower(tw, dt); }
  this.updateProjs(dt);
  // 清理
  var w = 0;
  for (var c = 0; c < list.length; c++) { if (!list[c].dead) list[w++] = list[c]; }
  list.length = w;
  // 波次完成
  for (var wn in this.waveAlive) {
    if (this.waveSpawnLeft[wn] === 0 && this.waveAlive[wn] <= 0 && !this['cleared' + wn]) {
      this['cleared' + wn] = true; var n = +wn;
      var bc = 20 + n * 3, bi = 8 + (n % 3 === 0 ? 4 : 0);
      this.addCompute(bc); this.addIntel(bi);
      this.emit('waveClear', { n: n, c: bc, i: bi });
      this.log('第 ' + n + ' 波已肃清，奖励算力 +' + bc + ' / 情报 +' + bi + '。', 'ok');
    }
  }
  if (!this.over && this.waveIdx >= this.map.waves.length && this.spawnQ.length === 0 && this.enemies.length === 0) this.finish(true);
};
})(window.G = window.G || {});
